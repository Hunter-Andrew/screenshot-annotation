// The undo history file of one image (ticket 13, spec "Undo history"). Pure TypeScript.
//
// Stored per image in local app data, never in the PNG (ADR 0004). It records the content hash of
// the PNG it belongs to, so a PNG changed outside the app (edited elsewhere, restored from a backup,
// replaced by sync) throws the history away: its steps would no longer fit the pixels and model.
// The rules here (cap, hash discard, expiry, corrupt file) take their clock and hash as arguments.
import { HISTORY_CAP, type HistoryState, type Step } from "./history";
import type { Edit } from "./editSession";

/** Bump when the file's shape changes incompatibly. A file with another number is discarded, not read. */
export const HISTORY_FORMAT_VERSION = 1;
export const EXPIRY_DAYS = 60;
export const DAY_MS = 24 * 60 * 60 * 1000;

export interface HistoryFile {
  /** `contentHash` of the Library PNG this history belongs to, as the app last wrote it. */
  hash: string;
  /** When the image was last opened or edited (ms since the epoch). */
  touchedAt: number;
  history: HistoryState;
  /**
   * The PNG bytes of pasted images (ticket 38) that the steps can put back but the Library PNG no longer
   * holds, by `imageId`: a deleted image's pixels, so Undo restores it after a restart too.
   */
  images?: Record<string, Uint8Array>;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function serializeHistory(file: HistoryFile): string {
  const { images, ...rest } = file;
  const stored =
    images && Object.keys(images).length > 0
      ? { images: Object.fromEntries(Object.entries(images).map(([id, png]) => [id, toBase64(png)])) }
      : {};
  return JSON.stringify({ version: HISTORY_FORMAT_VERSION, ...rest, ...stored });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const isCrop = (value: unknown): boolean => isObject(value) && ["x", "y", "width", "height"].every((k) => isNumber(value[k]));

/** Shallow check that is enough for `applyEdit` to never throw: kind and ids, not Annotation contents. */
function isEdit(value: unknown, depth = 0): value is Edit {
  if (!isObject(value)) return false;
  switch (value.kind) {
    case "add":
      return (
        isObject(value.annotation) &&
        isString(value.annotation.id) &&
        isString(value.annotation.type) &&
        (value.index === undefined || isNumber(value.index))
      );
    case "update":
      return isString(value.id) && isObject(value.patch);
    case "delete":
      return isString(value.id);
    case "reorder":
      return isString(value.id) && isNumber(value.to);
    case "setCrop":
      return value.crop === null || (isObject(value.crop) && ["x", "y", "width", "height"].every((k) => isNumber((value.crop as Record<string, unknown>)[k])));
    case "setBackground":
      return value.background === null || value.background === "white" || value.background === "dark" || value.background === "transparent";
    case "setShowOutside":
      return value.showOutside === null || typeof value.showOutside === "boolean";
    case "setGrowth":
      return (
        value.growth === null ||
        (isObject(value.growth) && isCrop(value.growth.base) && Array.isArray(value.growth.causes) && value.growth.causes.every((c) => isObject(c) && isString(c.id) && isCrop(c.bounds)))
      );
    case "batch":
      // One level only: a batch holds plain edits.
      return depth === 0 && Array.isArray(value.edits) && value.edits.every((part) => isEdit(part, 1));
    default:
      return false;
  }
}

function isStep(value: unknown): value is Step {
  return isObject(value) && isEdit(value.undo) && isEdit(value.redo) && isNumber(value.at);
}

/** The file's contents, or null if it is not JSON, has another format version or is malformed. */
export function parseHistory(text: string): HistoryFile | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== HISTORY_FORMAT_VERSION) return null;
  const { hash, touchedAt, history } = data;
  if (!isString(hash) || !isNumber(touchedAt) || !isObject(history)) return null;
  const { undo, redo } = history;
  if (!Array.isArray(undo) || !Array.isArray(redo) || !undo.every(isStep) || !redo.every(isStep)) return null;
  const images = readImages(data.images);
  return { hash, touchedAt, history: { undo, redo }, ...(Object.keys(images).length > 0 ? { images } : {}) };
}

/** The stored pasted images; an entry that is not valid base64 text is dropped (its Undo then has nothing to restore). */
function readImages(raw: unknown): Record<string, Uint8Array> {
  const images: Record<string, Uint8Array> = {};
  if (!isObject(raw)) return images;
  for (const [id, text] of Object.entries(raw)) {
    if (!isString(text)) continue;
    try {
      images[id] = fromBase64(text);
    } catch {
      // Not base64: skipped.
    }
  }
  return images;
}

/** The instant a history last touched at that moment expires: purge files older than this. */
export function expiryCutoff(now: number): number {
  return now - EXPIRY_DAYS * DAY_MS;
}

/** True once an image has gone more than 60 days without being opened or edited. */
export function isExpired(touchedAt: number, now: number): boolean {
  return touchedAt < expiryCutoff(now);
}

export type RestoreReason = "none" | "restored" | "corrupt" | "changed" | "expired";

/**
 * The history to start an image with. `stored` is the file's text (null: there is none) and
 * `currentHash` the hash of the PNG just read. Anything that does not fit gives an empty history
 * and says why; nothing here throws, so a bad file never stops an image from opening.
 */
export function restoreHistory(
  stored: string | null,
  currentHash: string,
  now: number,
): { history: HistoryState; reason: RestoreReason; images: Record<string, Uint8Array> } {
  const empty = { undo: [], redo: [] };
  if (stored === null) return { history: empty, reason: "none", images: {} };
  const file = parseHistory(stored);
  if (!file) return { history: empty, reason: "corrupt", images: {} };
  if (file.hash !== currentHash) return { history: empty, reason: "changed", images: {} };
  if (isExpired(file.touchedAt, now)) return { history: empty, reason: "expired", images: {} };
  return {
    history: { undo: file.history.undo.slice(-HISTORY_CAP), redo: file.history.redo.slice(-HISTORY_CAP) },
    reason: "restored",
    images: file.images ?? {},
  };
}

