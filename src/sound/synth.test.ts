import { SOUND_NAMES } from "./names";
import { RECIPES } from "./recipes";
import { DEFAULT_VOLUME, Synth } from "./synth";

function fakeContext() {
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = () => ({ connect() {}, start() {}, stop() {} });
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    state: "running" as AudioContextState,
    destination: {},
    oscillators: 0,
    createGain: () => ({ ...node(), gain: param() }),
    createOscillator: () => { ctx.oscillators++; return { ...node(), type: "sine", frequency: param() }; },
    createBiquadFilter: () => ({ ...node(), type: "bandpass", Q: param(), frequency: param() }),
    createBufferSource: () => ({ ...node(), buffer: null }),
    createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
    createConvolver: () => ({ ...node(), buffer: null }),
    createDynamicsCompressor: () => ({ ...node(), threshold: param() }),
    resume: vi.fn(async () => { ctx.state = "running"; }),
    suspend: vi.fn(async () => { ctx.state = "suspended"; }),
  };
  return ctx;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

test("every sound name has a non-empty recipe", () => {
  for (const name of SOUND_NAMES) expect(RECIPES[name].length).toBeGreaterThan(0);
});

test("muted: no audio context is ever created", () => {
  const make = vi.fn(() => fakeContext() as unknown as AudioContext);
  const s = new Synth(make);
  s.setEnabled(false);
  s.play("finish");
  expect(make).not.toHaveBeenCalled();
});

test("playing schedules one oscillator per tone (plus harmonics)", () => {
  const ctx = fakeContext();
  const s = new Synth(() => ctx as unknown as AudioContext);
  s.play("hover");
  const tones = RECIPES.hover.filter((p) => p.kind === "tone");
  expect(ctx.oscillators).toBeGreaterThanOrEqual(tones.length);
});

test("volume defaults low and is clamped to 0–0.5", () => {
  const s = new Synth(() => null);
  expect(s.volume).toBe(DEFAULT_VOLUME);
  s.setVolume(5);
  expect(s.volume).toBe(0.5);
  s.setVolume(-1);
  expect(s.volume).toBe(0);
});

test("the context suspends 1.5 s after the last sound ends, and resumes on play", () => {
  const ctx = fakeContext();
  const s = new Synth(() => ctx as unknown as AudioContext);
  s.play("hover"); // ~45 ms long
  vi.advanceTimersByTime(1400);
  expect(ctx.suspend).not.toHaveBeenCalled();
  vi.advanceTimersByTime(200);
  expect(ctx.suspend).toHaveBeenCalledOnce();
  s.play("hover");
  expect(ctx.resume).toHaveBeenCalledOnce();
});

test("no audio support is not an error", () => {
  expect(() => new Synth(() => null).play("finish")).not.toThrow();
});

test("playRecipe honours mute like play does", () => {
  const make = vi.fn(() => fakeContext() as unknown as AudioContext);
  const s = new Synth(make);
  s.setEnabled(false);
  s.playRecipe(RECIPES.hover);
  expect(make).not.toHaveBeenCalled();
});
