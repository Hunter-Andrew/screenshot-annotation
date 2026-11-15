//! Freezing the screen: one native-resolution frame per monitor, without the mouse pointer.
//! Windows only (GDI `BitBlt` from the screen DC never draws the cursor). Which part of the
//! frames becomes the Capture is the overlay's choice (see overlay.rs); the geometry is in
//! geometry.rs.

use crate::geometry::MonitorBounds;

/// One monitor frozen at the moment of the hotkey.
pub struct MonitorFrame {
    pub bounds: MonitorBounds,
    /// Tightly packed opaque RGBA rows, `bounds.width` x `bounds.height`.
    pub rgba: Vec<u8>,
}

#[cfg(windows)]
mod win {
    use super::MonitorFrame;
    use crate::capture_image::bgra_to_opaque_rgba;
    use crate::geometry::MonitorBounds;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, EnumDisplayMonitors,
        GetDC, GetDIBits, GetMonitorInfoW, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        CAPTUREBLT, DIB_RGB_COLORS, HDC, HMONITOR, MONITORINFO, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe extern "system" fn collect(monitor: HMONITOR, _dc: HDC, _rect: *mut RECT, data: LPARAM) -> BOOL {
        let monitors = &mut *(data.0 as *mut Vec<HMONITOR>);
        monitors.push(monitor);
        BOOL(1)
    }

    /// The mouse pointer position on the virtual screen, in physical pixels.
    pub fn cursor_position() -> Result<(i32, i32), String> {
        let mut cursor = POINT::default();
        unsafe { GetCursorPos(&mut cursor) }.map_err(|e| e.to_string())?;
        Ok((cursor.x, cursor.y))
    }

    /// Read a rectangle of the virtual screen as opaque RGBA. The process is per-monitor DPI
    /// aware (Tauri/tao), so coordinates and pixels are physical: no scaling happens here.
    unsafe fn grab_rect(left: i32, top: i32, width: i32, height: i32) -> Result<Vec<u8>, String> {
        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        let previous = SelectObject(memory, bitmap.into());

        let blit = BitBlt(memory, 0, 0, width, height, Some(screen), left, top, SRCCOPY | CAPTUREBLT);
        let mut pixels = vec![0u8; (width as usize) * (height as usize) * 4];
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                biHeight: -height, // top-down rows
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let rows = GetDIBits(
            memory,
            bitmap,
            0,
            height as u32,
            Some(pixels.as_mut_ptr().cast()),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        SelectObject(memory, previous);
        let _ = DeleteObject(bitmap.into());
        let _ = DeleteDC(memory);
        ReleaseDC(None, screen);

        blit.map_err(|e| e.to_string())?;
        if rows == 0 {
            return Err("GetDIBits failed".into());
        }
        bgra_to_opaque_rgba(&mut pixels);
        Ok(pixels)
    }

    /// Freeze every monitor. The index in the returned list is the monitor's number everywhere else.
    pub fn grab_monitors() -> Result<Vec<MonitorFrame>, String> {
        let mut handles: Vec<HMONITOR> = Vec::new();
        unsafe {
            let ok = EnumDisplayMonitors(None, None, Some(collect), LPARAM(&mut handles as *mut _ as isize));
            if !ok.as_bool() {
                return Err("EnumDisplayMonitors failed".into());
            }
            let mut frames = Vec::new();
            for handle in handles {
                let mut info = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
                if !GetMonitorInfoW(handle, &mut info).as_bool() {
                    return Err("GetMonitorInfoW failed".into());
                }
                let r = info.rcMonitor;
                let (width, height) = (r.right - r.left, r.bottom - r.top);
                if width <= 0 || height <= 0 {
                    continue;
                }
                let rgba = grab_rect(r.left, r.top, width, height)?;
                frames.push(MonitorFrame {
                    bounds: MonitorBounds { x: r.left, y: r.top, width: width as u32, height: height as u32 },
                    rgba,
                });
            }
            if frames.is_empty() {
                return Err("no monitors found".into());
            }
            Ok(frames)
        }
    }
}

#[cfg(windows)]
pub use win::{cursor_position, grab_monitors};

#[cfg(not(windows))]
pub fn cursor_position() -> Result<(i32, i32), String> {
    Err("Capture is only implemented on Windows".into())
}

#[cfg(not(windows))]
pub fn grab_monitors() -> Result<Vec<MonitorFrame>, String> {
    Err("Capture is only implemented on Windows".into())
}
