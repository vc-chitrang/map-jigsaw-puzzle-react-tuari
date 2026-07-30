@echo off
setlocal
REM ===========================================================================
REM  Enable the MAP Jigsaw Puzzle kiosk auto-start (OPT-IN).
REM
REM  Double-click to turn ON auto-start + crash-restart. It asks for admin
REM  (UAC) because the scheduled task runs at the highest level.
REM
REM  DO NOT enable this on a machine where a separate LAUNCHER app manages the
REM  app lifecycle: the watchdog reopening this app on close would fight the
REM  launcher. Auto-start is only for a STANDALONE kiosk where this app is the
REM  whole show. See docs/decisions.md ADR-024.
REM ===========================================================================

cd /d "%~dp0"

REM Self-elevate if not already running as administrator.
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting administrator rights...
    powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

set "ORIENTATION=portrait"
set /p ORIENTATION=Orientation [portrait/landscape] (default portrait):
if /i not "%ORIENTATION%"=="landscape" set "ORIENTATION=portrait"

echo.
echo Enabling auto-start for the %ORIENTATION% kiosk...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-autostart.ps1" -Orientation %ORIENTATION%

echo.
pause
endlocal
