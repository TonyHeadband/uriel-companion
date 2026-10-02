import type { CharacterDef } from "../characters";
import type { Pose } from "../engine/pose";
import { Flat2D } from "./flat2d";
import { Toon25D } from "./toon25d";

export type RendererId = "2d" | "2.5d" | "3d";

export interface Renderer {
  readonly id: RendererId;
  /** Strength (0–1) of the mood colour filling the body, at full for the busiest states. */
  moodOpacity: number;
  mount(canvas: HTMLCanvasElement): void;
  resize(cssWidth: number, cssHeight: number, dpr: number): void;
  /** The body outline at rest for this pose, in units of R: what the soft body deforms. */
  restOutline(ch: CharacterDef, pose: Pose): Array<readonly [number, number]>;
  draw(pose: Pose, character: CharacterDef): void;
  dispose(): void;
}

/** 2d and 2.5d exist; 3d isn't built yet and falls back to 2.5d. */
export function createRenderer(id: string, warn: (msg: string) => void = console.warn): Renderer {
  if (id === "2d") return new Flat2D();
  if (id !== "2.5d") warn(`renderer "${id}" isn't built yet; using 2.5d`);
  return new Toon25D();
}
