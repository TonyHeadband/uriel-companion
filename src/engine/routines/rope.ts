import type { RoutineCtx, Step } from "../routine";
import { thing } from "../things";

/** Turns per second. */
export const TEMPO = 1.6;
const CALM_TEMPO = 1;
/** The phase where the rope passes under the feet. */
export const UNDER = 0.5;
// The skip hop's rise (ms): it starts this much ahead, so it peaks over the rope.
const HOP_PEAK = 110;

/** Waits for the rope's phase to come round to `at`. */
function* toPhase(r: RoutineCtx, at: number): Step {
  const left = (p: number) => (((at - p) % 1) + 1) % 1;
  let prev = left(r.thing("rope").phase);
  yield* r.until(() => {
    const now = left(r.thing("rope").phase);
    const passed = now > prev;
    prev = now;
    return passed || false;
  });
}

/** Skipping on the spot, a hop over each pass, and now and then the rope catching its feet. */
export function* jumprope(r: RoutineCtx): Step {
  r.spawn(thing("rope", "rope", { x: 0, z: 0 }, { held: true }));
  try {
    yield* r.walkTo(r.spots[0]);
    yield* r.face(0);
    yield* r.play("handsUp");
    const tempo = r.calm ? CALM_TEMPO : TEMPO;
    let trips = r.calm ? 0 : 1 + Math.floor(r.random() * 2);
    let tripAt = 4 + Math.floor(r.random() * 8);
    let rate = tempo;
    r.set("rope", { rate });
    for (let turn = 0; ; turn++) {
      if (trips > 0 && turn === tripAt) {
        yield* toPhase(r, UNDER);
        r.set("rope", { rate: 0, phase: UNDER });
        r.express("annoyed", 700);
        yield* r.play("stumble");
        yield* r.wait(600);
        trips--;
        tripAt = turn + 4 + Math.floor(r.random() * 6);
        rate = tempo / 2;
        r.set("rope", { rate });
        continue;
      }
      yield* toPhase(r, UNDER - (HOP_PEAK / 1000) * rate);
      r.start("skipHop");
      rate = Math.min(tempo, rate + tempo * 0.15);
      r.set("rope", { rate });
    }
  } finally {
    r.start("handsDown");
  }
}
