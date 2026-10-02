import type { Post, World } from "../engine/things";
import { FIXTURES } from "./fixtures";
import type { Rect } from "./route";
import type { SceneDef } from "./types";

const cache = new Map<SceneDef, World | null>();

/** What things bump into in a scene: its bounds, every upright post, and each fixture's net as one rectangle. */
export function worldOf(scene: SceneDef): World | null {
  if (!cache.has(scene)) cache.set(scene, build(scene));
  return cache.get(scene)!;
}

function build(scene: SceneDef): World | null {
  if (!scene.bounds) return null;
  const posts: Post[] = [];
  const nets: Rect[] = [];
  for (const at of scene.fixtures) {
    const boxes = FIXTURES[at.kind].boxes;
    // Uprights only: the crossbar is out of a rolling ball's reach.
    for (const b of boxes) if (b.role === "post" && b.h > b.w) posts.push({ x: at.x + b.x, z: at.z + b.z, r: Math.max(b.w, b.d) / 2 });
    const net = boxes.filter((b) => b.role === "net");
    if (!net.length) continue;
    nets.push({
      x0: Math.min(...net.map((b) => at.x + b.x - b.w / 2)),
      x1: Math.max(...net.map((b) => at.x + b.x + b.w / 2)),
      z0: Math.min(...net.map((b) => at.z + b.z - b.d / 2)),
      z1: Math.max(...net.map((b) => at.z + b.z + b.d / 2)),
    });
  }
  return { bounds: scene.bounds, posts, nets };
}
