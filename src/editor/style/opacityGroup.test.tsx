import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { highlightKind } from "../../core/annotations/highlight";
import { StylePanel } from "../StylePanel";

function panel(opacity: number) {
  const onChange = vi.fn();
  render(<StylePanel kind={highlightKind} style={{ ...highlightKind.defaultStyle, opacity: { value: opacity } }} onChange={onChange} />);
  return onChange;
}
const pressed = () => screen.queryAllByRole("button", { pressed: true }).map((b) => b.textContent).filter((t) => t?.endsWith("%"));

describe("Opacity group", () => {
  it("offers the presets 25, 40, 60, 80 and 100 %, with no slider", () => {
    panel(0.8);
    for (const name of ["25%", "40%", "60%", "80%", "100%"]) expect(screen.getByRole("button", { name })).toBeVisible();
    expect(screen.queryByRole("slider", { name: "Opacity" })).toBeNull();
    expect(pressed()).toEqual(["80%"]);
  });

  it("stores the preset that is clicked", async () => {
    const onChange = panel(0.8);
    await userEvent.click(screen.getByRole("button", { name: "40%" }));
    expect(onChange).toHaveBeenCalledWith("opacity", { value: 0.4 });
  });

  it("shows no preset as active for a stored value that is none of them (an older stroke keeps its value)", () => {
    panel(0.9);
    expect(pressed()).toEqual([]);
  });
});
