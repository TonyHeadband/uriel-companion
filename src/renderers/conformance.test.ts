import { CHARACTERS } from "../characters";
import { restPose, type Pose } from "../engine/pose";
import { thing } from "../engine/things";
import { createRenderer } from "./renderer";

const drawn = vi.hoisted(() => ({ items: [] as string[] }));
vi.mock("./items", () => ({ ITEM_SIZE: 1, handShift: () => [0, 0], drawItem: (_x: unknown, kind: string) => void drawn.items.push(kind) }));

// Every pose field, at the values that stress a renderer. Adding a pose field means adding rows here.
const POSES: ReadonlyArray<readonly [string, Partial<Pose>]> = [
  ["rest", {}],
  ["turn π/4", { turn: Math.PI / 4 }],
  ["turn π/2", { turn: Math.PI / 2 }],
  ["turn π", { turn: Math.PI }],
  ["mid-spin", { turn: 5 }],
  ["tipped forward", { tip: 0.25 }],
  ["turned and tipped back", { turn: 0.5, tip: -0.25 }],
  ["reach 0.4", { reach: 0.4, item: "pen" }],
  ["reach 1 lens", { reach: 1, item: "lens" }],
  ["reach 1 pen", { reach: 1, item: "pen" }],
  ["reach 1 stamp", { reach: 1, item: "stamp" }],
  ["reach 1 empty", { reach: 1, item: null }],
  ["reach 1 book mid-turn", { reach: 1, item: "book", use: 0.5 }],
  ["reach 1 mug sipping", { reach: 1, item: "mug", use: 1 }],
  ["reach 1 can pouring", { reach: 1, item: "can", use: 1 }],
  ["away", { ox: 6 }],
  ["zoomed out, no scene", { zoom: 0.55 }],
  ["library rising", { zoom: 0.55, scene: { id: "library", show: 0.5 } }],
  ["browsing a shelf, back turned", { zoom: 0.55, ox: -2.5, oz: -0.1, turn: Math.PI, reach: 1, item: "lens", scene: { id: "library", show: 1 } }],
  ["writing behind the desk", { zoom: 0.6, oz: -1.3, oy: -0.7, ground: -0.7, reach: 1, item: "pen", scribble: 1, scene: { id: "study", show: 1 } }],
  ["behind the desk", { zoom: 0.6, ox: -0.5, oz: -1.4, scene: { id: "study", show: 1 } }],
  ["scene overshooting as it rises", { zoom: 0.6, scene: { id: "study", show: 1.08 } }],
  ["in bed", { zoom: 0.6, oz: -1.35, oy: -0.45, ground: -0.45, scene: { id: "bedroom", show: 1 } }],
  ["ball resting on the pitch", { zoom: 0.55, scene: { id: "pitch", show: 1 }, things: [thing("b", "ball", { x: 0, z: 0.3 })] }],
  ["ball spinning", { zoom: 0.55, scene: { id: "pitch", show: 1 }, things: [thing("b", "ball", { x: 1, z: 0 }, { spin: 7.3 })] }],
  ["ball in the air", { zoom: 0.55, scene: { id: "pitch", show: 1 }, things: [thing("b", "ball", { x: 0, z: -0.5 }, { y: -0.6 })] }],
  ["ball in the net, billowing it", { zoom: 0.55, turn: Math.PI, scene: { id: "pitch", show: 1 }, things: [thing("b", "ball", { x: 0.3, z: -2.08 })] }],
  ...[0, 0.25, 0.5, 0.75].map((phase): readonly [string, Partial<Pose>] => [
    `rope at phase ${phase}`,
    { zoom: 0.6, hands: 1, scene: { id: "yard", show: 1 }, things: [thing("r", "rope", { x: 0, z: 0 }, { held: true, phase })] },
  ]),
];
const RENDERERS = ["2d", "2.5d"];

function pointsCanvas() {
  const pts: number[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop() {} });
      return (...a: number[]) => {
        if (key === "moveTo" || key === "lineTo" || key === "translate") pts.push(...a);
      };
    },
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, pts };
}

describe.each(RENDERERS)("the %s renderer", (id) => {
  test.each(POSES)("draws %s", (name, over) => {
    const { canvas, pts } = pointsCanvas();
    const r = createRenderer(id);
    r.mount(canvas);
    r.resize(200, 170, 1);
    drawn.items.length = 0;
    const pose: Pose = { ...restPose(), hands: 0, ...over };
    expect(() => r.draw(pose, CHARACTERS.grid)).not.toThrow();
    expect(pts.every(Number.isFinite)).toBe(true);
    if (name !== "away") {
      // The body's rest outline stays inside the banner's box around the centre.
      for (const [px, py] of r.restOutline(CHARACTERS.grid, pose)) {
        expect(Math.abs(px)).toBeLessThanOrEqual(1.3);
        expect(Math.abs(py)).toBeLessThanOrEqual(1);
      }
    }
    expect(drawn.items).toEqual(pose.reach >= 0.7 && pose.item ? [pose.item] : []);
  });
});
