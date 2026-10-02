import type { RGB } from "../engine/color";
import { bodyFrame, type Placement } from "../renderers/layout";
import { h } from "./dom";

/** A metaball, in units of the banner height (x runs 0..aspect, y 0..1). */
export interface Blob {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

const BLOBS = 4;
const PUSH_RADIUS = 0.6;
const PUSH = 0.6;
const MAX_SPEED = 0.4;
const DRIFT = { min: 0.02, max: 0.05 };
const SCALE = 4;
const SHADE = 0.25;
export type BlobShape = "round" | "square";
// Distance exponent: 2 gives round blobs, 4 a squircle, i.e. rounded squares that still merge like liquid.
const EXPONENT: Record<BlobShape, number> = { round: 2, square: 4 };

export function seedBlobs(random: () => number, aspect: number): Blob[] {
  return Array.from({ length: BLOBS }, () => {
    const a = random() * Math.PI * 2;
    const speed = DRIFT.min + random() * (DRIFT.max - DRIFT.min);
    return { x: random() * aspect, y: random(), vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 0.18 + random() * 0.1 };
  });
}

/** Moves the blobs, bounces them off the banner's edges, and lets the character push the ones near it. */
export function stepBlobs(blobs: Blob[], dt: number, aspect: number, push?: { x: number; y: number; vx: number; vy: number }): void {
  for (const b of blobs) {
    const dx = push ? b.x - push.x : 0;
    const dy = push ? b.y - push.y : 0;
    const d = Math.hypot(dx, dy);
    if (push && d < PUSH_RADIUS) {
      // Away from the character, as fast as it moves: it parts the blobs it passes through instead of dragging them
      // along behind it.
      const speed = Math.hypot(push.vx, push.vy);
      const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : speed > 0 ? [push.vx / speed, push.vy / speed] : [0, 0];
      b.vx += ux * speed * PUSH * dt;
      b.vy += uy * speed * PUSH * dt;
    }
    // Pushes fade back to a calm drift.
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > DRIFT.max) {
      const k = Math.max(DRIFT.max, Math.min(MAX_SPEED, speed * (1 - 0.8 * dt))) / speed;
      b.vx *= k;
      b.vy *= k;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 0 || b.x > aspect) b.vx = -b.vx;
    if (b.y < 0 || b.y > 1) b.vy = -b.vy;
    b.x = Math.max(0, Math.min(aspect, b.x));
    b.y = Math.max(0, Math.min(1, b.y));
  }
}

export function fieldAlpha(blobs: readonly Blob[], x: number, y: number, shape: BlobShape = "round"): number {
  const n = EXPONENT[shape];
  let f = 0;
  for (const b of blobs) {
    const d = (Math.abs(x - b.x) ** n + Math.abs(y - b.y) ** n) ** (1 / n);
    f += (b.r * b.r) / Math.max(1e-6, d * d);
  }
  const k = Math.max(0, Math.min(1, (f - 0.8) / 0.4));
  return k * k * (3 - 2 * k);
}

/** A coarse damped wave grid: drops spread out as rings and fade. */
export class Ripples {
  private cur: Float32Array;
  private prev: Float32Array;

  constructor(
    private readonly w = 64,
    private readonly h = 28,
  ) {
    this.cur = new Float32Array(w * h);
    this.prev = new Float32Array(w * h);
  }

  drop(x01: number, y01: number, amp: number): void {
    const i = Math.round(Math.max(0, Math.min(1, x01)) * (this.w - 1));
    const j = Math.round(Math.max(0, Math.min(1, y01)) * (this.h - 1));
    this.cur[j * this.w + i] += amp;
  }

  step(): void {
    const { w, h, cur, prev } = this;
    const next = prev;
    for (let j = 1; j < h - 1; j++) {
      for (let i = 1; i < w - 1; i++) {
        const k = j * w + i;
        // Standard 2D wave update (c² = 0.5, stable), damped so rings fade.
        const lap = cur[k - 1] + cur[k + 1] + cur[k - w] + cur[k + w] - 4 * cur[k];
        next[k] = (2 * cur[k] - prev[k] + 0.5 * lap) * 0.985;
      }
    }
    this.prev = cur;
    this.cur = next;
  }

  /** The surface slope at a point: positive faces the light. */
  slope(x01: number, y01: number): number {
    const i = Math.max(1, Math.min(this.w - 2, Math.round(x01 * (this.w - 1))));
    const j = Math.max(1, Math.min(this.h - 2, Math.round(y01 * (this.h - 1))));
    const k = j * this.w + i;
    return (this.cur[k - 1] - this.cur[k + 1] + this.cur[k - this.w] - this.cur[k + this.w]) * 0.5;
  }

  peak(): number {
    let m = 0;
    for (const v of this.cur) m = Math.max(m, Math.abs(v));
    return m;
  }
}

export function fieldSize(cssW: number, cssH: number): { w: number; h: number } {
  return { w: Math.max(1, Math.round(cssW / SCALE)), h: Math.max(1, Math.round(cssH / SCALE)) };
}

/** Lava-lamp blobs with ripples, behind the whole banner, in the mood colour. */
export class Backdrop {
  readonly canvas = h("canvas", { class: "backdrop" });
  private readonly random: () => number;
  private readonly reduced: boolean;
  private blobs: Blob[] = [];
  private readonly ripples = new Ripples();
  private enabled = true;
  private shape: BlobShape = "round";
  private aspect = 400 / 170;
  private lastMs = -Infinity;
  private spot = { x: (400 / 170) / 2, y: 0.5 };
  private drawnStill = false;

  constructor(opts: { random?: () => number; reducedMotion?: boolean } = {}) {
    this.random = opts.random ?? Math.random;
    this.reduced = opts.reducedMotion ?? false;
    this.blobs = seedBlobs(this.random, this.aspect);
  }

  resize(cssW: number, cssH: number): void {
    const { w, h: hh } = fieldSize(cssW, cssH);
    this.canvas.width = w;
    this.canvas.height = hh;
    if (cssH > 0) this.aspect = cssW / cssH;
    this.drawnStill = false;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.canvas.hidden = !on;
  }

  setShape(shape: BlobShape): void {
    this.shape = shape;
    this.drawnStill = false;
  }

  setOpacity(v: number): void {
    this.canvas.style.opacity = String(Math.max(0, Math.min(1, v)));
  }

  ripple(strength: number): void {
    if (this.reduced || !this.enabled) return;
    this.ripples.drop(this.spot.x / this.aspect, this.spot.y, strength);
  }

  update(nowMs: number, at: Placement, color: RGB): void {
    if (!this.enabled) return;
    if (this.reduced && this.drawnStill) return;
    // In banner heights: the same frame the renderers use, on a canvas 1 high.
    const { cx: x, cy: y } = bodyFrame(this.aspect, 1, at);
    const gap = nowMs - this.lastMs;
    const dt = gap > 0 && gap < 200 ? gap / 1000 : 0;
    const push = dt ? { x, y, vx: (x - this.spot.x) / dt, vy: (y - this.spot.y) / dt } : undefined;
    this.spot = { x, y };
    this.lastMs = nowMs;
    if (!this.reduced) {
      stepBlobs(this.blobs, dt, this.aspect, push);
      this.ripples.step();
    }
    this.paint(color);
    this.drawnStill = this.reduced;
  }

  private paint(color: RGB): void {
    const ctx = this.canvas.getContext("2d");
    const { width: w, height: hh } = this.canvas;
    if (!ctx || w < 1 || hh < 1) return;
    const img = ctx.createImageData(w, hh);
    const d = img.data;
    for (let j = 0; j < hh; j++) {
      for (let i = 0; i < w; i++) {
        const bx = (i + 0.5) / hh;
        const by = (j + 0.5) / hh;
        const a = fieldAlpha(this.blobs, bx, by, this.shape);
        const s = this.ripples.slope((i + 0.5) / w, by);
        const light = 1 + SHADE * Math.max(-1, Math.min(1, s * 4));
        const k = (j * w + i) * 4;
        d[k] = Math.min(255, color[0] * light);
        d[k + 1] = Math.min(255, color[1] * light);
        d[k + 2] = Math.min(255, color[2] * light);
        // A faint sheen where there are no blobs, so a ripple shows on its own.
        d[k + 3] = Math.round(255 * Math.min(1, a * 0.9 + Math.abs(s) * 0.6));
      }
    }
    ctx.putImageData(img, 0, 0);
  }
}
