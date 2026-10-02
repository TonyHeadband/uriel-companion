import { bodyFrame, onCharacter } from "./layout";

const pose = (ox = 0, oy = 0, oz = 0, zoom = 1) => ({ ox, oy, oz, zoom });

test("the body sits at the centre of a full-banner canvas, sized by its height", () => {
  expect(bodyFrame(400, 170, pose())).toEqual({ cx: 200, cy: 85 + 0.1 * 51, R: 51 });
  expect(bodyFrame(400, 170, pose(2, 0)).cx).toBe(200 + 2 * 51);
});

test("only points near the character count as touching it", () => {
  const p = pose(1, 0); // centre at x = 251
  expect(onCharacter(251, 90, 400, 170, p)).toBe(true);
  expect(onCharacter(251 + 55, 90, 400, 170, p)).toBe(true);
  expect(onCharacter(40, 90, 400, 170, p)).toBe(false);
  expect(onCharacter(380, 20, 400, 170, p)).toBe(false);
});
