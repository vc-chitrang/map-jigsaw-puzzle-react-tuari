<#
.SYNOPSIS
    Remove the kiosk auto-start scheduled task created by install-autostart.ps1.

.DESCRIPTION
    Deletes the task by name. Requires an elevated shell (the task runs at the
    Highest run level). Run -DryRun to see what would be removed.

    This does NOT stop a watchdog that is already running -- it only prevents the
    next logon from starting it. To stop a live kiosk, exit the app with the
    staff double-Esc (the watchdog stops on a clean exit) or end the powershell
    process running kiosk-watchdog.ps1.

    ASCII only (PowerShell 5.1 reads a BOM-less file as ANSI).

.PARAMETER Orientation
    portrait (default) or landscape. Selects the default task name.

.PARAMETER TaskName
    Task to remove. Defaults to "<Product> Kiosk".

.PARAMETER DryRun
    Print the plan and exit WITHOUT removing anything.

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kiosk/uninstall-autostart.ps1 -DryRun

.EXAMPLE
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts/kiosk/uninstall-autostart.ps1 -Orientation landscape
#>

[CmdletBinding()]
param(
    [ValidateSet('portrait', 'landscape')] [string] $Orientation = 'portrait',
    [string] $TaskName = '',
    [switch] $DryRun
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'KioskPolicy.ps1')

if ([string]::IsNullOrWhiteSpace($TaskName)) {
    $TaskName = Get-KioskTaskName -Orientation $Orientation
}

$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

Write-Host '--- kiosk auto-start uninstall plan ---'
Write-Host ("task name : {0}" -f $TaskName)
Write-Host ("present   : {0}" -f [bool]$existing)
Write-Host ''

if (-not $existing) {
    Write-Host ("No scheduled task named '{0}' -- nothing to do." -f $TaskName) -ForegroundColor Yellow
    return
}

if ($DryRun) {
    Write-Host 'DRY RUN -- task left in place. Re-run without -DryRun (elevated) to remove.'
    return
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Not elevated. Right-click PowerShell -> Run as administrator, then re-run this script.'
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host ("Removed scheduled task '{0}'." -f $TaskName) -ForegroundColor Green
