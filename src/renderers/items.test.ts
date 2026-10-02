import type { ItemKind } from "../engine/pose";
import { drawItem, handShift } from "./items";

function recordingCanvas() {
  const nums: number[] = [];
  const ctx = new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => (key in target ? target[key] : (...a: unknown[]) => void nums.push(...a.filter((v): v is number => typeof v === "number"))),
    set: (target, key: string, value) => ((target[key] = value), true),
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, nums };
}

test.each<ItemKind>(["lens", "pen", "stamp", "book", "mug", "can"])("draws a %s with finite geometry", (kind) => {
  for (const use of [0, 0.5, 1]) {
    const { ctx, nums } = recordingCanvas();
    drawItem(ctx, kind, 100, 80, 50, "#fff", [80, 120, 255], use, 3.2);
    expect(nums.length).toBeGreaterThan(10);
    expect(nums.every(Number.isFinite)).toBe(true);
  }
});

test("a sip brings the mug in to the mouth, never up over the eyes; a lens stays at the hand", () => {
  const [dx, dy] = handShift("mug", 1, 0, 0);
  // The hand rests 0.95 R out and 0.4 R below centre, level with the mouth; the eyes are at centre height.
  expect(0.95 + dx).toBeLessThan(0.4);
  expect(0.4 + dy).toBeGreaterThanOrEqual(0.4);
  expect(Math.hypot(...handShift("mug", 0, 0, 0))).toBe(0);
  expect(handShift("lens", 1, 0, 0)).toEqual([0, 0]);
  expect(handShift(null, 1, 0, 0)).toEqual([0, 0]);
});

test("a book is held low and in front, below the eyes; the can up over what it waters", () => {
  const [bx, by] = handShift("book", 0, 0, 0);
  expect(bx).toBeLessThan(0);
  expect(by).toBeGreaterThan(0);
  expect(handShift("can", 0, 0, 0)[1]).toBeLessThan(-0.6);
});

test("writing moves the hand only while scribbling", () => {
  expect(handShift("pen", 0, 0, 1.3)).toEqual([0, 0]);
  expect(handShift("pen", 0, 1, 1.3)).not.toEqual([0, 0]);
});

test("draws nothing at size 0", () => {
  const { ctx, nums } = recordingCanvas();
  drawItem(ctx, "lens", 100, 80, 0, "#fff", [80, 120, 255]);
  expect(nums).toEqual([]);
});
