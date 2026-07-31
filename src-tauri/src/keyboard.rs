//! Native orchestration of the Windows TabTip keyboard.
//!
//! Mirrors the proven logic from the Unity `OnScreenKeyboard.cs` in Rust:
//!
//!   Open  = TryToggle (COM, works even when a physical keyboard is attached)
//!           → fallback to EnsureTabTipRunning (process spawn, for cold start)
//!   Close = WM_SYSCOMMAND / SC_CLOSE posted to the keyboard window
//!
//! Z-ORDER GUARD: `is_tabtip_visible()` is called by `kiosk::reassert` before
//! it calls `set_always_on_top`. If the keyboard is on screen the reassert is
//! skipped — otherwise the app would bury the keyboard the instant it steals focus.
//!
//! WHY COM FOR OPEN:
//!   On Windows 10/11, when a physical keyboard is detected the OS suppresses
//!   the touch keyboard even if you re-spawn `TabTip.exe`. The ITipInvocation
//!   COM interface bypasses that policy because it is an explicit programmatic
//!   signal. Spawning the process is kept only as a cold-start fallback for
//!   the case where the COM server is not yet running.

use tauri::command;

// ── Windows-only imports ───────────────────────────────────────────────────

#[cfg(windows)]
use windows_sys::{
    core::GUID,
    Win32::{
        Foundation::{HWND, LPARAM, WPARAM},
        Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED},
        System::Com::CoCreateInstance,
        UI::WindowsAndMessaging::{
            FindWindowW, GetDesktopWindow, IsWindowVisible, PostMessageW, SC_CLOSE, WM_SYSCOMMAND,
        },
    },
};

// ── ITipInvocation COM GUIDs (from OnScreenKeyboard.cs) ───────────────────

/// `CLSID_UIHostNoLaunch` — the COM class that hosts ITipInvocation.
#[cfg(windows)]
const CLSID_UI_HOST_NO_LAUNCH: GUID = GUID {
    data1: 0x4ce5_76fa,
    data2: 0x83dc,
    data3: 0x4f88,
    data4: [0x95, 0x1c, 0x9d, 0x07, 0x82, 0xb4, 0xe3, 0x76],
};

/// `IID_ITipInvocation` — the interface we call `Toggle` on.
#[cfg(windows)]
const IID_ITIP_INVOCATION: GUID = GUID {
    data1: 0x37c9_94e7,
    data2: 0x432b,
    data3: 0x4834,
    data4: [0xa2, 0xf7, 0xdc, 0xe1, 0xf1, 0x3b, 0x83, 0x4b],
};

#[cfg(windows)]
const CLSCTX_INPROC_SERVER: u32 = 0x1;
#[cfg(windows)]
const CLSCTX_LOCAL_SERVER: u32 = 0x4;

// ── Window detection ───────────────────────────────────────────────────────

/// Locate the TabTip keyboard window. Checks both the legacy class and the
/// Windows 10/11 CoreWindow host (mirrors `FindTabTipWindow` in C#).
#[cfg(windows)]
fn find_tabtip_hwnd() -> HWND {
    unsafe {
        let class_main: Vec<u16> = "IPTip_Main_Window\0".encode_utf16().collect();
        let mut hwnd: HWND = FindWindowW(class_main.as_ptr(), std::ptr::null());
        if hwnd == 0 {
            let class_core: Vec<u16> = "Windows.UI.Core.CoreWindow\0".encode_utf16().collect();
            let window_name: Vec<u16> =
                "Microsoft Text Input Application\0".encode_utf16().collect();
            hwnd = FindWindowW(class_core.as_ptr(), window_name.as_ptr());
        }
        hwnd
    }
}

/// Returns `true` when the TabTip window exists, is visible, AND is not cloaked.
///
/// Windows 10/11 keeps TabTip running as a background host process; only the
/// visible foreground keyboard is un-cloaked. This mirrors `IsCloaked` in C#.
///
/// Used by `kiosk::reassert` — if this returns `true` the kiosk must NOT
/// call `set_always_on_top` or it will instantly bury the keyboard.
#[cfg(windows)]
pub fn is_tabtip_visible() -> bool {
    unsafe {
        let hwnd = find_tabtip_hwnd();
        if hwnd == 0 || IsWindowVisible(hwnd) == 0 {
            return false;
        }
        let mut cloaked: i32 = 0;
        let hr = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED as u32,
            &mut cloaked as *mut i32 as *mut _,
            std::mem::size_of::<i32>() as u32,
        );
        !(hr == 0 && cloaked != 0)
    }
}

#[cfg(not(windows))]
pub fn is_tabtip_visible() -> bool {
    false
}

// ── COM toggle (ITipInvocation::Toggle) ────────────────────────────────────

/// Attempt to show the keyboard via COM `ITipInvocation::Toggle`.
///
/// This works even when a physical keyboard is attached because it is an
/// explicit programmatic signal, bypassing the OS hardware-keyboard suppression
/// policy. Mirrors `TryToggle()` in `OnScreenKeyboard.cs`.
///
/// Returns `true` on success, `false` if the COM server is not available.
#[cfg(windows)]
unsafe fn try_toggle_via_com() -> bool {
    let mut p_unk: *mut core::ffi::c_void = std::ptr::null_mut();

    let hr = CoCreateInstance(
        &CLSID_UI_HOST_NO_LAUNCH,
        std::ptr::null_mut(),
        CLSCTX_INPROC_SERVER | CLSCTX_LOCAL_SERVER,
        &IID_ITIP_INVOCATION,
        &mut p_unk,
    );

    if hr != 0 || p_unk.is_null() {
        log::warn!("[TabTip] CoCreateInstance failed (hr=0x{:08x}); will fall back to spawn.", hr);
        return false;
    }

    // Manual vtable dispatch (IL2CPP-safe technique from OnScreenKeyboard.cs):
    //   slot 0 = QueryInterface, slot 1 = AddRef, slot 2 = Release, slot 3 = Toggle
    let vtbl = *(p_unk as *const *const usize);

    type ToggleFn = unsafe extern "system" fn(*mut core::ffi::c_void, HWND) -> i32;
    type ReleaseFn = unsafe extern "system" fn(*mut core::ffi::c_void) -> u32;

    let toggle: ToggleFn = std::mem::transmute(*vtbl.add(3));
    toggle(p_unk, GetDesktopWindow());

    let release: ReleaseFn = std::mem::transmute(*vtbl.add(2));
    release(p_unk);

    log::info!("[TabTip] ITipInvocation::Toggle succeeded.");
    true
}

/// Spawn `TabTip.exe` as a cold-start fallback when the COM server is not yet
/// running. Mirrors `EnsureTabTipRunning()` in `OnScreenKeyboard.cs`.
#[cfg(windows)]
fn ensure_tabtip_running() {
    let path = r"C:\Program Files\Common Files\microsoft shared\ink\TabTip.exe";
    if !std::path::Path::new(path).exists() {
        log::warn!("[TabTip] TabTip.exe not found at {}.", path);
        return;
    }
    match std::process::Command::new(path).spawn() {
        Ok(_) => log::info!("[TabTip] Process spawned as fallback."),
        Err(e) => log::warn!("[TabTip] Spawn failed: {}.", e),
    }
}

// ── Public Tauri commands ──────────────────────────────────────────────────

/// Open the Windows TabTip touch keyboard.
///
/// Tries COM `ITipInvocation::Toggle` first (works with physical keyboards
/// attached), then falls back to spawning `TabTip.exe` if the COM server is
/// not yet running. Mirrors the full `OpenKeyboard()` flow in C#.
#[command]
pub fn open_tabtip() {
    #[cfg(windows)]
    unsafe {
        if !try_toggle_via_com() {
            ensure_tabtip_running();
        }
    }
}

/// Close the Windows TabTip touch keyboard gracefully via `WM_SYSCOMMAND / SC_CLOSE`.
///
/// Sends `SC_CLOSE` to the keyboard window rather than killing the host
/// process, so TabTip remains available for the next open without a cold
/// start. Mirrors `HideNow()` in `OnScreenKeyboard.cs`.
#[command]
pub fn close_tabtip() {
    #[cfg(windows)]
    unsafe {
        let hwnd = find_tabtip_hwnd();
        if hwnd != 0 {
            PostMessageW(hwnd, WM_SYSCOMMAND, SC_CLOSE as WPARAM, 0 as LPARAM);
            log::info!("[TabTip] Keyboard close signal sent.");
        } else {
            log::info!("[TabTip] Window not found for closing (already closed?).");
        }
    }
}
