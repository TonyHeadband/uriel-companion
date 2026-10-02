import { hex, mixRGB, type RGB } from "../engine/color";
import type { Pose } from "../engine/pose";
import { sinkOf, type Thing } from "../engine/things";
import { worldOf } from "../scene/world";
import { FIXTURES } from "../scene/fixtures";
import { SCENES } from "../scene/scenes";
import type { Box, BoxRole, FixtureDef, Placed } from "../scene/types";
import { FLOOR_Y, toScreen, type View } from "./layout";
import type { Ctx, Pt } from "./parts";

const SLATE = hex("#3A4152");
// Muted spines: mixed toward the slate so the shelf never outshouts the character.
const SPINES = ["#5B6EE1", "#E1735B", "#5BC0A8", "#E1C35B", "#A35BE1", "#7A8499"].map((c) => mixRGB(hex(c), SLATE, 0.35));
const ROLE: Record<Exclude<BoxRole, "book">, RGB> = {
  frame: SLATE,
  shelf: SLATE,
  leg: SLATE,
  panel: hex("#262B38"),
  top: hex("#4A5266"),
  paper: hex("#D9DEE6"),
  lamp: hex("#FFE7A8"),
  mattress: hex("#C9CFDA"),
  pillow: hex("#E6E9EE"),
  blanket: hex("#4C5FA8"),
  cushion: hex("#B0645A"),
  pot: hex("#B87A4B"),
  leaf: hex("#4FA36B"),
  post: hex("#E6E9EE"),
  net: hex("#C9CFDA"),
};
// Fixtures sink this far (R) below their place when hidden, rising as they show.
const SUNK = 0.8;
/** Toon outlines round every face. */
export const OUTLINE = "rgba(8,10,16,0.55)";

export function boxColor(b: Box): RGB {
  return b.role === "book" ? SPINES[Math.floor((b.tone ?? 0) * SPINES.length) % SPINES.length] : ROLE[b.role];
}

export interface BoxFaces {
  front: Pt[];
  top: Pt[];
  /** The side facing the middle of the view: the only one that ever shows. */
  side: Pt[];
  /** The side's normal across, for shading: −1 faces left, 1 faces right. */
  sideX: -1 | 1;
}

/** A box of a placed fixture on screen, `show` lifting it out of the floor. */
export function boxFaces(v: View, at: Placed, b: Box, show: number): BoxFaces {
  const lift = (1 - show) * SUNK;
  const [x0, x1] = [at.x + b.x - b.w / 2, at.x + b.x + b.w / 2];
  const [z0, z1] = [at.z + b.z - b.d / 2, at.z + b.z + b.d / 2];
  // y is down in body space, with the floor at FLOOR_Y.
  const [yb, yt] = [FLOOR_Y - b.y0 + lift, FLOOR_Y - b.y0 - b.h + lift];
  const p = (x: number, y: number, z: number): Pt => {
    const s = toScreen(v, x, y, z);
    return [s.X, s.Y] as const;
  };
  const sideX: -1 | 1 = x1 < 0 ? 1 : x0 > 0 ? -1 : (x0 + x1) / 2 < 0 ? 1 : -1;
  const sx = sideX === 1 ? x1 : x0;
  return {
    front: [p(x0, yt, z1), p(x1, yt, z1), p(x1, yb, z1), p(x0, yb, z1)],
    top: [p(x0, yt, z0), p(x1, yt, z0), p(x1, yt, z1), p(x0, yt, z1)],
    side: [p(sx, yt, z0), p(sx, yt, z1), p(sx, yb, z1), p(sx, yb, z0)],
    sideX,
  };
}

/** A fixture's boxes back to front, then bottom to top, so nearer and higher parts land over the rest. */
export function boxesInOrder(def: FixtureDef): Box[] {
  return [...def.boxes].sort((a, b) => a.z - b.z || a.y0 - b.y0);
}

export type DrawFixture = (def: FixtureDef, at: Placed, show: number) => void;

export type DrawThing = (t: Thing) => void;

/**
 * Paints the scene's fixtures, the free things in it and the character back to front by depth. Sorting is per fixture:
 * spots and routes keep the character out of their footprints, so a fixture is wholly in front of it or wholly
 * behind. On a tie the character stays in front. Held things are the character's to draw.
 */
export function paintInDepth(pose: Pose, fixture: DrawFixture, character: () => void, thingAt?: DrawThing): void {
  const scene = pose.scene;
  const bulge = netBulge(pose);
  const layers: Array<{ z: number; draw: () => void }> = (scene ? SCENES[scene.id].fixtures : []).map((at) => ({
    z: at.z,
    draw: () => fixture(bulge > 0 ? bulgeNet(FIXTURES[at.kind], bulge) : FIXTURES[at.kind], at, scene!.show),
  }));
  if (thingAt) for (const t of pose.things) if (!t.held) layers.push({ z: t.z, draw: () => thingAt(t) });
  layers.push({ z: pose.oz, draw: character });
  layers.sort((a, b) => a.z - b.z);
  for (const l of layers) l.draw();
}

/** How far the back of the scene's net is pushed in by a ball sunk into it (R). */
export function netBulge(pose: Pose): number {
  const world = pose.scene ? worldOf(SCENES[pose.scene.id]) : null;
  return Math.max(0, ...pose.things.map((t) => sinkOf(t, world)));
}

/** The fixture with its back netting pushed back `by` R: the widest net box is the back one. */
export function bulgeNet(def: FixtureDef, by: number): FixtureDef {
  return { ...def, boxes: def.boxes.map((b) => (b.role === "net" && b.w > b.d ? { ...b, z: b.z - by } : b)) };
}

/** Netting: a quad's outline and a grid of lines across it, so whatever is behind shows through. */
export function meshFace(x: Ctx, q: readonly Pt[], rows: number, cols: number): void {
  const at = (u: number, w: number): Pt => {
    const top: Pt = [q[0][0] + (q[1][0] - q[0][0]) * u, q[0][1] + (q[1][1] - q[0][1]) * u];
    const bot: Pt = [q[3][0] + (q[2][0] - q[3][0]) * u, q[3][1] + (q[2][1] - q[3][1]) * u];
    return [top[0] + (bot[0] - top[0]) * w, top[1] + (bot[1] - top[1]) * w];
  };
  x.beginPath();
  for (let i = 0; i <= cols; i++) {
    const [a, b] = [at(i / cols, 0), at(i / cols, 1)];
    x.moveTo(a[0], a[1]);
    x.lineTo(b[0], b[1]);
  }
  for (let j = 0; j <= rows; j++) {
    const [a, b] = [at(0, j / rows), at(1, j / rows)];
    x.moveTo(a[0], a[1]);
    x.lineTo(b[0], b[1]);
  }
  x.stroke();
}

/** The character's shadow on the floor, under it even mid-hop; only while a scene shows, so it reads as standing there. */
export function floorShadow(x: Ctx, v: View, pose: Pose): void {
  const show = Math.min(1, pose.scene?.show ?? 0);
  if (show <= 0.01) return;
  const { X, Y, s } = toScreen(v, pose.ox, FLOOR_Y + pose.ground, pose.oz);
  x.save();
  x.fillStyle = `rgba(0,0,0,${0.3 * show})`;
  x.beginPath();
  x.ellipse(X, Y, v.R * s * 0.95, v.R * s * 0.16, 0, 0, Math.PI * 2);
  x.fill();
  x.restore();
}
