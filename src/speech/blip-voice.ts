import type { SoundName } from "../sound/names";
import type { Recipe, Tone, Noise } from "../sound/recipes";
import type { Syllable, VowelChar } from "./timeline";

/** A character's speaking voice. */
export interface VoiceDef {
  base: number;
  wave: OscillatorType;
}

export interface Voice {
  /** rate > 1 when speech is sped up to fit. */
  syllable(s: Syllable, rate: number): void;
  interrupted(): void;
}

export const VOWEL_PITCH: Record<VowelChar, number> = { a: 0.9, e: 1.1, i: 1.25, o: 0.95, u: 0.85 };
const MURMUR_PITCH = 0.7;
const JITTER = 0.08;
const MAX_RISE = 0.25;

/** One Animalese-style blip; jitter is 0–1 and spreads the pitch ±4% so repeats don't sound robotic. */
export function blipRecipe(s: Syllable, rate: number, def: VoiceDef, jitter: number): Recipe {
  const pitch = s.murmur ? MURMUR_PITCH : VOWEL_PITCH[s.vowelChar];
  const f = def.base * pitch * (1 + (jitter - 0.5) * JITTER) * (1 + MAX_RISE * s.rise);
  // Square waves are much louder than sines at the same gain.
  const g = def.wave === "square" ? 0.025 : 0.05;
  const parts: Array<Tone | Noise> = [{ kind: "tone", f, d: ((s.ms / rate) * 0.7) / 1000, g, type: def.wave, a: 0.004 }];
  if (s.onset === "C" || s.onset === "FV") parts.push({ kind: "noise", f: 3500, d: 0.03, g: 0.012, q: 1.2 });
  return parts;
}

export class BlipVoice implements Voice {
  /** Off silences the speech blips only; other sounds and the mouth carry on. */
  enabled = true;

  constructor(
    private readonly out: { playRecipe(r: Recipe): void; play(n: SoundName): void },
    public def: VoiceDef,
    private readonly random: () => number = Math.random,
  ) {}

  syllable(s: Syllable, rate: number): void {
    if (!this.enabled) return;
    this.out.playRecipe(blipRecipe(s, rate, this.def, this.random()));
  }

  interrupted(): void {
    this.out.play("interrupt");
  }
}
