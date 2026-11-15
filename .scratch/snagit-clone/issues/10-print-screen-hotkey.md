# Grilling: Claiming Print Screen from Snipping Tool

Type: grilling
Status: resolved
Blocked by: 03

## Question

On Windows 11, Print Screen goes to Snipping Tool by default, and our `RegisterHotKey` "succeeds" but never fires (proven by the no-admin install test). How should the app get Print Screen?

- **(a)** Offer to turn off `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled`. Find out whether that needs a sign-out.
- **(b)** Use a low-level keyboard hook.
- **(c)** Default to Ctrl+Shift+S and document how to change it.

Deferred by Andrew. Not blocking the stack choice.

## Answer

Decided with Andrew on 2026-11-14.

**Detection**
- Don't trust `RegisterHotKey`: it reports success while Snipping Tool still takes the key.
- Read `HKCU\Control Panel\Keyboard\PrintScreenKeyForSnippingEnabled` instead. Treat it as **on unless explicitly 0** (the Windows 11 default).

**First-run notice.** When the setting is on, show a one-time notice: "Print Screen opens Snipping Tool. Use it for Screenshot Annotation instead?" with two buttons:
- **[Open Windows setting]** deep-links to Settings → Accessibility → Keyboard, where the user flips the toggle themselves.
- **[Keep Ctrl+Shift+S]**.

The app never edits that registry value itself. Ctrl+Shift+S works meanwhile.

**Rebindable hotkey.** The capture hotkey can be changed in Settings (default Print Screen, fallback Ctrl+Shift+S), with a warning if the chosen combination is already registered by another app.

**Out of scope:** low-level keyboard hooks (fragile, may alarm endpoint security, may not beat Snipping Tool).

Correction (2026-11-15, ticket v1/29): "Accessibility → Keyboard" above is the wrong place on current Windows 11; the setting is under Settings > Bluetooth & devices > Keyboard. The spec (`spec.md`, Notice) carries the same wording and is left as written.
