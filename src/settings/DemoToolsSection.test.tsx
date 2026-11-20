import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { renderShortcuts } from "./renderShortcuts";

const field = (name: string) => screen.findByRole("button", { name });

describe("Settings > Demo tools", () => {
  it("comes after Shortcuts and shows both defaults", async () => {
    renderShortcuts(createFakeBridge());
    const demo = await screen.findByRole("heading", { name: "Demo tools" });
    const shortcuts = screen.getByRole("heading", { name: "Shortcuts" });
    expect(shortcuts.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await field("Laser pointer hotkey: Alt+P")).toBeVisible();
    expect(await field("Drawing mode hotkey: Alt+D")).toBeVisible();
  });

  it("records a new laser pointer hotkey", async () => {
    const bridge = createFakeBridge();
    renderShortcuts(bridge);
    await userEvent.click(await field("Laser pointer hotkey: Alt+P"));
    await userEvent.keyboard("{Control>}{Alt>}p{/Alt}{/Control}");
    expect(await field("Laser pointer hotkey: Ctrl+Alt+P")).toBeVisible();
    expect(bridge.laserPointerHotkey).toBe("ctrl+alt+p");
    expect(bridge.drawingModeHotkey).toBe("alt+d");
  });

  it("refuses the other demo hotkey, naming it, and keeps the old one", async () => {
    const bridge = createFakeBridge();
    renderShortcuts(bridge);
    await userEvent.click(await field("Laser pointer hotkey: Alt+P"));
    await userEvent.keyboard("{Alt>}d{/Alt}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Drawing mode/);
    expect(bridge.laserPointerHotkey).toBe("alt+p");
  });

  it("refuses the capture hotkey and Print Screen", async () => {
    const bridge = createFakeBridge();
    renderShortcuts(bridge);
    await userEvent.click(await field("Drawing mode hotkey: Alt+D"));
    await userEvent.keyboard("{Control>}{Shift>}s{/Shift}{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/capture hotkey/i);
    await userEvent.click(await field("Drawing mode hotkey: Alt+D"));
    fireEvent.keyUp(window, { code: "PrintScreen" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Print Screen/);
    expect(bridge.drawingModeHotkey).toBe("alt+d");
  });

  it("shows the conflict message when another app owns the combination", async () => {
    const bridge = createFakeBridge();
    bridge.takenHotkeys.add("ctrl+alt+j");
    renderShortcuts(bridge);
    await userEvent.click(await field("Drawing mode hotkey: Alt+D"));
    await userEvent.keyboard("{Control>}{Alt>}j{/Alt}{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Ctrl+Alt+J is already in use by another app");
    expect(bridge.drawingModeHotkey).toBe("alt+d");
  });
});
