<#
.SYNOPSIS
    Bumps the app version and syncs it across every file that carries one.

.DESCRIPTION
    package.json is the SINGLE SOURCE OF TRUTH. This script increments it and
    writes the same value into:

      * src-tauri/tauri.conf.json  -> installer / exe file version
      * src-tauri/Cargo.toml       -> crate version

    The version reaches the UI through vite.config.ts, which reads package.json
    at build time and defines __APP_VERSION__. Nothing hardcodes it.

    Files are edited with a targeted regex rather than parse-and-reserialise, so
    formatting, key order and comments survive.

.PARAMETER Part
    Which component to increment: patch (default), minor, or major.
    Bumping minor resets patch; bumping major resets both.

.PARAMETER NoBump
    Only re-sync the other files to package.json. Does not change the version.

.PARAMETER SetVersion
    Set an explicit x.y.z instead of incrementing.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1
    powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -Part minor
    powershell -ExecutionPolicy Bypass -File scripts/bump-version.ps1 -SetVersion 1.0.0
#>

[CmdletBinding()]
param(
    [ValidateSet('patch', 'minor', 'major')]
    [string] $Part = 'patch',

    [switch] $NoBump,

    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string] $SetVersion = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot    = Split-Path -Parent $PSScriptRoot
$packagePath = Join-Path $repoRoot 'package.json'
$tauriPath   = Join-Path $repoRoot 'src-tauri/tauri.conf.json'
$cargoPath   = Join-Path $repoRoot 'src-tauri/Cargo.toml'

foreach ($path in @($packagePath, $tauriPath, $cargoPath)) {
    if (-not (Test-Path -LiteralPath $path)) { throw "Not found: $path" }
}

# UTF-8 without BOM: a BOM breaks `cargo` on Cargo.toml and is noise in JSON.
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Read-Text([string] $Path) {
    return [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
}

function Write-Text([string] $Path, [string] $Content) {
    [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

# ---- Current version -------------------------------------------------------
$packageText = Read-Text $packagePath
$match = [regex]::Match($packageText, '"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"')
if (-not $match.Success) { throw 'Could not find a "version": "x.y.z" field in package.json' }

$major = [int] $match.Groups[1].Value
$minor = [int] $match.Groups[2].Value
$patch = [int] $match.Groups[3].Value
$current = "$major.$minor.$patch"

# ---- Next version ----------------------------------------------------------
if ($SetVersion) {
    $next = $SetVersion
}
elseif ($NoBump) {
    $next = $current
}
else {
    switch ($Part) {
        'major' { $next = "$($major + 1).0.0" }
        'minor' { $next = "$major.$($minor + 1).0" }
        default { $next = "$major.$minor.$($patch + 1)" }
    }
}

# ---- Write -----------------------------------------------------------------
if ($next -ne $current) {
    # Replace only the FIRST "version" field: that is the package's own, before
    # any dependency block.
    $rx = New-Object System.Text.RegularExpressions.Regex '"version"\s*:\s*"\d+\.\d+\.\d+"'
    Write-Text $packagePath $rx.Replace($packageText, """version"": ""$next""", 1)
}

# tauri.conf.json — top-level "version".
$tauriText = Read-Text $tauriPath
$rxTauri = New-Object System.Text.RegularExpressions.Regex '"version"\s*:\s*"\d+\.\d+\.\d+"'
if (-not $rxTauri.IsMatch($tauriText)) { throw 'No "version" field in tauri.conf.json' }
Write-Text $tauriPath $rxTauri.Replace($tauriText, """version"": ""$next""", 1)

# Cargo.toml — the [package] version, i.e. the first bare `version = "x.y.z"`.
$cargoText = Read-Text $cargoPath
$rxCargo = New-Object System.Text.RegularExpressions.Regex '(?m)^version\s*=\s*"\d+\.\d+\.\d+"'
if (-not $rxCargo.IsMatch($cargoText)) { throw 'No package version in Cargo.toml' }
Write-Text $cargoPath $rxCargo.Replace($cargoText, "version = ""$next""", 1)

if ($next -eq $current) {
    Write-Host "Version unchanged: $next (synced tauri.conf.json + Cargo.toml)"
}
else {
    Write-Host "Version $current -> $next"
}

# Emitted on the last line so build.bat can capture it.
Write-Output $next
