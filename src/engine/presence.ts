import type { CharacterEngine } from "./character-engine";
import type { ExpressionHandle } from "./expression-stack";

export const YAWN_MS = 1200;
export const YAWN_TO_SLEEP_MS = 1000;

export interface PresenceDeps {
  engine: Pick<CharacterEngine, "claim" | "release" | "isClaimed" | "express" | "cancelExpression">;
  now: () => number;
  sleepAfterMs: number;
}

/** Whether the person is around: after a quiet while the character yawns and sleeps on the rest layer; any activity wakes it, and never while the agent is away. */
export class Presence {
  private last: number;
  private sleepAfter: number;
  private dozing: { yawn: ExpressionHandle | null; sleepAt: number; asleep: boolean } | null = null;

  constructor(private readonly d: PresenceDeps) {
    this.last = d.now();
    this.sleepAfter = d.sleepAfterMs;
  }

  /** Yawning or asleep. */
  get isDozing(): boolean {
    return this.dozing !== null;
  }

  setSleepAfter(ms: number): void {
    this.sleepAfter = ms;
  }

  /** The pointer moved, a key went down or a message was sent. */
  activity(): void {
    this.last = this.d.now();
    if (!this.dozing) return;
    if (this.dozing.yawn) this.d.engine.cancelExpression(this.dozing.yawn);
    this.dozing = null;
    this.d.engine.release("rest");
  }

  tick(): void {
    const n = this.d.now();
    const e = this.d.engine;
    if (this.dozing) {
      if (!this.dozing.asleep && n >= this.dozing.sleepAt) {
        this.dozing.asleep = true;
        e.claim("rest", "sleeping");
      }
      return;
    }
    if (e.isClaimed("link") || e.isClaimed("task") || e.isClaimed("interaction") || n - this.last < this.sleepAfter) return;
    this.doze();
  }

  /** Yawns and falls asleep now, as if the quiet while had passed; activity wakes it as usual. */
  doze(): void {
    if (this.dozing) return;
    const yawn = this.d.engine.express("yawn", YAWN_MS);
    this.dozing = { yawn, sleepAt: this.d.now() + YAWN_TO_SLEEP_MS, asleep: false };
  }
}
