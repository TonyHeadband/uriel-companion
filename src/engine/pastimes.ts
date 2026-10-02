import { ACTIONS } from "./actions";
import type { ClaimToken, Layer } from "./arbiter";
import type { CharacterEngine } from "./character-engine";
import type { ActionName } from "./states";

export const PASTIMES = (Object.keys(ACTIONS) as ActionName[]).filter((a) => ACTIONS[a].pastime);
export const PASTIME_WAIT: readonly [number, number] = [60_000, 180_000];
export const PASTIME_LENGTH: readonly [number, number] = [15_000, 30_000];
// Everything that outranks a pastime; any of them ends it for good.
const ABOVE: readonly Layer[] = ["link", "interaction", "task", "rest"];

export interface PastimesDeps {
  engine: Pick<CharacterEngine, "claim" | "release" | "isClaimed">;
  now: () => number;
  random?: () => number;
  liveliness: number;
  /** True while it's dozing off (the yawn before sleep): no pastime starts then, only to be cut short. */
  dozing?: () => boolean;
}

/**
 * Now and then, while nothing else is going on, the character does something on its own: a pastime on the life layer.
 * Anything above it ends it for good rather than pausing it (the arbiter drops the claim), and the wait for the next
 * starts over. Call tick() every frame, before the engine's update.
 */
export class Pastimes {
  private enabled = true;
  private live: number;
  private token: ClaimToken | null = null;
  private last: ActionName | null = null;
  // When the next pastime is due; null until plain idle has begun.
  private nextAt: number | null = null;
  private readonly random: () => number;

  constructor(private readonly d: PastimesDeps) {
    this.random = d.random ?? Math.random;
    this.live = d.liveliness;
  }

  get current(): ActionName | null {
    return this.token?.action ?? null;
  }

  setLiveliness(l: number): void {
    this.live = l;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.stop();
    this.nextAt = null;
  }

  /** Ends the current pastime, if any; the wait for the next starts over. */
  stop(): void {
    if (this.token) this.d.engine.release("life", this.token);
    this.token = null;
    this.nextAt = null;
  }

  /** Starts a pastime now (the one named, or any but the last), replacing one already going. */
  startNow(name?: ActionName): void {
    if (!this.enabled) return;
    const avoid = this.current ?? this.last;
    this.stop();
    const pick = name ?? this.pick(avoid);
    this.last = pick;
    this.token = this.d.engine.claim("life", pick, { ms: this.between(PASTIME_LENGTH), endsWhenCovered: true });
  }

  tick(): void {
    const e = this.d.engine;
    const busy = ABOVE.some((l) => e.isClaimed(l));
    if (this.token) {
      if (busy) this.stop();
      // Its time ran out, or something covered it: the arbiter let the claim go.
      else if (!e.isClaimed("life")) {
        this.token = null;
        this.nextAt = null;
      }
      return;
    }
    if (!this.enabled || busy || this.d.dozing?.()) {
      this.nextAt = null;
      return;
    }
    const n = this.d.now();
    if (this.nextAt === null) this.nextAt = n + this.between(PASTIME_WAIT) / (0.5 + this.live);
    else if (n >= this.nextAt) this.startNow();
  }

  private pick(avoid: ActionName | null): ActionName {
    const pool = PASTIMES.filter((a) => a !== avoid);
    return pool[Math.floor(this.random() * pool.length) % pool.length];
  }

  private between([min, max]: readonly [number, number]): number {
    return min + this.random() * (max - min);
  }
}
