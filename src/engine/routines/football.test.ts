import { CharacterEngine } from "../character-engine";
import type { Pose } from "../pose";
import { footprints } from "../../scene/plan";
import { inside } from "../../scene/route";
import { PITCH, SCENES } from "../../scene/scenes";
import { worldOf } from "../../scene/world";
import { inNet, type Thing } from "../things";
import { lineUp, standAt } from "./football";

function play(random: () => number, opts: { live?: number } = {}) {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random });
  if (opts.live !== undefined) e.setLiveliness(opts.live);
  e.claim("life", "football");
  const frames = (ms: number, each: (p: Pose, ball: Thing | undefined) => void) => {
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      const p = e.update();
      each(p, p.things.find((th) => th.kind === "ball"));
    }
  };
  return { e, frames };
}

const world = worldOf(SCENES.pitch);

test("it stands behind the ball and off to its outer side, turned to face the goal", () => {
  for (const b of [PITCH.penalty, { x: -1.4, z: 0 }]) {
    const s = lineUp(b);
    const far = (p: { x: number; z: number }) => Math.hypot(p.x - PITCH.mouth.x, p.z - PITCH.mouth.z);
    expect(far(s)).toBeGreaterThan(far(b));
    // Off the shot's line, on the outer side, so the ball's run to the goal is never behind its body.
    const [ax, az] = [b.x - PITCH.mouth.x, b.z - PITCH.mouth.z];
    const off = (ax * (s.z - b.z) - az * (s.x - b.x)) / Math.hypot(ax, az);
    expect(Math.abs(off)).toBeGreaterThan(0.5);
    expect(Math.abs(s.x)).toBeGreaterThan(Math.abs(b.x));
    // Its front (sin turn, cos turn) points at the goal.
    const [gx, gz] = [PITCH.mouth.x - s.x, PITCH.mouth.z - s.z];
    expect(Math.sin(s.turn!) * gx + Math.cos(s.turn!) * gz).toBeCloseTo(Math.hypot(gx, gz));
  }
  for (const r of footprints(SCENES.pitch)) expect(inside(r, standAt({ x: 0.2, z: -1.6 }, Math.PI))).toBe(false);
});

test("it shoots from off to one side, so its body never hides the goal", () => {
  expect(Math.abs(lineUp(PITCH.penalty).x)).toBeGreaterThanOrEqual(1.8);
});

test("after a miss it goes for the ball as it slows, not seconds later once it's dead still", () => {
  let stopped = -1;
  let moved = -1;
  let i = 0;
  let lastOx = 0;
  play(() => 0.02).frames(20_000, (p, ball) => {
    i++;
    if (stopped < 0 && ball && Math.abs(ball.x) > 1.4 && ball.y === 0 && Math.hypot(ball.vx, ball.vz) < 0.4 && i > 100) stopped = i;
    if (stopped > 0 && moved < 0 && Math.abs(p.ox - lastOx) > 0.01) moved = i;
    lastOx = p.ox;
  });
  expect(stopped).toBeGreaterThan(0);
  expect(moved - stopped).toBeLessThan(1500 / 16);
});

test("a shot aimed in ends in the net; then it turns to us and hops", () => {
  let scored = -1;
  let celebrated = false;
  let i = 0;
  play(() => 0.5).frames(15_000, (p, ball) => {
    i++;
    if (scored < 0 && ball && inNet(ball, world)) scored = i;
    if (scored >= 0 && Math.abs(p.turn) < 0.3 && p.oy < -0.1) celebrated = true;
  });
  expect(scored).toBeGreaterThan(0);
  expect(celebrated).toBe(true);
});

test("a shot aimed wide rolls on and stops; then it goes after the ball", () => {
  let restedAt: Thing | null = null;
  let reached = false;
  play(() => 0.02).frames(20_000, (p, ball) => {
    if (!restedAt && ball && ball.vx === 0 && ball.vz === 0 && ball.y === 0 && Math.abs(ball.x) > 1.4) restedAt = { ...ball };
    if (restedAt && Math.abs(p.ox - restedAt.x) < 1) reached = true;
  });
  expect(restedAt).not.toBeNull();
  expect(inNet(restedAt!, world)).toBe(false);
  expect(reached).toBe(true);
});

test("calm, it never walks: it shoots from where it stands and the ball comes back to its feet", () => {
  let went = false;
  let back = false;
  play(() => 0.5, { live: 0 }).frames(25_000, (p, ball) => {
    expect(Math.abs(p.ox)).toBeLessThan(0.05);
    expect(Math.abs(p.oz)).toBeLessThan(0.05);
    if (ball && ball.z < PITCH.mouth.z) went = true;
    if (went && ball && Math.hypot(ball.x, ball.z + 0.75) < 0.35 && ball.vz === 0) back = true;
  });
  expect(went).toBe(true);
  expect(back).toBe(true);
});

test.each([150, 400])("with the pointer resting %d px to the side it still turns and shoots", (dx) => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5 });
  e.setLook(dx, 0);
  e.claim("life", "football");
  let kicked = false;
  for (let x = 0; x < 20_000; x += 16) {
    t += 16;
    const ball = e.update().things.find((th) => th.kind === "ball");
    if (ball && Math.hypot(ball.vx, ball.vz) > 2) kicked = true;
  }
  expect(kicked).toBe(true);
});

test("when the kick-about ends, the ball sinks with the pitch and is gone", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5 });
  const tok = e.claim("life", "football");
  const step = (ms: number) => {
    let p = e.update();
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      p = e.update();
    }
    return p;
  };
  expect(step(2000).things.some((th) => th.kind === "ball")).toBe(true);
  e.release("life", tok);
  expect(step(3000).things).toEqual([]);
});
