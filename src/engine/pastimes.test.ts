import { CharacterEngine } from "./character-engine";
import { PASTIMES, Pastimes } from "./pastimes";
import { seeded } from "./random";

function rig(liveliness = 0.5, seed = 3) {
  let t = 0;
  const engine = new CharacterEngine({ now: () => t, random: seeded(seed) });
  const p = new Pastimes({ engine, now: () => t, random: seeded(seed + 1), liveliness });
  const run = (ms: number, each?: () => void) => {
    for (let x = 0; x < ms; x += 100) {
      t += 100;
      p.tick();
      engine.update();
      each?.();
    }
  };
  return { engine, p, run };
}

/** Milliseconds of plain idle until a pastime starts. */
function firstStart(liveliness: number, seed: number): number {
  const { p, run } = rig(liveliness, seed);
  let at = 0;
  for (let ms = 0; ms < 400_000 && !p.current; ms += 100) {
    run(100);
    at = ms;
  }
  return at;
}

test("the pastimes are the actions flagged as such", () => {
  expect([...PASTIMES].sort()).toEqual(["coffee", "football", "jumprope", "reading", "watering"]);
});

test("nothing starts before the wait; something does within it, at the default liveliness", () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const at = firstStart(0.5, seed);
    expect(at).toBeGreaterThanOrEqual(60_000 - 100);
    expect(at).toBeLessThanOrEqual(180_000);
  }
});

test("more lively, it comes sooner", () => {
  const slow = [1, 2, 3, 4, 5].reduce((s, seed) => s + firstStart(0, seed), 0);
  const quick = [1, 2, 3, 4, 5].reduce((s, seed) => s + firstStart(1, seed), 0);
  expect(quick).toBeLessThan(slow / 2);
});

test("a pastime shows on the life layer, lasts 15–30 s, and the same one never comes twice in a row", () => {
  const { engine, p, run } = rig();
  const seen: string[] = [];
  let since = 0;
  run(1_500_000, () => {
    const now = p.current;
    if (now && seen[seen.length - 1] !== now) {
      seen.push(now);
      since = 0;
      expect(engine.state).toBe(now);
    }
    if (now) since += 100;
    else if (since) {
      expect(since).toBeGreaterThanOrEqual(15_000);
      expect(since).toBeLessThanOrEqual(30_100);
      since = 0;
    }
  });
  expect(seen.length).toBeGreaterThan(4);
  for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
});

test.each([["task", "thinking"], ["rest", "sleeping"], ["interaction", "dizzy"]] as const)(
  "a %s claim ends it for good: it doesn't come back once that's over",
  (layer, action) => {
    const { engine, p, run } = rig();
    p.startNow("coffee");
    run(1000);
    const token = engine.claim(layer, action);
    run(200);
    expect(p.current).toBeNull();
    engine.release(layer, token);
    run(500);
    expect(engine.state).toBe("idle");
    expect(p.current).toBeNull();
  },
);

test("a poke (stop) ends it, and the wait starts over", () => {
  const { engine, p, run } = rig();
  p.startNow("reading");
  run(1000);
  p.stop();
  run(200);
  expect(engine.state).toBe("idle");
  run(55_000);
  expect(p.current).toBeNull();
});

test("switched off, it ends the current one and never starts another; on again, it waits afresh", () => {
  const { p, run } = rig(1);
  p.startNow("watering");
  p.setEnabled(false);
  run(600_000);
  expect(p.current).toBeNull();
  p.startNow();
  expect(p.current).toBeNull();
  p.setEnabled(true);
  run(30_000);
  expect(p.current).toBeNull();
});

test("startNow replaces the one running, never with the same one, and never stacks", () => {
  const { engine, p, run } = rig();
  p.startNow("coffee");
  run(500);
  p.startNow();
  run(500);
  expect(p.current).not.toBe("coffee");
  expect(engine.state).toBe(p.current);
  p.startNow("reading");
  run(500);
  expect(p.current).toBe("reading");
  expect(engine.state).toBe("reading");
});

test("covered and uncovered with no frame in between (window minimised), it still doesn't come back", () => {
  const { engine, p, run } = rig();
  p.startNow("coffee");
  run(1000);
  const token = engine.claim("task", "thinking");
  engine.release("task", token);
  expect(engine.state).toBe("idle");
  run(200);
  expect(engine.state).toBe("idle");
  expect(p.current).toBeNull();
});

test("nothing starts while it's dozing off: the yawn before sleep", () => {
  let dozing = true;
  let t = 0;
  const engine = new CharacterEngine({ now: () => t, random: seeded(3) });
  const p = new Pastimes({ engine, now: () => t, random: seeded(4), liveliness: 1, dozing: () => dozing });
  for (; t < 400_000; t += 100) p.tick();
  expect(p.current).toBeNull();
  dozing = false;
  for (let end = t + 400_000; t < end && !p.current; t += 100) p.tick();
  expect(p.current).not.toBeNull();
});
