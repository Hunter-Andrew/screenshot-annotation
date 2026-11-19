import { render, screen, within as inside } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { textKind } from "../../core/annotations/text";
import { StylePanel } from "../StylePanel";

function panel() {
  const onChange = vi.fn();
  render(<StylePanel kind={textKind} style={textKind.defaultStyle} onChange={onChange} />);
  return onChange;
}

describe("Font group", () => {
  it("shows the Font and Text outline sections for the Text tool", () => {
    panel();

    expect(screen.getByRole("region", { name: "Font" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Text outline" })).toBeVisible();
    expect(screen.queryByRole("region", { name: "Stroke" })).toBeNull();
  });

  it("takes a typed size from 8 to 200 and ignores anything outside it", async () => {
    const onChange = panel();
    const size = screen.getByRole("spinbutton", { name: "Font size" });
    expect(size).toHaveValue(32);

    await userEvent.clear(size);
    await userEvent.type(size, "40");
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, size: 40 });

    onChange.mockClear();
    await userEvent.clear(size);
    await userEvent.type(size, "7"); // too small
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.clear(size);
    await userEvent.type(size, "201"); // 2 and 20 are valid on the way; 201 is not
    expect(onChange).not.toHaveBeenLastCalledWith("font", expect.objectContaining({ size: 201 }));
  });

  it("offers the presets 10/12/14/18/24/32/48/72", async () => {
    const onChange = panel();
    const presets = screen.getByRole("combobox", { name: "Font size presets" });

    const values = within(presets).map((o) => o.value);
    expect(values.filter((v) => v !== "")).toEqual(["10", "12", "14", "18", "24", "32", "48", "72"]);

    await userEvent.selectOptions(presets, "48");
    expect(onChange).toHaveBeenCalledWith("font", { ...textKind.defaultStyle.font, size: 48 });
  });

  it("toggles bold and italic", async () => {
    const onChange = panel();

    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, bold: true });
    await userEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, italic: true });
  });

  it("has Align left, centre and right: the current one pressed (centre by default), left for a text saved before alignment existed", async () => {
    const onChange = panel();
    expect(screen.getByRole("button", { name: "Align center" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Align left" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Align left" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, align: "left" });
    await userEvent.click(screen.getByRole("button", { name: "Align right" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, align: "right" });
  });

  it("shows no alignment pressed wrongly for an older text without one, and the chosen one for a new text", () => {
    const { align: _gone, ...older } = textKind.defaultStyle.font!;
    const { unmount } = render(<StylePanel kind={textKind} style={{ ...textKind.defaultStyle, font: older }} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Align left" })).toHaveAttribute("aria-pressed", "true");
    unmount();
    render(<StylePanel kind={textKind} style={{ ...textKind.defaultStyle, font: { ...older, align: "right" } }} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Align right" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Align left" })).toHaveAttribute("aria-pressed", "false");
  });

  it("has an Underline toggle next to Bold and Italic", async () => {
    const onChange = panel();
    const underline = screen.getByRole("button", { name: "Underline" });
    expect(underline).toHaveAttribute("aria-pressed", "false");
    expect(underline.parentElement).toBe(screen.getByRole("button", { name: "Bold" }).parentElement);

    await userEvent.click(underline);
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, underline: true });
  });

  it("has Align top, middle and bottom together in their own row, apart from the horizontal alignment: Middle for a new text, Top for an older one", async () => {
    const onChange = panel();
    expect(screen.getByRole("button", { name: "Align middle" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Align top" })).toHaveAttribute("aria-pressed", "false");
    const horizontal = screen.getByRole("group", { name: "Alignment" });
    const vertical = screen.getByRole("group", { name: "Vertical alignment" });
    expect(inside(horizontal).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Align left", "Align center", "Align right"]);
    expect(inside(vertical).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Align top", "Align middle", "Align bottom"]);

    await userEvent.click(screen.getByRole("button", { name: "Align bottom" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, valign: "bottom" });
    await userEvent.click(screen.getByRole("button", { name: "Align top" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, valign: "top" });
  });

  it("shows Top pressed for an older text with no vertical alignment stored", () => {
    const { valign: _gone, underline: _u, ...older } = textKind.defaultStyle.font!;
    render(<StylePanel kind={textKind} style={{ ...textKind.defaultStyle, font: older }} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Align top" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Align middle" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Underline" })).toHaveAttribute("aria-pressed", "false");
  });

  it("changes the text color from the palette", async () => {
    const onChange = panel();

    await userEvent.click(within2("Font", "Color #2563eb"));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...textKind.defaultStyle.font, color: "#2563eb" });
  });
});

describe("Text outline group", () => {
  it("switches the outline off and on", async () => {
    const onChange = panel();
    const toggle = screen.getByRole("checkbox", { name: "Outline" });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(onChange).toHaveBeenLastCalledWith("textOutline", { ...textKind.defaultStyle.textOutline, enabled: false });
  });

  it("changes the outline color and width (1-10)", async () => {
    const onChange = panel();

    await userEvent.click(within2("Text outline", "Color #111827"));
    expect(onChange).toHaveBeenLastCalledWith("textOutline", { ...textKind.defaultStyle.textOutline, color: "#111827" });

    const width = screen.getByRole("spinbutton", { name: "Outline width" });
    await userEvent.clear(width);
    await userEvent.type(width, "5");
    expect(onChange).toHaveBeenLastCalledWith("textOutline", { ...textKind.defaultStyle.textOutline, width: 5 });
  });
});

function within(select: HTMLElement) {
  return Array.from((select as HTMLSelectElement).options);
}

/** A button inside the section called `section`. */
function within2(section: string, name: string): HTMLElement {
  const region = screen.getByRole("region", { name: section });
  const found = Array.from(region.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === name);
  if (!found) throw new Error(`no ${name} in ${section}`);
  return found as HTMLElement;
}
