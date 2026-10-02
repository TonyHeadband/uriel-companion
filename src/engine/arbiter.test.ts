import { Arbiter, type ActionChange } from "./arbiter";
import { Scheduler } from "./scheduler";

function rig() {
  let t = 0;
  const sched = new Scheduler(() => t);
  const changes: ActionChange[] = [];
  const arb = new Arbiter(sched, (c) => changes.push(c));
  const at = (ms: number) => { t = ms; sched.run(); };
  return { arb, changes, at, seen: () => changes.map((c) => `${c.how}:${c.action}`) };
}

test("idle when nothing is claimed", () => {
  const { arb, changes } = rig();
  expect(arb.current).toBe("idle");
  expect(changes).toEqual([]);
});

test("the highest claimed layer shows, whatever order they came in", () => {
  const { arb, seen } = rig();
  arb.claim("rest", "sleeping");
  arb.claim("interaction", "dizzy");
  arb.claim("task", "thinking");
  expect(arb.current).toBe("dizzy");
  expect(seen()).toEqual(["enter:sleeping", "enter:dizzy"]);
});

test("releasing the top resumes the one below; when all are gone, idle enters", () => {
  const { arb, seen } = rig();
  arb.claim("life", "working");
  arb.claim("interaction", "dizzy");
  arb.release("interaction");
  arb.release("life");
  expect(seen()).toEqual(["enter:working", "enter:dizzy", "resume:working", "enter:idle"]);
});

test("re-claiming the same action is a no-op; a different one enters", () => {
  const { arb, seen } = rig();
  const a = arb.claim("task", "searching");
  expect(arb.claim("task", "searching")).toBe(a);
  arb.claim("task", "talking");
  expect(seen()).toEqual(["enter:searching", "enter:talking"]);
});

test("restart enters the same action again", () => {
  const { arb, seen } = rig();
  arb.claim("task", "finished");
  arb.claim("task", "finished", { restart: true });
  expect(seen()).toEqual(["enter:finished", "enter:finished"]);
});

test("a timed claim releases itself", () => {
  const { arb, at } = rig();
  arb.claim("task", "finished", { ms: 2500 });
  at(2499);
  expect(arb.current).toBe("finished");
  at(2500);
  expect(arb.current).toBe("idle");
});

test("replacing a timed claim cancels its timer", () => {
  const { arb, at } = rig();
  arb.claim("task", "finished", { ms: 2500 });
  arb.claim("task", "thinking");
  at(3000);
  expect(arb.current).toBe("thinking");
});

test("re-claiming the same action keeps the original timer", () => {
  const { arb, at } = rig();
  arb.claim("task", "finished", { ms: 2500 });
  at(2000);
  arb.claim("task", "finished", { ms: 2500 });
  at(2500);
  expect(arb.current).toBe("idle");
});

test("a hidden timed claim keeps counting; when the top goes, it's already gone", () => {
  const { arb, at } = rig();
  arb.claim("life", "finished", { ms: 2500 });
  arb.claim("interaction", "dizzy", { ms: 3300 });
  expect(arb.current).toBe("dizzy");
  at(3300);
  expect(arb.current).toBe("idle");
});

test("a release with a stale token does nothing", () => {
  const { arb } = rig();
  const old = arb.claim("task", "error");
  arb.claim("task", "thinking");
  arb.release("task", old);
  expect(arb.current).toBe("thinking");
  expect(arb.isClaimed("task")).toBe(true);
});

test("releasing an empty layer does nothing", () => {
  const { arb, changes } = rig();
  arb.release("life");
  expect(changes).toEqual([]);
});

test("link is above everything, even a poke", () => {
  const { arb } = rig();
  arb.claim("interaction", "dizzy");
  arb.claim("link", "away");
  expect(arb.current).toBe("away");
  arb.release("link");
  expect(arb.current).toBe("dizzy");
});

test("a claim that ends when covered is gone once a higher layer shows, even before anything else runs", () => {
  const { arb, seen } = rig();
  arb.claim("life", "coffee", { endsWhenCovered: true });
  const t = arb.claim("task", "thinking");
  expect(arb.isClaimed("life")).toBe(false);
  arb.release("task", t);
  expect(arb.current).toBe("idle");
  expect(seen()).toEqual(["enter:coffee", "enter:thinking", "enter:idle"]);
});
