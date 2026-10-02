import type { Viseme } from "./timeline";

export interface Mouth {
  viseme: Viseme;
  open: number;
}

/** Where Uriel's speech comes from. BlipSpeech speaks text with blips; a TTS pipeline can implement the same contract. */
export interface SpeechBackend {
  /** More reply text arrived. */
  push(text: string): void;
  /** The reply is complete. */
  end(): void;
  /** Interrupted: silence now. */
  stop(): void;
  /** Advances to now (call once per frame) and returns the mouth to show; null when silent or waiting for more text. */
  update(nowMs: number): Mouth | null;
  readonly speaking: boolean;
  /** Resolves true when speech finishes naturally (at once if there was nothing to say), false when stopped. */
  drained(): Promise<boolean>;
}
