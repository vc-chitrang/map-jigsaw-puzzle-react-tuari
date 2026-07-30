@echo off
setlocal
REM ===========================================================================
REM  Disable the MAP Jigsaw Puzzle kiosk auto-start.
REM
REM  Double-click to remove the scheduled task. Asks for admin (UAC).
REM
REM  This only stops the NEXT logon from starting the kiosk; it does not close
REM  an app that is already running. To stop a live kiosk, exit with the staff
REM  double-Esc (the watchdog stops on a clean exit).
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
echo Disabling auto-start for the %ORIENTATION% kiosk...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-autostart.ps1" -Orientation %ORIENTATION%

echo.
pause
endlocal
