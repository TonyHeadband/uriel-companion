import { FIXTURES } from "./fixtures";
import { routeAround, type Rect } from "./route";
import type { FloorPt, SceneDef, Spot } from "./types";

// The body's half-width and half-depth, so walking past a fixture never clips it.
const MARGIN = { x: 0.9, z: 0.4 };

/** Every footprint in the scene, grown by the body's size. */
export function footprints(scene: SceneDef): Rect[] {
  return scene.fixtures.flatMap(({ kind, x, z }) => {
    const fp = FIXTURES[kind].footprint;
    if (!fp) return [];
    const cz = z + (fp.z ?? 0);
    return [{ x0: x - fp.w / 2 - MARGIN.x, x1: x + fp.w / 2 + MARGIN.x, z0: cz - fp.d / 2 - MARGIN.z, z1: cz + fp.d / 2 + MARGIN.z }];
  });
}

/**
 * The waypoints from `from` to a spot, round every fixture. A spot with a `via` is reached by a last straight step from
 * there, which may cross a footprint: jumping into bed, sliding onto a stool tucked against the desk.
 */
export function planWalk(scene: SceneDef, from: FloorPt, spot: Spot): FloorPt[] {
  const rects = footprints(scene);
  const to = { x: spot.x, z: spot.z };
  return spot.via ? [...routeAround(rects, from, spot.via), to] : routeAround(rects, from, to);
}
