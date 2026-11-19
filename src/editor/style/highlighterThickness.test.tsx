import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { highlightKind } from "../../core/annotations/highlight";
import { penKind } from "../../core/annotations/pen";
import { StylePanel } from "../StylePanel";

const labels = () =>
  [...screen.getByRole("group", { name: "Thickness presets" }).querySelectorAll("button")].map((b) => b.textContent);
const pressed = () =>
  screen
    .queryAllByRole("button", { pressed: true })
    .map((b) => b.getAttribute("aria-label"))
    .filter((t) => t?.startsWith("Thickness "));

describe("Highlighter thickness presets", () => {
  it("offers 8, 12, 18, 24 and 30 and no 2", () => {
    render(<StylePanel kind={highlightKind} style={highlightKind.defaultStyle} onChange={vi.fn()} />);
    expect(labels()).toEqual(["8", "12", "18", "24", "30"]);
  });

  it("stores the preset that is clicked", async () => {
    const onChange = vi.fn();
    render(<StylePanel kind={highlightKind} style={highlightKind.defaultStyle} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Thickness 12" }));
    expect(onChange).toHaveBeenCalledWith("stroke", { color: "#ffff00", width: 12 });
  });

  it("shows no preset pressed for a stored width that is none of them (the default 20)", () => {
    render(<StylePanel kind={highlightKind} style={highlightKind.defaultStyle} onChange={vi.fn()} />);
    expect(pressed()).toEqual([]);
  });

  it("leaves the Pen with 2, 4 and 8", () => {
    render(<StylePanel kind={penKind} style={penKind.defaultStyle} onChange={vi.fn()} />);
    expect(labels()).toEqual(["2", "4", "8"]);
  });
});
