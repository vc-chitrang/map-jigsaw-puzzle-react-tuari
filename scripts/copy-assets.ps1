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

# Is the Unity source reachable? Probe the ROOT before joining onto it: Join-Path
# throws DriveNotFoundException when the drive (e.g. D:) is absent, so a bare
# Join-Path here would crash before any fallback could run.
$unityReachable = $false
try { $unityReachable = Test-Path -LiteralPath $UnityRoot } catch { $unityReachable = $false }

$gameRoot   = ''
$modulesDir = ''
$gameOk     = $false
if ($unityReachable) {
    $gameRoot   = Join-Path $UnityRoot 'Assets/Games/Sliding-Puzzle'
    $modulesDir = Join-Path $UnityRoot 'Assets/Modules'
    $gameOk     = Test-Path -LiteralPath $gameRoot
}

if (-not $gameOk) {
    # A machine WITHOUT the Unity project is fine IF the assets were already
    # generated and copied here (README "Moving to another machine"). The
    # predev/prebuild hooks call this script on every run, so failing hard would
    # block dev AND build on any Unity-less checkout. Skip only when the assets
    # are actually present; a truly empty checkout still fails loudly.
    if (Test-Path -LiteralPath (Join-Path $Dest 'NAME_MAP.md')) {
        Write-Host "Unity project not found at $UnityRoot."
        Write-Host 'public/assets is already populated (NAME_MAP.md present) -- skipping copy.'
        Write-Host 'Pass -UnityRoot <path> to re-copy from the Unity project.'
        exit 0
    }
    throw ("Unity game folder not found and public/assets is empty.`n" +
        "Bring the Unity project, or copy public/assets from a build machine (see README).`n" +
        "Looked for: $UnityRoot`nPass -UnityRoot if the project moved.")
}

# ---------------------------------------------------------------------------
# Mapping: group -> @( @{ From = <path relative to $gameRoot>; To = <filename> } )
# ---------------------------------------------------------------------------
# Only the Unity bitmaps the running app still loads. See $superseded below for
# the 31 that used to be copied here and no longer are.
$plan = [ordered]@{

    'common' = @(
        @{ From = 'UI/Common/Background_Portrait.png';            To = 'background-portrait.png' }
        @{ From = 'UI/Common/Background_Landscape.png';           To = 'background-landscape.png' }
        @{ From = 'UI/Common/Circle_9Sliced.png';                 To = 'circle-9sliced.png' }
        @{ From = 'UI/Common/DropDownArrow.png';                  To = 'dropdown-arrow.png' }
        @{ From = 'UI/Common/rotating-arrow-to-the-right.png';    To = 'icon-rotate.png' }
        # side-strip is unused (SideStrip is inactive in both scenes) but is
        # committed and harmless; kept so the group matches the manifest.
        @{ From = 'UI/Common/SideStrip.png';                      To = 'side-strip.png' }
        @{ From = 'UI/Common/VerticalLine.png';                   To = 'vertical-line.png' }
    )

    'qr' = @(
        @{ From = 'UI/QRScanScreen/QR_Code_1-1024.png';           To = 'qr-code.png' }
    )
}

# ---------------------------------------------------------------------------
# SUPERSEDED -- deliberately NOT copied.
#
# These 31 Unity bitmaps were replaced by hand-authored vector/JPEG assets that
# are COMMITTED to the repo (ADR-035, ADR-038, ADR-039 for the SVGs; the
# "fallback art to jpg" change for the offline artwork). Nothing in `src/`
# references any of them any more.
#
# They stayed in the copy plan after the migration, so `copy:assets` -- which
# runs on every `predev` and `prebuild` -- rewrote all 31 on every build. They
# then showed up as untracked or, once someone ran `git add -A`, as staged
# additions, and re-appeared however often they were deleted.
#
# The mapping is preserved here as documentation: it records which Unity file
# each committed asset replaced, so a future diff against the Unity project
# stays traceable. Do NOT move these back into $plan without first checking that
# `src/` actually loads the .png -- if it loads the .svg, copying the .png only
# recreates the litter.
# ---------------------------------------------------------------------------
$superseded = [ordered]@{
    'gameplay' = @(
        'UI/GamePlayScreen/StartButton.png            -> start-button.svg'
        'UI/GamePlayScreen/StartButton-pressed.png    -> start-button-pressed.svg'
        'UI/GamePlayScreen/ResetButton.png            -> reset-button.svg'
        'UI/GamePlayScreen/ResetButton-Pressed.png    -> reset-button-pressed.svg'
        'UI/GamePlayScreen/PreviewButton.png          -> preview-button.svg'
        'UI/GamePlayScreen/PreviewButton-pressed.png  -> preview-button-pressed.svg'
        'UI/GamePlayScreen/NewImageButton.png         -> new-image-button.svg'
        'UI/GamePlayScreen/NewImageButton-pressed.png -> new-image-button-pressed.svg'
        'UI/GamePlayScreen/PlayAgainButton.png        -> play-again-button.svg'
        'UI/GamePlayScreen/PlayAgainButton-Pressed.png-> play-again-button-pressed.svg'
        'UI/GamePlayScreen/rotate-right.png           -> icon-reset.svg'
        'UI/GamePlayScreen/Group.png                  -> icon-preview.svg'
        'UI/GamePlayScreen/new image icon.png         -> icon-new-image.svg'
        'UI/GamePlayScreen/TimerBackground.png        -> timer-background.svg'
        'UI/GamePlayScreen/HomeButton.png             -> home-button.svg'
        'UI/GamePlayScreen/BackButton.png             -> back-button.svg'
        'UI/GamePlayScreen/Map Logo.png               -> map-logo.svg'
        # Arrow names upstream are the GRID DIRECTION OFFSETS from
        # GameManager.ArrowGridDirections: (0,-1) (0,1) (-1,0) (1,0). Grid Y is
        # top-down, so (0,-1) is the arrow ABOVE the empty cell.
        'UI/GamePlayScreen/0_-1.png                   -> arrow-up.svg'
        'UI/GamePlayScreen/0_1.png                    -> arrow-down.svg'
        'UI/GamePlayScreen/-1_0.png                   -> arrow-left.svg'
        'UI/GamePlayScreen/1_0.png                    -> arrow-right.svg'
    )
    'select' = @(
        'UI/ImageSelectOrUploadScreen/gallery-add.png     -> gallery-add.svg'
        'UI/ImageSelectOrUploadScreen/export-arrow-01.png -> export-arrow.svg'
    )
    'crop' = @(
        # "Refrence" typo is upstream.
        'UI/CropImageScreen/CropRefrenceFrame.png -> crop-reference-frame.svg'
    )
    'browse' = @(
        'UI/MAPCollectionScreen/SearchButton.png     -> search-button.svg'
        'UI/MAPCollectionScreen/Arrow.png            -> pagination-arrow.svg'
        'UI/MAPCollectionScreen/GridView.png         -> grid-view.svg'
        'UI/MAPCollectionScreen/PageSelectionBox.png -> page-selection-box.svg'
    )
    'fallback' = @(
        'Textures/image_00.png -> fallback-00.jpg'
        'Textures/Image_01.png -> fallback-01.jpg'
        'Textures/Image_02.png -> fallback-02.jpg'
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
$supersededCount = ($superseded.Values | ForEach-Object { $_.Count } | Measure-Object -Sum).Sum
Write-Host "Skipped $supersededCount superseded bitmap(s) - replaced by committed SVG/JPEG assets."
if ($missing.Count -gt 0) {
    Write-Host "Missing $($missing.Count) file(s):" -ForegroundColor Yellow
    foreach ($m in $missing) { Write-Host "  - $m" -ForegroundColor Yellow }
    Write-Host 'Missing assets do not fail the build; fix the manifest or the Unity project.' -ForegroundColor Yellow
}
