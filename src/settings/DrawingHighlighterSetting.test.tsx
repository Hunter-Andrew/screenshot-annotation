import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { Settings } from "./Settings";

const box = () => screen.getByRole("spinbutton", { name: /Highlighter opacity in Drawing mode/ });

const open = async (bridge = createFakeBridge()) => {
  render(<Settings bridge={bridge} />);
  await screen.findByRole("heading", { name: "Drawing mode Highlighter" });
  await waitFor(() => expect(box()).toBeEnabled());
  return bridge;
};

describe("Settings > Demo tools > Drawing mode Highlighter", () => {
  it("shows 20 percent for a fresh install, labelled as a percent of the Highlighter in Drawing mode", async () => {
    await open();
    expect(box()).toHaveValue(20);
    expect(screen.getByLabelText("Highlighter opacity in Drawing mode (%)")).toBe(box());
  });

  it("stores a typed value inside 5 to 60", async () => {
    const bridge = await open();
    await userEvent.clear(box());
    await userEvent.type(box(), "45{Enter}");
    await waitFor(() => expect(bridge.drawingHighlighterOpacity).toBe(45));
  });

  it("refuses values outside 5 to 60 and puts the stored one back", async () => {
    const bridge = await open();
    for (const bad of ["4", "61"]) {
      await userEvent.clear(box());
      await userEvent.type(box(), `${bad}{Enter}`);
      await waitFor(() => expect(box()).toHaveValue(20));
      expect(bridge.drawingHighlighterOpacity).toBe(20);
    }
  });
});
