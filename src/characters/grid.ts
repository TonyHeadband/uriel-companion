import { hex } from "../engine/color";
import type { CharacterDef } from "./types";

export function superellipse(rx: number, ry: number, n: number, steps: number): Array<readonly [number, number]> {
  const pts: Array<readonly [number, number]> = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pts.push([rx * Math.sign(c) * Math.abs(c) ** (2 / n), ry * Math.sign(s) * Math.abs(s) ** (2 / n)]);
  }
  return pts;
}

export const grid: CharacterDef = {
  id: "grid",
  label: "Grid",
  base: [hex("#0B1220"), hex("#05080F")],
  ink: "#3DF2FF",
  neon: hex("#3DF2FF"),
  eye: { w: 0.26, h: 0.3, spread: 0.36, y: -0.02 },
  mouth: { w: 0.36, h: 0.22, y: -0.42 },
  voice: { base: 480, wave: "square" },
  body: { firmness: 12, settle: 0.8, sway: 0.1, bump: 0.15 },
  minBlush: 0,
  depth: 0.6,
  outline: (R) => superellipse(R, R * 0.95, 8, 96),
};
