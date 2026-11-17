// Selecting thumbnails in the Library Strip and grid (ticket 15): Ctrl+click toggles one, Shift+click
// selects the range from the last one clicked, a plain click opens the image. Pure.

export interface Selection {
  selected: ReadonlySet<string>;
  /** The thumbnail a Shift+click ranges from. */
  anchor: string | null;
}

export const NO_SELECTION: Selection = { selected: new Set(), anchor: null };

export interface ClickModifiers {
  ctrl: boolean;
  shift: boolean;
}

export type ClickResult = { kind: "open" } | { kind: "select"; selection: Selection };

/**
 * What a click on `path` does. `order` is every thumbnail in the order shown; `current` is the image open
 * in the editor, which a first Shift+click ranges from when nothing was clicked yet.
 */
export function clickThumbnail(
  selection: Selection,
  order: readonly string[],
  path: string,
  mods: ClickModifiers,
  current: string | null,
): ClickResult {
  if (!mods.ctrl && !mods.shift) return { kind: "open" };
  if (mods.shift) {
    const from = selection.anchor ?? current ?? path;
    const a = order.indexOf(from);
    const b = order.indexOf(path);
    if (a < 0 || b < 0) return { kind: "select", selection: { selected: new Set([path]), anchor: path } };
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    const selected = new Set(mods.ctrl ? [...selection.selected, ...range] : range);
    // The anchor stays put, so Shift+clicking elsewhere re-ranges from the same place.
    return { kind: "select", selection: { selected, anchor: from } };
  }
  const selected = new Set(selection.selected);
  if (selected.has(path)) selected.delete(path);
  else selected.add(path);
  return { kind: "select", selection: { selected, anchor: path } };
}

/** The selection without any path that is no longer in the Library. The same object if nothing left. */
export function pruneSelection(selection: Selection, existing: ReadonlySet<string>): Selection {
  const selected = [...selection.selected].filter((p) => existing.has(p));
  const anchor = selection.anchor !== null && existing.has(selection.anchor) ? selection.anchor : null;
  if (selected.length === selection.selected.size && anchor === selection.anchor) return selection;
  return { selected: new Set(selected), anchor };
}
