import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createFakeBridge } from "../platform/fakeBridge";
import { useShortcutBindings } from "./useShortcutBindings";

/** A bridge whose read of the overrides takes its answer at once but delivers it only when `release` is called (a slow disk). */
function slowRead() {
  const bridge = createFakeBridge();
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => (release = resolve));
  const read = bridge.getShortcutOverrides;
  const slow = Object.assign(Object.create(bridge), {
    getShortcutOverrides: async () => {
      const answer = await read();
      await held;
      return answer;
    },
  });
  return { bridge, slow, release: () => release() };
}

describe("useShortcutBindings", () => {
  it("starts on the defaults and then follows the stored overrides", async () => {
    const bridge = createFakeBridge();
    await bridge.setShortcutOverrides({ "tool.arrow": "K" });
    const { result } = renderHook(() => useShortcutBindings(bridge, "editor", () => {}));
    expect(result.current["tool.arrow"]).toBe("A");
    await waitFor(() => expect(result.current["tool.arrow"]).toBe("K"));
  });

  it("follows a change pushed while it is open", async () => {
    const bridge = createFakeBridge();
    const { result } = renderHook(() => useShortcutBindings(bridge, "overlay", () => {}));
    await act(() => bridge.setShortcutOverrides({ "overlay.magnifier": "N" }));
    expect(result.current["overlay.magnifier"]).toBe("N");
  });

  it("does not let the initial read overwrite a change event that arrived first", async () => {
    const { bridge, slow, release } = slowRead();
    const { result } = renderHook(() => useShortcutBindings(slow, "editor", () => {}));
    await act(() => bridge.setShortcutOverrides({ "tool.arrow": "K" })); // the event; the held read already saw {}
    expect(result.current["tool.arrow"]).toBe("K");
    await act(async () => {
      release();
    });
    expect(result.current["tool.arrow"]).toBe("K");
  });

  it("reports an unreadable setting to the log and keeps the defaults", async () => {
    const bridge = createFakeBridge();
    const logged: string[] = [];
    const broken = Object.assign(Object.create(bridge), { getShortcutOverrides: () => Promise.reject(new Error("no file")) });
    const { result } = renderHook(() => useShortcutBindings(broken, "editor", (m) => logged.push(m)));
    await waitFor(() => expect(logged).toHaveLength(1));
    expect(logged[0]).toMatch(/getShortcutOverrides failed/);
    expect(result.current["tool.arrow"]).toBe("A");
  });
});
