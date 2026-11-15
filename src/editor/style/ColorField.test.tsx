import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ColorField } from "./ColorField";

function setup(color = "#e02424", props: Partial<Parameters<typeof ColorField>[0]> = {}) {
  const onPick = vi.fn();
  const view = render(<ColorField label="Color" color={color} onPick={onPick} {...props} />);
  const hex = () => screen.getByRole("textbox", { name: "Color hex" });
  return { onPick, hex, rerender: (next: string) => view.rerender(<ColorField label="Color" color={next} onPick={onPick} {...props} />) };
}

describe("ColorField", () => {
  it("shows the current color as #RRGGBB", () => {
    const { hex } = setup("#2563eb");
    expect(hex()).toHaveValue("#2563eb");
  });

  it("keeps the palette and the native picker", async () => {
    const { onPick } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Color #16a34a" }));
    expect(onPick).toHaveBeenLastCalledWith("#16a34a");
    expect(screen.getByLabelText("Custom color")).toHaveAttribute("type", "color");
  });

  it("can drop the palette", () => {
    setup("#e02424", { palette: false });
    expect(screen.queryByRole("button", { name: /^Color #/ })).toBeNull();
    expect(screen.getByRole("textbox", { name: "Color hex" })).toBeVisible();
  });

  it.each([
    ["#2563EB", "#2563eb"],
    ["2563eb", "#2563eb"],
    ["#f80", "#ff8800"],
    ["  #ABC  ", "#aabbcc"],
  ])("applies %j on Enter as %j", async (typed, stored) => {
    const { onPick, hex } = setup();
    await userEvent.clear(hex());
    await userEvent.type(hex(), `${typed}{Enter}`);
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(stored);
  });

  it("applies a valid value when the field loses focus", async () => {
    const { onPick, hex } = setup();
    await userEvent.clear(hex());
    await userEvent.type(hex(), "facc15");
    expect(onPick).not.toHaveBeenCalled(); // nothing changes while typing
    await userEvent.tab();
    expect(onPick).toHaveBeenCalledWith("#facc15");
  });

  it("applies a pasted color at once", async () => {
    const { onPick, hex } = setup();
    await userEvent.click(hex());
    await userEvent.paste("#9333EA");
    expect(onPick).toHaveBeenCalledWith("#9333ea");
  });

  it("shows an error for an invalid value and never changes the color", async () => {
    const { onPick, hex } = setup();
    await userEvent.clear(hex());
    await userEvent.type(hex(), "#12{Enter}");
    expect(hex()).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/#RGB or #RRGGBB/);
    await userEvent.tab();
    expect(onPick).not.toHaveBeenCalled();
  });

  it("goes back to the current color when an invalid value is left, and the error clears", async () => {
    const { hex } = setup("#e02424");
    await userEvent.clear(hex());
    await userEvent.type(hex(), "nope");
    await userEvent.tab();
    expect(hex()).toHaveValue("#e02424");
    expect(hex()).not.toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not take alpha hex", async () => {
    const { onPick, hex } = setup();
    await userEvent.clear(hex());
    await userEvent.type(hex(), "#e0242480{Enter}");
    expect(onPick).not.toHaveBeenCalled();
    expect(hex()).toHaveAttribute("aria-invalid", "true");
  });

  it("Escape puts the current color back", async () => {
    const { onPick, hex } = setup("#e02424");
    await userEvent.clear(hex());
    await userEvent.type(hex(), "#123456{Escape}");
    expect(hex()).toHaveValue("#e02424");
    expect(onPick).not.toHaveBeenCalled();
  });

  it("follows the color when it changes from outside (palette, another annotation, undo)", async () => {
    const { hex, rerender } = setup("#e02424");
    rerender("#16a34a");
    expect(hex()).toHaveValue("#16a34a");

    // Even while the field holds an unapplied or invalid draft.
    await userEvent.clear(hex());
    await userEvent.type(hex(), "zz");
    rerender("#111827");
    expect(hex()).toHaveValue("#111827");
    expect(hex()).not.toHaveAttribute("aria-invalid", "true");
  });

  it("does not report the color it already has", async () => {
    const { onPick, hex } = setup("#e02424");
    await userEvent.clear(hex());
    await userEvent.type(hex(), "E02424{Enter}");
    expect(onPick).not.toHaveBeenCalled();
    expect(hex()).toHaveValue("#e02424");
  });

  it("uses swatchLabel for the palette buttons", () => {
    setup("#e02424", { label: "Text color", swatchLabel: "Color" });
    expect(screen.getByRole("button", { name: "Color #2563eb" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Text color hex" })).toBeVisible();
  });
});
