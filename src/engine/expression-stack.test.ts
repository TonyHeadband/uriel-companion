import { ExpressionStack } from "./expression-stack";
import { EXPRESSIONS } from "./expressions";
import { Scheduler } from "./scheduler";
import type { ActionFace, ExpressionName } from "./states";

const WORKING: ActionFace = { eye: "pill" };
const all = () => true;

function rig(defs = EXPRESSIONS) {
  let t = 0;
  const sched = new Scheduler(() => t);
  const stack = new ExpressionStack(sched, () => t, defs);
  const at = (ms: number) => { t = ms; sched.run(); stack.update(); };
  return { stack, at, face: (base = WORKING, allowed: (n: ExpressionName) => boolean = all) => stack.resolve(base, allowed) };
}

test("no expressions: the action's face, with defaults filled in", () => {
  expect(rig().face().face).toEqual({ eye: "pill", mouth: null, gaze: "cursor", tilt: 0, blink: true, blush: 0 });
});

test("an expression overrides only what it defines, until it ends", () => {
  const { stack, at, face } = rig();
  stack.push("annoyed", 800);
  expect(face({ eye: "pill", tilt: 0.17 }).face).toMatchObject({ eye: "line", tilt: 0.17 });
  at(800);
  expect(face().face.eye).toBe("pill");
});

test("the higher priority wins; on a tie the newest", () => {
  const { stack, face } = rig();
  stack.push("love", 2000);
  stack.push("yawn", 2000);
  expect(face().face.eye).toBe("heart");
  stack.push("annoyed", 2000);
  expect(face().face.eye).toBe("line");
});

test("when the top one ends, the one below shows again", () => {
  const { stack, at, face } = rig();
  stack.push("happy", 3000);
  stack.push("annoyed", 500);
  expect(face().face.eye).toBe("line");
  at(600);
  expect(face().face.eye).toBe("happy");
});

test("a yawn's eyes close partway through", () => {
  const { stack, at, face } = rig();
  stack.push("yawn", 1200);
  expect(face().face.eye).toBe("tired");
  at(700);
  expect(face().face.eye).toBe("closed");
});

test("cancelling drops it and its pending steps", () => {
  const { stack, at, face } = rig();
  const h = stack.push("yawn", 1200);
  at(300);
  stack.cancel(h);
  at(700);
  expect(face().face.eye).toBe("pill");
});

test("prune removes what the new action doesn't allow", () => {
  const { stack, face } = rig();
  stack.push("love", 2000);
  stack.push("surprised", 2000);
  stack.prune((n) => n === "surprised");
  expect(face().face.eye).toBe("dot");
  stack.prune(() => false);
  expect(face().face.eye).toBe("pill");
});

test("the baseline sits under everything, never expires, and is skipped where not allowed", () => {
  const { stack, at, face } = rig();
  stack.setBaseline("happy");
  at(60_000);
  expect(face().face.eye).toBe("happy");
  stack.push("annoyed", 500);
  expect(face().face.eye).toBe("line");
  expect(face({ eye: "closed" }, () => false).face.eye).toBe("closed");
  stack.setBaseline(null);
  at(61_000);
  expect(face().face.eye).toBe("pill");
});

test("motion modifiers multiply", () => {
  const defs = {
    ...EXPRESSIONS,
    happy: { ...EXPRESSIONS.happy, modifiers: { pace: 2 } },
    wink: { ...EXPRESSIONS.wink, modifiers: { pace: 1.5, range: 0.5 } },
  };
  const { stack, face } = rig(defs);
  stack.setBaseline("happy");
  stack.push("wink", 1000);
  expect(face()).toMatchObject({ pace: 3, range: 0.5 });
});
