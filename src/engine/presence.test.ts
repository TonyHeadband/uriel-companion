import { CharacterEngine } from "./character-engine";
import { Presence } from "./presence";

const MIN = 60_000;

function rig() {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5 });
  const p = new Presence({ engine: e, now: () => t, sleepAfterMs: 10 * MIN });
  const advance = (ms: number) => {
    for (let x = 0; x < ms; x += 100) {
      t += 100;
      e.update();
      p.tick();
    }
  };
  return { e, p, advance };
}

test("ten quiet minutes: yawn, then asleep a second later", () => {
  const { e, advance } = rig();
  advance(10 * MIN);
  expect(e.update().eyeShape).toBe("tired");
  expect(e.state).toBe("idle");
  advance(1000);
  expect(e.state).toBe("sleeping");
});

test("activity wakes it, back to what's below", () => {
  const { e, p, advance } = rig();
  advance(10 * MIN + 1100);
  p.activity();
  expect(e.state).toBe("idle");
});

test("activity during the yawn cancels the sleep and the yawn", () => {
  const { e, p, advance } = rig();
  advance(10 * MIN);
  advance(500);
  p.activity();
  advance(2000);
  expect(e.state).toBe("idle");
  expect(e.update().eyeShape).toBe("pill");
});

test("keyboard-only chatting counts as activity (#16)", () => {
  const { e, p, advance } = rig();
  for (let i = 0; i < 12; i++) {
    advance(MIN);
    p.activity(); // a keydown
  }
  expect(e.state).toBe("idle");
});

test("no yawn or sleep while a turn or a poke holds the character", () => {
  const { e, advance } = rig();
  e.claim("task", "working");
  advance(12 * MIN);
  expect(e.state).toBe("working");
  e.release("task");
  e.claim("interaction", "dizzy");
  advance(2 * MIN);
  expect(e.state).toBe("dizzy");
});

test("a send while asleep shows thinking at once", () => {
  const { e, p, advance } = rig();
  advance(10 * MIN + 1100);
  p.activity();
  e.claim("task", "thinking");
  expect(e.state).toBe("thinking");
});

test("the sleep timeout can change", () => {
  const { e, p, advance } = rig();
  p.setSleepAfter(1 * MIN);
  advance(MIN + 1100);
  expect(e.state).toBe("sleeping");
});

test("activity under a turn still wakes it, so it doesn't fall back asleep after", () => {
  const { e, p, advance } = rig();
  advance(10 * MIN + 1100);
  expect(e.state).toBe("sleeping");
  e.claim("task", "thinking");
  p.activity();
  e.release("task");
  expect(e.state).toBe("idle");
});

test("doze falls asleep now, through the same yawn, and activity wakes it", () => {
  const { e, p, advance } = rig();
  p.doze();
  expect(e.update().eyeShape).toBe("tired");
  advance(1100);
  expect(e.state).toBe("sleeping");
  p.activity();
  expect(e.state).toBe("idle");
});

test("doze while already dozing doesn't yawn again", () => {
  const { e, p, advance } = rig();
  p.doze();
  advance(1100);
  p.doze();
  expect(e.update().eyeShape).toBe("closed");
});

test("no yawn or sleep while the agent is away", () => {
  const { e, advance } = rig();
  e.claim("link", "away");
  advance(12 * MIN);
  expect(e.isClaimed("rest")).toBe(false);
  e.release("link");
  expect(e.state).toBe("idle");
});
