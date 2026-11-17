import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Settings } from "./Settings";

// Ticket 37: "Image background" (what a new image starts with) and "Transparency checkerboard".
describe("Settings > Image", () => {
  it("shows the defaults on a fresh install: Transparent and a Dark checkerboard", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    await waitFor(() => expect(screen.getByLabelText("Image background")).toHaveValue("transparent"));
    expect(screen.getByLabelText("Transparency checkerboard")).toHaveValue("dark");
  });

  it("offers White, Dark and Transparent, and stores the choice", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const select = await screen.findByLabelText("Image background");
    await waitFor(() => expect(select).toBeEnabled());
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual(["White", "Dark", "Transparent"]);

    await userEvent.selectOptions(select, "White");

    expect(bridge.imageSettings.background).toBe("white");
    expect(bridge.imageSettings.checkerboard).toBe("dark");
    expect(select).toHaveValue("white");
  });

  it("offers a Dark and a Light checkerboard, and stores the choice", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const select = await screen.findByLabelText("Transparency checkerboard");
    await waitFor(() => expect(select).toBeEnabled());
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual(["Dark", "Light"]);

    await userEvent.selectOptions(select, "Light");

    expect(bridge.imageSettings).toEqual({ background: "transparent", checkerboard: "light" });
  });

  it("shows what was stored earlier, and follows a change made from another window", async () => {
    const bridge = createFakeBridge();
    await bridge.setImageBackground("dark");
    render(<Settings bridge={bridge} />);
    await waitFor(() => expect(screen.getByLabelText("Image background")).toHaveValue("dark"));

    await bridge.setImageBackground("white");
    await waitFor(() => expect(screen.getByLabelText("Image background")).toHaveValue("white"));
  });

  it("says that the checkerboard is only how transparency looks, never exported", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    expect(await screen.findByText(/never in an exported picture/i)).toBeVisible();
  });
});
