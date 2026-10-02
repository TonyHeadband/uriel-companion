import { Ease } from "./anim";
import { Tweens, type Key } from "./tweens";

const BLINK: Key[] = [[0.06, 70, Ease.inOut], [1, 130, Ease.out]];

test("a tween walks its keys in time and unlocks when done", () => {
  const v = { open: 1 };
  const tw = new Tweens(v);
  const done = vi.fn();
  tw.run("open", BLINK, 0, done);
  expect(tw.isLocked("open")).toBe(true);
  tw.update(35);
  expect(v.open).toBeLessThan(1);
  expect(v.open).toBeGreaterThan(0.06);
  tw.update(70);
  expect(v.open).toBeCloseTo(0.06, 6);
  tw.update(200);
  expect(v.open).toBeCloseTo(1, 6);
  expect(tw.isLocked("open")).toBe(false);
  expect(done).toHaveBeenCalledOnce();
});

test("a long frame finishes several keys at once", () => {
  const v = { x: 0 };
  const tw = new Tweens(v);
  tw.run("x", [[1, 50, Ease.lin], [2, 50, Ease.lin], [3, 50, Ease.lin]], 0);
  tw.update(1000);
  expect(v.x).toBe(3);
  expect(tw.active).toBe(false);
});

test("key timing doesn't drift with uneven frames", () => {
  const v = { x: 0 };
  const tw = new Tweens(v);
  tw.run("x", [[1, 100, Ease.lin], [2, 100, Ease.lin]], 0);
  tw.update(130); // 30 ms into the second key
  expect(v.x).toBeCloseTo(1.3, 6);
});

test("running a prop again replaces its tween", () => {
  const v = { x: 0 };
  const tw = new Tweens(v);
  const first = vi.fn();
  tw.run("x", [[10, 100, Ease.lin]], 0, first);
  tw.update(50);
  tw.run("x", [[0, 100, Ease.lin]], 50);
  tw.update(150);
  expect(v.x).toBeCloseTo(0, 6);
  expect(first).not.toHaveBeenCalled();
});
