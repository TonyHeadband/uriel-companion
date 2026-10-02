import { seeded } from "./random";
import { BALL_R, inNet, MAX_SINK, resting, rollSpeed, sinkOf, stepThings, thing, type Thing, type World } from "./things";

const GOAL: World = {
  bounds: { x0: -3.4, x1: 3.4, z0: -2.1, z1: 1.2 },
  posts: [{ x: -1.15, z: -1.25, r: 0.05 }, { x: 1.15, z: -1.25, r: 0.05 }],
  nets: [{ x0: -1.2, x1: 1.2, z0: -2.1, z1: -1.2 }],
};

function run(t: Thing, s: number, world: World | null = GOAL, each?: (t: Thing) => void): Thing {
  let things = [t];
  for (let i = 0; i < s * 60; i++) {
    things = stepThings(things, 1 / 60, world);
    each?.(things[0]);
  }
  return things[0];
}

test("a rolled ball slows to rest about where its kick says", () => {
  const end = run(thing("b", "ball", { x: -1, z: 0.5 }, { vx: rollSpeed(2) }), 6, null);
  expect(resting(end)).toBe(true);
  expect(end.x).toBeGreaterThan(0.85);
  expect(end.x).toBeLessThan(1.02);
  expect(end.spin).not.toBe(0);
});

test("a ball thrown up lands, bounces lower, and settles on the floor", () => {
  let lowest = 0;
  let landed = 0;
  let prevY = 0;
  const end = run(thing("b", "ball", { x: 0, z: 0 }, { vy: -4 }), 3, null, (b) => {
    expect(b.y).toBeLessThanOrEqual(0);
    lowest = Math.min(lowest, b.y);
    if (prevY < 0 && b.y === 0) landed++;
    prevY = b.y;
  });
  expect(lowest).toBeLessThan(-0.4);
  expect(landed).toBeGreaterThanOrEqual(2);
  expect(end.y).toBe(0);
  expect(end.vy).toBe(0);
});

test("it bounces back off a post", () => {
  const end = run(thing("b", "ball", { x: 1.15, z: 0 }, { vz: -4 }), 1);
  expect(end.vz).toBeGreaterThanOrEqual(0);
  expect(end.z).toBeGreaterThan(-1.25 + 0.05 + BALL_R - 0.01);
});

test("a shot into the mouth dies in the net, sinking into its back first", () => {
  let deepest = 0;
  const end = run(thing("b", "ball", { x: 0, z: 0.3 }, { vz: -rollSpeed(6) }), 6, GOAL, (b) => (deepest = Math.max(deepest, sinkOf(b, GOAL))));
  expect(inNet(end, GOAL)).toBe(true);
  expect(resting(end)).toBe(true);
  expect(deepest).toBeGreaterThan(0.05);
  expect(deepest).toBeLessThanOrEqual(MAX_SINK + 1e-9);
});

test("a lofted shot as hard as the football kicks stays in the net: the back gives, it doesn't spring it out", () => {
  const end = run(thing("b", "ball", { x: 0, z: 0.3 }, { vz: -rollSpeed(5.5), vy: -2 }), 6);
  expect(inNet(end, GOAL)).toBe(true);
});

test("a ball in the net rolls back out when knocked toward the viewer", () => {
  const end = run(thing("b", "ball", { x: 0, z: -1.8 }, { vz: rollSpeed(2) }), 6);
  expect(inNet(end, GOAL)).toBe(false);
  expect(end.z).toBeGreaterThan(-0.2);
});

test("from the side the netting is a wall", () => {
  const end = run(thing("b", "ball", { x: 2.2, z: -1.6 }, { vx: -5 }), 3, GOAL, (b) => expect(inNet(b, GOAL)).toBe(false));
  expect(end.x).toBeGreaterThan(1.2);
});

test("whatever the kick, a ball stays on the floor and inside the bounds", () => {
  const r = seeded(3);
  const { x0, x1, z0, z1 } = GOAL.bounds;
  for (let i = 0; i < 40; i++) {
    const kick = thing("b", "ball", { x: 0, z: 0.3 }, { vx: (r() * 2 - 1) * 8, vz: (r() * 2 - 1) * 8, vy: -r() * 4 });
    run(kick, 5, GOAL, (b) => {
      expect(b.y).toBeLessThanOrEqual(0);
      expect(b.x).toBeGreaterThanOrEqual(x0);
      expect(b.x).toBeLessThanOrEqual(x1);
      expect(b.z).toBeGreaterThanOrEqual(z0 - MAX_SINK);
      expect(b.z).toBeLessThanOrEqual(z1);
    });
  }
});

test("a held thing only turns: its phase advances by its rate and wraps", () => {
  const end = run(thing("r", "rope", { x: 0, z: 0 }, { held: true, rate: 1.6, phase: 0.9 }), 1, null);
  expect(end.phase).toBeCloseTo((0.9 + 1.6) % 1, 1);
  expect(end.x).toBe(0);
});
