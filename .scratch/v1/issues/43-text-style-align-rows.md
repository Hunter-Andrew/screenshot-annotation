# 43: Text style panel: vertical alignment on the second row

**What to build:** In the Text and Callout Style panel, the vertical alignment buttons (Top, Middle, Bottom) are split across rows: Top sits on the first row, with the horizontal alignment buttons, while Middle and Bottom wrap onto the second row. Put the horizontal alignment (Left, Centre, Right) alone on the first row, and all three vertical alignment buttons (Top, Middle, Bottom) together on the second row. Requested by Andrew on 2026-11-18.

**Blocked by:** the v1.0.0 release (M0 to M4 complete).

**Status:** ready-for-agent

## Notes

- The wrapping comes from the M4 fix that stopped the font controls overflowing sideways (`.presets` and `.style-panel .row` wrap). The fix is to group the horizontal and the vertical alignment buttons into two explicit rows (`valign` group in `src/editor/style/groups.tsx`), so a wrap can never split a group.
- Purely layout: no behaviour change; the existing locators (button names) must keep working, and the no-horizontal-scroll e2e (`e2e/m4settings.spec.ts`) must still pass for a Text and a Callout.

Planned for M5 (v1.1.0).
