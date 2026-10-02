import { CHARACTERS } from "../characters";
import { restPose } from "./pose";
import { MAX_OFFSET, resolveTuning, SoftBody, type BodyMotion, type BodyTuning } from "./softbody";

const JELLY: BodyTuning = { firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 };
const STIFF: BodyTuning = { firmness: 12, settle: 0.8, sway: 0.1, bump: 0.15 };
const WATERY: BodyTuning = { firmness: 3, settle: 0.18, sway: 0.8, bump: 0.6 };
const REST = Array.from({ length: 64 }, (_, i) => {
  const a = (i / 64) * Math.PI * 2;
  return [Math.cos(a), Math.sin(a)] as const;
});
const still = (o: Partial<BodyMotion> = {}): BodyMotion => ({ x: 0, y: 0, yaw: 0, sx: 1, sy: 1, tilt: 0, turn: 0, ...o });
const maxOffset = (out: ReadonlyArray<readonly [number, number]>) =>
  Math.max(...out.map(([x, y], i) => Math.hypot(x - REST[i][0], y - REST[i][1])));

function sim(tuning: BodyTuning, motionAt: (ms: number) => BodyMotion, untilMs: number) {
  const b = new SoftBody();
  let shape = b.apply(REST, motionAt(0), tuning, 0);
  const offsets: number[] = [];
  for (let t = 16; t <= untilMs; t += 16) {
    shape = b.apply(REST, motionAt(t), tuning, t);
    offsets.push(maxOffset(shape.outline));
  }
  return { b, shape, offsets };
}

test("a body at rest stays at rest", () => {
  const { offsets } = sim(JELLY, () => still(), 1000);
  expect(Math.max(...offsets)).toBeLessThan(1e-9);
});

test("a sudden move lags, overshoots, and settles within a second", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 0);
  const lag = b.apply(REST, still({ x: 0.2 }), JELLY, 16).outline;
  expect(lag[0][0]).toBeLessThan(REST[0][0]); // left behind
  let overshot = false;
  let shape = lag;
  for (let t = 32; t <= 1100; t += 16) {
    shape = b.apply(REST, still({ x: 0.2 }), JELLY, t).outline;
    if (shape[0][0] > REST[0][0] + 0.005) overshot = true;
  }
  expect(overshot).toBe(true);
  expect(maxOffset(shape)).toBeLessThan(0.01);
});

test("a firm body follows a slow drift closely; a watery one lags more", () => {
  const drift = (t: number) => still({ x: Math.min(0.5, (t / 800) * 0.5) });
  const firm = Math.max(...sim(STIFF, drift, 800).offsets);
  const watery = Math.max(...sim(WATERY, drift, 800).offsets);
  expect(firm).toBeLessThan(0.02);
  expect(watery).toBeGreaterThan(firm * 2);
});

test("offsets never exceed 0.3 R", () => {
  const { offsets } = sim(WATERY, (t) => still({ x: t > 0 ? 5 : 0 }), 200);
  expect(Math.max(...offsets)).toBeLessThanOrEqual(MAX_OFFSET + 1e-9);
});

test("a long gap (hidden window) resets to rest instead of exploding", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 0);
  const shape = b.apply(REST, still({ x: 0.4 }), JELLY, 5000);
  expect(maxOffset(shape.outline)).toBe(0);
});

test("a repeated or backwards timestamp produces no NaN", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 100);
  const same = b.apply(REST, still({ x: 0.1 }), JELLY, 100);
  const back = b.apply(REST, still({ x: 0.2 }), JELLY, 50);
  for (const [x, y] of [...same.outline, ...back.outline]) expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
});

test("a different point count (character switch) starts fresh", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 0);
  b.apply(REST, still({ x: 0.2 }), JELLY, 16);
  const half = REST.slice(0, 32);
  const shape = b.apply(half, still({ x: 0.3 }), JELLY, 32);
  expect(shape.outline).toHaveLength(32);
  expect(Math.max(...shape.outline.map(([x, y], i) => Math.hypot(x - half[i][0], y - half[i][1])))).toBe(0);
});

test("a gaze turn sways the top of the body more than the bottom", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 0);
  const out = b.apply(REST, still({ yaw: 0.4 }), JELLY, 16).outline;
  const top = REST.reduce((best, p, i) => (p[1] < REST[best][1] ? i : best), 0);
  const bottom = REST.reduce((best, p, i) => (p[1] > REST[best][1] ? i : best), 0);
  expect(Math.abs(out[top][0] - REST[top][0])).toBeGreaterThan(Math.abs(out[bottom][0] - REST[bottom][0]));
});

test("a bump pushes the outline outwards", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 0);
  b.bump();
  const out = b.apply(REST, still(), JELLY, 32).outline;
  const outward = out.filter(([x, y], i) => x * REST[i][0] + y * REST[i][1] > 1).length;
  expect(outward).toBeGreaterThan(REST.length * 0.9);
});

test("the face follows the upper body", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 0);
  const shape = b.apply(REST, still({ x: 0.2 }), JELLY, 16);
  expect(shape.face[0]).toBeLessThan(0);
});

test("overrides replace only the values they name", () => {
  expect(resolveTuning(JELLY, { sway: 0.9 })).toEqual({ ...JELLY, sway: 0.9 });
  expect(resolveTuning(JELLY)).toEqual(JELLY);
});

test("applyToPose fills pose.body from the character's own outline", () => {
  const b = new SoftBody();
  const pose = restPose();
  b.applyToPose(pose, CHARACTERS.grid.outline(1, pose), CHARACTERS.grid.body, 0);
  expect(pose.body!.outline).toHaveLength(CHARACTERS.grid.outline(1, pose).length);
});

test("a syllable bump is big enough to see on the default jelly", () => {
  const b = new SoftBody();
  b.apply(REST, still(), JELLY, 0);
  b.bump();
  let peak = 0;
  for (let t = 16; t <= 300; t += 16) peak = Math.max(peak, maxOffset(b.apply(REST, still(), JELLY, t).outline));
  expect(peak).toBeGreaterThanOrEqual(0.03);
});


test("a turn sways the body like a gaze turn does", () => {
  const rest = CHARACTERS.grid.outline(1, restPose());
  const b = new SoftBody();
  const m = { x: 0, y: 0, yaw: 0, sx: 1, sy: 1, tilt: 0, turn: 0 };
  b.apply(rest, m, CHARACTERS.grid.body, 0);
  const moved = b.apply(rest, { ...m, turn: 0.3 }, CHARACTERS.grid.body, 16);
  expect(moved.outline.some(([x], i) => Math.abs(x - rest[i][0]) > 1e-4)).toBe(true);
});

test("a turn's wrap-around is no motion for the soft body", () => {
  // A spin settles by snapping turn from 2π to 0: the same angle, so the body mustn't get a kick.
  const rest = CHARACTERS.grid.outline(1, restPose());
  const b = new SoftBody();
  const m = { x: 0, y: 0, yaw: 0, sx: 1, sy: 1, tilt: 0, turn: Math.PI * 2 };
  b.apply(rest, m, CHARACTERS.grid.body, 0);
  const after = b.apply(rest, { ...m, turn: 0 }, CHARACTERS.grid.body, 16);
  for (let i = 0; i < rest.length; i++) expect(after.outline[i][0]).toBeCloseTo(rest[i][0], 4);
});
