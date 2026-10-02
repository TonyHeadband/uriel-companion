import { clamp } from "./anim";
import type { Rect } from "../scene/route";
import type { FloorPt } from "../scene/types";

export type ThingKind = "ball" | "rope";

/**
 * Something that moves in a scene on its own: a ball rolling about, a rope turning in the hands. In R, world axes (y
 * down, z toward the viewer); y is its height off the floor, never above 0.
 */
export interface Thing {
  id: string;
  kind: ThingKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Roll angle (rad). */
  spin: number;
  /** 0–1 for things that cycle: the rope's turn (0 overhead, 0.25 in front, 0.5 under the feet, 0.75 behind). */
  phase: number;
  /** Turns of phase per second. */
  rate: number;
  /** Drawn from the hands rather than the floor: x, y and z mean nothing. */
  held: boolean;
  /** 0–1: rises and sinks with the scene. */
  show: number;
}

export interface Post {
  x: number;
  z: number;
  r: number;
}

/** What a free thing bumps into. A net is open toward the viewer (z1); its other sides are walls from outside. */
export interface World {
  bounds: Rect;
  posts: readonly Post[];
  nets: readonly Rect[];
}

export const BALL_R = 0.22;
const GRAVITY = 14;
// On the floor speed falls by e every 1/ROLL s, so a kick of v rolls v / ROLL.
const ROLL = 1.2;
const BOUNCE = 0.45;
// Landing slower than this it stays down.
const SETTLE = 0.8;
const REST_SPEED = 0.05;
// Going into a net it's slowed hard; the back gives like a spring, damped, so the ball sinks in and settles.
const NET_CATCH = 3;
const NET_SPRING = 120;
const NET_GIVE = 6;
// The netting soaks up the shot: it hands back at most this much speed, so the ball drops in the net, not out of it.
const NET_RETURN = 0.5;
export const MAX_SINK = 0.35;

export function thing(id: string, kind: ThingKind, at: FloorPt, over: Partial<Thing> = {}): Thing {
  return { id, kind, x: at.x, y: 0, z: at.z, vx: 0, vy: 0, vz: 0, spin: 0, phase: 0, rate: 0, held: false, show: 1, ...over };
}

/** The floor speed that rolls a ball `dist` R before friction stops it. */
export function rollSpeed(dist: number): number {
  return dist * ROLL;
}

export function resting(t: Thing): boolean {
  return t.y === 0 && t.vy === 0 && Math.hypot(t.vx, t.vz) < REST_SPEED;
}

const inside = (n: Rect, x: number, z: number) => x > n.x0 && x < n.x1 && z > n.z0 - MAX_SINK && z < n.z1;

export function inNet(t: Thing, world: World | null): boolean {
  return !t.held && !!world?.nets.some((n) => inside(n, t.x, t.z));
}

/** How far the ball has sunk into the back of a net it's in (R); the renderers billow the net by it. */
export function sinkOf(t: Thing, world: World | null): number {
  const n = t.held ? undefined : world?.nets.find((n) => inside(n, t.x, t.z));
  return n ? clamp(n.z0 + BALL_R - t.z, 0, MAX_SINK) : 0;
}

export function stepThings(things: readonly Thing[], dt: number, world: World | null): Thing[] {
  return things.map((t) => (t.held ? { ...t, phase: (((t.phase + t.rate * dt) % 1) + 1) % 1 } : roll(t, dt, world)));
}

function roll(t: Thing, dt: number, world: World | null): Thing {
  let { x, y, z, vx, vy, vz } = t;
  const [px, pz] = [x, z];
  vy += GRAVITY * dt;
  x += vx * dt;
  y += vy * dt;
  z += vz * dt;
  if (y >= 0) {
    y = 0;
    vy = vy > SETTLE ? -vy * BOUNCE : 0;
  }
  if (y === 0) {
    const k = Math.exp(-ROLL * dt);
    vx *= k;
    vz *= k;
  }
  let caught = false;
  if (world) {
    for (const p of world.posts) {
      const [dx, dz] = [x - p.x, z - p.z];
      const d = Math.hypot(dx, dz);
      const min = p.r + BALL_R;
      if (d >= min || d < 1e-9) continue;
      const [nx, nz] = [dx / d, dz / d];
      x = p.x + nx * min;
      z = p.z + nz * min;
      const into = vx * nx + vz * nz;
      if (into < 0) {
        vx -= (1 + BOUNCE) * into * nx;
        vz -= (1 + BOUNCE) * into * nz;
      }
    }
    for (const n of world.nets) {
      if (!inside(n, x, z)) continue;
      // Only the open side lets it in; from anywhere else it bounces off the netting.
      if (!inside(n, px, pz) && pz < n.z1) {
        if (px <= n.x0 || px >= n.x1) vx = -vx * BOUNCE;
        else vz = -vz * BOUNCE;
        x = px;
        z = pz;
        continue;
      }
      caught = true;
      if (vz < 0) {
        const k = Math.exp(-NET_CATCH * dt);
        vx *= k;
        vz *= k;
      }
      const sink = n.z0 + BALL_R - z;
      if (sink > 0) {
        vz += sink * NET_SPRING * dt;
        const k = Math.exp(-NET_GIVE * dt);
        vx *= k;
        vz = Math.min(vz * k, NET_RETURN);
        if (sink > MAX_SINK) {
          z = n.z0 + BALL_R - MAX_SINK;
          vz = Math.max(vz, 0);
        }
      }
      if (x < n.x0 + BALL_R || x > n.x1 - BALL_R) {
        x = clamp(x, n.x0 + BALL_R, n.x1 - BALL_R);
        vx = -vx * BOUNCE;
      }
    }
    if (!caught) {
      const b = world.bounds;
      if (x < b.x0 + BALL_R) [x, vx] = [b.x0 + BALL_R, Math.abs(vx) * BOUNCE];
      if (x > b.x1 - BALL_R) [x, vx] = [b.x1 - BALL_R, -Math.abs(vx) * BOUNCE];
      if (z < b.z0 + BALL_R) [z, vz] = [b.z0 + BALL_R, Math.abs(vz) * BOUNCE];
      if (z > b.z1 - BALL_R) [z, vz] = [b.z1 - BALL_R, -Math.abs(vz) * BOUNCE];
    }
  }
  if (y === 0 && Math.hypot(vx, vz) < REST_SPEED) [vx, vz] = [0, 0];
  const rolled = Math.hypot(x - px, z - pz);
  const spin = t.spin + (vx + vz >= 0 ? 1 : -1) * (rolled / BALL_R);
  return { ...t, x, y, z, vx, vy, vz, spin };
}
