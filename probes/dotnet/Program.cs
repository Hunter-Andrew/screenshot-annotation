// Throwaway probe for the "no-admin install" test. Not product code.
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;
using Microsoft.Win32;

static class Program
{
    [DllImport("user32.dll")] static extern bool RegisterHotKey(IntPtr hWnd, int id, uint mods, uint vk);
    const uint MOD_CONTROL = 2, MOD_SHIFT = 4, VK_SNAPSHOT = 0x2C, VK_S = 0x53;

    [STAThread]
    static void Main()
    {
        ApplicationConfiguration.Initialize();
        var report = new StringBuilder();
        void Log(string s) => report.AppendLine(s);
        Log($"DotnetProbe report {DateTime.Now:u}");
        Log($"OS: {Environment.OSVersion} | 64-bit: {Environment.Is64BitOperatingSystem}");
        Log($"Exe path: {Application.ExecutablePath}");

        var win = new HotkeyWindow();
        bool prt = RegisterHotKey(win.Handle, 1, 0, VK_SNAPSHOT);
        Log($"RegisterHotKey(PrintScreen): {(prt ? "OK" : "FAILED err " + Marshal.GetLastWin32Error())}");
        bool alt = RegisterHotKey(win.Handle, 2, MOD_CONTROL | MOD_SHIFT, VK_S);
        Log($"RegisterHotKey(Ctrl+Shift+S): {(alt ? "OK" : "FAILED err " + Marshal.GetLastWin32Error())}");

        try
        {
            var snip = Registry.GetValue(@"HKEY_CURRENT_USER\Control Panel\Keyboard", "PrintScreenKeyForSnippingEnabled", "(not set)");
            Log($"PrintScreenKeyForSnippingEnabled: {snip}");
        }
        catch (Exception e) { Log($"Read snipping setting: FAILED {e.Message}"); }

        try
        {
            using var run = Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
            run.SetValue("DotnetProbe", $"\"{Application.ExecutablePath}\"");
            Log("HKCU Run (launch at sign-in): OK");
        }
        catch (Exception e) { Log($"HKCU Run: FAILED {e.Message}"); }

        try
        {
            var bounds = SystemInformation.VirtualScreen;
            using var bmp = new Bitmap(bounds.Width, bounds.Height);
            using (var g = Graphics.FromImage(bmp)) g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
            Log($"Screen capture (virtual screen {bounds}): OK");
            var pics = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyPictures), "Screenshot Annotation");
            Directory.CreateDirectory(pics);
            var file = Path.Combine(pics, "probe-dotnet.png");
            bmp.Save(file, ImageFormat.Png);
            Log($"Write to Pictures: OK ({file})");
            Clipboard.SetImage(bmp);
            Log("Clipboard image: OK (try pasting into Teams/Outlook)");
        }
        catch (Exception e) { Log($"Capture/save/clipboard: FAILED {e.Message}"); }

        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var reportPath = Path.Combine(desktop, "DotnetProbe-report.txt");
        File.WriteAllText(reportPath, report.ToString());

        var tray = new NotifyIcon { Icon = SystemIcons.Information, Visible = true, Text = "DotnetProbe" };
        tray.ContextMenuStrip = new ContextMenuStrip();
        tray.ContextMenuStrip.Items.Add("Open report", null, (_, _) => System.Diagnostics.Process.Start("notepad.exe", reportPath));
        tray.ContextMenuStrip.Items.Add("Exit", null, (_, _) => { tray.Visible = false; Application.Exit(); });
        win.Pressed = id =>
        {
            File.AppendAllText(reportPath, $"Hotkey {(id == 1 ? "PrintScreen" : "Ctrl+Shift+S")} received at {DateTime.Now:T}{Environment.NewLine}");
            tray.ShowBalloonTip(2000, "DotnetProbe", $"Hotkey {(id == 1 ? "PrintScreen" : "Ctrl+Shift+S")} received", ToolTipIcon.Info);
        };
        tray.ShowBalloonTip(3000, "DotnetProbe running", "Report written to Desktop\\DotnetProbe-report.txt", ToolTipIcon.Info);
        Application.Run();
    }
}

class HotkeyWindow : NativeWindow
{
    public Action<int>? Pressed;
    public HotkeyWindow() => CreateHandle(new CreateParams());
    protected override void WndProc(ref Message m)
    {
        if (m.Msg == 0x0312) Pressed?.Invoke((int)m.WParam);
        base.WndProc(ref m);
    }
}
