<#
.SYNOPSIS
    Converts the Unity Conduit ITC font sources to woff2 in public/fonts.

.DESCRIPTION
    Client directive: Conduit ITC Regular + Bold are the only faces in the port.

    The Unity `.asset` SDF atlases are NOT used -- they are Unity-only and ~32 MB
    each. The `.otf`/`.ttf` sources next to them are the real fonts.

    Requires Python with fonttools + brotli. Installs them into the current
    interpreter if absent (pass -NoInstall to fail instead).

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/build-fonts.ps1
#>

[CmdletBinding()]
param(
    [string] $UnityRoot = 'D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle',
    [string] $Dest      = '',
    [switch] $NoInstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Dest)) {
    $Dest = Join-Path $repoRoot 'public/fonts'
}

$fontsDir = Join-Path $UnityRoot 'Assets/Games/Sliding-Puzzle/UI/fonts'

$faces = @(
    @{ From = 'ConduitITC-Bold.ttf';      To = 'ConduitITC-Bold.woff2' }
    @{ From = 'Conduit ITC Regular.otf';  To = 'ConduitITC-Regular.woff2' }
)

$python = (Get-Command python -ErrorAction SilentlyContinue)
if ($null -eq $python) {
    throw 'python not found on PATH. Install Python 3, or convert the fonts manually and drop the woff2 files into public/fonts.'
}

# fonttools ships the woff2 compressor; brotli does the actual compression.
# Note: no `2>$null` anywhere in this script -- under Windows PowerShell 5.1,
# redirecting a native executable's stderr wraps each line in a NativeCommandError
# and trips $ErrorActionPreference = 'Stop' even on exit code 0.
if (-not $NoInstall) {
    Write-Host 'Ensuring fonttools + brotli are available...'
    & python -m pip install --quiet --disable-pip-version-check fonttools brotli
    if ($LASTEXITCODE -ne 0) {
        throw 'pip install fonttools brotli failed. Install them manually, or drop pre-built woff2 files into public/fonts.'
    }
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null

$built = 0
foreach ($face in $faces) {
    $src = Join-Path $fontsDir $face.From
    $out = Join-Path $Dest $face.To

    if (-not (Test-Path -LiteralPath $src)) {
        Write-Warning "MISSING font source: $src"
        continue
    }

    & python -m fontTools.ttLib.woff2 compress -o "$out" "$src"
    if ($LASTEXITCODE -ne 0) { throw "woff2 compression failed for $($face.From)" }

    $sizeKb = [math]::Round((Get-Item -LiteralPath $out).Length / 1KB, 1)
    Write-Host "  $($face.From) -> $($face.To)  ($sizeKb KB)"
    $built++
}

Write-Host ''
Write-Host "Built $built font(s) into $Dest"
if ($built -lt $faces.Count) {
    Write-Warning 'Not every face was built. Text will fall back and pixel parity will fail.'
}
