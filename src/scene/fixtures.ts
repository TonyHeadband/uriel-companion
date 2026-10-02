import { seeded } from "../engine/random";
import type { Box, FixtureDef, FixtureKind } from "./types";

// Narrow enough that two pairs stand with a walkway between, all inside the zoomed-out banner.
const SHELF = { w: 1.8, h: 3, d: 0.7 };
const SHELF_LEVELS = [0.15, 1.05, 1.95];
const SHELF_INNER = SHELF.w - 0.3;

/** A row of books along one shelf, irregular but the same every frame: widths, heights and gaps from a fixed seed. */
function books(y0: number, seed: number): Box[] {
  const r = seeded(seed);
  const out: Box[] = [];
  let x = -SHELF_INNER / 2;
  while (true) {
    const w = 0.13 + r() * 0.13;
    if (x + w > SHELF_INNER / 2) break;
    // Now and then a gap, as if a book is out.
    if (r() < 0.12) {
      x += w;
      continue;
    }
    out.push({ x: x + w / 2, z: 0.05, y0, w, h: 0.5 + r() * 0.28, d: 0.5, role: "book", tone: r() });
    x += w + 0.015;
  }
  return out;
}

function bookshelf(): FixtureDef {
  const { w, h, d } = SHELF;
  const frame: Box[] = [
    { x: 0, z: -d / 2 + 0.05, y0: 0, w, h, d: 0.1, role: "panel" },
    ...SHELF_LEVELS.slice(1).map((y0): Box => ({ x: 0, z: 0, y0: y0 - 0.08, w, h: 0.08, d, role: "shelf" })),
    { x: 0, z: 0, y0: 0, w, h: 0.15, d, role: "frame" },
    { x: 0, z: 0, y0: h - 0.1, w, h: 0.1, d, role: "frame" },
    { x: -w / 2 + 0.05, z: 0, y0: 0, w: 0.1, h, d, role: "frame" },
    { x: w / 2 - 0.05, z: 0, y0: 0, w: 0.1, h, d, role: "frame" },
  ];
  return { boxes: [...frame, ...SHELF_LEVELS.flatMap((y0, i) => books(y0, 7 + i))], footprint: { w, d } };
}

/** A small desk lamp standing at (x, z) on a surface y0 high. */
function lamp(x: number, z: number, y0: number): Box[] {
  return [
    { x, z, y0, w: 0.3, h: 0.06, d: 0.3, role: "frame" },
    { x, z, y0: y0 + 0.06, w: 0.06, h: 0.55, d: 0.06, role: "frame" },
    { x: x - 0.13, z: z + 0.05, y0: y0 + 0.58, w: 0.42, h: 0.16, d: 0.26, role: "lamp" },
  ];
}

function desk(): FixtureDef {
  const top = 0.95;
  const legs: Box[] = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz): Box => ({ x: sx * 1.18, z: sz * 0.38, y0: 0, w: 0.12, h: top, d: 0.12, role: "leg" })),
  );
  return {
    boxes: [
      ...legs,
      // A front panel, so whoever sits behind it is hidden from the waist down.
      { x: 0, z: 0.4, y0: 0.35, w: 2.36, h: top - 0.35, d: 0.08, role: "panel" },
      { x: 0, z: 0, y0: top, w: 2.6, h: 0.12, d: 1, role: "top" },
      // The paper is on the right, under the writing hand of someone sitting behind the desk's middle.
      { x: 0.85, z: -0.15, y0: top + 0.12, w: 0.6, h: 0.05, d: 0.45, role: "paper" },
      { x: -0.35, z: 0.05, y0: top + 0.12, w: 0.45, h: 0.14, d: 0.35, role: "paper" },
      ...lamp(-0.95, -0.25, top + 0.12),
    ],
    footprint: { w: 2.6, d: 1 },
  };
}

/** How high the stool's seat is: high enough that the writing hand clears the desk in front. */
export const SEAT_TOP = 0.7;

function stool(): FixtureDef {
  const legs: Box[] = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz): Box => ({ x: sx * 0.26, z: sz * 0.2, y0: 0, w: 0.08, h: SEAT_TOP - 0.08, d: 0.08, role: "leg" })),
  );
  return { boxes: [...legs, { x: 0, z: 0, y0: SEAT_TOP - 0.08, w: 0.7, h: 0.08, d: 0.55, role: "top" }] };
}

// The bed is two fixtures, so the character sits between them in the depth order: headboard, mattress and pillow
// behind it, the blanket and footboard in front. Both are laid out around BED_Z, from the bed's head at the back.
const BED = { w: 3, head: -0.45, foot: 1.35 };
/** How high the mattress is: what the character sits on in bed. */
export const MATTRESS_TOP = 0.45;

function bed(): FixtureDef {
  const { w, head, foot } = BED;
  const legs: Box[] = [-1, 1].flatMap((sx) =>
    [head + 0.1, foot - 0.1].map((z): Box => ({ x: sx * (w / 2 - 0.08), z, y0: 0, w: 0.12, h: 0.15, d: 0.12, role: "leg" })),
  );
  return {
    boxes: [
      ...legs,
      { x: 0, z: (head + foot) / 2, y0: 0.12, w, h: 0.18, d: foot - head, role: "frame" },
      { x: 0, z: head, y0: 0, w, h: 1.7, d: 0.12, role: "frame" },
      { x: 0, z: (head + foot) / 2 + 0.05, y0: 0.3, w: w - 0.1, h: MATTRESS_TOP - 0.3, d: foot - head - 0.2, role: "mattress" },
      { x: 0, z: head + 0.3, y0: MATTRESS_TOP, w: 1.3, h: 0.25, d: 0.35, role: "pillow" },
    ],
    footprint: { w, d: foot - head, z: (head + foot) / 2 },
  };
}

// Placed where the character's lap would be: from just in front of where it sits, to the foot.
function blanket(): FixtureDef {
  const { w } = BED;
  return {
    boxes: [
      { x: 0, z: 0, y0: 0.3, w: w + 0.04, h: 0.68, d: 0.8, role: "blanket" },
      { x: 0, z: 0.47, y0: 0, w, h: 0.55, d: 0.1, role: "frame" },
    ],
  };
}

function nightstand(): FixtureDef {
  const h = 0.75;
  return {
    boxes: [
      { x: 0, z: 0, y0: 0, w: 0.75, h, d: 0.6, role: "panel" },
      { x: 0, z: 0.02, y0: h - 0.06, w: 0.8, h: 0.06, d: 0.62, role: "top" },
      ...lamp(0.1, -0.05, h),
    ],
    footprint: { w: 0.75, d: 0.6 },
  };
}

// The armchair, like the bed, is two fixtures so the character sits between them in depth: seat and back behind it,
// the arms in front. Both are laid out around the chair's middle; the arms fixture sits ARMS_AHEAD in front of it.
export const ARMCHAIR_SEAT = 0.5;
export const ARMS_AHEAD = 0.45;
// Roomy: the seat between the arms is as wide as the character.
const CHAIR = { w: 2.8, d: 1.3 };

function armchair(): FixtureDef {
  const { w, d } = CHAIR;
  return {
    boxes: [
      { x: 0, z: 0, y0: 0, w, h: 0.15, d, role: "frame" },
      { x: 0, z: 0.05, y0: 0.15, w: w - 0.6, h: ARMCHAIR_SEAT - 0.15, d: d - 0.1, role: "cushion" },
      { x: 0, z: -d / 2 + 0.15, y0: 0.15, w, h: 1.75, d: 0.3, role: "cushion" },
    ],
    footprint: { w, d },
  };
}

function armchairArms(): FixtureDef {
  const { w, d } = CHAIR;
  return {
    boxes: [-1, 1].map((sx): Box => ({ x: sx * (w / 2 - 0.15), z: -ARMS_AHEAD, y0: 0.15, w: 0.3, h: 0.7, d, role: "cushion" })),
  };
}

function floorLamp(): FixtureDef {
  return {
    boxes: [
      { x: 0, z: 0, y0: 0, w: 0.5, h: 0.08, d: 0.5, role: "frame" },
      { x: 0, z: 0, y0: 0.08, w: 0.08, h: 2.3, d: 0.08, role: "frame" },
      { x: 0, z: 0, y0: 2.2, w: 0.7, h: 0.45, d: 0.6, role: "lamp" },
    ],
    footprint: { w: 0.5, d: 0.5 },
  };
}

/** How high the cafe stool is: the mug hand clears the low table in front. */
export const CAFE_SEAT = 0.6;
const CAFE_TOP = 0.8;

function cafeTable(): FixtureDef {
  return {
    boxes: [
      { x: 0, z: 0, y0: 0, w: 0.7, h: 0.06, d: 0.6, role: "frame" },
      { x: 0, z: 0, y0: 0.06, w: 0.14, h: CAFE_TOP - 0.06, d: 0.14, role: "leg" },
      { x: 0, z: 0, y0: CAFE_TOP, w: 1.5, h: 0.1, d: 1, role: "top" },
      { x: -0.4, z: 0.1, y0: CAFE_TOP + 0.1, w: 0.35, h: 0.06, d: 0.3, role: "paper" },
    ],
    footprint: { w: 1.5, d: 1 },
  };
}

function plantStand(): FixtureDef {
  const top = 0.3;
  const leaves: Box[] = [
    [-0.25, 0.55, 0.12], [0.2, 0.75, 0.15], [0, 0.95, 0.12], [-0.1, 0.7, 0.14], [0.3, 0.5, 0.1],
  ].map(([x, h, w]): Box => ({ x, z: 0, y0: top + 0.5, w, h, d: w, role: "leaf" }));
  return {
    boxes: [
      { x: 0, z: 0, y0: 0, w: 0.7, h: top, d: 0.7, role: "panel" },
      { x: 0, z: 0, y0: top, w: 0.6, h: 0.5, d: 0.6, role: "pot" },
      ...leaves,
    ],
    footprint: { w: 0.7, d: 0.7 },
  };
}

/** A small football goal. Its origin is the middle of its mouth, which is open toward the viewer; the net is behind. */
export const GOAL = { w: 2.4, h: 1.3, d: 0.9, post: 0.1 };

function goal(): FixtureDef {
  const { w, h, d, post } = GOAL;
  return {
    boxes: [
      { x: 0, z: -d + 0.02, y0: 0, w, h, d: 0.04, role: "net" },
      ...[-1, 1].map((sx): Box => ({ x: sx * (w / 2 - 0.02), z: -d / 2, y0: 0, w: 0.04, h, d, role: "net" })),
      ...[-1, 1].map((sx): Box => ({ x: sx * (w / 2 - post / 2), z: -post / 2, y0: 0, w: post, h, d: post, role: "post" })),
      { x: 0, z: -post / 2, y0: h - post, w, h: post, d: post, role: "post" },
    ],
    footprint: { w, d, z: -d / 2 },
  };
}

export const FIXTURES: Record<FixtureKind, FixtureDef> = {
  bookshelf: bookshelf(),
  desk: desk(),
  stool: stool(),
  bed: bed(),
  blanket: blanket(),
  nightstand: nightstand(),
  armchair: armchair(),
  armchairArms: armchairArms(),
  floorLamp: floorLamp(),
  cafeTable: cafeTable(),
  plantStand: plantStand(),
  goal: goal(),
};
