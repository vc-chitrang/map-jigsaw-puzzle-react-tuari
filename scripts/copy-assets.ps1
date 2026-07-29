<#
.SYNOPSIS
    Copies every asset the port needs out of the Unity project into public/assets.

.DESCRIPTION
    Source of truth: docs/asset-manifest.md.

    Filenames are NORMALISED on copy (kebab-case, consistent `-pressed` suffix,
    no leading dashes, no spaces) because the Unity set has hazards that break on
    the web: Windows is case-insensitive, URLs are not; `-1_0.png` starts with a
    dash; three files contain spaces. The full source -> target mapping is in
    this file and is mirrored to public/assets/NAME_MAP.md on every run so a diff
    against Unity stays traceable.

    Safe to re-run; it overwrites and reports anything missing.

.PARAMETER UnityRoot
    Unity project root. Defaults to the documented location.

.PARAMETER Dest
    Output directory. Defaults to ./public/assets relative to the repo root.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/copy-assets.ps1
#>

[CmdletBinding()]
param(
    [string] $UnityRoot = 'D:/Chitrang_ViitorCloud/R&D/Sliding-Puzzle',
    [string] $Dest      = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = Split-Path -Parent $PSScriptRoot
if ([string]::IsNullOrWhiteSpace($Dest)) {
    $Dest = Join-Path $repoRoot 'public/assets'
}

$gameRoot   = Join-Path $UnityRoot 'Assets/Games/Sliding-Puzzle'
$modulesDir = Join-Path $UnityRoot 'Assets/Modules'

if (-not (Test-Path -LiteralPath $gameRoot)) {
    throw "Unity game folder not found: $gameRoot`nPass -UnityRoot if the project moved."
}

# ---------------------------------------------------------------------------
# Mapping: group -> @( @{ From = <path relative to $gameRoot>; To = <filename> } )
# ---------------------------------------------------------------------------
$plan = [ordered]@{

    'gameplay' = @(
        # Buttons -- note the inconsistent -Pressed/-pressed casing upstream.
        @{ From = 'UI/GamePlayScreen/StartButton.png';            To = 'start-button.png' }
        @{ From = 'UI/GamePlayScreen/StartButton-pressed.png';    To = 'start-button-pressed.png' }
        @{ From = 'UI/GamePlayScreen/ResetButton.png';            To = 'reset-button.png' }
        @{ From = 'UI/GamePlayScreen/ResetButton-Pressed.png';    To = 'reset-button-pressed.png' }
        @{ From = 'UI/GamePlayScreen/PreviewButton.png';          To = 'preview-button.png' }
        @{ From = 'UI/GamePlayScreen/PreviewButton-pressed.png';  To = 'preview-button-pressed.png' }
        @{ From = 'UI/GamePlayScreen/NewImageButton.png';         To = 'new-image-button.png' }
        @{ From = 'UI/GamePlayScreen/NewImageButton-pressed.png'; To = 'new-image-button-pressed.png' }
        @{ From = 'UI/GamePlayScreen/PlayAgainButton.png';        To = 'play-again-button.png' }
        @{ From = 'UI/GamePlayScreen/PlayAgainButton-Pressed.png';To = 'play-again-button-pressed.png' }

        # Footer icons -- 'new image icon.png' has spaces.
        @{ From = 'UI/GamePlayScreen/rotate-right.png';           To = 'icon-reset.png' }
        @{ From = 'UI/GamePlayScreen/Group.png';                  To = 'icon-preview.png' }
        @{ From = 'UI/GamePlayScreen/new image icon.png';          To = 'icon-new-image.png' }

        # Chrome
        @{ From = 'UI/GamePlayScreen/TimerBackground.png';        To = 'timer-background.png' }
        @{ From = 'UI/GamePlayScreen/HomeButton.png';             To = 'home-button.png' }
        @{ From = 'UI/GamePlayScreen/BackButton.png';             To = 'back-button.png' }
        @{ From = 'UI/GamePlayScreen/Map Logo.png';                To = 'map-logo.png' }

        # Board arrows. Upstream names are the GRID DIRECTION OFFSETS from
        # GameManager.ArrowGridDirections, in order (0,-1) (0,1) (-1,0) (1,0).
        # Grid Y is top-down, so (0,-1) is the arrow ABOVE the empty cell.
        @{ From = 'UI/GamePlayScreen/0_-1.png';                   To = 'arrow-up.png' }
        @{ From = 'UI/GamePlayScreen/0_1.png';                    To = 'arrow-down.png' }
        @{ From = 'UI/GamePlayScreen/-1_0.png';                   To = 'arrow-left.png' }
        @{ From = 'UI/GamePlayScreen/1_0.png';                    To = 'arrow-right.png' }
    )

    'common' = @(
        @{ From = 'UI/Common/Background_Portrait.png';            To = 'background-portrait.png' }
        @{ From = 'UI/Common/Background_Landscape.png';           To = 'background-landscape.png' }
        @{ From = 'UI/Common/Circle_9Sliced.png';                 To = 'circle-9sliced.png' }
        @{ From = 'UI/Common/DropDownArrow.png';                  To = 'dropdown-arrow.png' }
        @{ From = 'UI/Common/rotating-arrow-to-the-right.png';    To = 'icon-rotate.png' }
        @{ From = 'UI/Common/SideStrip.png';                      To = 'side-strip.png' }
        @{ From = 'UI/Common/VerticalLine.png';                   To = 'vertical-line.png' }
    )

    'select' = @(
        @{ From = 'UI/ImageSelectOrUploadScreen/gallery-add.png';     To = 'gallery-add.png' }
        @{ From = 'UI/ImageSelectOrUploadScreen/export-arrow-01.png'; To = 'export-arrow.png' }
    )

    # "Refrence" typo is upstream; normalised here.
    'crop' = @(
        @{ From = 'UI/CropImageScreen/CropRefrenceFrame.png';     To = 'crop-reference-frame.png' }
    )

    'browse' = @(
        @{ From = 'UI/MAPCollectionScreen/SearchButton.png';      To = 'search-button.png' }
        @{ From = 'UI/MAPCollectionScreen/Arrow.png';             To = 'pagination-arrow.png' }
        @{ From = 'UI/MAPCollectionScreen/GridView.png';          To = 'grid-view.png' }
        @{ From = 'UI/MAPCollectionScreen/PageSelectionBox.png';  To = 'page-selection-box.png' }
    )

    'qr' = @(
        @{ From = 'UI/QRScanScreen/QR_Code_1-1024.png';           To = 'qr-code.png' }
    )

    # Offline fallback artwork: loaded by folder in Unity, so keep at least one
    # or the kiosk has nothing to show when the collection API is down.
    'fallback' = @(
        @{ From = 'Textures/image_00.png';                        To = 'fallback-00.png' }
        @{ From = 'Textures/Image_01.png';                        To = 'fallback-01.png' }
        @{ From = 'Textures/Image_02.png';                        To = 'fallback-02.png' }
    )
}

# Popup icons live outside the game folder.
$popupPlan = @(
    @{ From = 'PopManager/Signs/cross.png';               To = 'icon-error.png' }
    @{ From = 'PopManager/Signs/exclamation-mark.png';    To = 'icon-warning.png' }
    @{ From = 'PopManager/Signs/information-button.png';  To = 'icon-info.png' }
    @{ From = 'PopManager/UI/Frame 9.png';                To = 'popup-frame.png' }
    @{ From = 'PopManager/UI/Frame 16.png';               To = 'popup-frame-alt.png' }
)

# ---------------------------------------------------------------------------

$copied  = 0
$missing = New-Object System.Collections.Generic.List[string]
$rows    = New-Object System.Collections.Generic.List[string]

function Copy-Asset {
    param(
        [string] $SourceRoot,
        [string] $RelativeFrom,
        [string] $OutDir,
        [string] $TargetName,
        [string] $Group
    )

    $src = Join-Path $SourceRoot $RelativeFrom
    if (-not (Test-Path -LiteralPath $src)) {
        $script:missing.Add($RelativeFrom)
        Write-Warning "MISSING: $src"
        return
    }

    Copy-Item -LiteralPath $src -Destination (Join-Path $OutDir $TargetName) -Force
    $script:copied++
    $script:rows.Add("| ``$RelativeFrom`` | ``assets/$Group/$TargetName`` |")
}

foreach ($group in $plan.Keys) {
    $outDir = Join-Path $Dest $group
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    foreach ($item in $plan[$group]) {
        Copy-Asset -SourceRoot $gameRoot -RelativeFrom $item.From -OutDir $outDir `
                   -TargetName $item.To -Group $group
    }
}

$popupDir = Join-Path $Dest 'popup'
New-Item -ItemType Directory -Force -Path $popupDir | Out-Null
foreach ($item in $popupPlan) {
    Copy-Asset -SourceRoot $modulesDir -RelativeFrom $item.From -OutDir $popupDir `
               -TargetName $item.To -Group 'popup'
}

# Traceability: regenerate the mapping table next to the copied files.
$header = @(
    '# Asset name map (generated)'
    ''
    "Generated by ``scripts/copy-assets.ps1``. Do not edit by hand."
    ''
    "Unity root: ``$UnityRoot``"
    ''
    '| Unity source (relative to `Assets/Games/Sliding-Puzzle`, popup group relative to `Assets/Modules`) | Port target |'
    '|---|---|'
)
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
($header + $rows) | Set-Content -Path (Join-Path $Dest 'NAME_MAP.md') -Encoding utf8

Write-Host ''
Write-Host "Copied $copied asset(s) to $Dest"
if ($missing.Count -gt 0) {
    Write-Host "Missing $($missing.Count) file(s):" -ForegroundColor Yellow
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Yellow }
    Write-Host 'Missing assets do not fail the build; fix the manifest or the Unity project.' -ForegroundColor Yellow
}
