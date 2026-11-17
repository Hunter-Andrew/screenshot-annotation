import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watchLibrary } from "./libraryWatch";

// The folder watch of the real bridge: poll a signature, call back when it changes.

function setup(signatures: (string | Error)[]) {
  let visibility: "visible" | "hidden" = "visible";
  const docListeners = new Map<string, () => void>();
  const winListeners = new Map<string, () => void>();
  const doc = {
    get visibilityState() {
      return visibility;
    },
    addEventListener: (type: string, fn: () => void) => void docListeners.set(type, fn),
    removeEventListener: (type: string) => void docListeners.delete(type),
  } as unknown as Document;
  const win = {
    addEventListener: (type: string, fn: () => void) => void winListeners.set(type, fn),
    removeEventListener: (type: string) => void winListeners.delete(type),
  } as unknown as Window;
  let n = 0;
  const readSignature = vi.fn(async () => {
    const next = signatures[Math.min(n++, signatures.length - 1)]!;
    if (next instanceof Error) throw next;
    return next;
  });
  const onChange = vi.fn();
  const stop = watchLibrary({ readSignature, onChange, intervalMs: 1000, doc, win });
  return {
    readSignature,
    onChange,
    stop,
    docListeners,
    winListeners,
    hide: () => (visibility = "hidden"),
    show: () => (visibility = "visible"),
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("watchLibrary", () => {
  it("takes the first signature as the starting point and does not report it", async () => {
    const w = setup(["a"]);
    await vi.advanceTimersByTimeAsync(0);
    expect(w.readSignature).toHaveBeenCalledTimes(1);
    expect(w.onChange).not.toHaveBeenCalled();
    w.stop();
  });

  it("reports a change once, then waits for the next one", async () => {
    const w = setup(["a", "a", "b", "b", "c"]);
    await vi.advanceTimersByTimeAsync(0); // a (baseline)
    await vi.advanceTimersByTimeAsync(1000); // a
    expect(w.onChange).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1000); // b
    expect(w.onChange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // b
    expect(w.onChange).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000); // c
    expect(w.onChange).toHaveBeenCalledTimes(2);
    w.stop();
  });

  it("does not poll while the window is hidden, and checks at once when it is shown again", async () => {
    const w = setup(["a", "b"]);
    await vi.advanceTimersByTimeAsync(0);
    w.hide();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.readSignature).toHaveBeenCalledTimes(1);

    w.show();
    w.docListeners.get("visibilitychange")!();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.onChange).toHaveBeenCalledTimes(1);
    w.stop();
  });

  it("checks when the window gets focus", async () => {
    const w = setup(["a", "b"]);
    await vi.advanceTimersByTimeAsync(0);
    w.winListeners.get("focus")!();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.onChange).toHaveBeenCalledTimes(1);
    w.stop();
  });

  it("an unreadable folder is skipped, and a change after it is still reported", async () => {
    const w = setup(["a", new Error("unreachable"), "b"]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.onChange).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.onChange).toHaveBeenCalledTimes(1);
    w.stop();
  });

  it("never runs two checks at once", async () => {
    let release!: () => void;
    const slow = new Promise<string>((r) => (release = () => r("a")));
    const readSignature = vi.fn(() => slow);
    const stop = watchLibrary({ readSignature, onChange: () => {}, intervalMs: 1000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(readSignature).toHaveBeenCalledTimes(1);
    release();
    stop();
  });

  it("stops: no more checks, no listeners, and a late answer reports nothing", async () => {
    const w = setup(["a", "b"]);
    await vi.advanceTimersByTimeAsync(0);
    w.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(w.readSignature).toHaveBeenCalledTimes(1);
    expect(w.docListeners.size).toBe(0);
    expect(w.winListeners.size).toBe(0);
    expect(w.onChange).not.toHaveBeenCalled();
  });
});
