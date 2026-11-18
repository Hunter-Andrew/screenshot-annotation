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
- [Task: Prove a per-user install works on the work laptop](issues/02-no-admin-install-test.md): both Tauri and .NET install, run, capture and copy without admin (SmartScreen can be bypassed). Print Screen gets swallowed by Snipping Tool.
- [Grilling: Choose the tech stack](issues/03-choose-stack.md): Tauri 2 + per-user NSIS installer, built on GitHub Actions ([ADR 0001](../../docs/adr/0001-tauri-2-per-user-nsis.md)).
- [Grilling: Annotation tools and their properties](issues/05-annotation-tool-set.md): 8 tools (arrow, line, pen, rect, ellipse, text, callout, highlighter, pixelate blur) built from shared property groups; crop and blur are non-destructive ([ADR 0002](../../docs/adr/0002-non-destructive-blur-and-crop.md)).
- [Grilling: Capture flow](issues/06-capture-flow.md): one hotkey and overlay with region, window and monitor modes, one monitor per capture, release captures instantly into a single pre-warmed editor ([ADR 0003](../../docs/adr/0003-prewarmed-hidden-windows.md)), and a Library Strip along the editor's bottom.
- [Grilling: Annotated Image storage format](issues/07-annotated-image-storage.md): one finished-looking PNG per image in month folders, with the Capture and Annotations embedded; Exports are always plain ([ADR 0004](../../docs/adr/0004-single-png-with-embedded-editable-data.md)).
- [Grilling: UI framework and canvas library](issues/11-ui-framework-canvas.md): React + TypeScript; an app-owned Annotation model ([ADR 0005](../../docs/adr/0005-app-owned-annotation-model.md)); persistent 200-step undo kept in local app data with 2-month expiry. The canvas library goes to a prototype.
- [Grilling: Distribution and updates](issues/09-distribution-updates.md): tag-triggered public GitHub Releases, manual install-over updates, unsigned, no network calls ([ADR 0006](../../docs/adr/0006-manual-updates-unsigned-no-network.md)).
- [Grilling: Claiming Print Screen from Snipping Tool](issues/10-print-screen-hotkey.md): detect the Snipping Tool setting, show a one-time notice deep-linking to the Windows toggle, and make the hotkey rebindable (default Print Screen, fallback Ctrl+Shift+S).
- [Prototype: Konva vs Fabric text editing](issues/12-konva-vs-fabric-prototype.md): Fabric.js, chosen for its built-in on-canvas text editing; callouts use a Textbox with synced box and tail shapes.
- [Prototype: Editor layout and tool behavior](issues/04-editor-ux-prototype.md): Snagit-style side panels (tools left, Style right, actions top, Library Strip bottom) with single-key tool shortcuts.
- [Prototype: Library window](issues/08-library-ux-prototype.md): "All captures" opens a full-window date-grouped grid; hover Copy/✕, multi-select delete with Undo, and Capture plus delay buttons in the top bar.
- [Grilling: Settings screen](issues/13-settings-screen.md): a small Settings window (hotkey, launch at sign-in, read-only Library folder, reset tool styles, About); tray menu with left-click to open the editor; closing the editor hides it to the tray.
- [Grilling: Testing strategy](issues/14-testing-strategy.md): test-first unit tests for the model, PNG embedding, export safety, history and Library; a small Playwright end-to-end suite; Windows CI gating releases; a manual 10-minute release checklist (including speed) that agents remind Andrew to run.
- [Grilling: Build order and milestones](issues/15-build-order.md): M0 skeleton (v0.1) → M1 capture and copy (v0.2) → M2 annotate (v0.3) → M3 Library (v0.4) → M4 complete (v0.5) → M5 shortcuts, polish and facelift (v0.6, added 2026-11-15) → M6 desktop demo tools (v1.0, split out 2026-11-18); all milestones are ticketed as vertical slices in `.scratch/v1/issues/`.

**Map complete (2026-11-14):** no open decisions remain; implementation starts with M0.

## Not yet specified

- Accessibility beyond keyboard shortcuts (screen reader labels, high contrast) — revisit after the build order.

## Out of scope

- Video capture or recording.
- Cloud sync / share links (beyond whatever OneDrive does to the folder on its own).
- OCR / text extraction.
- Scrolling / panoramic capture.
- Templates, themes, stamp libraries.
- Version history of an Annotated Image.
- Step numbers: deferred to a future phase ([Annotation tools and their properties](issues/05-annotation-tool-set.md)).
- Magnifier / spotlight tools; curved or elbow arrows; non-pixelate blur; "permanently apply blur".
- Low-level keyboard hooks to steal Print Screen ([Claiming Print Screen from Snipping Tool](issues/10-print-screen-hotkey.md)).
- macOS / Linux.
- Browser-based app.
