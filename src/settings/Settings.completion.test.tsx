import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Settings } from "./Settings";

/** Fake settings storage holding what the platform would have saved. */
const stored = (entries: Record<string, string>) => {
  const memory = new Map(Object.entries(entries));
  return { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v) };
};

describe("Settings > Launch at sign-in", () => {
  it("is on for a fresh install", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    expect(await screen.findByRole("checkbox", { name: "Launch at sign-in" })).toBeChecked();
  });

  it("shows the stored choice", async () => {
    render(<Settings bridge={createFakeBridge({ storage: stored({ "fake.launchAtSignIn": "0" }) })} />);
    const box = await screen.findByRole("checkbox", { name: "Launch at sign-in" });
    expect(box).not.toBeChecked();
    expect(box).toBeEnabled();
  });

  it("turning it off and on again is stored each time", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const box = await screen.findByRole("checkbox", { name: "Launch at sign-in" });
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(bridge.launchAtSignIn).toBe(false);
    await userEvent.click(box);
    expect(box).toBeChecked();
    expect(bridge.launchAtSignIn).toBe(true);
  });

  it("goes back and says so when Windows refuses the change", async () => {
    const bridge = createFakeBridge();
    bridge.failNextLaunchAtSignIn("access denied");
    render(<Settings bridge={bridge} />);
    const box = await screen.findByRole("checkbox", { name: "Launch at sign-in" });
    await userEvent.click(box);
    expect(await screen.findByRole("alert")).toHaveTextContent(/Could not change launch at sign-in.*access denied/);
    expect(box).toBeChecked();
    expect(bridge.launchAtSignIn).toBe(true);
  });
});

describe("Settings > Library folder", () => {
  it("shows where captures are saved, read-only", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const field = await screen.findByLabelText("Library folder");
    expect(field).toHaveValue(bridge.libraryFolder);
    expect(field).toHaveAttribute("readonly");
  });

  it("[Open in Explorer] opens the folder", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Open in Explorer" }));
    expect(bridge.libraryFolderOpened).toBe(1);
  });
});

describe("Settings > Reset tool styles", () => {
  it("clears every sticky style and says it did", async () => {
    const bridge = createFakeBridge();
    await bridge.setToolStyles({ rect: { stroke: { width: 8 } }, toolBehavior: { pen: true } });
    render(<Settings bridge={bridge} />);
    await userEvent.click(await screen.findByRole("button", { name: "Reset tool styles" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Tool styles reset");
    expect(bridge.toolStyles).toEqual({});
    expect(bridge.toolStylesResets).toBe(1);
  });
});
