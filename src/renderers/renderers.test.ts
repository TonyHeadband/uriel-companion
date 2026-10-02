import { CHARACTERS } from "../characters";
import { CharacterEngine } from "../engine/character-engine";
import { mixRGB, rgba } from "../engine/color";
import { restPose, type Pose } from "../engine/pose";
import { ACTIONS, allows } from "../engine/actions";
import { EXPRESSIONS } from "../engine/expressions";
import type { BadgeKind, EyeShape, ActionName } from "../engine/states";
import { VISEMES } from "../speech/timeline";
import { flatReach } from "./flat2d";
import { createRenderer } from "./renderer";

/** A canvas context that accepts every call and counts fills. */
function fakeCanvas() {
  const counts = { fill: 0, stroke: 0 };
  const gradient = { addColorStop() {} };
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => gradient;
      if (key === "measureText") return () => ({ width: 10 });
      return (..._args: unknown[]) => {
        if (key === "fill") counts.fill++;
        if (key === "stroke") counts.stroke++;
      };
    },
    set(target, key: string, value) {
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, counts };
}

test("unknown renderers fall back to 2.5d and say so", () => {
  const warn = vi.fn();
  expect(createRenderer("3d", warn).id).toBe("2.5d");
  expect(warn).toHaveBeenCalledWith(expect.stringContaining("3d"));
  expect(createRenderer("2d", warn).id).toBe("2d");
  expect(createRenderer("2.5d", warn).id).toBe("2.5d");
  expect(warn).toHaveBeenCalledOnce();
});

test.each(Object.values(CHARACTERS))("2d draws $id in every state without throwing", (ch) => {
  for (const state of Object.keys(ACTIONS) as ActionName[]) {
    let t = 0;
    const engine = new CharacterEngine({ now: () => t, random: () => 0.3 });
    engine.claim("task", state);
    const shown = engine.express("love");
    for (let i = 0; i < 40; i++) {
      t += 16;
      engine.update();
    }
    const { canvas, counts } = fakeCanvas();
    const r = createRenderer("2d");
    r.mount(canvas);
    r.resize(180, 170, 2);
    r.draw(engine.update(), ch);
    expect(shown === null).toBe(!allows(ACTIONS[state], "love"));
    expect(counts.fill).toBeGreaterThan(0); // dizzy and sleeping reject love and draw as few as one fill
    expect(canvas.width).toBe(360);
  }
});

test.each(Object.values(CHARACTERS))("2.5d draws $id in every state without throwing", (ch) => {
  for (const state of Object.keys(ACTIONS) as ActionName[]) {
    let t = 0;
    const engine = new CharacterEngine({ now: () => t, random: () => 0.3 });
    engine.claim("task", state);
    const shown = engine.express("love");
    for (let i = 0; i < 40; i++) {
      t += 16;
      engine.update();
    }
    const { canvas, counts } = fakeCanvas();
    const r = createRenderer("2.5d");
    r.mount(canvas);
    r.resize(180, 170, 2);
    r.draw(engine.update(), ch);
    expect(shown === null).toBe(!allows(ACTIONS[state], "love"));
    expect(counts.fill).toBeGreaterThan(0); // dizzy and sleeping reject love and draw as few as one fill
    expect(canvas.width).toBe(360);
  }
});

function drawWorking(moodOpacity?: number) {
  const stops: Array<[number, string]> = [];
  const gradient = { addColorStop: (o: number, c: string) => stops.push([o, c]) };
  const linear: number[][] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createLinearGradient") return (...a: number[]) => (linear.push(a), gradient);
      if (key === "createRadialGradient") return () => ({ addColorStop() {} });
      return () => {};
    },
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  let t = 0;
  const engine = new CharacterEngine({ now: () => t, random: () => 0.3 });
  engine.claim("task", "working");
  for (; t < 3000; t += 16) engine.update();
  const r = createRenderer("2d");
  if (moodOpacity !== undefined) r.moodOpacity = moodOpacity;
  r.mount(canvas);
  r.resize(170, 170, 1);
  r.draw(engine.update(), CHARACTERS.grid);
  const alpha = (c: string) => Number(c.match(/,([\d.]+)\)$/)![1]);
  return { linear, bottom: alpha(stops[0][1]), top: alpha(stops.at(-1)![1]) };
}

test("the mood fills the body softly from below, fading out toward the top", () => {
  const { linear, bottom, top } = drawWorking();
  expect(linear).toHaveLength(1);
  const [, y0, , y1] = linear[0];
  expect(y0).toBeGreaterThan(y1); // starts at the bottom, runs upward
  expect(bottom).toBeGreaterThan(0.5);
  expect(top).toBe(0);
});

test("mood opacity sets the fill's strength at the bottom, 0 to 1", () => {
  expect(drawWorking(1).bottom).toBeCloseTo(0.72 / 0.78, 2); // working is a busy state, near full strength
  expect(drawWorking(0.5).bottom).toBeCloseTo((0.5 * 0.72) / 0.78, 2);
  expect(drawWorking(0).bottom).toBe(0);
});

/** Records which drawing calls were made and the stroke style each stroke used. */
function recordingCanvas(id = "2d") {
  const calls: string[] = [];
  const strokes: string[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop() {} });
      return () => {
        calls.push(key);
        if (key === "stroke") strokes.push(String(target.strokeStyle));
      };
    },
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = createRenderer(id);
  r.mount(canvas);
  r.resize(200, 170, 1);
  return { r, calls, strokes };
}

const EYES: EyeShape[] = [...new Set([...Object.values(ACTIONS).map((a) => a.face.eye), ...Object.values(EXPRESSIONS).flatMap((x) => (x.eye ? [x.eye] : []))])];
const BADGES: Array<BadgeKind | null> = [null, "dots", "bang", "question", "dot"];

test.each(["2d", "2.5d"])("grid draws no circles on %s: every eye, badge, hand and blush is square", (id) => {
  const { r, calls } = recordingCanvas(id);
  for (const eyeShape of EYES) {
    for (const badge of BADGES) {
      const pose: Pose = { ...restPose(), eyeShape, badge, badgeScale: 1, hands: 1, waving: true, blush: 1, t: 0.4 };
      r.draw(pose, CHARACTERS.grid);
    }
  }
  for (const item of ["lens", "pen", "stamp"] as const) r.draw({ ...restPose(), reach: 1, item }, CHARACTERS.grid);
  r.draw({ ...restPose(), turn: Math.PI }, CHARACTERS.grid);
  r.draw({ ...restPose(), turn: Math.PI / 4, hands: 1 }, CHARACTERS.grid);
  for (const curve of ["arc", "ellipse", "bezierCurveTo", "quadraticCurveTo"]) expect(calls).not.toContain(curve);
  expect(calls.filter((c) => c === "fill").length).toBeGreaterThan(EYES.length * BADGES.length * 2);
});

test("grid's particles are pixel art, not curves", () => {
  const { r, calls } = recordingCanvas();
  const kinds = ["heart", "star", "spark"] as const;
  const particles = kinds.map((kind) => ({ kind, x: 0, y: 0, vx: 0, vy: 0, age: 0.3, life: 1, rot: 0, size: 0.1 }));
  r.draw({ ...restPose(), particles }, CHARACTERS.grid);
  expect(calls).not.toContain("bezierCurveTo");
  expect(calls.filter((c) => c === "rect").length).toBeGreaterThan(kinds.length * 4);
});

test("grid's neon edge is cyan at rest and takes the mood colour when busy", () => {
  const edge = (pose: Pose) => {
    const { r, strokes } = recordingCanvas();
    r.draw(pose, CHARACTERS.grid);
    return strokes.at(-1); // the edge goes on last, over the mood fill
  };
  expect(edge(restPose())).toBe(rgba(CHARACTERS.grid.neon!, 1));
  const busy = { ...restPose(), color: ACTIONS.working.color, tint: ACTIONS.working.tint };
  expect(edge(busy)).toBe(rgba(mixRGB(CHARACTERS.grid.neon!, ACTIONS.working.color, ACTIONS.working.tint), 1));
});
test.each(Object.values(CHARACTERS))("2d draws every mouth shape for $id", (ch) => {
  for (const viseme of VISEMES) {
    const { r, calls } = recordingCanvas();
    r.draw({ ...restPose() }, ch);
    const without = calls.filter((c) => c === "fill").length;
    calls.length = 0;
    r.draw({ ...restPose(), mouth: { viseme, open: 0.7, alpha: 1 } }, ch);
    expect(calls.filter((c) => c === "fill").length).toBeGreaterThan(without);
  }
});

test("grid's mouth has no circles in any shape", () => {
  const { r, calls } = recordingCanvas();
  for (const viseme of VISEMES) r.draw({ ...restPose(), mouth: { viseme, open: 1, alpha: 1 } }, CHARACTERS.grid);
  expect(calls).not.toContain("arc");
  expect(calls).not.toContain("ellipse");
});

/** Records each call with its arguments. */
function argsCanvas() {
  const calls: Array<[string, number[]]> = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(target, key: string) {
      if (key in target) return target[key];
      if (key === "createRadialGradient" || key === "createLinearGradient") return () => ({ addColorStop() {} });
      return (...args: number[]) => calls.push([key, args]);
    },
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  const r = createRenderer("2d");
  r.mount(canvas);
  r.resize(200, 170, 1);
  return { r, calls, R: 170 * 0.3 };
}

test("2d draws the soft body's outline and moves the face with it", () => {
  const { r, calls, R } = argsCanvas();
  const outline = Array.from({ length: 40 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    return [0.9 * Math.cos(a), 0.9 * Math.sin(a)] as const;
  });
  r.draw({ ...restPose(), body: { outline, face: [0.1, -0.05] } }, CHARACTERS.grid);
  const firstMove = calls.find(([k]) => k === "moveTo")!;
  expect(firstMove[1][0]).toBeCloseTo(0.9 * R, 5);
  expect(firstMove[1][1]).toBeCloseTo(0, 5);
  expect(calls.some(([k, a]) => k === "translate" && Math.abs(a[0] - 0.1 * R) < 1e-6 && Math.abs(a[1] + 0.05 * R) < 1e-6)).toBe(true);
});

test("2d's hand shrinks away on the way back and grows in front holding the item", () => {
  expect(flatReach(0)).toEqual({ side: 1, front: 0 });
  expect(flatReach(0.4).side).toBe(0);
  expect(flatReach(0.5)).toEqual({ side: 0, front: 0 });
  expect(flatReach(1)).toEqual({ side: 0, front: 1 });
});

test("2d draws the turn as the face sweeping across", () => {
  const eyeX = (turn: number) => {
    const { r, calls } = argsCanvas();
    r.draw({ ...restPose(), turn }, CHARACTERS.grid);
    return calls.filter(([k]) => k === "translate").map(([, a]) => a[0]);
  };
  expect(eyeX(0.5)).not.toEqual(eyeX(0));
});

test("2d draws the tip as the face moving down the head", () => {
  const eyeY = (tip: number) => {
    const { r, calls } = argsCanvas();
    r.draw({ ...restPose(), tip }, CHARACTERS.grid);
    return calls.filter(([k]) => k === "translate").map(([, a]) => a[1]);
  };
  expect(eyeY(0.25)).not.toEqual(eyeY(0));
});
