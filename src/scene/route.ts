import type { FloorPt } from "./types";

/** A patch of floor the character's centre must stay out of. */
export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

// Corners sit a hair outside the rect, so the legs along its edges don't count as crossing it.
const EPS = 0.01;

export function inside(r: Rect, p: FloorPt): boolean {
  return p.x > r.x0 && p.x < r.x1 && p.z > r.z0 && p.z < r.z1;
}

/** Whether the straight walk from a to b passes through the rect's inside (Liang–Barsky clipping). */
export function crosses(r: Rect, a: FloorPt, b: FloorPt): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let t0 = 0;
  let t1 = 1;
  for (const [p, q] of [[-dx, a.x - r.x0], [dx, r.x1 - a.x], [-dz, a.z - r.z0], [dz, r.z1 - a.z]] as const) {
    if (p === 0) {
      if (q <= 0) return false;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 >= t1) return false;
  }
  const tm = (t0 + t1) / 2;
  return inside(r, { x: a.x + dx * tm, z: a.z + dz * tm });
}

const dist = (a: FloorPt, b: FloorPt) => Math.hypot(b.x - a.x, b.z - a.z);

/**
 * Round the rect by its corners: one corner, or two along a side, whichever is the shortest walk that never cuts
 * through it. Starting alongside a rect, one corner is enough; starting in front of it and ending behind takes two.
 */
function detour(r: Rect, a: FloorPt, b: FloorPt): FloorPt[] {
  const [x0, x1, z0, z1] = [r.x0 - EPS, r.x1 + EPS, r.z0 - EPS, r.z1 + EPS];
  const corners: FloorPt[] = [{ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 }];
  const options: FloorPt[][] = corners.flatMap((c, i) => {
    const next = corners[(i + 1) % 4];
    return [[c], [c, next], [next, c]];
  });
  const clear = (o: FloorPt[]) => [a, ...o, b].every((p, i, all) => i === 0 || !crosses(r, all[i - 1], p));
  const length = (o: FloorPt[]) => [a, ...o, b].reduce((sum, p, i, all) => sum + (i ? dist(all[i - 1], p) : 0), 0);
  return options.filter(clear).reduce((best, o) => (length(o) < length(best) ? o : best));
}

/** The waypoints from `from` to `to`, ending at `to`, that keep out of every rect. */
export function routeAround(rects: readonly Rect[], from: FloorPt, to: FloorPt): FloorPt[] {
  // Caught inside a fixture as it rose (drawn in front of it then), it steps out toward the viewer first.
  const lead: FloorPt[] = [];
  let start = from;
  for (const r of rects) {
    if (!inside(r, start)) continue;
    start = { x: start.x, z: r.z1 + EPS };
    lead.push(start);
  }
  let path = [start, to];
  for (const r of rects) {
    const next = [path[0]];
    for (let i = 1; i < path.length; i++) {
      if (crosses(r, path[i - 1], path[i])) next.push(...detour(r, path[i - 1], path[i]));
      next.push(path[i]);
    }
    path = next;
  }
  return [...lead, ...path.slice(1)];
}
