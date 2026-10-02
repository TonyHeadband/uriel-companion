import type { Recipe, Tone } from "../sound/recipes";
import { BlipVoice, blipRecipe, VOWEL_PITCH, type VoiceDef } from "./blip-voice";
import type { Syllable } from "./timeline";

const DEF: VoiceDef = { base: 500, wave: "square" };
const syl = (o: Partial<Syllable> = {}): Syllable => ({
  onset: "C", vowel: "A", vowelChar: "a", ms: 140, pauseMs: 0, rise: 0, sentenceEnd: false, murmur: false, ...o,
});
const tone = (r: Recipe) => r.find((p) => p.kind === "tone") as Tone;

test("the vowel picks the pitch, on the character's own voice", () => {
  const a = tone(blipRecipe(syl({ vowelChar: "a" }), 1, DEF, 0.5));
  const i = tone(blipRecipe(syl({ vowelChar: "i" }), 1, DEF, 0.5));
  expect(a.f).toBeCloseTo(500 * VOWEL_PITCH.a, 5);
  expect(i.f / a.f).toBeCloseTo(1.25 / 0.9, 5);
  expect(a.type).toBe("square");
});

test("jitter stays within ±4%", () => {
  expect(tone(blipRecipe(syl(), 1, DEF, 0)).f).toBeCloseTo(500 * 0.9 * 0.96, 5);
  expect(tone(blipRecipe(syl(), 1, DEF, 1)).f).toBeCloseTo(500 * 0.9 * 1.04, 5);
});

test("a rising syllable is up to 25% higher", () => {
  const flat = tone(blipRecipe(syl(), 1, DEF, 0.5)).f;
  expect(tone(blipRecipe(syl({ rise: 1 }), 1, DEF, 0.5)).f).toBeCloseTo(flat * 1.25, 5);
});

test("a murmur is lower than any vowel", () => {
  const low = Math.min(...Object.values(VOWEL_PITCH));
  expect(tone(blipRecipe(syl({ murmur: true }), 1, DEF, 0.5)).f).toBeLessThan(500 * low);
});

test("a blip lasts 70% of the syllable, shorter when sped up", () => {
  expect(tone(blipRecipe(syl({ ms: 200 }), 1, DEF, 0.5)).d).toBeCloseTo(0.14, 5);
  expect(tone(blipRecipe(syl({ ms: 200 }), 2, DEF, 0.5)).d).toBeCloseTo(0.07, 5);
});

test("plain consonants add a tiny noise tick; pressed lips don't", () => {
  expect(blipRecipe(syl({ onset: "C" }), 1, DEF, 0.5).some((p) => p.kind === "noise")).toBe(true);
  expect(blipRecipe(syl({ onset: "MBP" }), 1, DEF, 0.5).some((p) => p.kind === "noise")).toBe(false);
});

test("BlipVoice plays syllables as recipes and the interrupt as a sound", () => {
  const recipes: Recipe[] = [];
  const sounds: string[] = [];
  const v = new BlipVoice({ playRecipe: (r) => recipes.push(r), play: (n) => sounds.push(n) }, DEF, () => 0.5);
  v.syllable(syl(), 1);
  v.interrupted();
  expect(recipes).toHaveLength(1);
  expect(sounds).toEqual(["interrupt"]);
});

test("with the voice off, syllables are silent but the cut-off chirp still plays", () => {
  const recipes: Recipe[] = [];
  const sounds: string[] = [];
  const v = new BlipVoice({ playRecipe: (r) => recipes.push(r), play: (n) => sounds.push(n) }, DEF, () => 0.5);
  v.enabled = false;
  v.syllable(syl(), 1);
  v.interrupted();
  expect(recipes).toHaveLength(0);
  expect(sounds).toEqual(["interrupt"]);
});
