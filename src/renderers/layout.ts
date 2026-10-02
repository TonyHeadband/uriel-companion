/** R as a share of the canvas's shorter side. */
export const R_SCALE = 0.3;
/** How far from the body centre (in R) a pointer still counts as touching the character. */
export const REACH = 1.2;
/** Nearer is a little bigger: scale per R of depth. */
export const DEPTH_SCALE = 0.12;
/** The floor recedes upward: each R further back sits this many R higher on screen. */
export const FLOOR_RISE = 0.35;
/** The floor's y in body space: where the body's bottom rests. */
export const FLOOR_Y = 1;
// Zoomed out, the view drops by this share of the canvas height per unit of zoom lost, leaving headroom for fixtures.
const PULL_DROP = 0.25;

/** Where the character is, in R: across, hop (down positive), depth (toward the viewer positive), and the camera's zoom. */
export interface Placement {
  ox: number;
  oy: number;
  oz: number;
  /** 1 is the close-up; lower pulls the camera back so a scene fits. */
  zoom: number;
}

/** The camera for a canvas of w × h: the screen spot of the world's origin, and R at depth 0. */
export interface View {
  x0: number;
  y0: number;
  R: number;
}

export function viewOf(w: number, h: number, zoom: number): View {
  const R = Math.min(w, h) * R_SCALE * zoom;
  return { x0: w / 2, y0: h / 2 + R * 0.1 + (1 - zoom) * PULL_DROP * h, R };
}

/** A world point (R; y down, z toward the viewer) on screen, with the scale things have at its depth. */
export function toScreen(v: View, x: number, y: number, z: number): { X: number; Y: number; s: number } {
  const s = Math.max(0.2, 1 + DEPTH_SCALE * z);
  return { X: v.x0 + x * v.R * s, Y: v.y0 + (y * s + z * FLOOR_RISE) * v.R, s };
}

/** Where renderers put the body centre, and how big R is there, for a canvas of w × h. */
export function bodyFrame(w: number, h: number, at: Placement): { cx: number; cy: number; R: number } {
  const v = viewOf(w, h, at.zoom);
  const p = toScreen(v, at.ox, at.oy, at.oz);
  return { cx: p.X, cy: p.Y, R: v.R * p.s };
}

/** True when (x, y), in the same box as w × h, is on or right around the character. */
export function onCharacter(x: number, y: number, w: number, h: number, at: Placement): boolean {
  const { cx, cy, R } = bodyFrame(w, h, at);
  return Math.hypot(x - cx, y - cy) <= REACH * R;
}
