import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { SHORTCUT_REGISTRY } from "../shared/shortcutRegistry";
import { Settings } from "./Settings";

function group(name: string) {
  return screen.getByRole("group", { name });
}

describe("Settings > Shortcuts", () => {
  it("groups shortcuts Capture / Capture overlay / Editor / Drawing mode in that order", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const names = within(screen.getByRole("region", { name: "Shortcuts" })).getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(names).toEqual(["Capture", "Capture overlay", "Editor", "Drawing mode"]);
  });

  it("lists Space and M under Capture overlay with their bindings", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const overlay = within(group("Capture overlay"));
    expect(overlay.getByRole("listitem", { name: "Capture the whole monitor under the cursor" })).toHaveTextContent("Space");
    expect(overlay.getByRole("listitem", { name: "Toggle the magnifier" })).toHaveTextContent("M");
    expect(overlay.queryByRole("listitem", { name: "Arrow" })).toBeNull();
  });

  it("lists a tool key under Editor", () => {
    render(<Settings bridge={createFakeBridge()} />);
    expect(within(group("Editor")).getByRole("listitem", { name: "Arrow" })).toHaveTextContent("A");
  });

  it("shows Arrow, Rectangle, Pen and Highlighter read-only with the Fixed marker and no change button", () => {
    render(<Settings bridge={createFakeBridge()} />);
    for (const name of ["Arrow", "Rectangle", "Pen", "Highlighter"]) {
      expect(within(group("Editor")).getByRole("listitem", { name })).toHaveTextContent("Fixed");
      expect(screen.queryByRole("button", { name: `Change shortcut for ${name}` })).toBeNull();
    }
  });

  it("lists the Drawing mode keys read-only: A, R, P, H, Ctrl+Z, Ctrl+Y, Esc, with no change or reset control", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const drawing = within(group("Drawing mode"));
    const rows = drawing.getAllByRole("listitem");
    expect(rows.map((r) => r.querySelector("kbd")?.textContent)).toEqual(["A", "R", "P", "H", "Ctrl+Z", "Ctrl+Y", "Esc"]);
    for (const row of rows) {
      expect(row).toHaveTextContent("Fixed");
      expect(within(row).queryByRole("button")).toBeNull();
    }
    expect(drawing.getByRole("listitem", { name: "Arrow" })).toHaveTextContent("A");
  });

  it("lists every registry entry once, and marks fixed ones read-only", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const items = within(screen.getByRole("region", { name: "Shortcuts" })).getAllByRole("listitem");
    expect(items).toHaveLength(SHORTCUT_REGISTRY.length);
    const undo = within(group("Editor")).getByRole("listitem", { name: "Undo" });
    expect(undo).toHaveTextContent("Ctrl+Z");
    expect(undo).toHaveTextContent("Fixed");
    expect(within(group("Editor")).getByRole("listitem", { name: "Ellipse" })).not.toHaveTextContent("Fixed");
  });

  it("also lists the fixed editing keys that have no action of their own, read-only", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const editor = within(group("Editor"));
    const fixedKeys = editor.getByLabelText("Other fixed keys");
    const shown = Array.from(fixedKeys.querySelectorAll("dt")).map((t) => t.textContent);
    expect(shown).toEqual(["Ctrl+V", "Ctrl+X", "Ctrl+A", "Enter", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);
    expect(within(fixedKeys as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("keeps the capture hotkey recorder under Capture", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    expect(await within(group("Capture")).findByRole("button", { name: "Ctrl+Shift+S" })).toBeVisible();
  });
});

describe("Settings > Shortcuts remapping", () => {
  async function setup(stored: Record<string, string> = {}) {
    const bridge = createFakeBridge();
    if (Object.keys(stored).length > 0) await bridge.setShortcutOverrides(stored);
    const user = userEvent.setup();
    render(<Settings bridge={bridge} />);
    return { bridge, user };
  }
  const row = (name: string) => screen.getByRole("listitem", { name });
  const changer = (name: string) => within(row(name)).getByRole("button", { name: `Change shortcut for ${name}` });

  it("has a recorder button on every remappable row and none on fixed rows", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const remappable = SHORTCUT_REGISTRY.filter((a) => a.remappable);
    expect(screen.getAllByRole("button", { name: /^Change shortcut for / })).toHaveLength(remappable.length);
    expect(within(row("Undo")).queryByRole("button")).toBeNull();
  });

  it("records a new key for M, saves it as an override and shows it", async () => {
    const { bridge, user } = await setup();
    await user.click(changer("Toggle the magnifier"));
    expect(changer("Toggle the magnifier")).toHaveTextContent("Press a key");
    await user.keyboard("n");
    await waitFor(() => expect(bridge.shortcutOverrides).toEqual({ "overlay.magnifier": "N" }));
    expect(row("Toggle the magnifier")).toHaveTextContent("N");
  });

  it("records Space and a Ctrl combination", async () => {
    const { bridge, user } = await setup();
    await user.click(changer("Capture the whole monitor under the cursor"));
    await user.keyboard("{Control>}{Shift>}k{/Shift}{/Control}");
    await waitFor(() => expect(bridge.shortcutOverrides).toEqual({ "overlay.monitor": "Ctrl+Shift+K" }));
  });

  it("Esc cancels recording and changes nothing", async () => {
    const { bridge, user } = await setup();
    await user.click(changer("Ellipse"));
    await user.keyboard("{Escape}");
    expect(changer("Ellipse")).toHaveTextContent("E");
    expect(bridge.shortcutOverrides).toEqual({});
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a clash with a message naming the other action, and keeps the old key", async () => {
    const { bridge, user } = await setup();
    await user.click(changer("Ellipse"));
    await user.keyboard("l");
    expect(await within(row("Ellipse")).findByRole("alert")).toHaveTextContent(/"Line"/);
    expect(changer("Ellipse")).toHaveTextContent("E");
    expect(row("Line")).toHaveTextContent("L");
    expect(bridge.shortcutOverrides).toEqual({});
  });

  it("refuses a fixed key, the Windows key and Print Screen with a reason", async () => {
    const { user } = await setup();
    await user.click(changer("Ellipse"));
    await user.keyboard("{Enter}");
    expect(await within(row("Ellipse")).findByRole("alert")).toHaveTextContent(/fixed/i);
    await user.click(changer("Ellipse"));
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await within(row("Ellipse")).findByRole("alert")).toHaveTextContent(/Windows key/);
    await user.click(changer("Ellipse"));
    await user.keyboard("{PrintScreen}");
    expect(await within(row("Ellipse")).findByRole("alert")).toHaveTextContent(/capture hotkey/);
  });

  it("refuses a modifier pressed and released on its own", async () => {
    const { user } = await setup();
    await user.click(changer("Ellipse"));
    await user.keyboard("{Control}");
    expect(await within(row("Ellipse")).findByRole("alert")).toHaveTextContent(/modifier/i);
  });

  it("shows saved overrides, falling back to the default for an invalid one", async () => {
    await setup({ "tool.ellipse": "K", "tool.line": "Win+L", "nope": "Z" });
    expect(await screen.findByRole("button", { name: "Change shortcut for Ellipse" })).toHaveTextContent("K");
    expect(changer("Line")).toHaveTextContent("L");
  });

  it("resets one entry, and refuses when the default is taken", async () => {
    const { bridge, user } = await setup({ "tool.ellipse": "K" });
    await within(row("Ellipse")).findByRole("button", { name: "Reset Ellipse" });
    await user.click(within(row("Ellipse")).getByRole("button", { name: "Reset Ellipse" }));
    await waitFor(() => expect(bridge.shortcutOverrides).toEqual({}));
    expect(changer("Ellipse")).toHaveTextContent("E");
  });

  it("refuses to reset onto a key another action now holds", async () => {
    const { bridge, user } = await setup({ "tool.ellipse": "K", "tool.text": "E" });
    await user.click(await within(row("Ellipse")).findByRole("button", { name: "Reset Ellipse" }));
    expect(await within(row("Ellipse")).findByRole("alert")).toHaveTextContent(/"Text"/);
    expect(bridge.shortcutOverrides).toEqual({ "tool.ellipse": "K", "tool.text": "E" });
  });

  it("Reset all clears every override, even a swapped pair", async () => {
    const { bridge, user } = await setup({ "tool.ellipse": "K", "tool.text": "E", "overlay.magnifier": "N" });
    await user.click(await screen.findByRole("button", { name: "Reset all shortcuts" }));
    await waitFor(() => expect(bridge.shortcutOverrides).toEqual({}));
    expect(changer("Ellipse")).toHaveTextContent("E");
    expect(changer("Toggle the magnifier")).toHaveTextContent("M");
  });

  it("follows a change made in another open Settings window", async () => {
    const { bridge } = await setup();
    await act(() => bridge.setShortcutOverrides({ "tool.ellipse": "K" }));
    expect(changer("Ellipse")).toHaveTextContent("K");
  });
});
