// The Library as the strip and grid show it: the platform's list of files, sorted newest first, and
// grouped under date headings. Pure functions (no DOM, no bridge) so the rules are unit tested.
import type { LibraryItem } from "../platform/bridge";
import { capturedAtFromPath } from "../shared/stamp";

/** One Annotated Image in the Library list. */
export interface LibraryImage {
  path: string;
  /** When it was captured: the time in its file name, else when the file was created (or last written). */
  capturedAt: Date;
  /** Pixel size of the finished image. */
  width: number;
  height: number;
  /** With `bytes`, changes whenever the file does: a thumbnail made for another value is stale. */
  modifiedMs: number;
  bytes: number;
}

/** The name of the file without its folder (the `/` or `\` it was written with does not matter). */
export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

/**
 * The Library list, newest capture on the left (first). Ordered by the capture time in the file name,
 * never by when the file was last written: editing an old image must not move it to the front. Files
 * without a time in their name (PNGs dropped into the folder) use when they were created. Ties go to
 * the later write, then to the path, so the order is stable.
 */
export function toLibraryImages(items: readonly LibraryItem[]): LibraryImage[] {
  return items
    .map((item) => ({
      path: item.path,
      capturedAt: capturedAtFromPath(item.path) ?? new Date(item.createdMs ?? item.modifiedMs),
      width: item.width,
      height: item.height,
      modifiedMs: item.modifiedMs,
      bytes: item.bytes,
    }))
    .sort(
      (a, b) =>
        b.capturedAt.getTime() - a.capturedAt.getTime() ||
        b.modifiedMs - a.modifiedMs ||
        (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    );
}

/** Whether two lists show the same thing (same files, same versions of them, same order). */
export function sameLibrary(a: readonly LibraryImage[], b: readonly LibraryImage[]): boolean {
  return a.length === b.length && a.every((x, i) => x.path === b[i]!.path && x.modifiedMs === b[i]!.modifiedMs && x.bytes === b[i]!.bytes);
}

export interface DateGroup {
  /** Stable across renders: `today`, `yesterday`, `day:2026-11-11`, `month:2026-10`. */
  key: string;
  heading: string;
  images: LibraryImage[];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Whole calendar days from `from` to `to` in local time (not 24 h blocks, so a daylight-saving change cannot shift a day). */
function calendarDaysBetween(from: Date, to: Date): number {
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day(to) - day(from)) / 86_400_000);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Group a newest-first list under date headings relative to `now`: Today, Yesterday, then each day of
 * the rest of the past week as "Wednesday 11 November", and anything older by month ("October 2026").
 * The order of the images, and of the groups, is the order given. A time after `now` (a clock that
 * moved) counts as Today.
 */
export function groupByDate(images: readonly LibraryImage[], now: Date): DateGroup[] {
  const groups: DateGroup[] = [];
  for (const image of images) {
    const at = image.capturedAt;
    const age = calendarDaysBetween(at, now);
    let key: string;
    let heading: string;
    if (age <= 0) {
      key = "today";
      heading = "Today";
    } else if (age === 1) {
      key = "yesterday";
      heading = "Yesterday";
    } else if (age < 7) {
      key = `day:${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
      heading = `${WEEKDAYS[at.getDay()]} ${at.getDate()} ${MONTHS[at.getMonth()]}`;
    } else {
      key = `month:${at.getFullYear()}-${pad(at.getMonth() + 1)}`;
      heading = `${MONTHS[at.getMonth()]} ${at.getFullYear()}`;
    }
    const last = groups.at(-1);
    if (last && last.key === key) last.images.push(image);
    else groups.push({ key, heading, images: [image] });
  }
  return groups;
}

/** "13:45:01" (24 hour, like the file name). */
export function formatTime(at: Date): string {
  return `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** "15 Nov 2026 13:45:01", for a thumbnail's tooltip and accessible name. */
export function formatWhen(at: Date): string {
  return `${at.getDate()} ${MONTHS[at.getMonth()]!.slice(0, 3)} ${at.getFullYear()} ${formatTime(at)}`;
}

/** Which image to show after `removed` (paths) leave the list that was `before`: the next older one, else the next newer, else none. */
export function neighbourAfterRemoval(before: readonly LibraryImage[], removed: ReadonlySet<string>, anchor: string): string | null {
  const index = before.findIndex((i) => i.path === anchor);
  const remaining = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < before.length; i += step) if (!removed.has(before[i]!.path)) return before[i]!.path;
    return null;
  };
  // Older images come later in a newest-first list.
  return remaining(index + 1, 1) ?? remaining(index - 1, -1);
}
