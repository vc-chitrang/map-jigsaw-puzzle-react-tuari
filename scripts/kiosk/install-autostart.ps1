<#
.SYNOPSIS
    Register the kiosk auto-start: a scheduled task that runs the watchdog at
    logon, which in turn launches and supervises the app (ADR-024).

.DESCRIPTION
    Creates (or replaces) a Scheduled Task that, at user logon, runs
    kiosk-watchdog.ps1 with the highest privileges and no time limit. The task's
    own "restart on failure" is the backstop for the watchdog process itself.

    WHY LOGON, NOT STARTUP: the app is a GUI (WebView2) and needs an interactive
    desktop session. A startup/SYSTEM task runs in session 0 with no desktop, so
    nothing would appear. The kiosk must therefore be set to AUTO-LOGIN a
    dedicated account (a kiosk-hardware step, P6.10); this task then fires on
    that logon.

    Registering a Highest-privilege task requires an ELEVATED (admin) shell.

    Run -DryRun first to see exactly what would be registered without touching
    the scheduler.

    ASCII only (PowerShell 5.1 reads a BOM-less file as ANSI).

.PARAMETER Orientation
    portrait (default) or landscape. Selects the product, task name and exe.

.PARAMETER ExePath
    Explicit app exe. If omitted the watchdog resolves it from the install dir
    at run time. Pass it if the app is installed somewhere non-standard.

.PARAMETER WatchdogPath
    The watchdog script to run. Defaults to kiosk-watchdog.ps1 beside this file.
    This folder MUST remain present on the kiosk (copy scripts/kiosk there).

.PARAMETER TaskName
    Scheduled-task name. Defaults to "<Product> Kiosk".

.PARAMETER User
    The account whose logon triggers the task. Defaults to the current user;
    pass the kiosk's auto-login account.

.PARAMETER DryRun
    Print the plan and exit WITHOUT creating the task. Safe anywhere.

.EXAMPLE
    # See the plan, change nothing:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kiosk/install-autostart.ps1 -DryRun

.EXAMPLE
    # Register (run from an elevated shell), landscape kiosk, specific account:
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kiosk/install-autostart.ps1 -Orientation landscape -User KIOSK-PC\museum
#>

[CmdletBinding()]
param(
    [ValidateSet('portrait', 'landscape')] [string] $Orientation = 'portrait',
    [string] $ExePath = '',
    [string] $WatchdogPath = '',
    [string] $TaskName = '',
    [string] $User = '',
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'KioskPolicy.ps1')

# --- Defaults --------------------------------------------------------------
$product = Get-KioskProductName -Orientation $Orientation
if ([string]::IsNullOrWhiteSpace($TaskName))     { $TaskName = Get-KioskTaskName -Orientation $Orientation }
if ([string]::IsNullOrWhiteSpace($WatchdogPath)) { $WatchdogPath = Join-Path $PSScriptRoot 'kiosk-watchdog.ps1' }
if ([string]::IsNullOrWhiteSpace($User))         { $User = "$env:USERDOMAIN\$env:USERNAME" }

# --- Build the command the task will run -----------------------------------
$watchdogArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$WatchdogPath`" -Orientation $Orientation"
if (-not [string]::IsNullOrWhiteSpace($ExePath)) {
    $watchdogArgs += " -ExePath `"$ExePath`""
}

Write-Host '--- kiosk auto-start install plan ---'
Write-Host ("task name    : {0}" -f $TaskName)
Write-Host ("orientation  : {0}" -f $Orientation)
Write-Host ("product      : {0}" -f $product)
Write-Host ("trigger      : at logon of {0}" -f $User)
Write-Host ("run level    : Highest (elevated)")
Write-Host ("watchdog     : {0}" -f $WatchdogPath)
Write-Host ("exe override : {0}" -f $(if ($ExePath) { $ExePath } else { '<resolved at run time>' }))
Write-Host ("command      : powershell.exe {0}" -f $watchdogArgs)
Write-Host ("settings     : no time limit; restart on failure x3 @ 1 min; start when available")
Write-Host ''

# --- Preconditions ---------------------------------------------------------
if (-not (Test-Path -LiteralPath $WatchdogPath)) {
    throw "Watchdog script not found: $WatchdogPath. Keep scripts/kiosk together, or pass -WatchdogPath."
}

if ($DryRun) {
    Write-Host 'DRY RUN -- no task created. Re-run without -DryRun (in an elevated shell) to register.'
    return
}

# Registering a Highest-privilege task needs elevation.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Not elevated. Right-click PowerShell -> Run as administrator, then re-run this script.'
}

# --- Register (idempotent: -Force replaces any existing task) --------------
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $watchdogArgs
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Principal $principal -Settings $settings -Force | Out-Null

Write-Host ("Registered scheduled task '{0}'." -f $TaskName) -ForegroundColor Green
Write-Host 'It will start the kiosk at the next logon of the named account.'
Write-Host ("Remove it with: scripts/kiosk/uninstall-autostart.ps1 -Orientation {0}" -f $Orientation)
