import type { Pose } from "./pose";

/** How a character's body wobbles. Units: firmness in Hz, the rest 0–1. */
export interface BodyTuning {
  /** Wobble frequency: higher is firmer. */
  firmness: number;
  /** Damping ratio: higher settles faster with less overshoot. */
  settle: number;
  /** How much a gaze turn pushes the top of the body sideways. */
  sway: number;
  /** How strong the outward pulse is on each spoken syllable. */
  bump: number;
}

/** Where the body is this frame, in units of R (same as the pose). */
export interface BodyMotion {
  x: number;
  y: number;
  yaw: number;
  sx: number;
  sy: number;
  tilt: number;
  turn: number;
}

export interface BodyShape {
  /** The deformed outline, in units of R. */
  outline: ReadonlyArray<readonly [number, number]>;
  /** How far the face should follow the body, in units of R. */
  face: readonly [number, number];
}

export const MAX_OFFSET = 0.3;
// Pull towards the neighbours' average, as a share of the spring: keeps the edge smooth, never spiky.
const SMOOTH = 0.5;
const SUBSTEP = 1 / 120;
// A longer gap means the window was hidden: start from rest rather than integrate a huge step.
const GAP_MS = 200;
const SWAY_GAIN = 0.6;
// Peaks around 0.04 R on the default jelly: a visible pulse per syllable, not a jolt.
const BUMP_SPEED = 6;

export function resolveTuning(defaults: BodyTuning, override: Partial<BodyTuning> = {}): BodyTuning {
  return { ...defaults, ...override };
}

/** A ring of springs around the character's outline: it lags behind motion, overshoots and settles. */
export class SoftBody {
  private d: Array<[number, number]> = [];
  private v: Array<[number, number]> = [];
  private last: BodyMotion | null = null;
  private lastMs = -Infinity;
  private pendingBump = 0;

  bump(): void {
    this.pendingBump += 1;
  }

  /** The frame-loop step: deforms the renderer's rest outline by the pose's motion and stores it on the pose. */
  applyToPose(pose: Pose, rest: ReadonlyArray<readonly [number, number]>, tuning: BodyTuning, nowMs: number): void {
    const motion = { x: pose.ox, y: pose.oy, yaw: pose.yaw, sx: pose.sx, sy: pose.sy, tilt: pose.tilt, turn: pose.turn };
    pose.body = this.apply(rest, motion, tuning, nowMs);
  }

  reset(): void {
    this.d = [];
    this.v = [];
    this.last = null;
    this.lastMs = -Infinity;
    this.pendingBump = 0;
  }

  apply(rest: ReadonlyArray<readonly [number, number]>, m: BodyMotion, t: BodyTuning, nowMs: number): BodyShape {
    const n = rest.length;
    const gap = nowMs - this.lastMs;
    if (this.d.length !== n || !this.last || gap > GAP_MS || gap < 0) {
      this.d = rest.map(() => [0, 0]);
      this.v = rest.map(() => [0, 0]);
      this.pendingBump = 0;
      this.last = m;
      this.lastMs = nowMs;
      return this.shape(rest);
    }
    const p = this.last;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const dsx = m.sx - p.sx;
    const dsy = m.sy - p.sy;
    const dTilt = m.tilt - p.tilt;
    // A spin settles by snapping turn from 2π to 0, which is the same angle: wrap so it isn't a kick.
    const dTurn = Math.atan2(Math.sin(m.turn - p.turn), Math.cos(m.turn - p.turn));
    const dYaw = m.yaw - p.yaw + dTurn;
    const ys = rest.map(([, y]) => y);
    const bottom = Math.max(...ys);
    const span = bottom - Math.min(...ys) || 1;
    const [cx, cy] = centroid(rest);
    for (let i = 0; i < n; i++) {
      const [rx, ry] = rest[i];
      const d = this.d[i];
      // The body moved, scaled or tilted under the points; they keep their place for a moment, so they lag.
      d[0] -= dx + rx * dsx - ry * dTilt;
      d[1] -= dy + ry * dsy + rx * dTilt;
      d[0] -= dYaw * t.sway * SWAY_GAIN * ((bottom - ry) / span);
      if (this.pendingBump) {
        const nx = rx - cx;
        const ny = ry - cy;
        const len = Math.hypot(nx, ny) || 1;
        this.v[i][0] += (nx / len) * t.bump * BUMP_SPEED * this.pendingBump;
        this.v[i][1] += (ny / len) * t.bump * BUMP_SPEED * this.pendingBump;
      }
    }
    this.pendingBump = 0;
    const steps = Math.ceil(gap / 1000 / SUBSTEP);
    const h = steps ? gap / 1000 / steps : 0;
    const w = 2 * Math.PI * t.firmness;
    for (let s = 0; s < steps; s++) this.step(w, t.settle, h);
    this.last = m;
    this.lastMs = nowMs;
    return this.shape(rest);
  }

  private step(w: number, zeta: number, h: number): void {
    const n = this.d.length;
    const avg = this.d.map((_, i) => {
      const a = this.d[(i + n - 1) % n];
      const b = this.d[(i + 1) % n];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] as const;
    });
    for (let i = 0; i < n; i++) {
      const d = this.d[i];
      const v = this.v[i];
      for (const k of [0, 1] as const) {
        const a = -w * w * d[k] - 2 * zeta * w * v[k] + w * w * SMOOTH * (avg[i][k] - d[k]);
        v[k] += a * h;
        d[k] += v[k] * h;
      }
      const len = Math.hypot(d[0], d[1]);
      if (len > MAX_OFFSET) {
        d[0] *= MAX_OFFSET / len;
        d[1] *= MAX_OFFSET / len;
      }
    }
  }

  private shape(rest: ReadonlyArray<readonly [number, number]>): BodyShape {
    const cy = centroid(rest)[1];
    let fx = 0;
    let fy = 0;
    let count = 0;
    const outline = rest.map(([rx, ry], i) => {
      const [ox, oy] = this.d[i];
      if (ry < cy) {
        fx += ox;
        fy += oy;
        count++;
      }
      return [rx + ox, ry + oy] as const;
    });
    return { outline, face: count ? [fx / count, fy / count] : [0, 0] };
  }
}

function centroid(pts: ReadonlyArray<readonly [number, number]>): readonly [number, number] {
  let x = 0;
  let y = 0;
  for (const [px, py] of pts) {
    x += px;
    y += py;
  }
  return [x / pts.length, y / pts.length];
}
