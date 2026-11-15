//! Capture of the monitor under the cursor at native resolution, without the mouse pointer.
//! Windows only (GDI `BitBlt` from the screen DC never draws the cursor). The region and window
//! modes of ticket 05/06 will replace "monitor under cursor" with the overlay's choice.

pub struct Captured {
    pub width: u32,
    pub height: u32,
    /// Plain RGBA PNG of the monitor.
    pub png: Vec<u8>,
}

#[cfg(windows)]
pub fn capture_monitor_under_cursor() -> Result<Captured, String> {
    use crate::capture_image::{bgra_to_opaque_rgba, encode_png};
    use windows::Win32::Foundation::POINT;
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC,
        GetDIBits, GetMonitorInfoW, MonitorFromPoint, ReleaseDC, SelectObject, BITMAPINFO,
        BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS, MONITORINFO,
        MONITOR_DEFAULTTONEAREST, SRCCOPY,
    };
    use windows::Win32::UI::WindowsAndMessaging::GetCursorPos;

    unsafe {
        let mut cursor = POINT::default();
        GetCursorPos(&mut cursor).map_err(|e| e.to_string())?;
        let monitor = MonitorFromPoint(cursor, MONITOR_DEFAULTTONEAREST);
        let mut info = MONITORINFO {
            cbSize: std::mem::size_of::<MONITORINFO>() as u32,
            ..Default::default()
        };
        if !GetMonitorInfoW(monitor, &mut info).as_bool() {
            return Err("GetMonitorInfoW failed".into());
        }
        // Physical pixels: the process is per-monitor DPI aware (Tauri/tao), so no scaling here.
        let r = info.rcMonitor;
        let (width, height) = (r.right - r.left, r.bottom - r.top);
        if width <= 0 || height <= 0 {
            return Err("monitor has no size".into());
        }

        let screen = GetDC(None);
        let memory = CreateCompatibleDC(Some(screen));
        let bitmap = CreateCompatibleBitmap(screen, width, height);
        let previous = SelectObject(memory, bitmap.into());

        let blit = BitBlt(memory, 0, 0, width, height, Some(screen), r.left, r.top, SRCCOPY | CAPTUREBLT);
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
        let png = encode_png(width as u32, height as u32, &pixels)?;
        Ok(Captured { width: width as u32, height: height as u32, png })
    }
}

#[cfg(not(windows))]
pub fn capture_monitor_under_cursor() -> Result<Captured, String> {
    Err("Capture is only implemented on Windows".into())
}
