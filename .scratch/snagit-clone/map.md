# Map: Snagit-style screenshot annotation app

Label: wayfinder:map

## Destination

Accepted ADRs in `docs/adr/` (one per decision), an up-to-date `GLOSSARY.md`, and an ordered build plan, together enough to start coding with nothing left to decide. Planning only: no app code.

## Notes

- **Domain:** a Windows desktop tool. The UX is Capture → annotate → Copy → Library (reopen and edit later). Terms are in `GLOSSARY.md` (Capture, Annotation, Annotated Image, Library, Export).
- **Hard constraints:**
  - **Windows only.**
  - **The work laptop never needs admin.** It only downloads and installs the app, using a per-user installer.
  - **Building and coding happen on GitHub Actions and/or the personal PC.**
  - **Install evidence:** Greenshot, VS Code, Chrome and XRM Toolbox all installed fine per-user. Visual Studio and its packages needed admin.
- **Settled in grilling (2026-11-14):**
  - **Capture modes:** region, window and full screen, plus a 3/5/10 s delay.
  - **Hotkey:** Print Screen, falling back to Ctrl+Shift+S with guidance if Print Screen is taken.
  - **Startup:** launches at sign-in into the system tray, with an off switch.
  - **Library location:** `Pictures\Screenshot Annotation`, which OneDrive may sync.
  - **Copy:** puts the Export image on the clipboard. "Save as PNG…" is a separate action.
  - **Editing history:** one version per Annotated Image (later edits overwrite it), with undo only while editing.
  - **Library cleanup:** keep everything forever, and deleting must be very easy.
  - **App type:** a desktop app, not a browser app.
- **Skills:** use grilling and domain-modeling for grilling tickets. Write ADRs in the domain-modeling ADR format.

## Decisions so far

- [Research: Windows tech stack candidates](issues/01-windows-stack-research.md): shortlist .NET WPF (best Win32 fit) and Tauri 2 (smallest, web canvas); Electron dropped.

## Not yet specified

- Ordered build plan / milestones (needs stack + UX decisions first).
- Testing strategy (depends on stack).
- Settings surface (hotkey rebinding, default colors, startup toggle): what is configurable and where.
- Behavior when the Library is on OneDrive and files are cloud-only or mid-sync.
- Accessibility and keyboard-only operation of the editor.

## Out of scope

- Video capture or recording.
- Cloud sync / share links (beyond whatever OneDrive does to the folder on its own).
- OCR / text extraction.
- Scrolling / panoramic capture.
- Templates, themes, stamp libraries.
- Version history of an Annotated Image.
- macOS / Linux.
- Browser-based app.
