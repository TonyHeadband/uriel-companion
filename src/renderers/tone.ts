import { mixRGB, rgba, type RGB } from "../engine/color";

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];
// Each band is a fixed step from the base colour, so it reads as cel shading; only a band edge being crossed blends.
const SHADE: readonly [RGB, number] = [BLACK, 0.35];
const MID: readonly [RGB, number] = [WHITE, 0.06];
const LIT: readonly [RGB, number] = [WHITE, 0.14];

/** The base colour at a band level (0 shade, 1 mid, 2 lit), blending only between neighbouring bands. */
export function toneOf(base: RGB, level: number): string {
  const [shade, mid, lit] = [SHADE, MID, LIT].map(([to, k]) => mixRGB(base, to, k));
  return rgba(level <= 1 ? mixRGB(shade, mid, level) : mixRGB(mid, lit, level - 1), 1);
}
