import { CharacterEngine } from "../character-engine";
import type { Pose } from "../pose";
import type { Thing } from "../things";
import { TEMPO, UNDER } from "./rope";

function skip(opts: { reducedMotion?: boolean } = {}) {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5, reducedMotion: opts.reducedMotion });
  const tok = e.claim("life", "jumprope");
  const frames = (ms: number, each: (p: Pose, rope: Thing | undefined) => void = () => {}) => {
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      const p = e.update();
      each(p, p.things.find((th) => th.kind === "rope"));
    }
  };
  return { e, tok, frames };
}

const wrapGap = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));

test("the hop peaks as the rope passes under the feet", () => {
  const { frames } = skip();
  const oys: number[] = [];
  const phases: number[] = [];
  frames(4500, (p, rope) => {
    oys.push(p.oy);
    phases.push(rope && rope.rate > 0 ? rope.phase : NaN);
  });
  let peaks = 0;
  for (let i = 1; i < oys.length - 1; i++) {
    if (Number.isNaN(phases[i]) || oys[i] > -0.08 || oys[i] > oys[i - 1] || oys[i] > oys[i + 1]) continue;
    peaks++;
    expect(wrapGap(phases[i], UNDER)).toBeLessThanOrEqual(0.08);
  }
  expect(peaks).toBeGreaterThanOrEqual(3);
});

test("a trip holds the rope at the feet, then it starts again slower and builds back", () => {
  const { frames } = skip();
  let held = 0;
  let tripped = false;
  const after: number[] = [];
  frames(20_000, (_p, rope) => {
    if (!rope) return;
    if (rope.rate === 0 && rope.phase === UNDER) held += 16;
    else if (held >= 300 && !tripped) tripped = true;
    if (tripped && after.length < 400) after.push(rope.rate);
  });
  expect(tripped).toBe(true);
  expect(after[0]).toBeLessThan(TEMPO);
  expect(Math.max(...after)).toBeCloseTo(TEMPO, 5);
});

test("with the pointer resting far to the side it still gets turning", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5 });
  e.setLook(400, 0);
  e.claim("life", "jumprope");
  let turning = false;
  for (let x = 0; x < 6000; x += 16) {
    t += 16;
    const rope = e.update().things.find((th) => th.kind === "rope");
    if (rope && rope.rate > 0) turning = true;
  }
  expect(turning).toBe(true);
});

test("at liveliness 0 it skips slower and never trips, as with reduced motion", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5 });
  e.setLiveliness(0);
  e.claim("life", "jumprope");
  let turning = false;
  for (let x = 0; x < 30_000; x += 16) {
    t += 16;
    const rope = e.update().things.find((th) => th.kind === "rope");
    if (rope && rope.rate > 0) turning = true;
    if (turning) {
      expect(rope!.rate).toBeGreaterThan(0);
      expect(rope!.rate).toBeLessThan(TEMPO);
    }
  }
  expect(turning).toBe(true);
});

test("with reduced motion it never trips", () => {
  const { frames } = skip({ reducedMotion: true });
  let turning = false;
  frames(30_000, (_p, rope) => {
    if (rope && rope.rate > 0) turning = true;
    if (turning) expect(rope!.rate).toBeGreaterThan(0);
  });
  expect(turning).toBe(true);
});

test("cut short, the hands come down and the rope goes with the yard", () => {
  const { e, tok, frames } = skip();
  frames(2000);
  e.release("life", tok);
  let last: Pose | null = null;
  frames(3000, (p) => (last = p));
  expect(last!.hands).toBeLessThan(0.05);
  expect(last!.things).toEqual([]);
});
