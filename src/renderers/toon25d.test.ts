import { CHARACTERS } from "../characters";
import { rgba } from "../engine/color";
import { restPose, type Pose } from "../engine/pose";
import { createRenderer } from "./renderer";

const log = vi.hoisted(() => [] as string[]);
vi.mock("./items", () => ({ ITEM_SIZE: 1, handShift: () => [0, 0], drawItem: () => void log.push("item") }));

/** Logs each drawing call; fills are logged with the fill style they used. */
function draw(over: Partial<Pose>) {
  log.length = 0;
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop() {} });
      return () => void log.push(key === "fill" ? `fill:${String(target.fillStyle)}` : key);
    },
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = createRenderer("2.5d");
  r.mount(canvas);
  r.resize(200, 170, 1);
  r.draw({ ...restPose(), hands: 0, ...over }, CHARACTERS.grid);
  return [...log];
}

function drawArgs(over: Partial<Pose>) {
  const calls: Array<[string, number[]]> = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop() {} });
      return (...a: number[]) => void calls.push([key, a]);
    },
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = createRenderer("2.5d");
  r.mount(canvas);
  r.resize(200, 170, 1);
  r.draw({ ...restPose(), hands: 0, ...over }, CHARACTERS.grid);
  return calls;
}

const fills = (calls: string[]) => calls.filter((c) => c.startsWith("fill:"));
const handFill = `fill:${rgba(CHARACTERS.grid.base[0], 1)}`;

test("face-on it has a face; from behind it has the back panel instead", () => {
  const front = draw({});
  const back = draw({ turn: Math.PI });
  const scales = (calls: string[]) => calls.filter((c) => c === "scale").length;
  // The body scales once; each eye scales again to squeeze with the turn.
  expect(scales(front)).toBe(scales(back) + 2);
  // The back has 9 dots where the front has two eyes.
  expect(fills(back).length - fills(front).length).toBe(7);
});

test("a hand behind the body is drawn before the body", () => {
  expect(fills(draw({ reach: 0.4 }))[0]).toBe(handFill);
  // Only the reaching hand, out in front: at rest the slab stands a little turned, so one side hand is just behind it.
  const inFront = fills(draw({ reach: 1 }));
  expect(inFront[0]).not.toBe(handFill);
  expect(inFront.slice(1)).toContain(handFill);
});

test("an item behind the body is hidden by it; in front it's drawn over it", () => {
  const behind = draw({ reach: 0.5, item: "pen" });
  expect(behind.indexOf("item")).toBeLessThan(behind.indexOf("clip"));
  const held = draw({ reach: 1, item: "pen" });
  expect(held.indexOf("item")).toBeGreaterThan(held.lastIndexOf("clip"));
});

test("the face polygon follows the soft body's outline point by point", () => {
  const ch = CHARACTERS.grid;
  const R = 170 * 0.3;
  // moveTo 0 and 1 are the silhouette (fill, clip); 2 is the face polygon.
  const faceStart = (over: Partial<Pose>) => drawArgs(over).filter(([k]) => k === "moveTo")[2][1];
  const rest = createRenderer("2.5d").restOutline(ch, restPose());
  const pushed = rest.map(([x, y]) => [x + Math.sign(x) * 0.1, y] as const);
  const plain = faceStart({});
  const bent = faceStart({ body: { outline: pushed, face: [0, 0] } });
  expect(rest[0][0]).not.toBe(0);
  expect(bent[0] - plain[0]).toBeCloseTo(Math.sign(rest[0][0]) * 0.1 * R, 5);
});

test("from behind, each face point stays on the same side as its silhouette point", () => {
  // moveTo 0 and 1 are the silhouette (fill, clip); 2 is the face polygon.
  const starts = drawArgs({ turn: Math.PI - 0.3 }).filter(([k]) => k === "moveTo");
  const sil = starts[0][1];
  const face = starts[2][1];
  expect(sil[0]).not.toBe(0);
  expect(Math.sign(face[0])).toBe(Math.sign(sil[0]));
});

test("2.5d never draws the body flat to the camera: at rest it shows a sliver of side", () => {
  const r = createRenderer("2.5d");
  const width = Math.max(...r.restOutline(CHARACTERS.grid, restPose()).map(([px]) => Math.abs(px)));
  expect(width).toBeGreaterThan(1.01);
});

test("tipped, the slab shows its top or bottom wall as one more band", () => {
  expect(fills(draw({ tip: 0.2 })).length).toBe(fills(draw({})).length + 1);
  expect(fills(draw({ tip: -0.2 })).length).toBe(fills(draw({})).length + 1);
});
