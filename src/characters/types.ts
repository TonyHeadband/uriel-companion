import type { RGB } from "../engine/color";
import type { Pose } from "../engine/pose";
import type { BodyTuning } from "../engine/softbody";
import type { VoiceDef } from "../speech/blip-voice";

export type CharacterId = "grid";

export interface CharacterDef {
  id: CharacterId;
  label: string;
  /** Body colours: [face, shade]. Renderers use the first. */
  base: readonly [RGB, RGB];
  ink: string;
  /** Eye size (w, h) in units of R; spread and y are angles on the head sphere, y > 0 is higher. */
  eye: { w: number; h: number; spread: number; y: number };
  /** Mouth size (w, h) in units of R; y is an angle on the head sphere like the eyes', lower than theirs. */
  mouth: { w: number; h: number; y: number };
  voice: VoiceDef;
  /** How the body wobbles; tunable per character in Customization. */
  body: BodyTuning;
  minBlush: number;
  /** Front-to-back thickness in units of R, for renderers that turn the body; absent is flat. */
  depth?: number;
  /** Glow colour at rest for a lit edge and eyes; blends toward the mood colour as tint rises. */
  neon?: RGB;
  /** Body outline around (0, 0) for body radius R; may move with pose.t. */
  outline(R: number, pose: Pose): Array<readonly [number, number]>;
}
