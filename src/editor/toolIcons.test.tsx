import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { defaultBindings } from "../shared/shortcutRegistry";
import { SHORTCUT_ACTIONS } from "./shortcuts";
import { ToolIcon, TOOL_ICONS } from "./toolIcons";
import { ToolColumn } from "./ToolColumn";
import { TOOLS } from "./tools";

describe("tool icons", () => {
  it("every tool in the shortcut table has an icon, built or not (add a tool, add its icon)", () => {
    const ids = SHORTCUT_ACTIONS.filter((a) => a.id.startsWith("tool.")).map((a) => a.id.slice("tool.".length));
    expect(ids.length).toBeGreaterThanOrEqual(11);
    for (const id of ids) expect(TOOL_ICONS, `icon for tool "${id}"`).toHaveProperty(id);
  });

  it("every tool in the tool column has an icon, and no icon is for a tool that does not exist", () => {
    for (const tool of TOOLS) expect(TOOL_ICONS).toHaveProperty(tool.id);
    const known = new Set(SHORTCUT_ACTIONS.filter((a) => a.id.startsWith("tool.")).map((a) => a.id.slice(5)));
    for (const id of Object.keys(TOOL_ICONS)) expect(known.has(id), `icon "${id}" has no shortcut row`).toBe(true);
  });

  it("an icon is decorative, inherits the text color and is 20-24 px", () => {
    for (const id of Object.keys(TOOL_ICONS)) {
      const { container, unmount } = render(<ToolIcon id={id} />);
      const svg = container.querySelector("svg")!;
      expect(svg, id).not.toBeNull();
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(Number(svg.getAttribute("width"))).toBeGreaterThanOrEqual(20);
      expect(Number(svg.getAttribute("width"))).toBeLessThanOrEqual(24);
      expect(container.innerHTML).toContain("currentColor");
      unmount();
    }
  });
});

describe("the tool column with icons", () => {
  it("each button shows icon, name and key, and keeps its accessible name and tooltip", () => {
    render(<ToolColumn tools={TOOLS} active="pen" disabled={false} bindings={defaultBindings("editor")} onPick={() => {}} />);

    const pen = screen.getByRole("button", { name: "Pen (P)" });
    expect(pen).toHaveAttribute("title", "Pen (P)");
    expect(pen).toHaveAttribute("aria-pressed", "true");
    expect(pen.querySelector("svg")).not.toBeNull();
    expect(pen).toHaveTextContent("Pen");
    expect(pen.querySelector("kbd")).toHaveTextContent("P");
    expect(screen.getByRole("button", { name: /^Select/ })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getAllByRole("button")).toHaveLength(TOOLS.length);
  });
});
