//! A passive Raw Input listener for bare Print Screen (ticket 26, ADR 0007). `RegisterHotKey`
//! never delivers WM_HOTKEY for bare Print Screen on Andrew's laptop, so while that is the
//! capture hotkey this thread watches the keyboard instead: a hidden message-only window that
//! registered for keyboard Raw Input with `RIDEV_INPUTSINK` (events arrive even when another app
//! has the focus) and turns each Print Screen event into a log line and, per
//! `print_screen_key::Decider`, at most one capture per press.
//!
//! Strictly passive: no `RIDEV_NOLEGACY`, no `SetWindowsHookEx` / `WH_KEYBOARD_LL`, and the key is
//! never blocked or swallowed, so Windows still performs its own screen copy to the clipboard
//! (the capture's automatic copy replaces it later; see `deliver_capture` in lib.rs).
//!
//! The Windows part cannot be run on the Linux build machine; it is only type-checked there.

use std::sync::Arc;

/// Called (on the listener thread) once per Print Screen press.
pub type OnTrigger = Arc<dyn Fn() + Send + Sync>;

#[cfg(windows)]
pub use imp::Listener;

#[cfg(not(windows))]
pub use stub::Listener;

#[cfg(not(windows))]
mod stub {
    use super::OnTrigger;

    pub struct Listener;

    impl Listener {
        pub fn start(_on_trigger: OnTrigger) -> Result<Listener, String> {
            Err("Raw Input exists only on Windows".into())
        }
        pub fn stop(self) {}
    }
}

#[cfg(windows)]
mod imp {
    use std::cell::RefCell;
    use std::sync::mpsc;
    use std::thread::JoinHandle;
    use std::time::{Duration, Instant};

    use windows::core::w;
    use windows::Win32::Foundation::{GetLastError, HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_SNAPSHOT,
    };
    use windows::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE, RAWINPUTHEADER,
        RIDEV_INPUTSINK, RIDEV_REMOVE, RID_INPUT, RIM_TYPEKEYBOARD,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, DispatchMessageW, GetMessageW, PostMessageW,
        PostQuitMessage, RegisterClassExW, UnregisterClassW, HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE,
        WM_CLOSE, WM_DESTROY, WM_INPUT, WNDCLASSEXW,
    };

    use super::OnTrigger;
    use crate::diag;
    use crate::print_screen_key::{describe_event, Decider, Decision, KeyEvent};

    /// RAWKEYBOARD.Flags bit: the key was released (RI_KEY_BREAK).
    const RI_KEY_BREAK: u16 = 1;
    /// Generic Desktop page, Keyboard usage.
    const USAGE_PAGE_GENERIC: u16 = 0x01;
    const USAGE_KEYBOARD: u16 = 0x06;
    const START_TIMEOUT: Duration = Duration::from_secs(5);

    /// What the window procedure needs; it lives on the listener thread only.
    struct ThreadState {
        decider: Decider,
        started: Instant,
        on_trigger: OnTrigger,
    }

    thread_local! {
        static STATE: RefCell<Option<ThreadState>> = const { RefCell::new(None) };
    }

    /// A running listener. `stop` (or dropping it) closes the window and ends the thread.
    pub struct Listener {
        hwnd: isize,
        thread: Option<JoinHandle<()>>,
    }

    impl Listener {
        /// Starts the thread and waits until it has registered for Raw Input (or failed, with why).
        pub fn start(on_trigger: OnTrigger) -> Result<Listener, String> {
            let (tx, rx) = mpsc::channel::<Result<isize, String>>();
            let thread = std::thread::Builder::new()
                .name("print-screen-raw-input".into())
                .spawn(move || run(on_trigger, tx))
                .map_err(|e| format!("could not start the listener thread: {e}"))?;
            match rx.recv_timeout(START_TIMEOUT) {
                Ok(Ok(hwnd)) => Ok(Listener { hwnd, thread: Some(thread) }),
                Ok(Err(message)) => {
                    let _ = thread.join();
                    Err(message)
                }
                Err(_) => Err("the listener thread did not report back in time".into()),
            }
        }

        pub fn stop(self) {
            drop(self);
        }
    }

    impl Drop for Listener {
        fn drop(&mut self) {
            // SAFETY: posting a message to a window handle is sound even if the window is gone.
            let posted = unsafe { PostMessageW(Some(HWND(self.hwnd as *mut _)), WM_CLOSE, WPARAM(0), LPARAM(0)) };
            if let Some(thread) = self.thread.take() {
                if posted.is_ok() {
                    let _ = thread.join();
                }
            }
            diag::log("raw input listener stopped");
        }
    }

    fn run(on_trigger: OnTrigger, started: mpsc::Sender<Result<isize, String>>) {
        // SAFETY: plain Win32 calls with valid arguments; the window class name is a static literal.
        let setup = unsafe { create_window_and_register() };
        match setup {
            Err(message) => {
                let _ = started.send(Err(message));
            }
            Ok(hwnd) => {
                STATE.with(|s| {
                    *s.borrow_mut() = Some(ThreadState { decider: Decider::new(), started: Instant::now(), on_trigger })
                });
                diag::log(&format!(
                    "raw input listener started (hwnd {:#x}): RegisterRawInputDevices ok, usage page 0x01 usage 0x06, RIDEV_INPUTSINK; passive, no hook, no key blocking",
                    hwnd.0 as isize
                ));
                let _ = started.send(Ok(hwnd.0 as isize));
                let mut msg = MSG::default();
                // SAFETY: standard message loop on the thread that owns the window.
                unsafe {
                    while GetMessageW(&mut msg, None, 0, 0).as_bool() {
                        DispatchMessageW(&msg);
                    }
                    let _ = UnregisterClassW(CLASS_NAME, None);
                }
                STATE.with(|s| *s.borrow_mut() = None);
            }
        }
    }

    const CLASS_NAME: windows::core::PCWSTR = w!("ScreenshotAnnotationPrintScreenRawInput");

    /// SAFETY: call from the thread that will run the message loop.
    unsafe fn create_window_and_register() -> Result<HWND, String> {
        let instance = GetModuleHandleW(None).map_err(|e| format!("GetModuleHandleW: {e}"))?;
        let class = WNDCLASSEXW {
            cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
            lpfnWndProc: Some(wnd_proc),
            hInstance: instance.into(),
            lpszClassName: CLASS_NAME,
            ..Default::default()
        };
        if RegisterClassExW(&class) == 0 {
            return Err(format!("RegisterClassExW failed: {:?}", GetLastError()));
        }
        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            CLASS_NAME,
            w!(""),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE),
            None,
            Some(instance.into()),
            None,
        )
        .map_err(|e| {
            let _ = UnregisterClassW(CLASS_NAME, None);
            format!("CreateWindowExW (message-only window) failed: {e}")
        })?;
        let device = RAWINPUTDEVICE {
            usUsagePage: USAGE_PAGE_GENERIC,
            usUsage: USAGE_KEYBOARD,
            dwFlags: RIDEV_INPUTSINK, // never RIDEV_NOLEGACY: the key must still reach Windows and other apps
            hwndTarget: hwnd,
        };
        if let Err(e) = RegisterRawInputDevices(&[device], std::mem::size_of::<RAWINPUTDEVICE>() as u32) {
            let _ = DestroyWindow(hwnd);
            let _ = UnregisterClassW(CLASS_NAME, None);
            return Err(format!("RegisterRawInputDevices failed: {e}"));
        }
        Ok(hwnd)
    }

    unsafe extern "system" fn wnd_proc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        match msg {
            WM_INPUT => on_input(HRAWINPUT(lparam.0 as *mut _)),
            WM_CLOSE => {
                // Stop receiving before the window goes (hwndTarget must be null for RIDEV_REMOVE).
                let remove = RAWINPUTDEVICE {
                    usUsagePage: USAGE_PAGE_GENERIC,
                    usUsage: USAGE_KEYBOARD,
                    dwFlags: RIDEV_REMOVE,
                    hwndTarget: HWND::default(),
                };
                if let Err(e) = RegisterRawInputDevices(&[remove], std::mem::size_of::<RAWINPUTDEVICE>() as u32) {
                    diag::log(&format!("raw input: removing the keyboard registration failed: {e}"));
                }
                let _ = DestroyWindow(hwnd);
                return LRESULT(0);
            }
            WM_DESTROY => {
                PostQuitMessage(0);
                return LRESULT(0);
            }
            _ => {}
        }
        // Raw Input messages must also reach DefWindowProc (it frees the input data).
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    fn modifier_down(vk: u16) -> bool {
        // SAFETY: GetAsyncKeyState has no preconditions.
        unsafe { GetAsyncKeyState(i32::from(vk)) < 0 }
    }

    fn on_input(handle: HRAWINPUT) {
        // 8-byte aligned buffer, large enough for a keyboard RAWINPUT.
        let mut buffer = [0u64; 16];
        let mut size = std::mem::size_of_val(&buffer) as u32;
        // SAFETY: `buffer` is valid for `size` bytes and aligned for RAWINPUT; `size` is updated by the call.
        let copied = unsafe {
            GetRawInputData(
                handle,
                RID_INPUT,
                Some(buffer.as_mut_ptr().cast()),
                &mut size,
                std::mem::size_of::<RAWINPUTHEADER>() as u32,
            )
        };
        if copied == u32::MAX || (copied as usize) < std::mem::size_of::<RAWINPUTHEADER>() {
            return;
        }
        // SAFETY: GetRawInputData filled a RAWINPUT (header + data) at the start of the aligned buffer.
        let raw = unsafe { &*(buffer.as_ptr() as *const RAWINPUT) };
        if raw.header.dwType != RIM_TYPEKEYBOARD.0 {
            return;
        }
        // SAFETY: dwType says the union holds keyboard data.
        let key = unsafe { raw.data.keyboard };
        if key.VKey != VK_SNAPSHOT.0 {
            return;
        }
        let event = KeyEvent {
            is_break: key.Flags & RI_KEY_BREAK != 0,
            flags: key.Flags,
            make_code: key.MakeCode,
            modifiers_down: [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN].iter().any(|vk| modifier_down(vk.0)),
        };
        STATE.with(|cell| {
            let mut guard = cell.borrow_mut();
            let Some(state) = guard.as_mut() else { return };
            let now = state.started.elapsed().as_millis() as u64;
            diag::log(&format!("{} message={:#x} vkey={:#04x}", describe_event(&event, now), key.Message, key.VKey));
            let decision = state.decider.on_event(&event, now);
            diag::log(&format!("raw input: PrintScreen decision: {}", decision.describe()));
            if matches!(decision, Decision::Trigger(_)) {
                (state.on_trigger)();
            }
        });
    }
}
