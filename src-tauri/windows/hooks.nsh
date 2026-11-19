; NSIS installer hooks for Sigil (Screenshot Annotation) (tauri.conf.json: bundle.windows.nsis.installerHooks).
; Tauri's template calls these macros; see docs/release-checklist.md for how to verify them by hand.
;
; Data safety (ADR 0004, 0006): these hooks delete no file or folder (the one registry value they remove is
; described at NSIS_HOOK_POSTUNINSTALL). Tauri's own uninstaller removes
; $APPDATA\<identifier> and $LOCALAPPDATA\<identifier> only when the "Delete the application data"
; checkbox is ticked and it is not an update, and it never touches the Pictures library folder.
; The app must keep settings, tool styles, history and the thumbnail cache under those two
; <identifier> folders (Tauri's app_data_dir / app_local_data_dir) for that checkbox to cover them.

; The tray app has no window to close, so end it before files are replaced. Running first, this
; also replaces the template's "app is running, kill it?" prompt, which then finds nothing to ask.
; taskkill exits 128 when the process is not running; that is fine and ignored.
!macro NSIS_HOOK_PREINSTALL
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "${MAINBINARYNAME}.exe"'
  Pop $0
  Sleep 500
!macroend

; On an upgrade the old version's uninstaller runs first, then this installer's files go in.
!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec '"$SYSDIR\taskkill.exe" /F /IM "${MAINBINARYNAME}.exe"'
  Pop $0
  Sleep 500
!macroend

; Relaunch after installing. The GUI installer's finish page already offers "Run" (ticked by
; default), and /R launches the app from .onInstSuccess in silent and passive modes, so only
; launch here for silent/passive installs that did not pass /R. That avoids a second launch.
!macro NSIS_HOOK_POSTINSTALL
  ${If} ${Silent}
  ${OrIf} $PassiveMode = 1
    ${GetOptions} $CMDLINE "/R" $0
    ${If} ${Errors}
      nsis_tauri_utils::RunAsUser "$INSTDIR\${MAINBINARYNAME}.exe" ""
    ${EndIf}
  ${EndIf}
!macroend

; Launch at sign-in (ticket 23) is a value in the per-user Run key that the app writes itself
; (src-tauri/src/autostart.rs, same key and name). Remove just that value on uninstall, so Windows is
; not left trying to start a deleted program. On an upgrade this runs too (the old version's
; uninstaller), and the relaunched app writes the value again if the setting is still on. The key
; itself and every other value in it are never touched.
!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Screenshot Annotation"
!macroend
