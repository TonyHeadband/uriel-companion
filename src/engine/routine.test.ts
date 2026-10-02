import { Routine, type RoutineHost, type RoutineScript } from "./routine";
import type { Thing } from "./things";

function fakeHost() {
  const h = {
    t: 0,
    arrivedAt: Infinity,
    goes: [] as unknown[],
    played: [] as string[],
    blinks: 0,
    list: [] as Thing[],
  };
  const host: RoutineHost = {
    now: () => h.t,
    random: () => 0.5,
    calm: false,
    reduced: false,
    spots: () => [{ x: 1, z: 0 }],
    at: () => ({ x: 0, z: 0 }),
    go: (to) => {
      h.goes.push(to);
      h.arrivedAt = h.t + 300;
    },
    arrived: () => h.t >= h.arrivedAt,
    face: () => {},
    turned: () => true,
    play: (name) => (h.played.push(name), 250),
    use: () => 400,
    blink: () => h.blinks++,
    express: () => {},
    things: () => h.list,
    world: () => null,
  };
  return { h, host };
}

test("wait resumes once its time is up, not before", () => {
  const { h, host } = fakeHost();
  const log: string[] = [];
  const r = new Routine(function* (c) {
    log.push("start");
    yield* c.wait(500);
    log.push("after");
  }, host);
  r.tick();
  h.t = 499;
  r.tick();
  expect(log).toEqual(["start"]);
  h.t = 500;
  r.tick();
  expect(log).toEqual(["start", "after"]);
  expect(r.done).toBe(true);
});

test("walkTo sets off, then waits until the host says it's there", () => {
  const { h, host } = fakeHost();
  let there = false;
  const r = new Routine(function* (c) {
    yield* c.walkTo(c.spots[0]);
    there = true;
  }, host);
  r.tick();
  expect(h.goes).toEqual([{ x: 1, z: 0 }]);
  h.t = 299;
  r.tick();
  expect(there).toBe(false);
  h.t = 300;
  r.tick();
  expect(there).toBe(true);
});

test("play waits as long as the gesture runs; use blinks after when asked", () => {
  const { h, host } = fakeHost();
  const r = new Routine(function* (c) {
    yield* c.play("hop");
    yield* c.use([], { blink: true });
  }, host);
  r.tick();
  expect(h.played).toEqual(["hop"]);
  h.t = 250;
  r.tick();
  expect(h.blinks).toBe(0);
  h.t = 650;
  r.tick();
  expect(h.blinks).toBe(1);
});

test("until resumes with the value its condition gave", () => {
  const { h, host } = fakeHost();
  let got = "";
  const r = new Routine(function* (c) {
    got = yield* c.until(() => (h.t >= 100 ? "goal" : false));
  }, host);
  r.tick();
  h.t = 100;
  r.tick();
  expect(got).toBe("goal");
});

test("cancelled mid-wait it stops for good, and its finally runs", () => {
  const { h, host } = fakeHost();
  const log: string[] = [];
  const r = new Routine(function* (c) {
    try {
      yield* c.wait(1000);
      log.push("never");
    } finally {
      log.push("cleaned up");
    }
  }, host);
  r.tick();
  r.cancel();
  h.t = 2000;
  r.tick();
  expect(log).toEqual(["cleaned up"]);
  expect(r.done).toBe(true);
});

test("things: spawn, kick and rollTo work on the host's list", () => {
  const { host, h } = fakeHost();
  const r = new Routine(function* (c) {
    c.spawn({ id: "b", kind: "ball", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, phase: 0, rate: 0, held: false, show: 1 });
    c.kick("b", 1, -2, -0.5);
    yield* c.wait(1);
    c.rollTo("b", { x: 0, z: 2.4 });
  }, host);
  r.tick();
  expect(h.list[0]).toMatchObject({ vx: 1, vz: -2, vy: -0.5 });
  h.t = 1;
  r.tick();
  expect(h.list[0].vx).toBeCloseTo(0);
  expect(h.list[0].vz).toBeCloseTo(2.4 * 1.2);
});

const forever: RoutineScript = function* () {
  for (;;) yield () => true;
};

test("a script whose waits are always met still hands the frame back", () => {
  const { host } = fakeHost();
  const r = new Routine(forever, host);
  expect(() => r.tick()).not.toThrow();
  expect(r.done).toBe(false);
});
