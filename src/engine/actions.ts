import { hex, type RGB } from "./color";
import type { GestureName } from "./gestures";
import type { ItemKind, ParticleKind } from "./pose";
import type { ActionFace, ActionName, BadgeKind, ExpressionName, Motion } from "./states";
import type { SoundName } from "../sound/names";
import type { SceneName } from "../scene/types";
import type { RoutineName } from "./routines";

export type EnterStep = GestureName | { particles: ParticleKind; count: number; at: number };

export interface ActionDef {
  /** The person's at-a-glance signal of what's happening; mood never changes it. */
  color: RGB;
  /** How strongly the mood colour fills the body from below, 0–1. */
  tint: number;
  badge: BadgeKind | null;
  sound?: SoundName;
  motion: Motion;
  rhythm?: "bounce" | "breathe";
  /** Played when the action is entered, not when it resumes; without it the character blinks. */
  enter?: readonly EnterStep[];
  face: ActionFace;
  ambient?: { particles: ParticleKind; every: number };
  /** Expressions that may show over this action; omitted means all. */
  allows?: readonly ExpressionName[];
  /** The character leaves the stage while this shows, and greets when it comes back. */
  offstage?: boolean;
  /** What the character holds while this shows, fetched from behind its back. */
  item?: ItemKind;
  /** The fixtures that rise in around the character while this shows; it walks between the scene's spots. */
  scene?: SceneName;
  /** Something it does on its own while idle (see Pastimes), not something the agent is doing. */
  pastime?: boolean;
  /** What it does while this shows, scripted (see Routines), in place of going from spot to spot in its scene. */
  routine?: RoutineName;
}

export function allows(a: ActionDef, e: ExpressionName): boolean {
  return !a.allows || a.allows.includes(e);
}

const STILL = { x: 0, y: 0 };

// Colours and tints from the study (§1). Searching darts about and hops, working slides from desk to desk; calm ones
// barely drift; talking and attention states come to the centre to be noticed. question and approval are what a turn leaves behind (agent-map).
export const ACTIONS: Record<ActionName, ActionDef> = {
  idle: {
    color: hex("#E6E9EE"), tint: 0, badge: null,
    motion: { range: { x: 2, y: 0.2 }, every: [3000, 6000], pace: 1.5, glance: true },
    face: { eye: "pill" },
  },
  thinking: {
    color: hex("#8B5CF6"), tint: 0.72, badge: "dots", sound: "think",
    motion: { range: { x: 0.6, y: 0.1 }, every: [4000, 7000], pace: 2.5 },
    face: { eye: "pill", gaze: { fixed: [0.55, 0.55] } },
  },
  talking: {
    color: hex("#FFD9A8"), tint: 0.2, badge: null,
    motion: { range: { x: 0.4, y: 0.05 }, every: [2500, 4000], pace: 1.2, centre: true },
    face: { eye: "pill" },
  },
  working: {
    color: hex("#3B9EFF"), tint: 0.72, badge: "dots", sound: "work", item: "pen", scene: "study",
    motion: { range: { x: 1.2, y: 0 }, every: [3000, 5000], pace: 0.6, desks: 3 },
    face: { eye: "pill" },
  },
  searching: {
    color: hex("#6366F1"), tint: 0.72, badge: "dots", sound: "search", item: "lens", scene: "library",
    motion: { range: { x: 2, y: 0.2 }, every: [800, 1800], pace: 0.3, hop: 0.06 },
    face: { eye: "pill", gaze: "scan" },
  },
  question: {
    color: hex("#22D3EE"), tint: 0.75, badge: "question",
    motion: { range: { x: 0.3, y: 0.05 }, every: [3000, 5000], pace: 2, centre: true },
    face: { eye: "pill", tilt: 0.17 },
  },
  // A tool the agent didn't tag: a bug to fix in uriel-tools, shown plainly instead of guessed. Tilts the opposite way to question so the two don't read alike.
  confused: {
    color: hex("#A3E635"), tint: 0.72, badge: "question",
    motion: { range: { x: 0.3, y: 0.05 }, every: [3000, 5000], pace: 2 },
    face: { eye: "dot", tilt: -0.17 },
  },
  approval: {
    color: hex("#F5A524"), tint: 0.78, badge: "bang", rhythm: "bounce", enter: ["hop"], item: "stamp",
    motion: { range: STILL, pace: 0.4, centre: true },
    face: { eye: "wide" },
  },
  error: {
    color: hex("#F4505E"), tint: 0.78, badge: "dot", sound: "error", enter: ["shake"],
    motion: { range: STILL, pace: 0.4, centre: true },
    face: { eye: "flat" },
  },
  finished: {
    color: hex("#34D399"), tint: 0.35, badge: "dot", sound: "finish",
    enter: ["littleHop", "pirouette", { particles: "spark", count: 5, at: 500 }],
    motion: { range: { x: 0.5, y: 0.08 }, every: [3000, 5000], pace: 2 },
    face: { eye: "happy" },
  },
  sleeping: {
    color: hex("#94A3B8"), tint: 0.32, badge: null, rhythm: "breathe", ambient: { particles: "z", every: 1300 }, scene: "bedroom",
    motion: { range: STILL, pace: 1.5 },
    face: { eye: "closed", gaze: "down", blink: false },
    allows: ["surprised"],
  },
  dizzy: {
    color: hex("#F472B6"), tint: 0.7, badge: null, sound: "dizzy", enter: ["shake", "spin2"],
    motion: { range: { x: 0.6, y: 0.1 }, every: [400, 900], pace: 0.35 },
    face: { eye: "spiral", gaze: "sway", blink: false },
    allows: [],
  },
  // The agent can't be reached: the character is somewhere else. Nothing to show, so no colour change, sound or feelings.
  away: {
    color: hex("#E6E9EE"), tint: 0, badge: null, offstage: true,
    motion: { range: STILL, pace: 1.5 },
    face: { eye: "pill" },
    allows: [],
  },
  // Pastimes: things it does on its own while idle. Calm colours, no badge, no sound.
  reading: {
    color: hex("#F5B971"), tint: 0.3, badge: null, pastime: true, item: "book", scene: "nook",
    motion: { range: STILL, pace: 1.2 },
    face: { eye: "pill", gaze: "down" },
    routine: "reading",
  },
  coffee: {
    color: hex("#C8935E"), tint: 0.3, badge: null, pastime: true, item: "mug", scene: "cafe",
    motion: { range: STILL, pace: 1.2 },
    face: { eye: "pill" },
    routine: "coffee",
  },
  watering: {
    color: hex("#5EC8F2"), tint: 0.35, badge: null, pastime: true, item: "can", scene: "garden",
    motion: { range: STILL, pace: 1.2 },
    face: { eye: "pill", gaze: "down" },
    routine: "watering",
  },
  football: {
    color: hex("#7BD389"), tint: 0.3, badge: null, pastime: true, scene: "pitch", routine: "football",
    motion: { range: STILL, pace: 1.2 },
    face: { eye: "pill" },
  },
  jumprope: {
    color: hex("#F2D45E"), tint: 0.3, badge: null, pastime: true, scene: "yard", routine: "jumprope",
    motion: { range: STILL, pace: 1.2 },
    face: { eye: "pill" },
  },
};
