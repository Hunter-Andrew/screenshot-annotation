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
  it("groups shortcuts Capture / Capture overlay / Editor in that order", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const names = screen.getAllByRole("group").map((g) => g.getAttribute("aria-label"));
    expect(names).toEqual(["Capture", "Capture overlay", "Editor"]);
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

  it("lists every registry entry once, and marks fixed ones read-only", () => {
    render(<Settings bridge={createFakeBridge()} />);
    const items = within(screen.getByRole("region", { name: "Shortcuts" })).getAllByRole("listitem");
    expect(items).toHaveLength(SHORTCUT_REGISTRY.length);
    const undo = within(group("Editor")).getByRole("listitem", { name: "Undo" });
    expect(undo).toHaveTextContent("Ctrl+Z");
    expect(undo).toHaveTextContent("Fixed");
    expect(within(group("Editor")).getByRole("listitem", { name: "Arrow" })).not.toHaveTextContent("Fixed");
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
    await user.click(changer("Arrow"));
    await user.keyboard("{Escape}");
    expect(changer("Arrow")).toHaveTextContent("A");
    expect(bridge.shortcutOverrides).toEqual({});
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("refuses a clash with a message naming the other action, and keeps the old key", async () => {
    const { bridge, user } = await setup();
    await user.click(changer("Arrow"));
    await user.keyboard("l");
    expect(await within(row("Arrow")).findByRole("alert")).toHaveTextContent(/"Line"/);
    expect(changer("Arrow")).toHaveTextContent("A");
    expect(row("Line")).toHaveTextContent("L");
    expect(bridge.shortcutOverrides).toEqual({});
  });

  it("refuses a fixed key, the Windows key and Print Screen with a reason", async () => {
    const { user } = await setup();
    await user.click(changer("Arrow"));
    await user.keyboard("{Enter}");
    expect(await within(row("Arrow")).findByRole("alert")).toHaveTextContent(/fixed/i);
    await user.click(changer("Arrow"));
    await user.keyboard("{Meta>}k{/Meta}");
    expect(await within(row("Arrow")).findByRole("alert")).toHaveTextContent(/Windows key/);
    await user.click(changer("Arrow"));
    await user.keyboard("{PrintScreen}");
    expect(await within(row("Arrow")).findByRole("alert")).toHaveTextContent(/capture hotkey/);
  });

  it("refuses a modifier pressed and released on its own", async () => {
    const { user } = await setup();
    await user.click(changer("Arrow"));
    await user.keyboard("{Control}");
    expect(await within(row("Arrow")).findByRole("alert")).toHaveTextContent(/modifier/i);
  });

  it("shows saved overrides, falling back to the default for an invalid one", async () => {
    await setup({ "tool.arrow": "K", "tool.line": "Win+L", "nope": "Z" });
    expect(await screen.findByRole("button", { name: "Change shortcut for Arrow" })).toHaveTextContent("K");
    expect(changer("Line")).toHaveTextContent("L");
  });

  it("resets one entry, and refuses when the default is taken", async () => {
    const { bridge, user } = await setup({ "tool.arrow": "K" });
    await within(row("Arrow")).findByRole("button", { name: "Reset Arrow" });
    await user.click(within(row("Arrow")).getByRole("button", { name: "Reset Arrow" }));
    await waitFor(() => expect(bridge.shortcutOverrides).toEqual({}));
    expect(changer("Arrow")).toHaveTextContent("A");
  });

  it("refuses to reset onto a key another action now holds", async () => {
    const { bridge, user } = await setup({ "tool.arrow": "K", "tool.line": "A" });
    await user.click(await within(row("Arrow")).findByRole("button", { name: "Reset Arrow" }));
    expect(await within(row("Arrow")).findByRole("alert")).toHaveTextContent(/"Line"/);
    expect(bridge.shortcutOverrides).toEqual({ "tool.arrow": "K", "tool.line": "A" });
  });

  it("Reset all clears every override, even a swapped pair", async () => {
    const { bridge, user } = await setup({ "tool.arrow": "K", "tool.line": "A", "overlay.magnifier": "N" });
    await user.click(await screen.findByRole("button", { name: "Reset all shortcuts" }));
    await waitFor(() => expect(bridge.shortcutOverrides).toEqual({}));
    expect(changer("Arrow")).toHaveTextContent("A");
    expect(changer("Toggle the magnifier")).toHaveTextContent("M");
  });

  it("follows a change made in another open Settings window", async () => {
    const { bridge } = await setup();
    await act(() => bridge.setShortcutOverrides({ "tool.arrow": "K" }));
    expect(changer("Arrow")).toHaveTextContent("K");
  });
});
