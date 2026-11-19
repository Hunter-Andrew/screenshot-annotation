import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Settings } from "./Settings";

const field = (name: string) => screen.findByRole("button", { name });

describe("Settings > Demo tools", () => {
  it("comes after Shortcuts and shows both defaults", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    const demo = await screen.findByRole("heading", { name: "Demo tools" });
    const shortcuts = screen.getByRole("heading", { name: "Shortcuts" });
    expect(shortcuts.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await field("Pointer highlight hotkey: Ctrl+Shift+L")).toBeVisible();
    expect(await field("Drawing mode hotkey: Ctrl+Shift+D")).toBeVisible();
  });

  it("records a new pointer highlight hotkey", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await field("Pointer highlight hotkey: Ctrl+Shift+L"));
    await userEvent.keyboard("{Control>}{Alt>}p{/Alt}{/Control}");
    expect(await field("Pointer highlight hotkey: Ctrl+Alt+P")).toBeVisible();
    expect(bridge.pointerHighlightHotkey).toBe("ctrl+alt+p");
    expect(bridge.drawingModeHotkey).toBe("ctrl+shift+d");
  });

  it("refuses the other demo hotkey, naming it, and keeps the old one", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await field("Pointer highlight hotkey: Ctrl+Shift+L"));
    await userEvent.keyboard("{Control>}{Shift>}d{/Shift}{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Drawing mode/);
    expect(bridge.pointerHighlightHotkey).toBe("ctrl+shift+l");
  });

  it("refuses the capture hotkey and Print Screen", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await field("Drawing mode hotkey: Ctrl+Shift+D"));
    await userEvent.keyboard("{Control>}{Shift>}s{/Shift}{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/capture hotkey/i);
    await userEvent.click(await field("Drawing mode hotkey: Ctrl+Shift+D"));
    fireEvent.keyUp(window, { code: "PrintScreen" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Print Screen/);
    expect(bridge.drawingModeHotkey).toBe("ctrl+shift+d");
  });

  it("shows the conflict message when another app owns the combination", async () => {
    const bridge = createFakeBridge();
    bridge.takenHotkeys.add("ctrl+alt+j");
    render(<Settings bridge={bridge} />);
    await userEvent.click(await field("Drawing mode hotkey: Ctrl+Shift+D"));
    await userEvent.keyboard("{Control>}{Alt>}j{/Alt}{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Ctrl+Alt+J is already in use by another app");
    expect(bridge.drawingModeHotkey).toBe("ctrl+shift+d");
  });
});
