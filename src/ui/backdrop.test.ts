import { seeded } from "../engine/random";
import { fieldAlpha, fieldSize, Ripples, seedBlobs, stepBlobs, type Blob } from "./backdrop";

const ASPECT = 400 / 170;

test("four blobs start inside the banner with the spec's sizes and speeds", () => {
  const blobs = seedBlobs(seeded(3), ASPECT);
  expect(blobs).toHaveLength(4);
  for (const b of blobs) {
    expect(b.r).toBeGreaterThanOrEqual(0.18);
    expect(b.r).toBeLessThanOrEqual(0.28);
    expect(Math.hypot(b.vx, b.vy)).toBeGreaterThanOrEqual(0.02 - 1e-9);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThanOrEqual(0.05 + 1e-9);
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(ASPECT);
  }
});

test("the field is opaque inside a blob and clear far away", () => {
  const blob: Blob = { x: 1, y: 0.5, vx: 0, vy: 0, r: 0.2 };
  expect(fieldAlpha([blob], 1, 0.5)).toBe(1);
  expect(fieldAlpha([blob], 2, 0.5)).toBe(0);
});

test("blobs bounce and stay inside the banner", () => {
  const blobs = seedBlobs(seeded(5), ASPECT);
  for (let i = 0; i < 20_000; i++) stepBlobs(blobs, 0.05, ASPECT);
  for (const b of blobs) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.x).toBeLessThanOrEqual(ASPECT);
    expect(b.y).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeLessThanOrEqual(1);
  }
});

test("the character pushes only nearby blobs", () => {
  const near: Blob = { x: 0.5, y: 0.5, vx: 0, vy: 0, r: 0.2 };
  const far: Blob = { x: 2.2, y: 0.5, vx: 0, vy: 0, r: 0.2 };
  stepBlobs([near, far], 0.016, ASPECT, { x: 0.5, y: 0.5, vx: 1, vy: 0 });
  expect(near.vx).toBeGreaterThan(0);
  expect(far.vx).toBe(0);
});

test("a blob behind a moving character is pushed away from it, not dragged along after it", () => {
  const behind: Blob = { x: 0.7, y: 0.5, vx: 0, vy: 0, r: 0.2 };
  const ahead: Blob = { x: 1.3, y: 0.5, vx: 0, vy: 0, r: 0.2 };
  const beside: Blob = { x: 1, y: 0.8, vx: 0, vy: 0, r: 0.2 };
  stepBlobs([behind, ahead, beside], 0.016, ASPECT, { x: 1, y: 0.5, vx: 1, vy: 0 });
  expect(behind.vx).toBeLessThan(0);
  expect(ahead.vx).toBeGreaterThan(0);
  // Passing by, it parts them sideways.
  expect(beside.vy).toBeGreaterThan(0);
});

test("a ripple spreads and dies out", () => {
  const r = new Ripples();
  r.drop(0.2, 0.5, 1);
  r.step();
  expect(r.peak()).toBeGreaterThan(0.1);
  for (let i = 0; i < 1500; i++) r.step();
  expect(r.peak()).toBeLessThan(0.01);
});

test("fast speech (a drop every frame) stays bounded", () => {
  const r = new Ripples();
  for (let i = 0; i < 2000; i++) {
    if (i % 4 === 0) r.drop(0.2, 0.5, 0.35);
    r.step();
  }
  expect(Number.isFinite(r.peak())).toBe(true);
  expect(r.peak()).toBeLessThan(20);
});

test("the pixel field is a quarter size, and never zero even for a collapsed stage", () => {
  expect(fieldSize(400, 170)).toEqual({ w: 100, h: 43 });
  expect(fieldSize(0, 0)).toEqual({ w: 1, h: 1 });
});

test("blobs can be round or rounded squares: only a square reaches into the corner", () => {
  const blob: Blob = { x: 1, y: 0.5, vx: 0, vy: 0, r: 0.2 };
  // 0.85 r along both axes is outside a circle of radius r (1.2 r away) but inside a rounded square.
  const corner = [1 + 0.85 * 0.2, 0.5 + 0.85 * 0.2] as const;
  expect(fieldAlpha([blob], ...corner, "square")).toBeGreaterThan(0.3);
  expect(fieldAlpha([blob], ...corner, "round")).toBe(0);
  expect(fieldAlpha([blob], ...corner)).toBe(0); // round by default
});
