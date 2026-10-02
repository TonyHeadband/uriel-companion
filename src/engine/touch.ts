import type { CharacterEngine } from "./character-engine";
import type { SoundName } from "../sound/names";

export const REST_MS = 1900;
export const TRIPLE_MS = 1700;
export const DIZZY_MS = 3300;

export interface TouchDeps {
  engine: Pick<CharacterEngine, "claim" | "express" | "squash" | "jolt" | "blink" | "setHover">;
  now: () => number;
  sound: (s: SoundName) => void;
  onDizzy: (on: boolean) => void;
}

/** How the character reacts to the pointer. Call tick() every frame. */
export class Touch {
  private hoverSince: number | null = null;
  private loved = false;
  private clicks: number[] = [];
  private dizzyUntil = 0;

  constructor(private readonly d: TouchDeps) {}

  hoverStart(): void {
    this.hoverSince = this.d.now();
    this.loved = false;
    this.d.engine.setHover(true);
    this.d.engine.blink();
    this.d.sound("hover");
  }

  hoverEnd(): void {
    this.hoverSince = null;
    this.d.engine.setHover(false);
  }

  pointerMove(): void {
    if (this.hoverSince !== null) this.hoverSince = this.d.now();
  }

  click(): void {
    const n = this.d.now();
    if (this.dizzyUntil) return;
    this.clicks = this.clicks.filter((t) => n - t < TRIPLE_MS);
    this.clicks.push(n);
    if (this.clicks.length >= 3) {
      this.clicks = [];
      this.d.engine.claim("interaction", "dizzy", { ms: DIZZY_MS });
      this.dizzyUntil = n + DIZZY_MS;
      this.d.onDizzy(true);
      return;
    }
    this.d.engine.squash();
    this.d.engine.jolt();
    this.d.engine.express("annoyed", 800);
    this.d.sound("poke");
  }

  tick(): void {
    const n = this.d.now();
    const e = this.d.engine;
    if (this.dizzyUntil && n >= this.dizzyUntil) {
      this.dizzyUntil = 0;
      this.d.onDizzy(false);
    }
    if (this.hoverSince !== null && !this.loved && n - this.hoverSince >= REST_MS) {
      this.loved = true;
      e.express("love", 1800);
    }
  }
}
