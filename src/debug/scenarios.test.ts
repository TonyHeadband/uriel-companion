import { runScenario, SCENARIOS, type ScenarioDeps } from "./scenarios";

function rig() {
  const calls: string[] = [];
  const timers: Array<{ ms: number; fn: () => void }> = [];
  let finishTurn!: () => void;
  const d: ScenarioDeps = {
    turn: (kind) => {
      calls.push(`turn:${kind}`);
      return new Promise<void>((r) => (finishTurn = r));
    },
    doze: () => calls.push("doze"),
    mood: (m) => calls.push(`mood:${m}`),
    poke: () => calls.push("poke"),
    later: (ms, fn) => timers.push({ ms, fn }),
    linkDown: () => calls.push("linkDown"),
    linkUp: () => calls.push("linkUp"),
  };
  const fire = () => timers.splice(0).forEach((t) => t.fn());
  return { d, calls, timers, fire, finish: () => finishTurn() };
}

test("every scenario has a label", () => {
  expect(SCENARIOS.map(([kind]) => kind)).toEqual(["ok", "error", "nap", "sleepy", "pokes", "away", "flavours", "confused"]);
});

test("turn and failing turn play the scripted turns", () => {
  const r = rig();
  runScenario("ok", r.d);
  runScenario("error", r.d);
  expect(r.calls).toEqual(["turn:ok", "turn:error"]);
});

test("nap dozes off straight away", () => {
  const r = rig();
  runScenario("nap", r.d);
  expect(r.calls).toEqual(["doze"]);
});

test("sleepy turn: asleep and tired, then a turn; the mood clears when it's done", async () => {
  const r = rig();
  runScenario("sleepy", r.d);
  expect(r.calls).toEqual(["doze", "mood:tired"]);
  expect(r.timers[0].ms).toBeGreaterThanOrEqual(1200);
  r.fire();
  expect(r.calls.at(-1)).toBe("turn:ok");
  r.finish();
  await Promise.resolve();
  expect(r.calls.at(-1)).toBe("mood:null");
});

test("pokes in a turn: three pokes while it searches", () => {
  const r = rig();
  runScenario("pokes", r.d);
  expect(r.calls).toEqual(["turn:ok"]);
  // The scripted turn searches from 4 s to 10 s.
  expect(r.timers[0].ms).toBeGreaterThan(4000);
  expect(r.timers[0].ms).toBeLessThan(10_000);
  r.fire();
  expect(r.calls.slice(1)).toEqual(["poke", "poke", "poke"]);
});

test("away and back: the agent goes, then returns 4 s later", () => {
  const r = rig();
  runScenario("away", r.d);
  expect(r.calls).toEqual(["linkDown"]);
  expect(r.timers[0].ms).toBe(4000);
  r.fire();
  expect(r.calls).toEqual(["linkDown", "linkUp"]);
});

test("tool flavours and confused play their scripted turns", () => {
  const r = rig();
  runScenario("flavours", r.d);
  runScenario("confused", r.d);
  expect(r.calls).toEqual(["turn:flavours", "turn:confused"]);
});
