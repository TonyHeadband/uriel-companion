import { Ease, Spring, cubicBezier, smooth } from "./anim";
import { hex, mixRGB, rgba } from "./color";

test("every ease starts at 0 and ends at 1", () => {
  for (const f of Object.values(Ease)) {
    expect(f(0)).toBeCloseTo(0, 6);
    expect(f(1)).toBeCloseTo(1, 6);
  }
});

test("back overshoots before settling", () => {
  expect(Ease.back(0.7)).toBeGreaterThan(1);
});

test("cubicBezier for the close curve is monotonic", () => {
  const f = cubicBezier(0.45, 0, 0.2, 1);
  let prev = -1;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const v = f(Math.min(t, 1));
    expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
    prev = v;
  }
  expect(f(1)).toBeCloseTo(1, 3);
});

test("smooth closes the gap by 1-k per second, independent of frame size", () => {
  expect(smooth(0, 1, 0.5, 1)).toBeCloseTo(0.5, 6);
  let v = 0;
  for (let i = 0; i < 10; i++) v = smooth(v, 1, 0.5, 0.1);
  expect(v).toBeCloseTo(0.5, 6);
});

test("a spring overshoots slightly and settles on its target", () => {
  const s = new Spring(0);
  s.target = 1;
  let max = 0;
  for (let i = 0; i < 120; i++) {
    s.step(1 / 60);
    max = Math.max(max, s.value);
  }
  expect(max).toBeGreaterThan(1);
  expect(max).toBeLessThan(1.15);
  expect(s.settled).toBe(true);
});

test("colour helpers", () => {
  expect(hex("#3B9EFF")).toEqual([59, 158, 255]);
  expect(mixRGB([0, 0, 0], [200, 100, 50], 0.5)).toEqual([100, 50, 25]);
  expect(rgba([1.4, 2.6, 3], 0.5)).toBe("rgba(1,3,3,0.5)");
});
