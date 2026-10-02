import { Ease } from "../anim";
import type { RoutineCtx, RoutineScript, Step } from "../routine";
import type { Key } from "../tweens";
import type { Viseme } from "../../speech/timeline";

/** Gets to the scene's spot, then uses the held item now and then: a page turned, a sip, a pour. */
function nowAndThen(every: readonly [number, number], keys: readonly Key[], opts: { blink?: boolean; mouth?: Viseme } = {}): RoutineScript {
  return function* (r: RoutineCtx): Step {
    yield* r.walkTo(r.spots[0]);
    for (;;) {
      yield* r.wait(every);
      yield* r.use(keys, opts);
    }
  };
}

export const reading = nowAndThen([4000, 6000], [[1, 300, Ease.inOut], [0, 300, Ease.inOut]], { blink: true });
export const coffee = nowAndThen([3000, 5000], [[1, 500, Ease.inOut], [1, 600, Ease.inOut], [0, 500, Ease.inOut]], { mouth: "O" });
export const watering = nowAndThen([3000, 4000], [[1, 400, Ease.out], [1, 900, Ease.inOut], [0, 400, Ease.inOut]]);
