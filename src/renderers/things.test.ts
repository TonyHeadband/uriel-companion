import { thing } from "../engine/things";
import { ballPatches, rope, ropeAlpha, ROPE_HANDS } from "./things";

test("the rope shows only while it's in the hands and the yard is up: it sinks with the scene, goes with the hands", () => {
  const r = (show: number) => thing("r", "rope", { x: 0, z: 0 }, { held: true, show });
  expect(ropeAlpha(r(1), 1)).toBe(1);
  expect(ropeAlpha(r(0), 1)).toBe(0);
  expect(ropeAlpha(r(1), 0)).toBe(0);
  expect(ropeAlpha(r(0.3), 1)).toBeGreaterThan(0);
  expect(ropeAlpha(r(0.3), 1)).toBeLessThan(1);
  expect(ropeAlpha(r(1), 0.5)).toBeCloseTo(0.5);
});
import { FLOOR_Y } from "./layout";

test("the ball's patches turn with its spin; the middle one stays put", () => {
  const a = ballPatches(0);
  const b = ballPatches(1);
  expect(b[0]).toEqual(a[0]);
  expect(b[1].x).not.toBeCloseTo(a[1].x);
  for (const p of a) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(0.8);
});

test("the rope runs hand to hand: over the head at 0, in front at 0.25, under the feet at 0.5, behind at 0.75", () => {
  for (const ph of [0, 0.25, 0.5, 0.75]) {
    const { pts } = rope(ph);
    expect(pts[0][0]).toBeCloseTo(-ROPE_HANDS.x);
    expect(pts[0][1]).toBeCloseTo(ROPE_HANDS.y);
    expect(pts[pts.length - 1][0]).toBeCloseTo(ROPE_HANDS.x);
  }
  const mid = (ph: number) => rope(ph).pts[Math.floor(rope(ph).pts.length / 2)];
  expect(mid(0)[1]).toBeLessThan(-1.2);
  expect(mid(0.5)[1]).toBeGreaterThanOrEqual(FLOOR_Y);
  expect(rope(0.25).behind).toBe(false);
  expect(mid(0.25)[2]).toBeGreaterThan(0.5);
  expect(rope(0.75).behind).toBe(true);
});
