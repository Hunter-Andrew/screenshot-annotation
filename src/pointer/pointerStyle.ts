import type { CSSProperties } from "react";
import type { PointerSize } from "../platform/bridge";

/** The dot window's edge at 100% scale, in CSS pixels; `src-tauri/src/pointer.rs` `WINDOW_SIZE` must match (see rustParity.test.ts). */
export const POINTER_WINDOW_SIZE = 96;

/** The click ripple: a ring of the pointer colour that grows from the core to `maxDiameter` and fades (ticket 40 decision 7). */
export const RIPPLE = { durationMs: 400, maxDiameter: 70, borderWidth: 3 } as const;

interface GlowLayer {
  blur: number;
  spread: number;
  opacity: number;
}

export interface Glow {
  /** The bright core's diameter in CSS pixels (physical pixels at 100% scale). */
  core: number;
  inner: GlowLayer;
  outer: GlowLayer;
}

/**
 * The size table (ticket 40 decision 5): Medium is the prototype's dot (option C: a 14 px core, an inner glow of
 * 10 px blur and 4 px spread at 70% and an outer glow of 24 px and 10 px at 30%); Small and Large scale both layers in
 * step with the core (inner about 70%, outer about 30% opacity). The Large outer glow is held back a little so every
 * glow stays inside the 96 px window. Tune on the Windows PC.
 */
const GLOWS: Record<PointerSize, Glow> = {
  small: { core: 10, inner: { blur: 7, spread: 3, opacity: 0.7 }, outer: { blur: 17, spread: 7, opacity: 0.3 } },
  medium: { core: 14, inner: { blur: 10, spread: 4, opacity: 0.7 }, outer: { blur: 24, spread: 10, opacity: 0.3 } },
  large: { core: 20, inner: { blur: 14, spread: 6, opacity: 0.7 }, outer: { blur: 26, spread: 10, opacity: 0.3 } },
};

export function glowFor(size: PointerSize): Glow {
  return GLOWS[size] ?? GLOWS.medium;
}

const FALLBACK_RGB: [number, number, number] = [224, 36, 36];

/** `#rrggbb` and an opacity as a CSS colour; anything that is not `#rrggbb` is red. */
export function hexToRgba(hex: string, opacity: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  const [r, g, b] = m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : FALLBACK_RGB;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

interface Look {
  color: string;
  size: PointerSize;
}

/** The round core with its two glow layers, all in the pointer colour. */
export function dotStyle({ color, size }: Look): CSSProperties {
  const { core, inner, outer } = glowFor(size);
  const layer = (l: GlowLayer) => `0 0 ${l.blur}px ${l.spread}px ${hexToRgba(color, l.opacity)}`;
  return {
    width: core,
    height: core,
    borderRadius: "50%",
    background: color,
    boxShadow: `${layer(inner)}, ${layer(outer)}`,
  };
}

/** The ripple ring: starts at the core's size, ends at `RIPPLE.maxDiameter` (the keyframes are in PointerDot). */
export function rippleStyle({ color, size }: Look): CSSProperties & Record<`--${string}`, string> {
  return {
    borderColor: color,
    "--ripple-from": `${glowFor(size).core}px`,
    "--ripple-to": `${RIPPLE.maxDiameter}px`,
    animationDuration: `${RIPPLE.durationMs}ms`,
  };
}
