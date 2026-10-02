import { restPose } from "../engine/pose";
import { CHARACTERS, characterFor } from "./index";

const R = 100;

test.each(Object.values(CHARACTERS))("$id outline is a closed shape within bounds", (ch) => {
  const pts = ch.outline(R, restPose());
  expect(pts.length).toBeGreaterThanOrEqual(32);
  for (const [x, y] of pts) {
    expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
    expect(Math.abs(x)).toBeLessThanOrEqual(1.6 * R);
    expect(Math.abs(y)).toBeLessThanOrEqual(1.6 * R);
  }
});

test("grid is a rounded square, not a circle", () => {
  const pts = CHARACTERS.grid.outline(R, restPose());
  // A circle's corner reach is about 0.71 R; a rounded square reaches well into the corners.
  const cornerReach = Math.max(...pts.map(([x, y]) => Math.min(Math.abs(x), Math.abs(y))));
  expect(cornerReach).toBeGreaterThan(0.85 * R);
});

test("unknown ids fall back to the grid", () => {
  expect(characterFor("dragon").id).toBe("grid");
});

test.each(Object.values(CHARACTERS))("$id has a mouth below its eyes and its own voice", (ch) => {
  expect(ch.mouth.y).toBeLessThan(ch.eye.y);
  expect(ch.voice.base).toBeGreaterThan(200);
});

test("each character has a body feel", () => {
  for (const ch of Object.values(CHARACTERS)) {
    expect(ch.body.settle).toBeGreaterThan(0);
    expect(ch.body.settle).toBeLessThanOrEqual(1);
  }
});
