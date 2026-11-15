import { describe, expect, it } from "vitest";
import { unpackCapture, unpackFrame, unpackLibraryFile } from "./tauriBridge";

const frameBytes = [2, 0, 0, 0, 1, 0, 0, 0, 0x89, 0x50, 0x4e, 0x47];

describe("unpackFrame", () => {
  it("reads width, height and the PNG from an ArrayBuffer", () => {
    const frame = unpackFrame(new Uint8Array(frameBytes).buffer);
    expect([frame.width, frame.height]).toEqual([2, 1]);
    expect(Array.from(frame.png)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  // When the webview's CSP blocks Tauri's fetch-based IPC, Tauri falls back to postMessage and a
  // binary reply arrives as a plain array of byte values instead of an ArrayBuffer.
  it("also accepts the plain byte array the postMessage fallback delivers", () => {
    const frame = unpackFrame(frameBytes as unknown as ArrayBuffer);
    expect([frame.width, frame.height]).toEqual([2, 1]);
    expect(Array.from(frame.png)).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it("names the problem when the reply is neither", () => {
    expect(() => unpackFrame({ nope: 1 } as unknown as ArrayBuffer)).toThrow(/unexpected reply/);
    expect(() => unpackFrame(new ArrayBuffer(3))).toThrow(/no frozen frame/);
  });
});

describe("unpackCapture", () => {
  it("accepts a plain byte array too, and treats an empty reply as no capture", () => {
    const bytes = new Uint8Array(17 + 2);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 5, true);
    view.setUint32(4, 4, true);
    view.setFloat64(8, 1500, true);
    bytes[16] = 0;
    bytes.set([7, 8], 17);
    const capture = unpackCapture(Array.from(bytes) as unknown as ArrayBuffer);
    expect([capture?.width, capture?.height, capture?.capturedAt.getTime()]).toEqual([5, 4, 1500]);
    expect(Array.from(capture!.png)).toEqual([7, 8]);
    expect(unpackCapture(new ArrayBuffer(0))).toBeNull();
    expect(unpackCapture([] as unknown as ArrayBuffer)).toBeNull();
  });
});

describe("unpackCapture clipboard outcome", () => {
  const body = (flag: number) => {
    const bytes = new Uint8Array(17 + 2);
    const view = new DataView(bytes.buffer);
    view.setUint32(0, 5, true);
    view.setUint32(4, 4, true);
    view.setFloat64(8, 1500, true);
    bytes[16] = flag;
    bytes.set([7, 8], 17);
    return bytes.buffer;
  };

  it("reads whether the platform copied the capture, failed to, or did not try", () => {
    expect(unpackCapture(body(0))?.clipboard).toBeUndefined();
    expect(unpackCapture(body(1))?.clipboard).toBe("copied");
    expect(unpackCapture(body(2))?.clipboard).toBe("failed");
    expect(Array.from(unpackCapture(body(1))!.png)).toEqual([7, 8]);
  });
});

describe("unpackLibraryFile", () => {
  // u32 LE byte length of the path, the path as UTF-8, then the PNG (what library_open_latest sends).
  const body = (path: string, png: number[]) => {
    const text = new TextEncoder().encode(path);
    const bytes = new Uint8Array(4 + text.length + png.length);
    new DataView(bytes.buffer).setUint32(0, text.length, true);
    bytes.set(text, 4);
    bytes.set(png, 4 + text.length);
    return bytes.buffer;
  };

  it("reads the path (counted in bytes, so accents survive) and the PNG", () => {
    const file = unpackLibraryFile(body("C:\\Users\\Jos\u00e9\\a.png", [0x89, 0x50]));

    expect(file?.path).toBe("C:\\Users\\Jos\u00e9\\a.png");
    expect(Array.from(file!.png)).toEqual([0x89, 0x50]);
  });

  it("treats an empty reply as an empty Library", () => {
    expect(unpackLibraryFile(new ArrayBuffer(0))).toBeNull();
    expect(unpackLibraryFile([] as unknown as ArrayBuffer)).toBeNull();
  });
});
