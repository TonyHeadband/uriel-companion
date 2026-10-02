import type { GestureName } from "./gestures";
import type { ParticleKind } from "./pose";
import type { EyeShape, ExpressionName, FaceMouth, Gaze } from "./states";
import type { SoundName } from "../sound/names";

export interface ExpressionDef {
  /** 0 baseline mood, 10 ambient, 20 reaction to the person. Higher shows over lower; ties go to the newest. */
  priority: number;
  eye?: EyeShape;
  mouth?: FaceMouth;
  /** A later eye, e.g. a yawn ends with the eyes shut. */
  then?: { at: number; eye: EyeShape };
  blush?: number;
  tilt?: number;
  gaze?: Gaze;
  gestures?: readonly GestureName[];
  particles?: { kind: ParticleKind; count: number; at?: number };
  sound?: SoundName;
  /** Multiply the action's motion: pace > 1 is slower, range < 1 is smaller. */
  modifiers?: { pace?: number; range?: number };
}

export const EXPRESSIONS: Record<ExpressionName, ExpressionDef> = {
  love: { priority: 20, eye: "heart", mouth: { viseme: "U", open: 0.5 }, gestures: ["blushHold", "smallHop"], particles: { kind: "heart", count: 4 }, sound: "love" },
  surprised: { priority: 20, eye: "dot", mouth: { viseme: "O", open: 1 }, gestures: ["bigHop", "eyesWide"] },
  annoyed: { priority: 20, eye: "line", mouth: { viseme: "MBP", open: 0 }, sound: "annoyed" },
  proud: { priority: 10, eye: "star", mouth: { viseme: "E", open: 0.7 }, gestures: ["tiltBack", "pirouette"], particles: { kind: "star", count: 5 } },
  wink: { priority: 10, eye: "wink", mouth: { viseme: "E", open: 0.25 }, gestures: ["tiltSide"] },
  yawn: {
    priority: 10, eye: "tired", mouth: { viseme: "A", open: 1 }, then: { at: 700, eye: "closed" }, gestures: ["yawnStretch"],
    particles: { kind: "z", count: 2, at: 700 }, sound: "yawn",
  },
  happy: { priority: 10, eye: "happy", mouth: { viseme: "E", open: 0.5 }, gestures: ["blushFlash"] },
  // A mood rather than a moment: no gesture or sound, so it can sit under everything as a baseline.
  tired: { priority: 10, eye: "tired" },
};
