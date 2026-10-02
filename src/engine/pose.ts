import type { Viseme } from "../speech/timeline";
import type { RGB } from "./color";
import type { BodyShape } from "./softbody";
import { ACTIONS } from "./actions";
import type { BadgeKind, EyeShape } from "./states";
import type { SceneName } from "../scene/types";
import type { Thing } from "./things";

export type ItemKind = "lens" | "pen" | "stamp" | "book" | "mug" | "can";

export type ParticleKind = "heart" | "star" | "spark" | "z";

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seconds; negative until the particle starts (staggered bursts). */
  age: number;
  life: number;
  rot: number;
  size: number;
}

export interface PoseMouth {
  viseme: Viseme;
  /** 0 closed – 1 fully open for this shape. */
  open: number;
  /** Fades the whole mouth in when speech starts and out after it ends. */
  alpha: number;
}

/** Everything a renderer needs for one frame. Lengths are in units of the body radius R. */
export interface Pose {
  t: number;
  yaw: number;
  pitch: number;
  roll: number;
  tilt: number;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  /** Depth on the floor: negative is further back, positive toward the viewer. */
  oz: number;
  /** What it stands or sits on, as a y offset from the floor (R, negative is up): a mattress in bed. */
  ground: number;
  /** The camera: 1 is the close-up, lower pulls back to fit a scene. */
  zoom: number;
  color: RGB;
  tint: number;
  blush: number;
  eyeShape: EyeShape;
  eyeOpen: number;
  eyeScale: number;
  badge: BadgeKind | null;
  badgeColor: RGB;
  badgeScale: number;
  hands: number;
  waving: boolean;
  /** Body yaw in radians, separate from the gaze's yaw; spins wind it past 2π. */
  turn: number;
  /** Body pitch in radians: positive tips the top toward the viewer (leaning forward, looking down). */
  tip: number;
  /** The right hand's reach: 0 at its side, 0.4 behind the body, 1 in front holding the item. */
  reach: number;
  item: ItemKind | null;
  /** 0–1: how busily the hand holding the item scribbles, writing at a desk. */
  scribble: number;
  /** 0–1: how far the held item is in use: a page turning, the mug at the mouth, the can tipped to pour. */
  use: number;
  particles: readonly Particle[];
  mouth: PoseMouth | null;
  /** The soft body's outline and face offset (units of R); null draws the character's own outline. */
  body: BodyShape | null;
  /** The fixtures around the character, rising in (show 0 → 1) and sinking out with the action. */
  scene: PoseScene | null;
  /** Things moving in the scene, a ball rolling about, a rope turning in the hands; they rise and sink with it. */
  things: readonly Thing[];
}

export interface PoseScene {
  id: SceneName;
  show: number;
}

export function restPose(): Pose {
  return {
    t: 0, yaw: 0, pitch: 0, roll: 0, tilt: 0, sx: 1, sy: 1, ox: 0, oy: 0, oz: 0, ground: 0, zoom: 1,
    color: ACTIONS.idle.color, tint: 0, blush: 0,
    eyeShape: "pill", eyeOpen: 1, eyeScale: 1, badge: null, badgeColor: ACTIONS.idle.color, badgeScale: 0,
    hands: 0, waving: false, turn: 0, tip: 0, reach: 0, item: null, scribble: 0, use: 0, particles: [], mouth: null, body: null, scene: null, things: [],
  };
}
