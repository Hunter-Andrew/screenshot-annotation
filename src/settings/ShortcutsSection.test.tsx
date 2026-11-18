import { render, screen, within } from "@testing-library/react";
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

  it("keeps the capture hotkey recorder under Capture", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    expect(await within(group("Capture")).findByRole("button", { name: "Ctrl+Shift+S" })).toBeVisible();
  });
});
