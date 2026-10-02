import { GOAL } from "./fixtures";
import { PITCH, SCENES } from "./scenes";
import { worldOf } from "./world";

test("the pitch's world: its bounds, a post at each side of the goal's mouth, and the net behind it", () => {
  const w = worldOf(SCENES.pitch)!;
  expect(w.bounds).toEqual({ x0: -3.4, x1: 3.4, z0: -2.1, z1: 1.2 });
  expect(w.posts.map((p) => p.x).sort((a, b) => a - b)).toEqual([-(GOAL.w / 2 - GOAL.post / 2), GOAL.w / 2 - GOAL.post / 2]);
  for (const p of w.posts) expect(p.z).toBeCloseTo(PITCH.mouth.z - GOAL.post / 2);
  expect(w.nets).toHaveLength(1);
  const [n] = w.nets;
  expect(n.z1).toBeCloseTo(PITCH.mouth.z);
  expect(n.z0).toBeCloseTo(PITCH.mouth.z - GOAL.d);
  expect(n.x1 - n.x0).toBeCloseTo(GOAL.w);
});

test("the back of the bounds is the back of the goal, so a ball never gets behind it", () => {
  const w = worldOf(SCENES.pitch)!;
  expect(w.bounds.z0).toBeCloseTo(w.nets[0].z0);
});

test("a scene without bounds has no world: nothing rolls there", () => {
  expect(worldOf(SCENES.yard)).toBeNull();
  expect(worldOf(SCENES.library)).toBeNull();
});
