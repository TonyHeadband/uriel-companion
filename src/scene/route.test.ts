import { crosses, routeAround, type Rect } from "./route";
import type { FloorPt } from "./types";

const R: Rect = { x0: -1, x1: 1, z0: -1, z1: 1 };

test("a walk crosses a rect only through its inside", () => {
  expect(crosses(R, { x: 0, z: 2 }, { x: 0, z: -2 })).toBe(true);
  expect(crosses(R, { x: -2, z: 0 }, { x: 2, z: 0.5 })).toBe(true);
  expect(crosses(R, { x: 1, z: 2 }, { x: 1, z: -2 })).toBe(false);
  expect(crosses(R, { x: 2, z: 2 }, { x: 3, z: -2 })).toBe(false);
});

test("a route keeps out of the rect and ends where it was going", () => {
  const to = { x: 0.3, z: -2 };
  const path = routeAround([R], { x: -0.2, z: 2 }, to);
  expect(path[path.length - 1]).toEqual(to);
  expect(path.length).toBe(3);
  let at: FloorPt = { x: -0.2, z: 2 };
  for (const p of path) {
    expect(crosses(R, at, p)).toBe(false);
    at = p;
  }
});

test("from inside a rect it steps out toward the viewer first", () => {
  expect(routeAround([R], { x: 0.2, z: 0 }, { x: 0.2, z: 3 })[0]).toEqual({ x: 0.2, z: 1.01 });
});

test("a clear walk is a single leg", () => {
  expect(routeAround([R], { x: -3, z: 2 }, { x: 3, z: 2 })).toEqual([{ x: 3, z: 2 }]);
});
