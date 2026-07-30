<#
.SYNOPSIS
    Kiosk watchdog: launch the MAP Jigsaw Puzzle app and relaunch it if it
    crashes. Stops when staff exit it cleanly (double-Esc).

.DESCRIPTION
    This is the process that the auto-start scheduled task runs at logon
    (install-autostart.ps1). It supervises the APP from the OUTSIDE, which is the
    whole point: a restart mechanism inside the app cannot restart the app once
    the app's own process has died. Two layers of recovery (ADR-024):

        scheduled task  --restarts-->  watchdog  --restarts-->  app

    The task's own "restart on failure" is the backstop for the watchdog; the
    watchdog is the backstop for the app.

    The relaunch decision is Get-RestartDecision in KioskPolicy.ps1 (pure and
    unit-tested). This file is the IO around it: launch, wait, log, sleep.

    KNOWN LIMITATION: this catches the app PROCESS dying. It does NOT catch a
    WebView2 renderer that crashes while the host process stays alive (a blank
    board), nor a hang. Detecting those needs a health signal from the running
    app and the real kiosk to validate it -- tracked with P6.7-P6.10. The clean
    process-death case is what is buildable and testable here.

    ASCII only (PowerShell 5.1 reads a BOM-less file as ANSI).

.PARAMETER Orientation
    portrait (default) or landscape. Selects the product and its install dir.

.PARAMETER ExePath
    Explicit path to the app exe. If omitted, resolved from the install dir for
    the orientation. The watchdog refuses to run on a guessed path.

.PARAMETER LogDir
    Where to write watchdog.log. Defaults to
    %ProgramData%\<ProductName>\watchdog.

.PARAMETER DryRun
    Print the resolved configuration and the launch command, then exit WITHOUT
    launching anything or looping. Safe to run on a dev machine.

.PARAMETER MaxIterations
    Stop after this many launches (0 = unbounded, the real kiosk default). A
    positive value bounds a smoke test so the loop cannot run forever.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kiosk/kiosk-watchdog.ps1 -DryRun

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kiosk/kiosk-watchdog.ps1 -Orientation landscape
#>

[CmdletBinding()]
param(
    [ValidateSet('portrait', 'landscape')] [string] $Orientation = 'portrait',
    [string] $ExePath = '',
    [string] $LogDir = '',
    [switch] $DryRun,
    [int]    $MaxIterations = 0
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'KioskPolicy.ps1')

# --- Resolve configuration -------------------------------------------------
$product = Get-KioskProductName -Orientation $Orientation
$policy = Get-KioskWatchdogPolicy

if ([string]::IsNullOrWhiteSpace($ExePath)) {
    $ExePath = Resolve-KioskExePath -Orientation $Orientation
}

if ([string]::IsNullOrWhiteSpace($LogDir)) {
    $LogDir = Join-Path (Join-Path $env:ProgramData $product) 'watchdog'
}

# --- Logging ---------------------------------------------------------------
$script:LogFile = $null
function Initialize-Log {
    if ([string]::IsNullOrWhiteSpace($LogDir)) { return }
    try {
        if (-not (Test-Path -LiteralPath $LogDir)) {
            New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
        }
        $script:LogFile = Join-Path $LogDir 'watchdog.log'
    }
    catch {
        # A watchdog that cannot open its log must still supervise the app.
        Write-Warning ("could not open log dir {0}: {1}" -f $LogDir, $_.Exception.Message)
        $script:LogFile = $null
    }
}

function Write-Log {
    param([string] $Message)
    $stamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
    $line = "$stamp  $Message"
    Write-Host $line
    if ($script:LogFile) {
        try { Add-Content -LiteralPath $script:LogFile -Value $line -Encoding UTF8 } catch { }
    }
}

# --- Dry run: prove the wiring without launching anything ------------------
# Runs even when the app is not installed on this machine, so the resolved
# configuration can be checked on a dev box. It REPORTS whether the exe resolved
# rather than failing on it.
if ($DryRun) {
    $exeShown = if ([string]::IsNullOrWhiteSpace($ExePath)) { '<not found -- pass -ExePath on the kiosk>' } else { $ExePath }
    $exeExists = (-not [string]::IsNullOrWhiteSpace($ExePath)) -and (Test-Path -LiteralPath $ExePath)
    Write-Host '--- kiosk-watchdog DRY RUN ---'
    Write-Host ("orientation   : {0}" -f $Orientation)
    Write-Host ("product       : {0}" -f $product)
    Write-Host ("exe path      : {0}" -f $exeShown)
    Write-Host ("exe exists    : {0}" -f $exeExists)
    Write-Host ("log dir       : {0}" -f $LogDir)
    Write-Host ("policy        : cleanExit={0} healthySec={1} maxRapid={2} backoff={3}s cooloff={4}s" -f `
            $policy.CleanExitCode, $policy.MinHealthyRunSeconds, $policy.MaxRapidCrashes, `
            $policy.ShortBackoffSeconds, $policy.CoolOffSeconds)
    Write-Host ("max iterations: {0}" -f $(if ($MaxIterations -gt 0) { $MaxIterations } else { 'unbounded' }))
    Write-Host ''
    Write-Host 'Would launch, wait for exit, then apply Get-RestartDecision each cycle.'
    Write-Host 'No process launched (dry run).'
    return
}

# --- Validate the exe (real run only) --------------------------------------
if ([string]::IsNullOrWhiteSpace($ExePath)) {
    $dirs = (Get-KioskInstallDirCandidates -Orientation $Orientation) -join '; '
    throw ("Could not find the $product exe. Looked in: $dirs. " +
        "Pass -ExePath <path-to-exe> explicitly.")
}
if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "ExePath does not exist: $ExePath"
}

# --- Supervise -------------------------------------------------------------
Initialize-Log
Write-Log ("watchdog start: product='$product' exe='$ExePath'")

$consecutiveFastCrashes = 0
$iteration = 0

while ($true) {
    $iteration++
    Write-Log ("launch #$iteration")

    $exitCode = $null
    $started = Get-Date
    try {
        $proc = Start-Process -FilePath $ExePath -PassThru
        $proc.WaitForExit()
        $exitCode = $proc.ExitCode
    }
    catch {
        # Launch itself failed (missing DLL, bad path). Treat as an instant crash
        # so the crash-loop guard applies rather than spinning.
        Write-Log ("launch FAILED: {0}" -f $_.Exception.Message)
        $exitCode = 1
    }

    $runSeconds = ((Get-Date) - $started).TotalSeconds
    if ($null -eq $exitCode) { $exitCode = 1 }

    $decision = Get-RestartDecision -ExitCode $exitCode -RunSeconds $runSeconds `
        -ConsecutiveFastCrashes $consecutiveFastCrashes -Policy $policy
    $consecutiveFastCrashes = $decision.NextConsecutiveFastCrashes

    Write-Log ("exit code={0} ran={1:N1}s -> {2} ({3}) delay={4}s fastCrashes={5}" -f `
            $exitCode, $runSeconds, $decision.Action, $decision.Reason, `
            $decision.DelaySeconds, $consecutiveFastCrashes)

    if ($decision.Action -eq 'Stop') {
        Write-Log 'clean exit -- watchdog stopping (staff maintenance exit).'
        break
    }

    if ($decision.Action -eq 'CoolOff') {
        Write-Log ("CRASH LOOP detected -- cooling off {0}s before trying again." -f $decision.DelaySeconds)
    }

    if ($MaxIterations -gt 0 -and $iteration -ge $MaxIterations) {
        Write-Log ("reached MaxIterations={0} -- stopping (smoke-test bound)." -f $MaxIterations)
        break
    }

    if ($decision.DelaySeconds -gt 0) {
        Start-Sleep -Seconds $decision.DelaySeconds
    }
}

Write-Log 'watchdog exit.'
