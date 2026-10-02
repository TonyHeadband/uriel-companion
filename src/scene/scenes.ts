import { ARMCHAIR_SEAT, ARMS_AHEAD, MATTRESS_TOP, SEAT_TOP, CAFE_SEAT } from "./fixtures";
import type { Placed, SceneDef, SceneName } from "./types";

const SHELF_Z = -1.2;
// Two pairs of bookshelves with a walkway between; it browses each with its back to us.
const SHELVES = [-4.3, -2.5, 1.7, 3.5];
const DESK = { x: 0, z: -0.3 };
// Behind the desk, clear of its back edge.
const SEAT_Z = DESK.z - 1;
const BED_Z = -1.6;
const IN_BED_Z = BED_Z + 0.25;
const CHAIR_Z = -1;
const CAFE = { x: 0, z: -0.3 };
const PLANT = { x: 1.3, z: -0.6 };
const GOAL_Z = -1.2;
/** The goal's mouth, and the penalty spot the ball starts on: off to one side, so its body never hides the goal. */
export const PITCH = { mouth: { x: 0, z: GOAL_Z }, penalty: { x: 1.4, z: GOAL_Z + 1.2 } };

export const SCENES: Record<SceneName, SceneDef> = {
  library: {
    zoom: 0.55,
    dwell: [2500, 5000],
    fixtures: SHELVES.map((x): Placed => ({ kind: "bookshelf", x, z: SHELF_Z })),
    spots: SHELVES.map((x) => ({ x, z: -0.1, turn: Math.PI })),
  },
  // Working: it goes round the desk, hops onto the stool behind it and sits facing us across the desk, writing.
  study: {
    zoom: 0.6,
    dwell: [4000, 7000],
    fixtures: [
      { kind: "desk", x: DESK.x, z: DESK.z },
      // Just behind where it sits, so it's drawn under the character.
      { kind: "stool", x: DESK.x, z: SEAT_Z - 0.05 },
    ],
    spots: [{ x: DESK.x, z: SEAT_Z, lift: SEAT_TOP, writes: true }],
  },
  // Sleeping: it hurries to the foot of the bed and jumps back into it, landing sitting up under the blanket, between
  // the bed and the blanket in depth, a nightstand and lamp beside it.
  bedroom: {
    zoom: 0.6,
    pace: 0.35,
    dwell: [4000, 7000],
    fixtures: [
      { kind: "nightstand", x: -2.3, z: BED_Z - 0.3 },
      { kind: "bed", x: 0, z: BED_Z },
      { kind: "blanket", x: 0, z: BED_Z + 0.85 },
    ],
    spots: [{ x: 0, z: IN_BED_Z, via: { x: 0, z: 0.45 }, lift: MATTRESS_TOP, leap: true }],
  },
  // Reading: it hops back into the armchair from in front of it and reads, a floor lamp beside it.
  nook: {
    zoom: 0.6,
    pace: 0.5,
    dwell: [4000, 7000],
    fixtures: [
      { kind: "floorLamp", x: -2.2, z: CHAIR_Z - 0.3 },
      { kind: "armchair", x: 0, z: CHAIR_Z },
      { kind: "armchairArms", x: 0, z: CHAIR_Z + ARMS_AHEAD },
    ],
    spots: [{ x: 0, z: CHAIR_Z + 0.2, via: { x: 0, z: 0.45 }, lift: ARMCHAIR_SEAT }],
  },
  // Coffee: it sits on a stool behind a little table, facing us, and sips.
  cafe: {
    zoom: 0.6,
    pace: 0.5,
    dwell: [4000, 7000],
    fixtures: [
      { kind: "cafeTable", x: CAFE.x, z: CAFE.z },
      { kind: "stool", x: CAFE.x, z: CAFE.z - 1.05 },
    ],
    spots: [{ x: CAFE.x, z: CAFE.z - 1, lift: CAFE_SEAT }],
  },
  // Watering: it stands left of a plant, turned toward it, the can held out over the pot.
  garden: {
    zoom: 0.6,
    pace: 0.5,
    dwell: [4000, 7000],
    fixtures: [{ kind: "plantStand", x: PLANT.x, z: PLANT.z }],
    // Far enough left that the can's spout, held out and up, pours over the pot.
    spots: [{ x: PLANT.x - 2.25, z: PLANT.z + 0.2, turn: 0.5 }],
  },
  // Football: a goal at the back; it shoots from behind the ball, three-quarters back-on to us.
  pitch: {
    zoom: 0.55,
    pace: 0.45,
    dwell: [4000, 7000],
    fixtures: [{ kind: "goal", x: PITCH.mouth.x, z: PITCH.mouth.z }],
    spots: [{ x: PITCH.penalty.x, z: PITCH.penalty.z + 0.75, turn: Math.PI }],
    // The back edge is the goal's back, so a wide shot comes back off the wall beside it.
    bounds: { x0: -3.4, x1: 3.4, z0: GOAL_Z - 0.9, z1: 1.2 },
  },
  // Jump rope: open floor, facing us.
  yard: {
    zoom: 0.6,
    pace: 0.5,
    dwell: [4000, 7000],
    fixtures: [],
    spots: [{ x: 0, z: 0 }],
  },
};
