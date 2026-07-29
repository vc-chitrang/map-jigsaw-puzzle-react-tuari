<#
.SYNOPSIS
    Screenshots a window by process name, for pixel-parity captures.

.DESCRIPTION
    Used for both sides of the parity diff:

      * the port          -> -ProcessName map-jigsaw-puzzle
      * the Unity build   -> -ProcessName "MAP Jigsaw Puzzle-0.1.2-2"

    Captures the window's CLIENT area, excluding the title bar and borders, so the
    two captures are directly comparable even if one build is decorated and the
    other is not.

    The window is brought to the foreground first: a window that is occluded or
    minimised captures as black, because this reads from the screen rather than
    asking the window to redraw itself.

.PARAMETER ProcessName
    Process name without .exe.

.PARAMETER Out
    Output PNG path.

.PARAMETER DelaySeconds
    Settle time after focusing, before the capture. Give an app time to finish an
    animation or an image load.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts/capture-window.ps1 `
        -ProcessName map-jigsaw-puzzle -Out captures/port-540x960.png
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $ProcessName,

    [Parameter(Mandatory = $true)]
    [string] $Out,

    [int] $DelaySeconds = 2
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# Full type definition rather than -MemberDefinition: nested structs cannot be
# declared inside a member-definition fragment.
if (-not ('Win32Capture' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class Win32Capture
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT { public int X; public int Y; }

    [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr hWnd, ref POINT point);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int cmd);
}
'@
}

$process = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue |
    Where-Object { $_.MainWindowHandle -ne 0 } |
    Select-Object -First 1

if ($null -eq $process) {
    throw "No running process named '$ProcessName' with a visible window."
}

$handle = $process.MainWindowHandle

# SW_RESTORE = 9, in case it is minimised.
[void][Win32Capture]::ShowWindow($handle, 9)
[void][Win32Capture]::SetForegroundWindow($handle)
Start-Sleep -Seconds $DelaySeconds

$rect = New-Object 'Win32Capture+RECT'
if (-not [Win32Capture]::GetClientRect($handle, [ref] $rect)) {
    throw 'GetClientRect failed.'
}

$width  = $rect.Right - $rect.Left
$height = $rect.Bottom - $rect.Top
if ($width -le 0 -or $height -le 0) {
    throw "Window client area is empty ($width x $height)."
}

# Client coordinates are window-relative; convert the origin to screen space.
$origin = New-Object 'Win32Capture+POINT'
$origin.X = 0
$origin.Y = 0
if (-not [Win32Capture]::ClientToScreen($handle, [ref] $origin)) {
    throw 'ClientToScreen failed.'
}

$bitmap   = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
    $graphics.CopyFromScreen($origin.X, $origin.Y, 0, 0, (New-Object System.Drawing.Size($width, $height)))

    $outDir = Split-Path -Parent $Out
    if ($outDir -and -not (Test-Path -LiteralPath $outDir)) {
        New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    }

    $bitmap.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
}
finally {
    $graphics.Dispose()
    $bitmap.Dispose()
}

Write-Host ("Captured {0} x {1} client area of '{2}' -> {3}" -f $width, $height, $ProcessName, $Out)
