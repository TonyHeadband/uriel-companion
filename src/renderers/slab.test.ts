import { CHARACTERS } from "../characters";
import { restPose } from "../engine/pose";
import { band, bandLevel, capNormal, faceNormal, faceX, faceY, facing, project, reachPoint, sideNormal, silhouette } from "./slab";

const front = CHARACTERS.grid.outline(1, restPose());
const halfWidth = (pts: ReadonlyArray<readonly [number, number]>) => Math.max(...pts.map(([x]) => Math.abs(x)));

test("the silhouette is the front face-on, the depth side-on, and the back from behind", () => {
  expect(halfWidth(silhouette(front, 0, 0.6))).toBeCloseTo(1, 5);
  expect(halfWidth(silhouette(front, Math.PI / 2, 0.6))).toBeCloseTo(0.3, 5);
  expect(halfWidth(silhouette(front, Math.PI, 0.6))).toBeCloseTo(1, 5);
  expect(silhouette(front, 1, 0.6)).toHaveLength(front.length);
});

test("the front face slides across as it turns", () => {
  expect(faceX(0, 0, 0.6)).toBe(0);
  expect(faceX(0, Math.PI / 2, 0.6)).toBeCloseTo(0.3, 5);
  expect(faceX(0, Math.PI / 2, 0.6, -1)).toBeCloseTo(-0.3, 5);
});

test("facing: front, side, back", () => {
  expect(facing(0)).toBe("front");
  expect(facing(Math.PI / 2)).toBe("side");
  expect(facing(Math.PI)).toBe("back");
  expect(facing(Math.PI * 2 + 0.1)).toBe("front");
});

test("a quarter turn takes the right hand behind the body", () => {
  expect(project(1.15, 0.42, 0, 0).z).toBeCloseTo(0, 9);
  expect(project(1.15, 0.42, 0, Math.PI / 2).z).toBeLessThan(0);
  expect(project(1.15, 0.42, 0, -Math.PI / 2).z).toBeGreaterThan(0);
});

test("the reach goes behind the body, then round to the front", () => {
  expect(reachPoint(0)).toEqual([1.15, 0.42, 0]);
  expect(reachPoint(0.4)[2]).toBeLessThan(0);
  expect(reachPoint(1)).toEqual([0.95, 0.4, 0.7]);
  expect(reachPoint(2)).toEqual([0.95, 0.4, 0.7]);
});

test("the light falls from the top left in hard bands", () => {
  expect(band(faceNormal(0, 1))).toBe("lit");
  expect(band(faceNormal(Math.PI, -1))).toBe("lit");
  expect(band(sideNormal(Math.PI / 2))).toBe("lit"); // side-on, the visible wall faces the viewer
  expect(band([1, 0, 0])).toBe("shade"); // a wall facing right, away from the light
});

test("the face stays in one band across the everyday lean, and darkens only when really turned", () => {
  // Lean and gaze turn keep the body within about ±0.45 rad; a band edge in there flickers as it wanders.
  for (let t = -0.55; t <= 0.45; t += 0.05) expect(band(faceNormal(t, 1))).toBe("lit");
  expect(band(faceNormal(Math.PI / 4, 1))).not.toBe("lit");
});

test("tipping forward shows the top wall: the outline grows and the face drops", () => {
  const height = (pts: ReadonlyArray<readonly [number, number]>) => Math.max(...pts.map(([, y]) => Math.abs(y)));
  expect(height(silhouette(front, 0, 0.6, 0.25))).toBeGreaterThan(height(silhouette(front, 0, 0.6, 0)));
  expect(faceY(0, 0, 0.25, 0.6)).toBeGreaterThan(0);
  expect(project(0, -1, 0, 0, 0.25).z).toBeGreaterThan(0); // the top comes toward the viewer
});

test("the top wall is lit and the bottom shaded", () => {
  expect(band(capNormal(0.2))).toBe("lit");
  expect(band(capNormal(-0.2))).toBe("shade");
});

test("crossing a band edge fades over a few frames instead of popping", () => {
  let prev = bandLevel(faceNormal(-1.6, 1));
  for (let t = -1.6; t <= 1.6; t += 0.005) {
    const level = bandLevel(faceNormal(t, 1));
    expect(Math.abs(level - prev)).toBeLessThan(0.2);
    prev = level;
  }
});
