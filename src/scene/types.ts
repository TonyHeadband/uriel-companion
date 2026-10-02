// The environment as data: fixtures are lists of boxes, scenes place them and say where the character stands. Every
// renderer draws the same scene its own way, the way every renderer draws the same pose.

import type { Rect } from "./route";

export type BoxRole =
  | "frame" | "panel" | "shelf" | "book" | "top" | "leg" | "paper" | "lamp" | "mattress" | "pillow" | "blanket"
  | "cushion" | "pot" | "leaf" | "post" | "net";

/** A box in R: x and z are its centre from the fixture's origin, y0 its bottom's height above the floor. */
export interface Box {
  x: number;
  z: number;
  y0: number;
  w: number;
  h: number;
  d: number;
  role: BoxRole;
  /** 0–1: a per-box nudge of the role's tone, so rows of books don't all match. */
  tone?: number;
}

export interface FixtureDef {
  boxes: readonly Box[];
  /**
   * The floor it covers, centred z further than its origin; the character walks round it, never through. None: it
   * lies within another fixture's footprint (a blanket on a bed).
   */
  footprint?: { w: number; d: number; z?: number };
}

export type FixtureKind =
  | "bookshelf" | "desk" | "stool" | "bed" | "blanket" | "nightstand" | "armchair" | "armchairArms" | "floorLamp" | "cafeTable" | "plantStand"
  | "goal";

/** A fixture in a scene. Its z is also its place in the depth order against the character. */
export interface Placed {
  kind: FixtureKind;
  x: number;
  z: number;
}

export interface FloorPt {
  x: number;
  z: number;
}

/** A place to stand, and the body turn to settle into there (π is its back to the viewer). */
export interface Spot {
  x: number;
  z: number;
  turn?: number;
  /** Got to from here, in a straight last step that may cross a footprint: jumping into bed from its foot. */
  via?: FloorPt;
  /** Height (R) of what it sits on there, above the floor: a mattress. */
  lift?: number;
  /** The last step is a quick, high jump: backwards into bed from its foot. */
  leap?: boolean;
  /** It writes while there: the hand holding the pen scribbles. */
  writes?: boolean;
}

export type SceneName = "library" | "study" | "bedroom" | "nook" | "cafe" | "garden" | "pitch" | "yard";

export interface SceneDef {
  /** The camera pulls back to this while the scene shows. */
  zoom: number;
  /** Walking pace here (s, lower is quicker), over the action's own: sleeping drifts, but gets to bed briskly. */
  pace?: number;
  /** How long it stays at a spot once there (ms, min–max) before going to another. */
  dwell: readonly [number, number];
  fixtures: readonly Placed[];
  /** Where the character goes while the scene shows; it arrives at the first one. */
  spots: readonly Spot[];
  /** The floor things roll about on; none, and nothing rolls here. */
  bounds?: Rect;
}
