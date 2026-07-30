@echo off
setlocal EnableDelayedExpansion

REM ===========================================================================
REM  MAP Jigsaw Puzzle - Windows release build
REM
REM  Bumps the version, makes sure the generated inputs exist, and produces the
REM  NSIS installer plus the standalone .exe.
REM
REM  Usage:
REM    build.bat                    PORTRAIT, bump the PATCH number
REM    build.bat landscape          LANDSCAPE, bump the PATCH number
REM    build.bat minor              portrait, bump the MINOR number
REM    build.bat landscape major    landscape, bump the MAJOR number
REM    build.bat same               build WITHOUT changing the version
REM
REM  Arguments may be given in either order. Version words: patch (default),
REM  minor, major, same. Orientation words: portrait (default), landscape.
REM
REM  TWO SEPARATE PRODUCTS (ADR-020). The landscape build overlays
REM  tauri.landscape.conf.json, which changes productName and identifier, so the
REM  two installers coexist instead of overwriting one another. The version is
REM  shared: both products ship at the same version from package.json.
REM
REM  The version shown at the bottom-left of the app, in the installer, and in
REM  the .exe file properties all come from package.json. Nothing is hardcoded.
REM ===========================================================================

cd /d "%~dp0"

set "PS=powershell -NoProfile -ExecutionPolicy Bypass -File"
set "BUMP_ARGS=-Part patch"
set "ORIENTATION=portrait"
set "TAURI_ARGS="

REM Accept the two kinds of word in either order.
for %%a in (%*) do (
    if /i "%%a"=="minor"     set "BUMP_ARGS=-Part minor"
    if /i "%%a"=="major"     set "BUMP_ARGS=-Part major"
    if /i "%%a"=="patch"     set "BUMP_ARGS=-Part patch"
    if /i "%%a"=="same"      set "BUMP_ARGS=-NoBump"
    if /i "%%a"=="portrait"  set "ORIENTATION=portrait"
    if /i "%%a"=="landscape" set "ORIENTATION=landscape"
)

REM VITE_ORIENTATION drives the front-end geometry tables; the config overlay
REM drives productName, identifier and the window.
set "VITE_ORIENTATION=%ORIENTATION%"
if /i "%ORIENTATION%"=="landscape" set "TAURI_ARGS=--config src-tauri/tauri.landscape.conf.json"

echo.
echo ============================================================
echo  MAP Jigsaw Puzzle - release build (%ORIENTATION%)
echo ============================================================

REM --- 1. Dependencies ------------------------------------------------------
if not exist "node_modules" (
    echo.
    echo [1/5] Installing npm dependencies...
    call npm install --no-fund --no-audit
    if errorlevel 1 goto :fail
) else (
    echo.
    echo [1/5] npm dependencies present.
)

REM --- 2. Generated inputs --------------------------------------------------
REM Fonts and icons are one-off generation steps, unlike assets, which the
REM prebuild hook copies on every build.
if not exist "public\fonts\ConduitITC-Bold.woff2" (
    echo.
    echo [2/5] Generating woff2 fonts...
    call npm run build:fonts
    if errorlevel 1 goto :fail
) else (
    echo.
    echo [2/5] Fonts present.
)

if not exist "src-tauri\icons\icon.ico" (
    echo       Generating app icons...
    call npm run build:icons
    if errorlevel 1 goto :fail
)

REM --- 3. Version -----------------------------------------------------------
echo.
echo [3/5] Setting version...
set "APP_VERSION="
REM The bump script prints progress first and the bare version LAST, so the last
REM captured line is the value we want.
for /f "usebackq delims=" %%v in (`%PS% "scripts\bump-version.ps1" %BUMP_ARGS%`) do set "APP_VERSION=%%v"
if errorlevel 1 goto :fail
if "!APP_VERSION!"=="" (
    echo ERROR: could not determine the version. Is scripts\bump-version.ps1 intact?
    goto :fail
)
echo       Building version !APP_VERSION!

REM --- 4. Tests -------------------------------------------------------------
echo.
echo [4/5] Running tests...
call npm test
if errorlevel 1 (
    echo.
    echo ERROR: tests failed. Not shipping a build on red tests.
    goto :fail
)

REM --- 5. Build -------------------------------------------------------------
echo.
echo [5/5] Building the Tauri release bundle (%ORIENTATION%)...
echo       First run compiles all Rust dependencies with LTO - expect a few minutes.
call npx tauri build %TAURI_ARGS%
if errorlevel 1 goto :fail

REM --- Report ---------------------------------------------------------------
REM Resolve both artefacts by glob rather than by building the filename:
REM the portable exe is named after the CARGO PACKAGE (map-jigsaw-puzzle.exe),
REM not the productName, and the installer name embeds the version.
set "EXE="
for %%f in ("%CD%\src-tauri\target\release\*.exe") do set "EXE=%%~ff"

REM Match this orientation's installer specifically: both products' installers live
REM in the same folder, so a bare glob would report whichever sorted last.
set "SETUP="
if /i "%ORIENTATION%"=="landscape" (
    for %%f in ("%CD%\src-tauri\target\release\bundle\nsis\*Landscape*-setup.exe") do set "SETUP=%%~ff"
) else (
    for %%f in ("%CD%\src-tauri\target\release\bundle\nsis\*-setup.exe") do (
        echo %%~nxf | findstr /i "Landscape" >nul || set "SETUP=%%~ff"
    )
)

echo.
echo ============================================================
echo  BUILD OK - version !APP_VERSION!
echo ============================================================
echo.

if defined SETUP (
    echo  Installer ^(per-machine, bundles WebView2, needs admin^):
    echo    !SETUP!
) else (
    echo  Installer: NOT FOUND. Check:
    echo    %CD%\src-tauri\target\release\bundle\nsis\
)

echo.
if defined EXE (
    echo  Portable exe ^(no install; needs WebView2 already present^):
    echo    !EXE!
) else (
    echo  Portable exe: NOT FOUND in src-tauri\target\release\
)

echo.
echo  Notes:
echo    - The window opens FULLSCREEN and ALWAYS-ON-TOP in a release build.
echo    - Press ESC twice within 1 second to exit.
echo    - The installer needs admin rights ^(per-machine install^).
echo.
endlocal
exit /b 0

:fail
echo.
echo ============================================================
echo  BUILD FAILED - see the output above.
echo ============================================================
endlocal
exit /b 1
