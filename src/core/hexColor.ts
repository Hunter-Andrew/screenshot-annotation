// Typed hex colors for the Style panel's ColorField. The output is the one stored format of the
// model (`HEX` in propertyGroups.ts: lower-case `#rrggbb`), so the sanitizer, sticky styles and the
// Export all agree. No alpha: opacity stays in the Fill group.

const TYPED = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `#RGB` or `#RRGGBB`, with or without `#`, any case, surrounding whitespace ignored, as `#rrggbb`; null when it is not one. */
export function parseHexColor(input: string): string | null {
  const match = TYPED.exec(input.trim());
  if (!match) return null;
  let digits = match[1]!.toLowerCase();
  if (digits.length === 3) digits = [...digits].map((d) => d + d).join("");
  return `#${digits}`;
}
