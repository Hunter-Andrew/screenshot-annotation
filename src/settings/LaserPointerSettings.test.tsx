import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Settings } from "./Settings";

const open = async (bridge = createFakeBridge()) => {
  render(<Settings bridge={bridge} />);
  await screen.findByRole("heading", { name: "Laser pointer look" });
  await waitFor(() => expect(screen.getByRole("radio", { name: "Medium" })).toBeEnabled());
  return bridge;
};

describe("Settings > Demo tools > Laser pointer look", () => {
  it("shows red, Medium and the ripple on for a fresh install", async () => {
    await open();
    expect(screen.getByRole("button", { name: "Laser pointer color #e02424" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "Medium" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Show a ripple when I left-click" })).toBeChecked();
  });

  it("offers the 8 palette colours, a custom picker and a hex field", async () => {
    await open();
    expect(screen.getAllByRole("button", { name: /^Laser pointer color #/ })).toHaveLength(8);
    expect(screen.getByLabelText("Custom laser pointer color")).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Laser pointer color hex" })).toHaveValue("#e02424");
  });

  it("stores a palette colour at once", async () => {
    const bridge = await open();
    await userEvent.click(screen.getByRole("button", { name: "Laser pointer color #2563eb" }));
    await waitFor(() => expect(bridge.laserPointerSettings.color).toBe("#2563eb"));
    expect(screen.getByRole("button", { name: "Laser pointer color #2563eb" })).toHaveAttribute("aria-pressed", "true");
  });

  it("stores a typed hex colour", async () => {
    const bridge = await open();
    const hex = screen.getByRole("textbox", { name: "Laser pointer color hex" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#12ab34{Enter}");
    await waitFor(() => expect(bridge.laserPointerSettings.color).toBe("#12ab34"));
  });

  it("hides the Windows mouse arrow by default, and the checkbox turns that off and on", async () => {
    const bridge = await open();
    const box = screen.getByRole("checkbox", { name: "Hide the Windows mouse arrow while the Laser pointer is on" });
    await waitFor(() => expect(box).toBeEnabled());
    expect(box).toBeChecked();
    expect(bridge.laserPointerHideCursor).toBe(true);
    await userEvent.click(box);
    await waitFor(() => expect(bridge.laserPointerHideCursor).toBe(false));
    await userEvent.click(box);
    await waitFor(() => expect(bridge.laserPointerHideCursor).toBe(true));
  });

  it("stores the size", async () => {
    const bridge = await open();
    await userEvent.click(screen.getByRole("radio", { name: "Large" }));
    await waitFor(() => expect(bridge.laserPointerSettings.size).toBe("large"));
    await userEvent.click(screen.getByRole("radio", { name: "Small" }));
    await waitFor(() => expect(bridge.laserPointerSettings.size).toBe("small"));
  });

  it("stores the ripple checkbox and leaves the colour and size alone", async () => {
    const bridge = await open();
    await userEvent.click(screen.getByRole("button", { name: "Laser pointer color #16a34a" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Show a ripple when I left-click" }));
    await waitFor(() => expect(bridge.laserPointerSettings).toEqual({ color: "#16a34a", size: "medium", ripple: false }));
  });

  it("shows what was stored the next time Settings opens", async () => {
    const bridge = createFakeBridge();
    await bridge.setLaserPointerSettings({ color: "#9333ea", size: "small", ripple: false });
    await open(bridge);
    expect(screen.getByRole("button", { name: "Laser pointer color #9333ea" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("radio", { name: "Small" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Show a ripple when I left-click" })).not.toBeChecked();
  });

  it("has a switch that follows the hotkey and the tray item, and can turn the Laser pointer on and off itself", async () => {
    const bridge = await open();
    const on = screen.getByRole("checkbox", { name: "Laser pointer is on" });
    expect(on).not.toBeChecked();
    act(() => bridge.pressLaserPointerHotkey());
    await waitFor(() => expect(on).toBeChecked());
    await userEvent.click(on);
    await waitFor(() => expect(on).not.toBeChecked());
    expect(bridge.laserPointerOn).toBe(false);
    await userEvent.click(on);
    await waitFor(() => expect(bridge.laserPointerOn).toBe(true));
  });
});
