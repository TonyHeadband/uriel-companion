import { restPose, type Pose } from "../engine/pose";
import { SCENES } from "../scene/scenes";
import type { SceneName } from "../scene/types";
import { FLOOR_Y, toScreen, viewOf } from "./layout";
import { boxFaces, bulgeNet, netBulge, paintInDepth } from "./scenery";
import { FIXTURES } from "../scene/fixtures";
import { thing } from "../engine/things";
import { PITCH } from "../scene/scenes";

function orderWith(over: Partial<Pose>): string[] {
  const drawn: string[] = [];
  paintInDepth({ ...restPose(), ...over }, (_def, at) => drawn.push(at.kind), () => drawn.push("character"), (t) => drawn.push(t.kind));
  return drawn;
}

test("a ball is painted at its own depth: under the goal when in the net, over the character when nearer", () => {
  const scene = { id: "pitch", show: 1 } as const;
  expect(orderWith({ scene, oz: 1, things: [thing("b", "ball", { x: 0, z: -1.7 })] })).toEqual(["ball", "goal", "character"]);
  expect(orderWith({ scene, oz: 0, things: [thing("b", "ball", { x: 0, z: 0.8 })] })).toEqual(["goal", "character", "ball"]);
});

test("a held rope isn't a floor layer: the character draws it", () => {
  const scene = { id: "yard", show: 1 } as const;
  expect(orderWith({ scene, things: [thing("r", "rope", { x: 0, z: 0 }, { held: true })] })).toEqual(["character"]);
});

test("the net billows back by however far the ball has sunk into it", () => {
  const scene = { id: "pitch", show: 1 } as const;
  expect(netBulge({ ...restPose(), scene, things: [thing("b", "ball", { x: 0, z: 0 })] })).toBe(0);
  const sunk = netBulge({ ...restPose(), scene, things: [thing("b", "ball", { x: 0, z: PITCH.mouth.z - 0.9 + 0.22 - 0.2 })] });
  expect(sunk).toBeCloseTo(0.2);
  const back = (d: ReturnType<typeof bulgeNet>) => Math.min(...d.boxes.filter((b) => b.role === "net").map((b) => b.z));
  expect(back(bulgeNet(FIXTURES.goal, 0.2))).toBeCloseTo(back(FIXTURES.goal) - 0.2);
});

function order(over: Partial<Pose>): string[] {
  const drawn: string[] = [];
  paintInDepth({ ...restPose(), ...over }, (_def, at) => drawn.push(at.kind), () => drawn.push("character"));
  return drawn;
}

test("without a scene only the character is painted", () => {
  expect(order({})).toEqual(["character"]);
});

test("the character is painted over a fixture behind it, and under one in front", () => {
  const scene = { id: "study", show: 1 } as const;
  expect(order({ scene, oz: 0 })).toEqual(["stool", "desk", "character"]);
  expect(order({ scene, oz: -2 })).toEqual(["character", "stool", "desk"]);
  // Sitting behind the desk, on its stool.
  expect(order({ scene, oz: SCENES.study.spots[0].z })).toEqual(["stool", "character", "desk"]);
  // Level with a fixture (beside it), the character stays in front.
  expect(order({ scene, oz: SCENES.study.fixtures[0].z })).toEqual(["stool", "desk", "character"]);
});

test("in bed the character is between the bed and its blanket", () => {
  const scene = { id: "bedroom", show: 1 } as const;
  expect(order({ scene, oz: SCENES.bedroom.spots[0].z })).toEqual(["nightstand", "bed", "character", "blanket"]);
});

test("in the armchair the character is between its back and its arms", () => {
  const scene = { id: "nook", show: 1 } as const;
  expect(order({ scene, oz: SCENES.nook.spots[0].z })).toEqual(["floorLamp", "armchair", "character", "armchairArms"]);
});

describe.each(Object.keys(SCENES) as SceneName[])("the %s scene, zoomed out in the banner", (name) => {
  const scene = SCENES[name];
  const v = viewOf(400, 170, scene.zoom);

  test("has every spot's body inside the banner", () => {
    for (const s of scene.spots) {
      const at = s;
      const lift = s.lift ?? 0;
      for (const [x, y] of [[at.x - 1.2, -1.2 - lift], [at.x + 1.2, FLOOR_Y - lift]]) {
        const p = toScreen(v, x, y, at.z);
        expect(p.X).toBeGreaterThan(0);
        expect(p.X).toBeLessThan(400);
        expect(p.Y).toBeGreaterThan(0);
        expect(p.Y).toBeLessThan(170);
      }
    }
  });

  test("has every fixture inside the banner", () => {
    for (const at of scene.fixtures) {
      for (const b of FIXTURES[at.kind].boxes) {
        for (const pt of Object.values(boxFaces(v, at, b, 1)).flat()) {
          if (typeof pt === "number") continue;
          expect(pt[0]).toBeGreaterThan(0);
          expect(pt[0]).toBeLessThan(400);
          expect(pt[1]).toBeGreaterThan(0);
        }
      }
    }
  });
});
