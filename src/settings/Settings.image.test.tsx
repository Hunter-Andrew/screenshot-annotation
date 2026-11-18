import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("shows the view defaults with their labels", async () => {
    render(<Settings bridge={createFakeBridge()} />);
    await waitFor(() => expect(screen.getByLabelText("Canvas margin (px)")).toHaveValue(16));
    expect(screen.getByLabelText("Outside-canvas darkness (%)")).toHaveValue(95);
    expect(screen.getByLabelText("Outside-canvas darkness slider")).toHaveValue("95");
    expect(screen.getByLabelText("Show outside the canvas on new images")).toBeChecked();
  });

  it("has the crop margin (default 150, 0 to 400) and the dark background colour (default #191919), which is stored", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const crop = await screen.findByLabelText("Canvas margin during crop (px)");
    await waitFor(() => expect(crop).toBeEnabled());
    expect(crop).toHaveValue(150);
    expect(screen.getByText(/0 to 400/)).toBeVisible();
    await userEvent.clear(crop);
    await userEvent.type(crop, "401");
    await userEvent.tab();
    expect(bridge.imageSettings.cropMargin).toBe(150);
    await userEvent.clear(crop);
    await userEvent.type(crop, "0");
    await userEvent.tab();
    expect(bridge.imageSettings.cropMargin).toBe(0);

    const dark = screen.getByLabelText("Dark image background");
    expect(dark).toHaveValue("#191919");
    fireEvent.change(dark, { target: { value: "#336699" } });
    await waitFor(() => expect(bridge.imageSettings.darkBackground).toBe("#336699"));
    expect(dark).toHaveValue("#336699");
  });

  it("stores a number inside its range, and ignores one outside it", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const field = await screen.findByLabelText("Canvas margin (px)");
    await waitFor(() => expect(field).toBeEnabled());

    await userEvent.clear(field);
    await userEvent.type(field, "100");
    await userEvent.tab();
    expect(bridge.imageSettings.canvasMargin).toBe(100);

    await userEvent.clear(field);
    await userEvent.type(field, "999");
    await userEvent.tab();
    expect(bridge.imageSettings.canvasMargin).toBe(100);
    expect(field).toHaveValue(100);
    expect(screen.getByText(/0 to 200/)).toBeVisible();
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

  it("the darkness takes a tenth in its number box, up to 99.9, and the slider moves the same value", async () => {
    const bridge = createFakeBridge();
    render(<Settings bridge={bridge} />);
    const box = await screen.findByLabelText("Outside-canvas darkness (%)");
    await waitFor(() => expect(box).toBeEnabled());
    expect(box).toHaveAttribute("step", "0.1");
    expect(box).toHaveAttribute("max", "99.9");

    await userEvent.clear(box);
    await userEvent.type(box, "72.5");
    await userEvent.tab();
    expect(bridge.imageSettings.outsideDarkness).toBe(72.5);

    await userEvent.clear(box);
    await userEvent.type(box, "99.9");
    await userEvent.tab();
    expect(bridge.imageSettings.outsideDarkness).toBe(99.9);

    await userEvent.clear(box);
    await userEvent.type(box, "99.95");
    await userEvent.tab();
    expect(bridge.imageSettings.outsideDarkness).toBe(99.9); // more than one decimal, or past 99.9: nothing is stored
    expect(box).toHaveValue(99.9);
    expect(screen.getByText(/0 to 99\.9/)).toBeVisible();

    const slider = screen.getByLabelText("Outside-canvas darkness slider");
    expect(slider).toHaveAttribute("step", "0.1");
    fireEvent.change(slider, { target: { value: "40.3" } });
    expect(box).toHaveValue(40.3); // the box follows the slider while it moves
    fireEvent.pointerUp(slider);
    expect(bridge.imageSettings.outsideDarkness).toBe(40.3);
  });

  it("a stored 60 is shown as 60", async () => {
    const bridge = createFakeBridge();
    await bridge.setOutsideDarkness(60);
    render(<Settings bridge={bridge} />);
    await waitFor(() => expect(screen.getByLabelText("Outside-canvas darkness (%)")).toHaveValue(60));
  });
});
