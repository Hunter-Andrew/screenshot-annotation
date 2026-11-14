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
