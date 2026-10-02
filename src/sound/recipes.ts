import type { SoundName } from "./names";

export interface Tone {
  kind: "tone";
  f: number;
  to?: number;
  d: number;
  g: number;
  type?: OscillatorType;
  a?: number;
  delay?: number;
  vib?: number;
  vibf?: number;
  /** Adds a quiet partial at f×h for a bell-like colour. */
  h?: number;
}

export interface Noise {
  kind: "noise";
  f: number;
  to?: number;
  d: number;
  g: number;
  q?: number;
  delay?: number;
}

export type Recipe = readonly (Tone | Noise)[];

const tone = (f: number, d: number, g: number, o: Partial<Tone> = {}): Tone => ({ kind: "tone", f, d, g, ...o });
const noise = (f: number, d: number, g: number, o: Partial<Noise> = {}): Noise => ({ kind: "noise", f, d, g, ...o });
const arp = (fs: number[], d: number, g: number, step: number, h?: number): Tone[] =>
  fs.map((f, i) => tone(f, d, g, { delay: i * step, h }));

export const RECIPES: Record<SoundName, Recipe> = {
  send: [noise(600, 0.32, 0.035, { to: 3800 }), tone(520, 0.22, 0.03, { to: 1100 })],
  think: [tone(587.3, 0.18, 0.03), tone(698.5, 0.22, 0.028, { delay: 0.1 })],
  work: [tone(784, 0.12, 0.025), tone(1046.5, 0.16, 0.02, { delay: 0.06 })],
  search: arp([659.3, 880, 1174.7], 0.12, 0.022, 0.08),
  finish: [
    tone(1046.5, 0.5, 0.07, { h: 3 }),
    tone(1318.5, 0.7, 0.065, { delay: 0.09, h: 3 }),
    tone(1568, 0.9, 0.04, { delay: 0.18, h: 3 }),
  ],
  error: [tone(349.2, 0.3, 0.08, { type: "triangle" }), tone(277.2, 0.5, 0.08, { type: "triangle", delay: 0.14 })],
  hover: [tone(1900, 0.045, 0.012)],
  poke: [tone(260, 0.16, 0.12, { to: 120, type: "triangle" }), noise(1000, 0.05, 0.05, { q: 0.7 })],
  annoyed: [tone(220, 0.2, 0.06, { to: 170, type: "triangle", delay: 0.05 })],
  dizzy: [
    tone(700, 0.9, 0.05, { to: 400, vib: 40, vibf: 8 }),
    tone(1050, 0.9, 0.02, { to: 600, vib: 60, vibf: 6, delay: 0.05 }),
  ],
  love: [tone(1174.7, 0.3, 0.04, { vib: 12, vibf: 7 }), tone(1480, 0.45, 0.04, { vib: 12, vibf: 7, delay: 0.13 })],
  yawn: [tone(466.2, 0.75, 0.04, { to: 261.6, vib: 8, vibf: 4 })],
  greet: arp([587.3, 740, 880], 0.3, 0.05, 0.09, 4),
  interrupt: [tone(900, 0.12, 0.05, { to: 300, type: "triangle" })],
};
