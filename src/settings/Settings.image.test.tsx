import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Settings } from "./Settings";

// Ticket 37: "Image background" (what a new image starts with) and "Transparency checkerboard".
describe("Settings > Image", () => {
  it("shows the defaults on a fresh install: Transparent and a Light checkerboard", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    await waitFor(() => expect(screen.getByLabelText("Image background")).toHaveValue("transparent"));
    expect(screen.getByLabelText("Transparency checkerboard")).toHaveValue("light");
  });

  it("offers White, Dark and Transparent, and stores the choice", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const select = await screen.findByLabelText("Image background");
    await waitFor(() => expect(select).toBeEnabled());
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual(["White", "Dark", "Transparent"]);

    await userEvent.selectOptions(select, "White");

    expect(bridge.imageSettings.background).toBe("white");
    expect(bridge.imageSettings.checkerboard).toBe("light");
    expect(select).toHaveValue("white");
  });

  it("offers a Dark and a Light checkerboard, and stores the choice", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const select = await screen.findByLabelText("Transparency checkerboard");
    await waitFor(() => expect(select).toBeEnabled());
    expect(Array.from((select as HTMLSelectElement).options).map((o) => o.text)).toEqual(["Dark", "Light"]);

    await userEvent.selectOptions(select, "Dark");

    expect(bridge.imageSettings.checkerboard).toBe("dark");
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

  it("shows the view and callout defaults with their labels", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    await waitFor(() => expect(screen.getByLabelText("Callout tail length (% of drag)")).toHaveValue(20));
    expect(screen.getByLabelText("Canvas margin (px)")).toHaveValue(48);
    expect(screen.getByLabelText("Outside-canvas darkness (%)")).toHaveValue(60);
    expect(screen.getByLabelText("Show outside the canvas on new images")).toBeChecked();
  });

  it("stores a number inside its range, and ignores one outside it", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const field = await screen.findByLabelText("Callout tail length (% of drag)");
    await waitFor(() => expect(field).toBeEnabled());

    await userEvent.clear(field);
    await userEvent.type(field, "35");
    await userEvent.tab();
    expect(bridge.imageSettings.calloutTailPercent).toBe(35);

    await userEvent.clear(field);
    await userEvent.type(field, "99");
    await userEvent.tab();
    expect(bridge.imageSettings.calloutTailPercent).toBe(35);
    expect(field).toHaveValue(35);
    expect(screen.getByText(/5 to 50/)).toBeVisible();
  });

  it("stores the margin, the darkness and the show-outside choice", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const margin = await screen.findByLabelText("Canvas margin (px)");
    await waitFor(() => expect(margin).toBeEnabled());
    await userEvent.clear(margin);
    await userEvent.type(margin, "100");
    await userEvent.tab();
    const dark = screen.getByLabelText("Outside-canvas darkness (%)");
    await userEvent.clear(dark);
    await userEvent.type(dark, "0");
    await userEvent.tab();
    await userEvent.click(screen.getByLabelText("Show outside the canvas on new images"));
    expect(bridge.imageSettings).toMatchObject({ canvasMargin: 100, outsideDarkness: 0, showOutsideDefault: false });
  });
});
