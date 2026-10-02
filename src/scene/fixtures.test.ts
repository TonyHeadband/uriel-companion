import { FIXTURES } from "./fixtures";

test("the armchair's seat, between its arms, is as wide as the character (2 R)", () => {
  const [left, right] = [...FIXTURES.armchairArms.boxes].sort((a, b) => a.x - b.x);
  const between = right.x - right.w / 2 - (left.x + left.w / 2);
  expect(between).toBeGreaterThanOrEqual(2.1);
  const seat = FIXTURES.armchair.boxes.find((b) => b.role === "cushion" && b.h < 1)!;
  expect(seat.w).toBeGreaterThanOrEqual(2.1);
});

test("the plant's pot sits low, on a short stand", () => {
  const pot = FIXTURES.plantStand.boxes.find((b) => b.role === "pot")!;
  expect(pot.y0).toBeLessThanOrEqual(0.3);
});
