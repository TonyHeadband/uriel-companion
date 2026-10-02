import type { ExpressionName, ActionName } from "./states";
import { Arbiter } from "./arbiter";
import { Scheduler } from "./scheduler";
import { Touch } from "./touch";

function rig(initial: ActionName = "idle") {
  let t = 0;
  const calls: string[] = [];
  const sounds: string[] = [];
  const dizzy: boolean[] = [];
  const sched = new Scheduler(() => t);
  const arbiter = new Arbiter(sched, () => {});
  if (initial !== "idle") arbiter.claim("task", initial);
  const engine = {
    claim: arbiter.claim.bind(arbiter),
    get state() { return arbiter.current; },
    isClaimed: arbiter.isClaimed.bind(arbiter),
    express(n: ExpressionName) { calls.push(`emote:${n}`); return null; },
    squash() { calls.push("squash"); },
    jolt() { calls.push("jolt"); },
    blink() { calls.push("blink"); },
    setHover(on: boolean) { calls.push(`hover:${on}`); },
  };
  const touch = new Touch({ engine, now: () => t, sound: (s) => sounds.push(s), onDizzy: (on) => dizzy.push(on) });
  const advance = (ms: number) => { t += ms; sched.run(); touch.tick(); };
  return { touch, engine, arbiter, calls, sounds, dizzy, advance };
}

test("hovering blinks and grows the eyes; resting 1.9 s gives love once", () => {
  const { touch, calls, sounds, advance } = rig();
  touch.hoverStart();
  expect(calls).toEqual(["hover:true", "blink"]);
  expect(sounds).toEqual(["hover"]);
  advance(1800);
  expect(calls).not.toContain("emote:love");
  advance(200);
  advance(5000);
  expect(calls.filter((c) => c === "emote:love")).toHaveLength(1);
});

test("moving the pointer restarts the resting clock", () => {
  const { touch, calls, advance } = rig();
  touch.hoverStart();
  advance(1500);
  touch.pointerMove();
  advance(1500);
  expect(calls).not.toContain("emote:love");
});

test("a click squashes and annoys", () => {
  const { touch, calls, sounds } = rig();
  touch.click();
  expect(calls).toEqual(["squash", "jolt", "emote:annoyed"]);
  expect(sounds).toEqual(["poke"]);
});

test("three clicks within 1.7 s make it dizzy for 3.3 s, then it goes back", () => {
  const { touch, engine, dizzy, advance } = rig();
  touch.click();
  advance(500);
  touch.click();
  advance(500);
  touch.click();
  expect(engine.state).toBe("dizzy");
  expect(dizzy).toEqual([true]);
  advance(3200);
  expect(engine.state).toBe("dizzy");
  advance(200);
  expect(engine.state).toBe("idle");
  expect(dizzy).toEqual([true, false]);
});

test("three spread-out clicks don't", () => {
  const { touch, engine, advance } = rig();
  touch.click();
  advance(1000);
  touch.click();
  advance(1000);
  touch.click();
  expect(engine.state).toBe("idle");
});

test("dizzy does not restore over a state a turn set meanwhile", () => {
  const { touch, engine, arbiter, dizzy, advance } = rig("idle");
  touch.click();
  touch.click();
  touch.click();
  arbiter.claim("task", "thinking"); // a chat turn started
  advance(3400);
  expect(engine.state).toBe("thinking");
  expect(dizzy).toEqual([true, false]);
});

test("three quick pokes make it dizzy during a turn too, then the turn shows again", () => {
  const { touch, engine, dizzy, advance } = rig("working");
  touch.click();
  touch.click();
  touch.click();
  expect(engine.state).toBe("dizzy");
  expect(dizzy).toEqual([true]);
  advance(3400);
  expect(engine.state).toBe("working");
});

test("an error left by a turn doesn't stop it getting dizzy", () => {
  const { touch, engine, advance } = rig("error");
  touch.click();
  touch.click();
  touch.click();
  expect(engine.state).toBe("dizzy");
  advance(3400);
  expect(engine.state).toBe("error");
});
