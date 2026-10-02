import { footprints, planWalk } from "./plan";
import { crosses, inside } from "./route";
import { SCENES } from "./scenes";
import type { FloorPt, SceneName } from "./types";

describe.each(Object.keys(SCENES) as SceneName[])("the %s scene", (name) => {
  const scene = SCENES[name];
  const rects = footprints(scene);

  test("has its spots (or the way into them) out on the open floor", () => {
    for (const s of scene.spots) for (const r of rects) expect(inside(r, s.via ?? s)).toBe(false);
  });

  test("walks to any spot, from another or from the open floor, never through a fixture", () => {
    // Where it might be when the scene rises, and every other spot.
    const froms: FloorPt[] = [-3, 0, 3].map((x) => ({ x, z: 0.3 })).concat(scene.spots.map(({ x, z }) => ({ x, z })));
    for (const a of froms) {
      for (const b of scene.spots) {
        if (a.x === b.x && a.z === b.z) continue;
        const legs = planWalk(scene, a, b);
        let at = a;
        legs.forEach((leg, i) => {
          // The last step into a spot reached by its via may cross a footprint: onto a stool, into bed.
          const last = b.via && i === legs.length - 1;
          // Caught inside as a fixture rose, its first step is out of it.
          for (const r of rects) if (!last && !inside(r, at)) expect(crosses(r, at, leg)).toBe(false);
          at = leg;
        });
        expect(at).toEqual({ x: b.x, z: b.z });
      }
    }
  });
});
