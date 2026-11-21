import { fireEvent, screen, waitFor } from "@testing-library/react";
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
    expect(await field("Open or close the editor hotkey: Alt+E")).toBeVisible();
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

  it("records a new editor hotkey and saves it", async () => {
    const bridge = createFakeBridge();
    renderShortcuts(bridge);
    await userEvent.click(await field("Open or close the editor hotkey: Alt+E"));
    await userEvent.keyboard("{Control>}{Alt>}w{/Alt}{/Control}");
    expect(await field("Open or close the editor hotkey: Ctrl+Alt+W")).toBeVisible();
    expect(bridge.editorHotkey).toBe("ctrl+alt+w");
    expect(bridge.laserPointerHotkey).toBe("alt+p");
  });

  it("refuses a combination another extra hotkey has, naming it, and keeps the old editor hotkey", async () => {
    const bridge = createFakeBridge();
    renderShortcuts(bridge);
    await userEvent.click(await field("Open or close the editor hotkey: Alt+E"));
    await userEvent.keyboard("{Alt>}p{/Alt}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Laser pointer/);
    expect(bridge.editorHotkey).toBe("alt+e");
    // And the other way: the laser pointer cannot take the editor's combination.
    await userEvent.click(await field("Laser pointer hotkey: Alt+P"));
    await userEvent.keyboard("{Alt>}e{/Alt}");
    await waitFor(() => expect(screen.getAllByRole("alert").map((alert) => alert.textContent).join("|")).toMatch(/already the editor hotkey/));
    expect(bridge.laserPointerHotkey).toBe("alt+p");
  });

  it("refuses Print Screen, so Alt+Print Screen is not available for the editor hotkey", async () => {
    const bridge = createFakeBridge();
    renderShortcuts(bridge);
    await userEvent.click(await field("Open or close the editor hotkey: Alt+E"));
    fireEvent.keyDown(window, { code: "PrintScreen", altKey: true });
    expect(await screen.findByRole("alert")).toHaveTextContent(/Print Screen/);
    expect(bridge.editorHotkey).toBe("alt+e");
  });
});
