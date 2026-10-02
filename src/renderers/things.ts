import { clamp } from "../engine/anim";
import { BALL_R, type Thing } from "../engine/things";
import { FLOOR_Y, toScreen, type View } from "./layout";
import { roundRect, type Ctx, type Pt } from "./parts";
import { OUTLINE } from "./scenery";

const LEATHER = "#F2F4F7";
const PATCH = "#2A2F3A";

/** A football's dark patches in ball radii: one in the middle, five round it that turn with the spin. Squares, in the house style. */
export function ballPatches(spin: number): Array<{ x: number; y: number; size: number }> {
  const ring = [0, 1, 2, 3, 4].map((i) => {
    const a = (i * 2 * Math.PI) / 5 + spin;
    return { x: Math.cos(a) * 0.78, y: Math.sin(a) * 0.78, size: 0.3 };
  });
  return [{ x: 0, y: 0, size: 0.42 }, ...ring];
}

/** A ball on the floor or in the air, with its shadow under it shrinking as it lifts. */
export function drawBall(x: Ctx, v: View, t: Thing, shaded: boolean): void {
  const show = clamp(t.show * 1.5, 0, 1);
  if (show <= 0.01) return;
  const floor = toScreen(v, t.x, FLOOR_Y, t.z);
  const r = BALL_R * v.R * floor.s;
  const lift = clamp(1 + t.y / 1.5, 0.3, 1);
  x.save();
  x.globalAlpha = show;
  x.fillStyle = `rgba(0,0,0,${0.3 * lift})`;
  x.beginPath();
  x.ellipse(floor.X, floor.Y, r * lift, r * 0.3 * lift, 0, 0, Math.PI * 2);
  x.fill();
  const c = toScreen(v, t.x, FLOOR_Y + t.y - BALL_R, t.z);
  x.beginPath();
  x.arc(c.X, c.Y, r, 0, Math.PI * 2);
  x.fillStyle = LEATHER;
  x.fill();
  x.save();
  x.clip();
  x.fillStyle = PATCH;
  for (const p of ballPatches(t.spin)) {
    const s = p.size * r;
    roundRect(x, c.X + p.x * r - s / 2, c.Y + p.y * r - s / 2, s, s, s * 0.25);
    x.fill();
  }
  if (shaded) {
    // Lit from the upper left, as everything else.
    x.fillStyle = "rgba(0,0,0,0.18)";
    x.beginPath();
    x.arc(c.X + r * 0.35, c.Y + r * 0.35, r, 0, Math.PI * 2);
    x.fill();
  }
  x.restore();
  x.lineWidth = v.R * 0.025;
  x.strokeStyle = OUTLINE;
  x.beginPath();
  x.arc(c.X, c.Y, r, 0, Math.PI * 2);
  x.stroke();
  x.restore();
}

/** Where the rope's handles are, in body space: in the hands at its sides. */
export const ROPE_HANDS = { x: 1.15, y: 0.42 };
// From the line through the hands the rope swings this far: high over the head, just under the feet.
const ROPE_UP = 2.2;
const ROPE_DOWN = 0.62;
const ROPE_OUT = 1;
const ROPE_PTS = 16;

/**
 * The rope in body space (R; y down, z toward the viewer), from the left hand to the right, swung round the line through
 * them: 0 is overhead, 0.25 in front, 0.5 under the feet, 0.75 behind. `behind` says to draw it before the body.
 */
export function rope(phase: number): { pts: Array<readonly [number, number, number]>; behind: boolean } {
  const a = phase * 2 * Math.PI;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const dy = -(c > 0 ? ROPE_UP : ROPE_DOWN) * c;
  const dz = s * ROPE_OUT;
  const pts = Array.from({ length: ROPE_PTS + 1 }, (_, i) => {
    const u = i / ROPE_PTS;
    const b = Math.sin(Math.PI * u);
    return [-ROPE_HANDS.x + 2 * ROPE_HANDS.x * u, ROPE_HANDS.y + b * dy, b * dz] as const;
  });
  return { pts, behind: s < 0 };
}

/** The rope is only there while it's in the hands and the yard is up: it sinks with the scene and goes with the hands. */
export function ropeAlpha(t: Thing, hands: number): number {
  return Math.min(clamp(t.show * 1.5, 0, 1), clamp(hands, 0, 1));
}

export function drawRope(x: Ctx, pts: readonly Pt[], R: number, ink: string, alpha: number): void {
  if (alpha <= 0.01) return;
  x.save();
  x.globalAlpha *= alpha;
  x.lineCap = "round";
  x.lineJoin = "round";
  x.lineWidth = R * 0.06;
  x.strokeStyle = ink;
  x.beginPath();
  pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.stroke();
  x.restore();
}
