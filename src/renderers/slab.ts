import { clamp, lerp } from "../engine/anim";
import type { Pt } from "./parts";

export type Facing = "front" | "side" | "back";
export type Band = "lit" | "mid" | "shade";
type Vec3 = readonly [number, number, number];

/** Below this |cos turn| the big faces are edge-on: no face, no back panel. */
export const FACE_MIN = 0.15;

// From the top left but mostly toward the viewer, so the lit band covers the everyday lean (±0.45 rad) and its edge
// isn't crossed back and forth while the character wanders.
const L: Vec3 = (() => {
  const v: Vec3 = [-0.25, -0.6, 0.76];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

/**
 * The outline of a slab `depth` thick whose front is `front`, turned about the vertical axis and tipped about the
 * horizontal one. Each point moves out by the side's and the top's share, so the point count stays and the soft body
 * can deform it.
 */
export function silhouette(front: ReadonlyArray<Pt>, turn: number, depth: number, tip = 0): Pt[] {
  const c = Math.abs(Math.cos(turn));
  const s = Math.abs(Math.sin(turn));
  const cp = Math.abs(Math.cos(tip));
  const sp = Math.abs(Math.sin(tip));
  return front.map(([x, y]) => [
    Math.sign(x) * (Math.abs(x) * c + (depth / 2) * s),
    Math.sign(y) * (Math.abs(y) * cp + (depth / 2) * sp),
  ] as const);
}

/** Where x on the front (side 1) or the back (side −1) lands once turned. */
export function faceX(x: number, turn: number, depth: number, side: 1 | -1 = 1): number {
  return x * Math.cos(turn) + side * (depth / 2) * Math.sin(turn);
}

/** Where y on the front (side 1) or the back (side −1) lands once tipped; tipping forward drops the face. */
export function faceY(y: number, turn: number, tip: number, depth: number, side: 1 | -1 = 1): number {
  return y * Math.cos(tip) + side * (depth / 2) * Math.cos(turn) * Math.sin(tip);
}

export function facing(turn: number): Facing {
  const c = Math.cos(turn);
  return c > FACE_MIN ? "front" : c < -FACE_MIN ? "back" : "side";
}

/** A body-space point turned about the vertical axis, then tipped; z > 0 is toward the viewer, y > 0 is down. */
export function project(x: number, y: number, z: number, turn: number, tip = 0): { x: number; y: number; z: number } {
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  const cp = Math.cos(tip);
  const sp = Math.sin(tip);
  const z1 = -x * s + z * c;
  return { x: x * c + z * s, y: y * cp + z1 * sp, z: -y * sp + z1 * cp };
}

// The right hand's path as reach goes 0 → 1: at its side, behind the body, coming round, in front.
const REACH_PATH: ReadonlyArray<readonly [number, Vec3]> = [
  [0, [1.15, 0.42, 0]],
  [0.4, [0.45, 0.1, -0.8]],
  [0.7, [1.05, 0.25, 0.2]],
  [1, [0.95, 0.4, 0.7]],
];

export function reachPoint(reach: number): Vec3 {
  const r = clamp(reach, 0, 1);
  if (r >= 1) return REACH_PATH[REACH_PATH.length - 1][1];
  for (let i = 1; i < REACH_PATH.length; i++) {
    const [r1, p1] = REACH_PATH[i];
    if (r > r1) continue;
    const [r0, p0] = REACH_PATH[i - 1];
    const k = (r - r0) / (r1 - r0);
    return [lerp(p0[0], p1[0], k), lerp(p0[1], p1[1], k), lerp(p0[2], p1[2], k)];
  }
  return REACH_PATH[REACH_PATH.length - 1][1];
}

/** The front's (side 1) or back's (side −1) normal once turned and tipped. */
export function faceNormal(turn: number, side: 1 | -1, tip = 0): Vec3 {
  const z1 = side * Math.cos(turn);
  return [side * Math.sin(turn), z1 * Math.sin(tip), z1 * Math.cos(tip)];
}

/** The normal of whichever side wall faces the viewer. */
export function sideNormal(turn: number, tip = 0): Vec3 {
  const z1 = -Math.sin(turn);
  const right: Vec3 = [Math.cos(turn), z1 * Math.sin(tip), z1 * Math.cos(tip)];
  return right[2] >= 0 ? right : [-right[0], -right[1], -right[2]];
}

/** The normal of the top wall when tipped forward, or the bottom one when tipped back. */
export function capNormal(tip: number): Vec3 {
  const top: Vec3 = [0, -Math.cos(tip), Math.sin(tip)];
  return top[2] >= 0 ? top : [0, -top[1], -top[2]];
}

// Band edges in light (n·L), and how wide the fade across each is.
const LIT = 0.55;
const MID = 0.15;
const SOFT = 0.06;

/**
 * 0 shade, 1 mid, 2 lit. Flat inside each band, but each edge fades over a narrow window: turning across one reads as
 * a quick change of tone, not a pop.
 */
export function bandLevel(n: Vec3): number {
  const d = n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
  const step = (edge: number) => clamp((d - edge) / SOFT + 0.5, 0, 1);
  return step(MID) + step(LIT);
}

export function band(n: Vec3): Band {
  const level = bandLevel(n);
  return level >= 1.5 ? "lit" : level >= 0.5 ? "mid" : "shade";
}
