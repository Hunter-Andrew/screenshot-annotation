/** Local capture time as `YYYY-MM-DD HHmmss`: the Library file name (ADR 0004). Rust's `library::Stamp` parses exactly this. */
export function formatStamp(date: Date): string {
  const p = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${p(date.getFullYear(), 4)}-${p(date.getMonth() + 1)}-${p(date.getDate())} ` +
    `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`
  );
}
