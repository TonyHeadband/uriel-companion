import { AWAY_EVERY_MS, Link, ONLINE_EVERY_MS, type LinkState } from "./link";

/** Health answers are queued; each check takes the next one. Timers fire only when the test says so. */
function rig(answers: boolean[] = []) {
  const changes: LinkState[] = [];
  const timers: Array<{ ms: number; fn: () => void }> = [];
  let checks = 0;
  let pending: ((ok: boolean) => void) | null = null;
  const queue = [...answers];
  const link = new Link({
    health: () => {
      checks++;
      if (queue.length) return Promise.resolve(queue.shift()!);
      return new Promise((r) => (pending = r));
    },
    later: (ms, fn) => timers.push({ ms, fn }),
    onChange: (s) => changes.push(s),
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  /** Fires the most recent timer and lets the check finish. */
  const tick = async () => {
    timers.pop()!.fn();
    await settle();
  };
  const answer = async (ok: boolean) => {
    pending!(ok);
    pending = null;
    await settle();
  };
  return { link, changes, timers, tick, settle, answer, checks: () => checks };
}

test("starts connecting; the first good check is online", async () => {
  const r = rig([true]);
  expect(r.link.state).toBe("connecting");
  r.link.start();
  await r.settle();
  expect(r.changes).toEqual(["online"]);
  expect(r.timers.at(-1)!.ms).toBe(ONLINE_EVERY_MS);
});

test("launching against a down agent goes away on the first failure", async () => {
  const r = rig([false]);
  r.link.start();
  await r.settle();
  expect(r.changes).toEqual(["away"]);
  expect(r.timers.at(-1)!.ms).toBe(AWAY_EVERY_MS);
});

test("once online, one failed check isn't enough; two in a row are", async () => {
  const r = rig([true, false, true, false, false]);
  r.link.start();
  await r.settle();
  await r.tick();
  expect(r.link.state).toBe("online");
  await r.tick();
  await r.tick();
  expect(r.link.state).toBe("online");
  await r.tick();
  expect(r.changes).toEqual(["online", "away"]);
});

test("away checks every 5 s and comes back on the first good one", async () => {
  const r = rig([false, false, true]);
  r.link.start();
  await r.settle();
  await r.tick();
  expect(r.timers.at(-1)!.ms).toBe(AWAY_EVERY_MS);
  await r.tick();
  expect(r.changes).toEqual(["away", "online"]);
  expect(r.timers.at(-1)!.ms).toBe(ONLINE_EVERY_MS);
});

test("reportDown goes away at once, and the next check comes at the away pace", async () => {
  const r = rig([true]);
  r.link.start();
  await r.settle();
  r.link.reportDown();
  expect(r.changes).toEqual(["online", "away"]);
  expect(r.timers.at(-1)!.ms).toBe(AWAY_EVERY_MS);
  // The slow timer from before is stale: firing it starts no check.
  const before = r.checks();
  r.timers[0].fn();
  await r.settle();
  expect(r.checks()).toBe(before);
});

test("reportDown, then a passing check, comes back online", async () => {
  const r = rig([true, true]);
  r.link.start();
  await r.settle();
  r.link.reportDown();
  await r.tick();
  expect(r.changes).toEqual(["online", "away", "online"]);
});

test("reportUp is online at once", async () => {
  const r = rig([false]);
  r.link.start();
  await r.settle();
  r.link.reportUp();
  expect(r.changes).toEqual(["away", "online"]);
});

test("onChange fires only on a change", async () => {
  const r = rig([true]);
  r.link.start();
  await r.settle();
  r.link.reportUp();
  r.link.reportUp();
  expect(r.changes).toEqual(["online"]);
});

test("checks never overlap: a report during a slow check schedules nothing extra", async () => {
  const r = rig();
  r.link.start();
  expect(r.checks()).toBe(1);
  r.link.reportDown();
  expect(r.timers).toEqual([]);
  await r.answer(true);
  expect(r.timers).toHaveLength(1);
  expect(r.checks()).toBe(1);
});

test("start twice still runs one chain of checks", async () => {
  const r = rig([true]);
  r.link.start();
  r.link.start();
  await r.settle();
  expect(r.checks()).toBe(1);
});

test("an onChange that throws once still leaves the next check scheduled", async () => {
  const timers: Array<{ ms: number; fn: () => void }> = [];
  let boom = true;
  const link = new Link({
    health: () => Promise.resolve(true),
    later: (ms, fn) => timers.push({ ms, fn }),
    onChange: () => {
      if (boom) {
        boom = false;
        throw new Error("listener failed");
      }
    },
  });
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  link.start();
  await new Promise((r) => setTimeout(r, 0));
  expect(timers).toHaveLength(1);
  expect(log).toHaveBeenCalled();
  log.mockRestore();
});
