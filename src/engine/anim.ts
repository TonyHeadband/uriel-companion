export type EaseFn = (t: number) => number;

// Same curves as coucou's prototype `E` (Louis-CFM/coucou, MIT).
export const Ease = {
  out: (t: number) => 1 - (1 - t) ** 3,
  inOut: (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t: number) => {
    const c1 = 1.7;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  lin: (t: number) => t,
} satisfies Record<string, EaseFn>;

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** CSS-style cubic-bezier; x is solved by bisection, plenty precise at 60 fps. */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): EaseFn {
  const bez = (t: number, p1: number, p2: number) => 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3;
  return (x) => {
    let lo = 0;
    let hi = 1;
    let t = x;
    for (let i = 0; i < 20; i++) {
      if (bez(t, x1, x2) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return bez(t, y1, y2);
  };
}

/** Frame-rate independent chase: `k` is the fraction of the gap left after one second. Never overshoots. */
export function smooth(current: number, target: number, k: number, dtSeconds: number): number {
  return current + (target - current) * (1 - k ** dtSeconds);
}

/** Damped spring (SwiftUI's response/dampingFraction), sub-stepped so a dropped frame can't destabilise it. */
export class Spring {
  value: number;
  target: number;
  velocity = 0;
  private readonly omega: number;
  private readonly zeta: number;

  constructor(value: number, response = 0.5, damping = 0.72) {
    this.value = value;
    this.target = value;
    this.omega = (2 * Math.PI) / response;
    this.zeta = damping;
  }

  get settled(): boolean {
    return Math.abs(this.target - this.value) < 0.01 && Math.abs(this.velocity) < 0.05;
  }

  step(dt: number): void {
    const steps = Math.max(1, Math.ceil(dt * 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const acc = this.omega ** 2 * (this.target - this.value) - 2 * this.zeta * this.omega * this.velocity;
      this.velocity += acc * h;
      this.value += this.velocity * h;
    }
  }
}
