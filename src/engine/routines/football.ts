import { footprints } from "../../scene/plan";
import { inside } from "../../scene/route";
import { PITCH, SCENES } from "../../scene/scenes";
import type { FloorPt, Spot } from "../../scene/types";
import type { RoutineCtx, Step } from "../routine";
import { rollSpeed, thing } from "../things";

// Shots aim this far (R) either side of the goal's middle: inside about ±0.88 they go in, so roughly 6 in 10 score.
const AIM = 1.55;
// It stands this far behind the ball (toward us) to shoot.
const IN_FRONT = 0.6;
// And this far out to the side of the ball.
const ASIDE = 0.8;
// The kick's lunge peaks this far in (ms): where it meets the ball.
const KICK_AT = 120;
// Room to stand on, inside the bounds and clear of the camera.
const FLOOR = { x0: -3, x1: 3, z1: 1.1 };
const BACK = Math.PI;
// Below this speed (R/s) a rolling ball is as good as stopped.
const SLOW = 0.4;

/** A spot to stand at near `p`: on the floor, pushed out in front of any fixture it would be inside. */
export function standAt(p: FloorPt, turn: number): Spot {
  const x = Math.max(FLOOR.x0, Math.min(FLOOR.x1, p.x));
  let z = Math.min(FLOOR.z1, p.z);
  for (const r of footprints(SCENES.pitch)) if (inside(r, { x, z })) z = r.z1 + 0.05;
  return { x, z, turn };
}

/**
 * Behind the ball and off to its outer side, the way a striker comes at it, turned to face the goal: from the camera the
 * ball's run to the goal is then never behind its body.
 */
export function lineUp(ball: FloorPt): Spot {
  const [dx, dz] = [ball.x - PITCH.mouth.x, ball.z - PITCH.mouth.z];
  const d = Math.hypot(dx, dz) || 1;
  const [ux, uz] = [dx / d, dz / d];
  // Across the line, on the side away from the goal's middle.
  const out = ball.x >= PITCH.mouth.x ? 1 : -1;
  const [px, pz] = uz * out >= 0 ? [uz, -ux] : [-uz, ux];
  const s = standAt({ x: ball.x + ux * IN_FRONT + px * ASIDE, z: ball.z + uz * IN_FRONT + pz * ASIDE }, 0);
  // The body's front is (sin turn, cos turn): pointed at the goal.
  return { ...s, turn: Math.atan2(PITCH.mouth.x - s.x, PITCH.mouth.z - s.z) };
}

/** Rolling slowly enough to go after: friction takes seconds over the last crawl to a dead stop. */
function slowing(r: RoutineCtx): boolean {
  const b = r.thing("ball");
  return b.y === 0 && Math.hypot(b.vx, b.vz) < SLOW;
}

/** The lunge, and the ball sent off at the moment it lands. */
function* strike(r: RoutineCtx, turn: number, send: () => void): Step {
  yield* r.face(turn);
  yield* r.play("windUp");
  r.start("kick");
  yield* r.wait(KICK_AT);
  send();
}

function shoot(r: RoutineCtx): void {
  const b = r.thing("ball");
  const target = { x: PITCH.mouth.x + (r.random() * 2 - 1) * AIM, z: PITCH.mouth.z };
  const [dx, dz] = [target.x - b.x, target.z - b.z];
  const d = Math.hypot(dx, dz);
  // Hard enough to carry well past the goal line: in, it hits the back of the net and billows it; wide, it runs on to
  // the wall.
  const v = rollSpeed(d + 4);
  r.kick("ball", (dx / d) * v, (dz / d) * v, -2);
}

/** In the net or past the goal line: it goes to the ball and knocks it back out to the penalty spot. */
function* fetch(r: RoutineCtx): Step {
  const b = r.thing("ball");
  yield* r.walkTo(standAt({ x: b.x, z: b.z + 0.8 }, BACK));
  yield* strike(r, BACK, () => r.rollTo("ball", PITCH.penalty));
  yield* r.until(() => slowing(r));
}

/** Kick-about: line up behind the ball, shoot at the goal with its back to us, celebrate a goal, fetch a miss. */
export function* football(r: RoutineCtx): Step {
  const calm = r.calm;
  // Calm, it never walks: the ball sits in front of wherever it stands, and comes back there after each shot.
  const feet = calm ? { x: r.at().x, z: r.at().z - IN_FRONT } : PITCH.penalty;
  r.spawn(thing("ball", "ball", feet));
  for (;;) {
    let stand = lineUp(r.thing("ball"));
    if (!calm) {
      if (r.thing("ball").z < PITCH.mouth.z + 0.6) yield* fetch(r);
      stand = lineUp(r.thing("ball"));
      yield* r.walkTo(stand);
    }
    yield* strike(r, stand.turn!, () => shoot(r));
    const out = yield* r.until(() => (r.inNet("ball") ? "goal" : slowing(r) ? "miss" : false));
    if (out === "goal") {
      yield* r.wait(400);
      yield* r.face(0);
      r.express("happy", 900);
      yield* r.play("hop");
      yield* r.wait(600);
    } else yield* r.wait(500);
    if (calm) {
      yield* r.until(() => r.resting("ball"));
      r.rollTo("ball", feet);
      yield* r.until(() => r.resting("ball"));
      r.set("ball", { x: feet.x, z: feet.z });
    }
  }
}
