/** Local capture time as `YYYY-MM-DD HHmmss`: the Library file name (ADR 0004). Rust's `library::Stamp` parses exactly this. */
export function formatStamp(date: Date): string {
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}

/** The capture time a Library path's file name carries (`YYYY-MM-DD HHmmss`, optional `-2` suffix), or null. */
export function capturedAtFromPath(path: string): Date | null {
  const name = path.split(/[\\/]/).pop() ?? "";
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2})(\d{2})(\d{2})(?:-\d+)?\.png$/i.exec(name);
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1).map(Number) as [number, number, number, number, number, number];
  const date = new Date(year, month - 1, day, hour, minute, second);
  // new Date rolls 2026-13-45 over to another day; only a real calendar time counts.
  const real = date.getMonth() === month - 1 && date.getDate() === day && hour < 24 && minute < 60 && second < 60;
  return real ? date : null;
}
