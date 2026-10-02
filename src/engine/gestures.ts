import { Ease } from "./anim";
import type { Prop } from "./props";
import type { Key } from "./tweens";

/** One prop's keyframes. `keys` gets the expression's duration, so holds can stretch to fit it. */
export interface Track {
  prop: Prop;
  keys: (ms: number) => Key[];
  /** Jump here before starting (a spin starts from upright). */
  from?: number;
  /** Snap value and target here when done: a full turn is the same as none, and smoothing mustn't spin it back. */
  settle?: number;
}
export type Gesture = readonly Track[];

const fixed = (prop: Prop, keys: Key[]): Track => ({ prop, keys: () => keys });
const hold = (ms: number, used: number) => Math.max(0, ms - used);
// Spins start from wherever the body leans, not a snap to front, and settle on the same angle as 2π·n.
const turns = (ms: number, n: number): Track => ({
  prop: "turn", keys: () => [[Math.PI * 2 * n, ms, Ease.inOut]], settle: 0,
});

// Gesture timings from coucou's prototype (Louis-CFM/coucou, MIT): fast in, slower out, small overshoot.
export const GESTURES = {
  blink: [fixed("open", [[0.06, 70, Ease.inOut], [1, 130, Ease.out]])],
  squash: [
    fixed("sy", [[0.78, 70, Ease.out], [1.1, 130, Ease.out], [1, 170, Ease.inOut]]),
    fixed("sx", [[1.16, 70, Ease.out], [0.95, 130, Ease.out], [1, 170, Ease.inOut]]),
  ],
  hop: [fixed("oy", [[-0.2, 150, Ease.out], [0, 300, Ease.back]])],
  littleHop: [fixed("oy", [[-0.12, 140, Ease.out], [0, 280, Ease.back]])],
  shake: [fixed("ox", [[0.08, 50, Ease.out], [-0.08, 70, Ease.inOut], [0.05, 70, Ease.inOut], [0, 90, Ease.out]])],
  pirouette: [turns(900, 1)],
  spin2: [turns(1300, 2)],
  handsUp: [fixed("hands", [[1, 280, Ease.back]])],
  handsDown: [fixed("hands", [[0, 240, Ease.inOut]])],
  smallHop: [fixed("oy", [[-0.1, 160, Ease.out], [0, 300, Ease.back]])],
  bigHop: [fixed("oy", [[-0.3, 140, Ease.out], [0, 380, Ease.back]])],
  eyesWide: [fixed("es", [[1.25, 120, Ease.out], [1, 500, Ease.inOut]])],
  blushHold: [{ prop: "blush", keys: (ms) => [[1, 300, Ease.out], [1, hold(ms, 600), Ease.lin], [0, 300, Ease.inOut]] }],
  blushFlash: [fixed("blush", [[0.6, 200, Ease.out], [0, 600, Ease.inOut]])],
  tiltBack: [{ prop: "tilt", keys: (ms) => [[-0.14, 220, Ease.out], [-0.14, hold(ms, 500), Ease.lin], [0, 280, Ease.inOut]] }],
  tiltSide: [{ prop: "tilt", keys: (ms) => [[0.12, 160, Ease.out], [0.12, hold(ms, 400), Ease.lin], [0, 240, Ease.inOut]] }],
  // Football, its back to us: a lean back and a crouch, then the lunge at the ball (its peak at 120 ms is the contact).
  windUp: [fixed("tip", [[0.18, 260, Ease.out]]), fixed("sy", [[0.9, 260, Ease.out]])],
  kick: [
    fixed("tip", [[-0.3, 120, Ease.out], [0, 320, Ease.inOut]]),
    fixed("sy", [[1.08, 120, Ease.out], [1, 320, Ease.inOut]]),
    fixed("oy", [[-0.12, 120, Ease.out], [0, 300, Ease.back]]),
  ],
  // Jump rope: a quick, low skip peaking at 110 ms; a trip is a wobble and a lurch.
  skipHop: [fixed("oy", [[-0.14, 110, Ease.out], [0, 160, Ease.inOut]])],
  stumble: [
    fixed("ox", [[0.1, 60, Ease.out], [-0.1, 90, Ease.inOut], [0.06, 90, Ease.inOut], [0, 120, Ease.out]]),
    fixed("tilt", [[0.15, 120, Ease.out], [-0.08, 200, Ease.inOut], [0, 300, Ease.inOut]]),
  ],
  yawnStretch: [
    fixed("sy", [[1.12, 500, Ease.inOut], [1, 500, Ease.inOut]]),
    fixed("sx", [[0.94, 500, Ease.inOut], [1, 500, Ease.inOut]]),
  ],
} satisfies Record<string, Gesture>;

export type GestureName = keyof typeof GESTURES;

/** How long a gesture runs (ms): its longest track. */
export function gestureMs(g: Gesture): number {
  return Math.max(0, ...g.map((tr) => tr.keys(0).reduce((s, [, ms]) => s + ms, 0)));
}

/** A look over one shoulder and back. The engine picks the side, so it isn't in GESTURES. */
export function lookAround(side: 1 | -1): Gesture {
  return [fixed("turn", [[0.6 * side, 450, Ease.inOut], [0.6 * side, 1200, Ease.lin], [0, 500, Ease.inOut]])];
}

/** A poke knocks the body round a little; it springs back. */
export function turnJolt(side: 1 | -1): Gesture {
  return [fixed("turn", [[0.3 * side, 90, Ease.out], [0, 260, Ease.back]])];
}

// The hand fetches an item from behind the body and puts it back there: behind (0.4) is where it changes.
export const REACH_KEYS: Key[] = [[1, 600, Ease.out]];
export const STOW_BEHIND: Key[] = [[0.4, 250, Ease.inOut]];
export const STOW_SIDE: Key[] = [[0, 250, Ease.out]];
// A scene's fixtures rise out of the floor with a little overshoot, and sink back quicker.
export const SCENE_RISE: Key[] = [[1, 700, Ease.back]];
export const SCENE_SINK: Key[] = [[0, 350, Ease.inOut]];
