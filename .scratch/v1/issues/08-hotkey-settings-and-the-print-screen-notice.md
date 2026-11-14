# 08: Hotkey settings and the Print Screen notice

**What to build:** In Settings, Andrew clicks the hotkey field and presses a new combination, and the app warns if it's already taken. If Windows' PrintScreenKeyForSnippingEnabled is not explicitly 0, a one-time notice offers [Open Windows setting], which deep-links to Accessibility → Keyboard, or [Keep Ctrl+Shift+S]. The app never writes that value.

**Blocked by:** 04 (Tracer: hotkey → monitor capture → editor → Copy, saved to Library)

**Status:** ready-for-agent

- [ ] The recorder saves and re-registers the hotkey; a conflict shows a warning
- [ ] The notice appears once when the setting is on or missing (e2e with the fake bridge)
- [ ] The deep link opens the right Settings page
- [ ] No low-level keyboard hooks

Spec: `.scratch/snagit-clone/spec.md`.
