<#
.SYNOPSIS
    Pure decision logic for the kiosk watchdog and installer. No side effects.

.DESCRIPTION
    This file contains ONLY pure functions so they can be unit-tested with Pester
    without launching a process or touching the scheduler. The watchdog
    (kiosk-watchdog.ps1) and the installer (install-autostart.ps1) dot-source it;
    the tests (KioskAutostart.Tests.ps1) dot-source it too and assert against it.

    The one piece of genuine, drift-prone logic here is Get-RestartDecision: given
    how a run ended, decide whether to relaunch, cool off, or stop. Keeping it pure
    is the same discipline the game core and the router follow (see
    docs/decisions.md); ADR-024 records why the watchdog lives in PowerShell rather
    than in TypeScript.

    ASCII only, on purpose: PowerShell 5.1 reads a BOM-less file as ANSI, so any
    non-ASCII byte here would be mangled (docs/ai_handoff.md section 9).
#>

Set-StrictMode -Version Latest

# ---------------------------------------------------------------------------
# Policy constants -- one place, referenced from the watchdog and the tests.
#
# CleanExitCode        the exit code a clean shutdown produces. The staff exit
#                      hatch calls window.close() (src/kiosk/exitHatch.ts), and
#                      Tauri exits the process with 0 when the last window
#                      closes. A clean exit is therefore a deliberate staff exit
#                      for maintenance, so the watchdog must STOP -- otherwise
#                      staff can never get out. Any non-zero code (or a kill) is
#                      a crash and is relaunched. If a future Tauri version makes
#                      a clean exit non-zero, this is the single line to change.
# MinHealthyRunSeconds a run that lasted at least this long before dying counts
#                      as "healthy": the crash is treated as isolated and the
#                      rapid-crash counter is reset.
# MaxRapidCrashes      after this many fast crashes in a row (no healthy run in
#                      between), stop hammering and cool off instead of pinning
#                      the CPU relaunching a build that cannot start.
# ShortBackoffSeconds  pause before a normal relaunch, so a crash-restart-crash
#                      cycle cannot spin flat out.
# CoolOffSeconds       the long pause after a detected crash loop. The kiosk
#                      still recovers if the fault was transient, but a hard
#                      fault no longer burns the machine.
# ---------------------------------------------------------------------------
function Get-KioskWatchdogPolicy {
    [CmdletBinding()]
    param()

    return [pscustomobject]@{
        CleanExitCode        = 0
        MinHealthyRunSeconds = 60
        MaxRapidCrashes      = 5
        ShortBackoffSeconds  = 3
        CoolOffSeconds       = 300
    }
}

<#
.SYNOPSIS
    Decide what the watchdog should do after the app process exits.

.PARAMETER ExitCode
    The process exit code. 0 == clean (staff exit); anything else == crash.

.PARAMETER RunSeconds
    How long the app ran before exiting.

.PARAMETER ConsecutiveFastCrashes
    The count of fast crashes seen in a row BEFORE this exit (the caller keeps it).

.PARAMETER Policy
    Optional policy override (defaults to Get-KioskWatchdogPolicy). Tests pass a
    small policy so they do not have to wait real seconds.

.OUTPUTS
    [pscustomobject] with:
      Action                     'Stop' | 'Relaunch' | 'CoolOff'
      DelaySeconds               how long to wait before the action
      NextConsecutiveFastCrashes the count to carry into the next iteration
      Reason                     a short, log-safe tag
#>
function Get-RestartDecision {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)] [int]    $ExitCode,
        [Parameter(Mandatory = $true)] [double] $RunSeconds,
        [int]      $ConsecutiveFastCrashes = 0,
        [psobject] $Policy = $null
    )

    if ($null -eq $Policy) { $Policy = Get-KioskWatchdogPolicy }

    # Clean exit == staff closed it on purpose. Do not fight them.
    if ($ExitCode -eq $Policy.CleanExitCode) {
        return [pscustomobject]@{
            Action                     = 'Stop'
            DelaySeconds               = 0
            NextConsecutiveFastCrashes = 0
            Reason                     = 'clean-exit'
        }
    }

    # A crash that came only after a healthy run is isolated: relaunch and reset
    # the rapid-crash counter.
    if ($RunSeconds -ge $Policy.MinHealthyRunSeconds) {
        return [pscustomobject]@{
            Action                     = 'Relaunch'
            DelaySeconds               = $Policy.ShortBackoffSeconds
            NextConsecutiveFastCrashes = 0
            Reason                     = 'healthy-run-crash'
        }
    }

    # A fast crash. Count it; if we have hit the limit, cool off instead of
    # relaunching straight away.
    $next = $ConsecutiveFastCrashes + 1
    if ($next -ge $Policy.MaxRapidCrashes) {
        return [pscustomobject]@{
            Action                     = 'CoolOff'
            DelaySeconds               = $Policy.CoolOffSeconds
            NextConsecutiveFastCrashes = 0
            Reason                     = 'crash-loop'
        }
    }

    return [pscustomobject]@{
        Action                     = 'Relaunch'
        DelaySeconds               = $Policy.ShortBackoffSeconds
        NextConsecutiveFastCrashes = $next
        Reason                     = 'fast-crash'
    }
}

# ---------------------------------------------------------------------------
# Deployment naming. These MUST match src-tauri/tauri.conf.json (portrait) and
# src-tauri/tauri.landscape.conf.json (landscape). Two products (ADR-020), so
# two install dirs and two task names.
# ---------------------------------------------------------------------------
function Get-KioskProductName {
    [CmdletBinding()]
    param([ValidateSet('portrait', 'landscape')] [string] $Orientation = 'portrait')

    if ($Orientation -eq 'landscape') { return 'MAP Jigsaw Puzzle Landscape' }
    return 'MAP Jigsaw Puzzle'
}

function Get-KioskTaskName {
    [CmdletBinding()]
    param([ValidateSet('portrait', 'landscape')] [string] $Orientation = 'portrait')

    return ('{0} Kiosk' -f (Get-KioskProductName -Orientation $Orientation))
}

<#
.SYNOPSIS
    The directories a per-machine NSIS install could have placed the app in, in
    search order. Pure: takes the Program Files roots as parameters so it is
    testable without reading the real environment.
#>
function Get-KioskInstallDirCandidates {
    [CmdletBinding()]
    param(
        [ValidateSet('portrait', 'landscape')] [string] $Orientation = 'portrait',
        [string] $ProgramFiles = $env:ProgramFiles,
        [string] $ProgramFilesX86 = ${env:ProgramFiles(x86)}
    )

    $product = Get-KioskProductName -Orientation $Orientation
    $roots = @()
    if (-not [string]::IsNullOrWhiteSpace($ProgramFiles))    { $roots += $ProgramFiles }
    if (-not [string]::IsNullOrWhiteSpace($ProgramFilesX86)) { $roots += $ProgramFilesX86 }

    $dirs = @()
    foreach ($root in $roots) { $dirs += (Join-Path $root $product) }
    return $dirs
}

<#
.SYNOPSIS
    Find the installed app exe, or return $null. Does touch the disk (Test-Path),
    but the directory list it searches is the pure function above, so the logic
    is testable and only the final existence check is IO.

    Deliberately does NOT invent a path: if nothing is found the caller must be
    told to pass -ExePath, rather than the watchdog launching a guess.
#>
function Resolve-KioskExePath {
    [CmdletBinding()]
    param(
        [ValidateSet('portrait', 'landscape')] [string] $Orientation = 'portrait',
        [string] $ProgramFiles = $env:ProgramFiles,
        [string] $ProgramFilesX86 = ${env:ProgramFiles(x86)}
    )

    $product = Get-KioskProductName -Orientation $Orientation
    $dirs = Get-KioskInstallDirCandidates -Orientation $Orientation `
        -ProgramFiles $ProgramFiles -ProgramFilesX86 $ProgramFilesX86

    foreach ($dir in $dirs) {
        # Tauri's NSIS names the installed binary after the product; fall back to
        # any single .exe in the install dir if the naming ever changes.
        $named = Join-Path $dir ('{0}.exe' -f $product)
        if (Test-Path -LiteralPath $named) { return $named }

        if (Test-Path -LiteralPath $dir) {
            $exes = @(Get-ChildItem -LiteralPath $dir -Filter '*.exe' -File -ErrorAction SilentlyContinue)
            if ($exes.Count -eq 1) { return $exes[0].FullName }
        }
    }

    return $null
}
