import type { Viseme } from "../speech/timeline";
export type ActionName =
  | "idle" | "thinking" | "talking" | "working" | "searching" | "question" | "confused" | "approval" | "error" | "finished" | "sleeping" | "dizzy" | "away"
  | "reading" | "coffee" | "watering" | "football" | "jumprope";
export type ExpressionName = "love" | "surprised" | "proud" | "wink" | "yawn" | "happy" | "annoyed" | "tired";
export type EyeShape =
  | "pill" | "wide" | "dot" | "line" | "flat" | "happy" | "closed" | "spiral" | "heart" | "star" | "tired" | "wink";
export type BadgeKind = "dots" | "bang" | "question" | "dot";

/** Where the eyes point: the cursor, a scan, down (asleep), a dizzy sway, or a fixed [yaw, pitch] blended over the cursor. */
export type Gaze = "cursor" | "scan" | "down" | "sway" | { fixed: readonly [number, number] };

/** An action's resting face. Gaze defaults to the cursor and blinking to on. */
export interface ActionFace {
  eye: EyeShape;
  gaze?: Gaze;
  tilt?: number;
  blink?: boolean;
}

export interface FaceMouth {
  viseme: Viseme;
  open: number;
}

/** The face after expressions are laid over the action's. */
export interface Face {
  eye: EyeShape;
  /** A feeling's mouth (surprise, a yawn, a grin); null leaves the mouth to speech or nothing. */
  mouth: FaceMouth | null;
  gaze: Gaze;
  tilt: number;
  blink: boolean;
  blush: number;
}

/** How the character moves around the banner in a state; units of R, scaled by the liveliness setting. */
export interface Motion {
  /** Wander box around the centre. */
  range: { readonly x: number; readonly y: number };
  /** Milliseconds between moves (min, max); absent: it never picks a new spot. */
  every?: readonly [number, number];
  /** Ease time constant in seconds: lower is quicker. */
  pace: number;
  /** Moves only between this many evenly spaced spots across the box (desks), never staying on the same one. */
  desks?: number;
  /** Hop height as a dash starts. */
  hop?: number;
  /** Looks around on its own while the mouse is still. */
  glance?: boolean;
  /** Comes back to the centre on entry, so it gets noticed. */
  centre?: boolean;
}
