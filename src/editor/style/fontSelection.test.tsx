import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { textKind } from "../../core/annotations/text";
import { StylePanel } from "../StylePanel";

// The Font group of the Style panel while a Text or Callout box is being typed in (per-selection styling).

const whole = textKind.defaultStyle.font!;
const same = { size: 24, bold: false, italic: false, underline: false, color: "#e02424" } as const;

/** A button inside the section called `section`. */
function within2(section: string, name: string): HTMLElement {
  const region = screen.getByRole("region", { name: section });
  const found = Array.from(region.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === name);
  if (!found) throw new Error(`no ${name} in ${section}`);
  return found as HTMLElement;
}

function selecting(font: Record<string, unknown> = {}) {
  const onChange = vi.fn();
  const onSelection = vi.fn();
  const focusText = vi.fn();
  render(
    <StylePanel
      kind={textKind}
      style={textKind.defaultStyle}
      onChange={onChange}
      textEditing={{ selection: { font: { ...same, ...font } as never }, onStyle: onSelection, focusText }}
    />,
  );
  return { onChange, onSelection, focusText };
}

describe("Font group while characters are selected in a box being typed in", () => {
  it("styles only the selection: B, I and U report a change of the selection and never of the whole box", async () => {
    const { onChange, onSelection } = selecting();
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onSelection).toHaveBeenLastCalledWith({ bold: true });
    await userEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(onSelection).toHaveBeenLastCalledWith({ italic: true });
    await userEvent.click(screen.getByRole("button", { name: "Underline" }));
    expect(onSelection).toHaveBeenLastCalledWith({ underline: true });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the selection's values, not the box's: a bold selection has Bold pressed and a click turns it off", async () => {
    const { onSelection } = selecting({ bold: true, size: 40, color: "#2563eb" });
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("spinbutton", { name: "Font size" })).toHaveValue(40);
    expect(within2("Font", "Color #2563eb")).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onSelection).toHaveBeenLastCalledWith({ bold: false });
  });

  it("shows mixed values as mixed: no pressed toggle, an empty size box saying mixed, no color picked; a click sets it for all", async () => {
    const { onSelection } = selecting({ bold: "mixed", size: "mixed", color: "mixed" });
    expect(screen.getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "mixed");
    const size = screen.getByRole("spinbutton", { name: "Font size" });
    expect(size).toHaveValue(null);
    expect(size).toHaveAttribute("placeholder", "mixed");
    const hex = screen.getByRole("textbox", { name: "Text color hex" });
    expect(hex).toHaveValue("");
    expect(hex).toHaveAttribute("placeholder", "mixed");
    for (const swatch of within(screen.getByRole("region", { name: "Font" })).getAllByRole("button", { name: /^Color #/ })) expect(swatch).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onSelection).toHaveBeenLastCalledWith({ bold: true });
    await userEvent.click(within2("Font", "Color #16a34a"));
    expect(onSelection).toHaveBeenLastCalledWith({ color: "#16a34a" });
    await userEvent.type(size, "30");
    expect(onSelection).toHaveBeenLastCalledWith({ size: 30 });
  });

  it("takes a typed hex color and a size preset for the selection only", async () => {
    const { onChange, onSelection } = selecting();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Font size presets" }), "48");
    expect(onSelection).toHaveBeenLastCalledWith({ size: 48 });
    const hex = screen.getByRole("textbox", { name: "Text color hex" });
    await userEvent.clear(hex);
    await userEvent.type(hex, "#00ff00{Enter}");
    expect(onSelection).toHaveBeenLastCalledWith({ color: "#00ff00" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves the alignments to the whole box", async () => {
    const { onChange, onSelection } = selecting();
    await userEvent.click(screen.getByRole("button", { name: "Align center" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...whole, align: "center" });
    await userEvent.click(screen.getByRole("button", { name: "Align bottom" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...whole, valign: "bottom" });
    expect(onSelection).not.toHaveBeenCalled();
  });

  it("with only a caret (no selection) the controls change the whole box, as before", async () => {
    const onChange = vi.fn();
    render(<StylePanel kind={textKind} style={textKind.defaultStyle} onChange={onChange} textEditing={{ selection: null, onStyle: vi.fn(), focusText: vi.fn() }} />);
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onChange).toHaveBeenLastCalledWith("font", { ...whole, bold: true });
  });

  it("a press on a button does not take the focus from the text (mouse down is default-prevented), so the selection stays", () => {
    selecting();
    for (const name of ["Bold", "Italic", "Underline"]) expect(fireEvent.mouseDown(screen.getByRole("button", { name }))).toBe(false);
    expect(fireEvent.mouseDown(within2("Font", "Color #16a34a"))).toBe(false);
  });

  it("hands the keyboard back to the text after a button or a preset, but not while a number is being typed", async () => {
    const { focusText } = selecting();
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(focusText).toHaveBeenCalledTimes(1);
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Font size presets" }), "48");
    expect(focusText).toHaveBeenCalledTimes(2);
    await userEvent.type(screen.getByRole("spinbutton", { name: "Font size" }), "30");
    expect(focusText).toHaveBeenCalledTimes(2);
  });

  it("the Font section is marked as one that keeps the text edit going when it takes the focus", () => {
    selecting();
    expect(screen.getByRole("region", { name: "Font" })).toHaveAttribute("data-keeps-text-editing");
    expect(screen.getByRole("region", { name: "Text outline" })).not.toHaveAttribute("data-keeps-text-editing");
  });
});
