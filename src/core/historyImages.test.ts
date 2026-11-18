// @vitest-environment node
// Undo history and pasted images (ticket 38): the history keeps the bytes of a deleted image, so Undo
// brings it back with its original pixels, also after a restart (the history file carries them).
import { describe, expect, it } from "vitest";
import { createFromCapture, encodeLibraryPng, decodeLibraryPng, imageIdFor } from "./annotatedImage";
import type { ImageAnnotation } from "./annotation";
import { createEditSession } from "./editSession";
import { historyImageIds } from "./history";
import { restoreHistory, serializeHistory } from "./historyFile";
import { encodeRgbaPng } from "./png";

const capturePng = () => encodeRgbaPng(2, 2, new Uint8Array(16).fill(255));
const pasted = () => encodeRgbaPng(3, 1, new Uint8Array([1, 2, 3, 255, 4, 5, 6, 200, 7, 8, 9, 100]));
const NOW = Date.UTC(2026, 10, 16, 12);

async function pastedSession() {
  const session = createEditSession(createFromCapture(capturePng()), { now: () => NOW });
  const imageId = await imageIdFor(pasted());
  session.registerImage(imageId, pasted());
  const annotation: ImageAnnotation = {
    id: "i1",
    type: "image",
    x: 0,
    y: 0,
    width: 3,
    height: 1,
    imageId,
    border: { enabled: false, color: "#e02424", width: 4 },
    opacity: { value: 1 },
  };
  session.apply({ kind: "add", annotation });
  return { session, imageId, annotation };
}

describe("an image session keeps pasted bytes", () => {
  it("keeps the bytes after the image is deleted, so Undo restores it with its original pixels", async () => {
    const { session, imageId } = await pastedSession();
    session.apply({ kind: "delete", id: "i1" });
    expect(session.image.model.annotations).toEqual([]);
    expect(session.image.images?.[imageId]).toEqual(pasted());

    session.undo();
    const restored = session.image.model.annotations[0] as ImageAnnotation;
    expect(restored.imageId).toBe(imageId);
    expect(session.image.images?.[imageId]).toEqual(pasted());
  });

  it("registering an image is not an undo step", async () => {
    const session = createEditSession(createFromCapture(capturePng()));
    session.registerImage("x", pasted());
    expect(session.canUndo).toBe(false);
    expect(session.image.images?.x).toEqual(pasted());
  });

  it("a paste is one undo step: Undo removes the image, Redo puts it back", async () => {
    const { session } = await pastedSession();
    expect(session.history.undo).toHaveLength(1);
    session.undo();
    expect(session.image.model.annotations).toEqual([]);
    session.redo();
    expect(session.image.model.annotations).toHaveLength(1);
  });
});

describe("the history file carries the bytes of images the history refers to", () => {
  it("lists the images a history's steps would put back", async () => {
    const { session, imageId } = await pastedSession();
    session.apply({ kind: "delete", id: "i1" });
    expect(historyImageIds(session.history)).toEqual([imageId]);
  });

  it("restores a deleted image's bytes from the file in a later run, and Undo then works", async () => {
    const { session, imageId } = await pastedSession();
    session.apply({ kind: "delete", id: "i1" });
    // The Library PNG no longer holds the deleted image...
    const png = await encodeLibraryPng(session.image, async () => capturePng());
    expect(decodeLibraryPng(png).images).toEqual({});
    // ...so the history file does.
    const text = serializeHistory({
      hash: "h",
      touchedAt: NOW,
      history: session.history,
      images: { [imageId]: pasted() },
    });

    const restored = restoreHistory(text, "h", NOW);
    expect(restored.reason).toBe("restored");
    expect(restored.images[imageId]).toEqual(pasted());

    const next = createEditSession(
      { ...decodeLibraryPng(png), images: { ...decodeLibraryPng(png).images, ...restored.images } },
      { history: restored.history },
    );
    expect(next.undo()).toBe(true);
    expect(next.image.model.annotations).toHaveLength(1);
    expect(next.image.images?.[imageId]).toEqual(pasted());
  });

  it("has no images for a file written without any, and ignores a malformed images entry", () => {
    const plain = serializeHistory({ hash: "h", touchedAt: NOW, history: { undo: [], redo: [] } });
    expect(restoreHistory(plain, "h", NOW).images).toEqual({});
    const broken = JSON.stringify({ ...JSON.parse(plain), images: { a: 5 } });
    const result = restoreHistory(broken, "h", NOW);
    expect(result.reason).toBe("restored");
    expect(result.images).toEqual({});
  });
});
