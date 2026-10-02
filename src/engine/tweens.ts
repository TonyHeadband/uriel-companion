import { clamp, type EaseFn } from "./anim";

export type Key = readonly [target: number, ms: number, ease: EaseFn];

interface Running<P> {
  prop: P;
  keys: readonly Key[];
  index: number;
  from: number;
  startMs: number;
  onDone?: () => void;
}

/** Keyframe tweens on a shared values object. A prop with a running tween is "locked": smoothing must skip it. */
export class Tweens<P extends string> {
  private running: Running<P>[] = [];

  constructor(private readonly values: Record<P, number>) {}

  run(prop: P, keys: readonly Key[], nowMs: number, onDone?: () => void): void {
    this.running = this.running.filter((r) => r.prop !== prop);
    this.running.push({ prop, keys, index: 0, from: this.values[prop], startMs: nowMs, onDone });
  }

  isLocked(prop: P): boolean {
    return this.running.some((r) => r.prop === prop);
  }

  get active(): boolean {
    return this.running.length > 0;
  }

  update(nowMs: number): void {
    for (const r of [...this.running]) {
      for (;;) {
        const [target, ms, ease] = r.keys[r.index];
        const p = ms <= 0 ? 1 : clamp((nowMs - r.startMs) / ms, 0, 1);
        this.values[r.prop] = r.from + (target - r.from) * ease(p);
        if (p < 1) break;
        // Advance by the key's own length, not to "now", so uneven frames don't stretch the gesture.
        r.from = target;
        r.startMs += ms;
        r.index++;
        if (r.index >= r.keys.length) {
          this.running.splice(this.running.indexOf(r), 1);
          r.onDone?.();
          break;
        }
      }
    }
  }
}
