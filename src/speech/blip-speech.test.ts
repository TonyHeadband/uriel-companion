import { BlipSpeech, FIT_TAIL_MS } from "./blip-speech";
import type { Voice } from "./blip-voice";
import { toSyllables, type Syllable } from "./timeline";

function rig() {
  const spoken: Array<{ s: Syllable; rate: number }> = [];
  const voice: Voice = { syllable: (s, rate) => spoken.push({ s, rate }), interrupted() {} };
  const sp = new BlipSpeech(voice);
  let t = 0;
  /** Runs frames every 16 ms until speech stops (or a limit), returning the elapsed time. */
  const runOut = (limitMs = 600_000) => {
    const from = t;
    while (sp.speaking && t - from < limitMs) {
      sp.update(t);
      t += 16;
    }
    return t - from;
  };
  return { sp, spoken, runOut, at: (ms: number) => sp.update((t = ms)) };
}

const LONG = Array.from({ length: 120 }, () => "Here is a fairly long sentence about forms.").join(" ") + " ";
const naturalMs = (text: string) => toSyllables(text).reduce((ms, s) => ms + s.ms + s.pauseMs, 0);

test("speaks every syllable at speaking pace, then drains naturally", async () => {
  const { sp, spoken, runOut } = rig();
  const done = sp.drained();
  sp.push("hello there friend ");
  sp.end();
  const elapsed = runOut();
  expect(spoken).toHaveLength(toSyllables("hello there friend").length);
  expect(Math.abs(elapsed - naturalMs("hello there friend"))).toBeLessThan(16 * spoken.length + 32);
  await expect(done).resolves.toBe(true);
});

test("the mouth shows the consonant, then the vowel, then closes", () => {
  const { sp, at } = rig();
  sp.push("ma ");
  const ms = toSyllables("ma")[0].ms;
  expect(at(0)).toEqual({ viseme: "MBP", open: 0.05 });
  expect(at(ms * 0.6)).toEqual({ viseme: "A", open: 1 });
  expect(at(ms + 1)).toBeNull();
});

test("a pause after a comma keeps the mouth closed but present", () => {
  const { sp, at } = rig();
  sp.push("ma, pa ");
  const ms = toSyllables("ma")[0].ms;
  at(0);
  expect(at(ms + 1)).toEqual({ viseme: "rest", open: 0 });
});

test("while waiting for more text (a tool call), the mouth goes away", () => {
  const { sp, at } = rig();
  sp.push("ma ");
  at(0);
  expect(sp.speaking).toBe(true);
  expect(at(1000)).toBeNull();
});

test("while the reply is still streaming it keeps speaking and waits for end()", async () => {
  const { sp, runOut } = rig();
  sp.push("one ");
  let drained = false;
  void sp.drained().then(() => (drained = true));
  runOut(2000);
  expect(sp.speaking).toBe(true);
  await Promise.resolve();
  expect(drained).toBe(false);
  sp.push("two ");
  sp.end();
  runOut();
  await Promise.resolve();
  expect(drained).toBe(true);
});

test("all: a long reply is spoken at normal pace", () => {
  const { sp, runOut } = rig();
  sp.push(LONG);
  sp.end();
  expect(runOut()).toBeGreaterThan(FIT_TAIL_MS * 2);
});

test("fit: a long reply speeds up to end within 8 s of the reply completing", () => {
  const { sp, spoken, runOut } = rig();
  sp.mode = "fit";
  sp.push(LONG);
  sp.end();
  expect(runOut()).toBeLessThanOrEqual(FIT_TAIL_MS + 1000);
  expect(spoken.at(-1)!.rate).toBeGreaterThan(1);
});

test("fit: a whole reply arriving at once as one final still fits", () => {
  const { sp, runOut } = rig();
  sp.mode = "fit";
  sp.push(LONG.trim());
  sp.end();
  expect(runOut()).toBeLessThanOrEqual(FIT_TAIL_MS + 1000);
});

test("first: only the first two sentences are spoken", () => {
  const { sp, spoken, runOut } = rig();
  sp.mode = "first";
  sp.push("One. Two. Three. Four. ");
  sp.end();
  runOut();
  expect(spoken).toHaveLength(toSyllables("One. Two.").length);
});

test("stop silences at once and drained resolves false", async () => {
  const { sp, at } = rig();
  sp.push("hello world ");
  at(0);
  const done = sp.drained();
  sp.stop();
  await expect(done).resolves.toBe(false);
  expect(sp.speaking).toBe(false);
  expect(at(16)).toBeNull();
});

test("nothing speakable drains at once, so the turn can finish", async () => {
  const { sp } = rig();
  sp.push("👍");
  sp.end();
  expect(sp.speaking).toBe(false);
  await expect(sp.drained()).resolves.toBe(true);
});

test("after a long pause in frames (hidden window) it resumes one syllable at a time", () => {
  const { sp, spoken, at } = rig();
  sp.push("a b c d e ");
  at(0);
  at(10_000);
  expect(spoken).toHaveLength(2);
});

test("silent until spoken to", () => {
  const { sp, at } = rig();
  expect(sp.speaking).toBe(false);
  expect(at(0)).toBeNull();
});
