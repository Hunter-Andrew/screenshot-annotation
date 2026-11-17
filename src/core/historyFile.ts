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
}

export function serializeHistory(file: HistoryFile): string {
  return JSON.stringify({ version: HISTORY_FORMAT_VERSION, ...file });
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isString = (value: unknown): value is string => typeof value === "string";
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** Shallow check that is enough for `applyEdit` to never throw: kind and ids, not Annotation contents. */
function isEdit(value: unknown): value is Edit {
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
  return { hash, touchedAt, history: { undo, redo } };
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
): { history: HistoryState; reason: RestoreReason } {
  const empty = { undo: [], redo: [] };
  if (stored === null) return { history: empty, reason: "none" };
  const file = parseHistory(stored);
  if (!file) return { history: empty, reason: "corrupt" };
  if (file.hash !== currentHash) return { history: empty, reason: "changed" };
  if (isExpired(file.touchedAt, now)) return { history: empty, reason: "expired" };
  return {
    history: { undo: file.history.undo.slice(-HISTORY_CAP), redo: file.history.redo.slice(-HISTORY_CAP) },
    reason: "restored",
  };
}

