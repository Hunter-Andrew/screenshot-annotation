import type { CSSProperties } from "react";
import type { LaserPointerSize } from "../platform/bridge";

/** The dot window's edge at 100% scale, in CSS pixels; `src-tauri/src/laser_pointer_math.rs` `WINDOW_SIZE` must match (see rustParity.test.ts). */
export const LASER_POINTER_WINDOW_SIZE = 96;

/** The click ripple: a ring of the pointer colour that grows from the core to `maxDiameter` and fades (ticket 40 decision 7). */
export const RIPPLE = { durationMs: 400, maxDiameter: 70, borderWidth: 3 } as const;

/** The haze never gets wider than this, so it (and its gradient) always fits inside the 96 px window with room to spare. */
const MAX_HAZE = 90;

export interface Laser {
  /** The size setting's core diameter in CSS pixels (physical pixels at 100% scale); it is what the click ripple starts from. */
  core: number;
  /** The wide soft haze's diameter. */
  haze: number;
  /** The one thin ring's outer diameter (the border is inside it) and border width. */
  ring: { diameter: number; border: number };
  /** The small hot core's diameter and the blur and spread of the glow around it. */
  hot: { diameter: number; blur: number; spread: number };
}

/**
 * The size table (ticket 40 decisions 5 and 14): the Laser pointer is look C of
 * `.scratch/v1/prototypes/laser-pointer-looks.html`, "Hot core + wide haze + thin ring", drawn in the pointer colour
 * only (the window is transparent). With k = core / 14 (Small 10, Medium 14, Large 20, so the size setting keeps its
 * meaning) it is a haze of 70 x k, a ring of 36 x k with a 1.5 x k border, and a hot core of 8 x k with a glow of 6 x k
 * blur and 2 x k spread. At Large, 70 x k would be 100 px, wider than the 96 px window: the haze is held to 90 px and
 * the ring shrinks in the same proportion, so every layer stays inside the window. Tune on the Windows PC.
 */
function laser(core: number): Laser {
  const k = core / 14;
  const haze = Math.min(70 * k, MAX_HAZE);
  const ring = 36 * k * (haze / (70 * k));
  return { core, haze, ring: { diameter: ring, border: 1.5 * k }, hot: { diameter: 8 * k, blur: 6 * k, spread: 2 * k } };
}

const LASERS: Record<LaserPointerSize, Laser> = { small: laser(10), medium: laser(14), large: laser(20) };

export function laserFor(size: LaserPointerSize): Laser {
  return LASERS[size] ?? LASERS.medium;
}

/** The width of the widest thing drawn for a size (haze, ring, or the hot core with its glow), centred on the dot. */
export function layerExtents(size: LaserPointerSize): number {
  const { haze, ring, hot } = laserFor(size);
  return Math.max(haze, ring.diameter, hot.diameter + 2 * (hot.blur + hot.spread));
}

const FALLBACK_RGB: [number, number, number] = [224, 36, 36];

function rgbOf(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : FALLBACK_RGB;
}

/** `#rrggbb` and an opacity as a CSS colour; anything that is not `#rrggbb` is red. */
export function hexToRgba(hex: string, opacity: number): string {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

interface Look {
  color: string;
  size: LaserPointerSize;
}

/** The pale tint of the colour (82% of the way to white) for the hot centre. */
export function hotTint(hex: string): string {
  const [r, g, b] = rgbOf(hex).map((v) => Math.round(v + (255 - v) * 0.82));
  return `rgb(${r}, ${g}, ${b})`;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** The three layers of the Laser pointer, each a round box to be centred on the hotspot (LaserPointerDot centres them). */
export function laserStyles({ color, size }: Look): { haze: CSSProperties; ring: CSSProperties; hot: CSSProperties } {
  const { haze, ring, hot } = laserFor(size);
  const round50 = "50%";
  return {
    haze: {
      width: round(haze),
      height: round(haze),
      borderRadius: round50,
      background: `radial-gradient(circle, ${hexToRgba(color, 0.5)} 0%, ${hexToRgba(color, 0.22)} 40%, ${hexToRgba(color, 0)} 72%)`,
    },
    ring: {
      width: round(ring.diameter),
      height: round(ring.diameter),
      boxSizing: "border-box",
      borderRadius: round50,
      border: `${round(ring.border)}px solid ${hexToRgba(color, 0.55)}`,
    },
    hot: {
      width: round(hot.diameter),
      height: round(hot.diameter),
      borderRadius: round50,
      background: `radial-gradient(circle, ${hotTint(color)} 0%, ${hexToRgba(color, 1)} 80%)`,
      boxShadow: `0 0 ${round(hot.blur)}px ${round(hot.spread)}px ${hexToRgba(color, 0.8)}`,
    },
  };
}

/** The ripple ring: starts at the core's size, ends at `RIPPLE.maxDiameter` (the keyframes are in LaserPointerDot). */
export function rippleStyle({ color, size }: Look): CSSProperties & Record<`--${string}`, string> {
  return {
    borderColor: color,
    "--ripple-from": `${laserFor(size).core}px`,
    "--ripple-to": `${RIPPLE.maxDiameter}px`,
    animationDuration: `${RIPPLE.durationMs}ms`,
  };
}
