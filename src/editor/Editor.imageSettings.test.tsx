import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";

// The image settings (canvas margin, outside darkness, show-outside default) reach every window
// through the getter and the change event, and a value outside its range is refused.

describe("the other image settings", () => {
  it("reach the editor through the same getter and event, and a value outside its range is refused", async () => {
    const bridge = createFakeBridge();
    const seen: unknown[] = [];
    await bridge.onImageSettings((settings) => seen.push(settings));
    await bridge.setCanvasMargin(100);
    await bridge.setOutsideDarkness(99.9);
    await bridge.setShowOutsideDefault(false);
    expect(await bridge.getImageSettings()).toMatchObject({ canvasMargin: 100, outsideDarkness: 99.9, showOutsideDefault: false });
    expect(seen).toHaveLength(3);

    await expect(bridge.setCanvasMargin(201)).rejects.toThrow();
    await expect(bridge.setOutsideDarkness(100)).rejects.toThrow();
    await expect(bridge.setOutsideDarkness(50.55)).rejects.toThrow();
    expect(seen).toHaveLength(3);
  });
});
