// @vitest-environment node
import { describe, expect, it } from "vitest";
import { returnsToSelect, sanitizeBehavior } from "./toolBehavior";
import { DEFAULT_RETURN_TO_SELECT, TOOLS } from "./tools";

describe("whether a tool returns to Select after one use", () => {
  it("defaults: the Pen stays, every other drawing tool returns", () => {
    expect(returnsToSelect("pen", {})).toBe(false);
    for (const id of ["arrow", "line", "rect", "ellipse", "text"]) expect(returnsToSelect(id, {})).toBe(true);
  });

  it("the user's choice beats the default, per tool", () => {
    const chosen = { pen: true, rect: false };
    expect(returnsToSelect("pen", chosen)).toBe(true);
    expect(returnsToSelect("rect", chosen)).toBe(false);
    expect(returnsToSelect("arrow", chosen)).toBe(true);
  });

  it("a tool with no default (a future one) returns to Select", () => {
    expect(returnsToSelect("callout", {})).toBe(true);
  });

  it("every drawing tool in the registry has a default", () => {
    for (const tool of TOOLS.filter((t) => t.id !== "select")) expect(DEFAULT_RETURN_TO_SELECT).toHaveProperty(tool.id);
  });
});

describe("reading the stored choices defensively", () => {
  it("keeps booleans and drops everything else", () => {
    expect(sanitizeBehavior({ pen: true, rect: "yes", text: 0, line: false })).toEqual({ pen: true, line: false });
  });

  it("anything but an object is empty (an old file, a hand-edited one)", () => {
    for (const raw of [undefined, null, 5, "x", [true]]) expect(sanitizeBehavior(raw)).toEqual({});
  });
});
