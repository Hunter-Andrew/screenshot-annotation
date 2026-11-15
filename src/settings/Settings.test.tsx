import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Settings } from "./Settings";

describe("Settings > About", () => {
  it("shows the installed version", async () => {
    const bridge = createFakeBridge({ version: "1.2.3" });
    render(<Settings bridge={bridge} />);
    expect(await screen.findByText("Version 1.2.3")).toBeVisible();
  });

  it("Check for updates opens the GitHub Releases page and nothing else", async () => {
    const bridge = createFakeBridge({ version: "1.2.3" });
    render(<Settings bridge={bridge} />);
    await userEvent.click(screen.getByRole("button", { name: "Check for updates" }));
    expect(bridge.openedUrls).toEqual([
      "https://github.com/Hunter-Andrew/screenshot-annotation/releases",
    ]);
  });
});

describe("Settings > Capture hotkey", () => {
  it("shows the current hotkey", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    expect(await screen.findByRole("button", { name: "Ctrl+Shift+S" })).toBeVisible();
  });

  it("records a new combination, registers it and shows it", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    expect(screen.getByRole("button", { name: /Press a key combination/ })).toBeVisible();
    await userEvent.keyboard("{Control>}{Alt>}k{/Alt}{/Control}");
    expect(await screen.findByRole("button", { name: "Ctrl+Alt+K" })).toBeVisible();
    expect(bridge.hotkey).toBe("ctrl+alt+k");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("warns on a conflict and keeps the old hotkey", async () => {
    const bridge = createFakeBridge();
    bridge.takenHotkeys.add("ctrl+alt+k");
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    await userEvent.keyboard("{Control>}{Alt>}k{/Alt}{/Control}");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Ctrl\+Alt\+K is already in use by another app/);
    expect(bridge.hotkey).toBe("ctrl+shift+s");
    expect(screen.getByRole("button", { name: "Ctrl+Shift+S" })).toBeVisible();
  });

  it("explains a combination that needs a modifier and does not register it", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    await userEvent.keyboard("k");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Ctrl, Alt, Shift or Win/);
    expect(bridge.hotkey).toBe("ctrl+shift+s");
  });

  it("Escape stops recording without a change", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Ctrl+Shift+S" })).toBeVisible();
    expect(bridge.hotkey).toBe("ctrl+shift+s");
  });

  it("warns at once when the saved hotkey could not be registered at startup", async () => {
    const bridge = createFakeBridge();
    bridge.getHotkey = async () => ({ accelerator: "ctrl+shift+s", registered: false });
    render(<Settings bridge={bridge} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Ctrl\+Shift\+S is already in use by another app/);
  });
});

describe("Settings > Print Screen notice", () => {
  it("is shown when Windows still gives Print Screen to Snipping Tool", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    expect(await screen.findByText(/Print Screen opens Snipping Tool/)).toBeVisible();
  });

  it("is not shown when Windows has the setting off", async () => {
    const bridge = createFakeBridge({ printScreenSnippingEnabled: false });
    render(<Settings bridge={bridge} />);
    await screen.findByRole("button", { name: "Ctrl+Shift+S" });
    expect(screen.queryByText(/Print Screen opens Snipping Tool/)).toBeNull();
  });

  it("[Open Windows setting] opens Accessibility > Keyboard and retires the notice", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open Windows setting" }));
    expect(bridge.keyboardSettingsOpened).toBe(1);
    expect(screen.queryByText(/Print Screen opens Snipping Tool/)).toBeNull();
    // A later visit does not show it again.
    render(<Settings bridge={bridge} />);
    await screen.findAllByRole("button", { name: "Ctrl+Shift+S" });
    expect(screen.queryByText(/Print Screen opens Snipping Tool/)).toBeNull();
  });

  it("[Keep Ctrl+Shift+S] retires the notice without opening anything", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Keep Ctrl+Shift+S" }));
    expect(bridge.keyboardSettingsOpened).toBe(0);
    expect(screen.queryByText(/Print Screen opens Snipping Tool/)).toBeNull();
  });
});
