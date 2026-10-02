import type { Mouth, SpeechBackend } from "./backend";
import type { Voice } from "./blip-voice";
import { Timeline, type Syllable } from "./timeline";

export const LONG_MODES = ["all", "fit", "first"] as const;
export type LongMode = (typeof LONG_MODES)[number];
/** In fit mode, speech ends at most this long after the reply is complete. */
export const FIT_TAIL_MS = 8000;
/** In first mode, only this many sentences are spoken. */
export const FIRST_SENTENCES = 2;
/** Fastest fit-mode speed-up; past it, syllables are dropped evenly instead. */
export const MAX_RATE = 3;
// Share of a syllable that shows the consonant's shape before the vowel opens.
const ONSET_SHARE = 0.35;
// A frame this late still continues the rhythm; later than that (a hidden window) speech resumes from now.
const CATCH_UP_MS = 50;

interface Playing {
  s: Syllable;
  start: number;
  end: number;
  next: number;
}

/** Speaks reply text as blips at speaking pace, behind the text, one syllable per frame at most. */
export class BlipSpeech implements SpeechBackend {
  mode: LongMode = "all";
  private timeline = new Timeline();
  private queue: Syllable[] = [];
  private playing: Playing | null = null;
  private active = false;
  private ended = false;
  private capped = false;
  private sentences = 0;
  private rate = 1;
  private lastNext = -Infinity;
  private waiters: Array<(natural: boolean) => void> = [];

  constructor(private readonly voice: Voice) {}

  get speaking(): boolean {
    return this.active;
  }

  push(text: string): void {
    this.active = true;
    this.enqueue(this.timeline.push(text));
  }

  end(): void {
    if (!this.active) return;
    this.ended = true;
    this.enqueue(this.timeline.end());
    if (this.mode === "fit") this.fit();
    if (!this.playing && !this.queue.length) this.finish(true);
  }

  stop(): void {
    if (this.active) this.finish(false);
  }

  update(nowMs: number): Mouth | null {
    if (!this.active) return null;
    if (this.playing && nowMs >= this.playing.next) {
      this.lastNext = this.playing.next;
      this.playing = null;
    }
    if (!this.playing) {
      const s = this.queue.shift();
      if (s) {
        const start = nowMs - this.lastNext < CATCH_UP_MS ? this.lastNext : nowMs;
        const end = start + s.ms / this.rate;
        this.playing = { s, start, end, next: end + s.pauseMs / this.rate };
        this.voice.syllable(s, this.rate);
      } else if (this.ended) {
        this.finish(true);
        return null;
      }
    }
    const p = this.playing;
    // Waiting for more text (a slow stream or a tool call): no mouth, so it fades out until the next words.
    if (!p) return null;
    if (nowMs >= p.end) return { viseme: "rest", open: 0 };
    const k = (nowMs - p.start) / (p.end - p.start);
    if (k < ONSET_SHARE && p.s.onset !== "rest") return { viseme: p.s.onset, open: p.s.onset === "MBP" ? 0.05 : 0.45 };
    return { viseme: p.s.vowel, open: 1 };
  }

  drained(): Promise<boolean> {
    if (!this.active) return Promise.resolve(true);
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  /** Speeds up (and past MAX_RATE, thins out) what's left so it ends within FIT_TAIL_MS. */
  private fit(): void {
    const left = this.queue.reduce((ms, s) => ms + s.ms + s.pauseMs, 0);
    if (left <= FIT_TAIL_MS) return;
    const need = left / FIT_TAIL_MS;
    this.rate = Math.min(need, MAX_RATE);
    if (need > MAX_RATE) {
      const keep = MAX_RATE / need;
      this.queue = this.queue.filter((_, i) => Math.floor((i + 1) * keep) > Math.floor(i * keep));
    }
  }

  private enqueue(syllables: Syllable[]): void {
    for (const s of syllables) {
      if (this.capped) return;
      this.queue.push(s);
      if (s.sentenceEnd && this.mode === "first" && ++this.sentences >= FIRST_SENTENCES) this.capped = true;
    }
  }

  private finish(natural: boolean): void {
    this.active = this.ended = this.capped = false;
    this.queue = [];
    this.playing = null;
    this.timeline = new Timeline();
    this.sentences = 0;
    this.rate = 1;
    this.lastNext = -Infinity;
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w(natural);
  }
}
