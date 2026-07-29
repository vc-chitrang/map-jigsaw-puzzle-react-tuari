<#
.SYNOPSIS
    Builds a square 1024x1024 app-icon source from the MAP logo.

.DESCRIPTION
    `tauri icon` requires a square source, and the Unity logo (`Map Logo.png`) is
    wide and white-on-transparent -- it would be invisible against a light
    taskbar. This composites it centred on MAP Kohl (#000000), which is the
    brand primary, and writes src-tauri/icon-source.png.

    Uses System.Drawing (shipped with Windows) so there is no image-library
    dependency.

    Run `npx tauri icon src-tauri/icon-source.png` afterwards, or just use
    `npm run build:icons` which does both.
#>

[CmdletBinding()]
param(
    [string] $Source = '',
    [string] $Out    = '',
    [int]    $Size   = 1024,
    # Fraction of the canvas the logo may occupy on its longest edge.
    [double] $Inset  = 0.76
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Source)) {
    $Source = Join-Path $repoRoot 'public/assets/gameplay/map-logo.png'
}
if ([string]::IsNullOrWhiteSpace($Out)) {
    $Out = Join-Path $repoRoot 'src-tauri/icon-source.png'
}

if (-not (Test-Path -LiteralPath $Source)) {
    throw "Logo not found: $Source`nRun `npm run copy:assets` first."
}

Add-Type -AssemblyName System.Drawing

$logo   = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source))
$canvas = New-Object System.Drawing.Bitmap($Size, $Size)
$gfx    = [System.Drawing.Graphics]::FromImage($canvas)

try {
    $gfx.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))   # MAP Kohl
    $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $gfx.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $budget = $Size * $Inset
    $ratio  = [Math]::Min($budget / $logo.Width, $budget / $logo.Height)
    $w      = [int][Math]::Round($logo.Width * $ratio)
    $h      = [int][Math]::Round($logo.Height * $ratio)
    $x      = [int][Math]::Round(($Size - $w) / 2)
    $y      = [int][Math]::Round(($Size - $h) / 2)

    $gfx.DrawImage($logo, $x, $y, $w, $h)

    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Out) | Out-Null
    $canvas.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $gfx.Dispose()
    $canvas.Dispose()
    $logo.Dispose()
}

Write-Host "Wrote $Out ($Size x $Size)"
