import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
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

describe("Settings > Print Screen warning (independent of the one-time notice)", () => {
  const warning = () => screen.queryByRole("status");

  it("appears right after recording Print Screen while Windows still gives it to Snipping Tool", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    fireEvent.keyUp(window, { code: "PrintScreen" });
    await screen.findByRole("button", { name: "Print Screen" });
    expect(bridge.hotkey).toBe("PrintScreen");
    expect(await screen.findByRole("status")).toHaveTextContent(
      /Windows will keep sending Print Screen to Snipping Tool, so Snipping Tool opens as well as the capture overlay/,
    );
  });

  it("is shown on load for a saved Print Screen hotkey even after the one-time notice was answered", async () => {
    const bridge = createFakeBridge();
    await bridge.setHotkey("PrintScreen");
    await bridge.dismissPrintScreenNotice();
    render(<Settings bridge={bridge} />);
    expect(await screen.findByRole("status")).toHaveTextContent(/Snipping Tool/);
    expect(screen.queryByText(/Print Screen opens Snipping Tool/)).toBeNull();
  });

  it("also covers Print Screen with modifiers", async () => {
    const bridge = createFakeBridge();
    await bridge.setHotkey("ctrl+PrintScreen");
    render(<Settings bridge={bridge} />);
    expect(await screen.findByRole("status")).toBeVisible();
  });

  it("is absent for other hotkeys and when the Windows setting is off", async () => {
    const other = render(<Settings bridge={createFakeBridge()} />);
    await screen.findByRole("button", { name: "Ctrl+Shift+S" });
    expect(warning()).toBeNull();
    other.unmount();

    const off = createFakeBridge({ printScreenSnippingEnabled: false });
    await off.setHotkey("PrintScreen");
    render(<Settings bridge={off} />);
    await screen.findByRole("button", { name: "Print Screen" });
    expect(warning()).toBeNull();
  });

  it("[Open Windows setting] opens the deep link and leaves the warning (and the one-time flag) alone", async () => {
    const bridge = createFakeBridge();
    await bridge.setHotkey("PrintScreen");
    render(<Settings bridge={bridge} />);
    const status = await screen.findByRole("status");
    await userEvent.click(within(status).getByRole("button", { name: "Open Windows setting" }));
    expect(bridge.keyboardSettingsOpened).toBe(1);
    expect(bridge.printScreenNoticeDismissed).toBe(false);
    expect(screen.getByRole("status")).toBeVisible();
  });

  it("re-checks when the window regains focus and goes away once Windows' setting is off", async () => {
    const bridge = createFakeBridge();
    await bridge.setHotkey("PrintScreen");
    render(<Settings bridge={bridge} />);
    await screen.findByRole("status");
    bridge.setPrintScreenSnipping(false);
    fireEvent.focus(window);
    await waitFor(() => expect(warning()).toBeNull());
    // ...and comes back if it is turned on again.
    bridge.setPrintScreenSnipping(true);
    fireEvent.focus(window);
    expect(await screen.findByRole("status")).toBeVisible();
  });
});

describe("Settings > Print Screen clipboard note", () => {
  const note = /Windows still copies the whole screen to the clipboard.*replaces that copy/;

  it("explains next to a bare Print Screen hotkey that Windows' own copy happens and the captured region replaces it", async () => {
    const bridge = createFakeBridge({ printScreenSnippingEnabled: false });
    await bridge.setHotkey("PrintScreen");
    render(<Settings bridge={bridge} />);
    expect(await screen.findByText(note)).toBeVisible();
  });

  it("is also shown with the Snipping Tool warning, and appears right after recording Print Screen", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    expect(screen.queryByText(note)).toBeNull();
    fireEvent.keyUp(window, { code: "PrintScreen" });
    await screen.findByRole("status");
    expect(await screen.findByText(note)).toBeVisible();
  });

  it("is absent for other hotkeys, Ctrl+Print Screen included", async () => {
    const bridge = createFakeBridge({ printScreenSnippingEnabled: false });
    const first = render(<Settings bridge={bridge} />);
    await screen.findByRole("button", { name: "Ctrl+Shift+S" });
    expect(screen.queryByText(note)).toBeNull();
    first.unmount();
    await bridge.setHotkey("ctrl+PrintScreen");
    render(<Settings bridge={bridge} />);
    await screen.findByRole("button", { name: "Ctrl+Print Screen" });
    expect(screen.queryByText(note)).toBeNull();
  });
});

describe("Settings > Print Screen listener failure", () => {
  it("shows the failure like any other hotkey problem when the Raw Input listener could not start", async () => {
    const bridge = createFakeBridge({ printScreenSnippingEnabled: false, rawInputFails: true });
    await bridge.setHotkey("PrintScreen");
    render(<Settings bridge={bridge} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not watch the Print Screen key.*capture\.log/s);
  });

  it("shows it right after recording Print Screen, and not for other hotkeys", async () => {
    const bridge = createFakeBridge({ printScreenSnippingEnabled: false, rawInputFails: true });
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    fireEvent.keyUp(window, { code: "PrintScreen" });
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not watch the Print Screen key/);
    await userEvent.click(screen.getByRole("button", { name: "Print Screen" }));
    await userEvent.keyboard("{Control>}{Alt>}k{/Alt}{/Control}");
    await screen.findByRole("button", { name: "Ctrl+Alt+K" });
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("Settings > one-time notice wording", () => {
  it("says what answering does and that it only appears once", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    const notice = (await screen.findByText(/Print Screen opens Snipping Tool/)).closest("section")!;
    expect(notice).toHaveTextContent(/only appears once/i);
    expect(notice).toHaveTextContent(/Open Windows setting.*opens/i);
    expect(notice).toHaveTextContent(/never changes that setting/i);
  });
});

describe("Settings > recorder diagnostics", () => {
  it("logs what the recorder received and the outcome of saving", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Ctrl+Shift+S" }));
    fireEvent.keyUp(window, { code: "PrintScreen" });
    await screen.findByRole("button", { name: "Print Screen" });
    const log = bridge.settingsLogs.join("\n");
    expect(log).toMatch(/recording started/);
    expect(log).toMatch(/keyup code=PrintScreen/);
    expect(log).toMatch(/set_hotkey PrintScreen: ok/);
  });

  it("logs and explains a window that loses focus mid-recording (what Snipping Tool does to the key)", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const field = await screen.findByRole("button", { name: "Ctrl+Shift+S" });
    await userEvent.click(field);
    const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(false);
    fireEvent.blur(field);
    hasFocus.mockRestore();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Snipping Tool/);
    expect(bridge.settingsLogs.join("\n")).toMatch(/lost focus while recording/);
  });
});
