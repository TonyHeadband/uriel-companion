import type { CharacterId } from "../characters";
import type { AppConfig } from "../config";
import type { BodyTuning } from "../engine/softbody";
import type { ActionName, ExpressionName } from "../engine/states";
import type { Mood, ScenarioKind } from "../debug/scenarios";
import type { LongMode } from "../speech/blip-speech";
import type { BlobShape } from "../ui/backdrop";
import type { FontSize } from "../ui/settings";

export const EVENTS = {
  ready: "settings:ready",
  snapshot: "settings:snapshot",
  command: "settings:command",
  /** The settings window gained (true) or lost (false) focus, so the main window can keep its full frame rate. */
  focus: "settings:focus",
} as const;

/** What the settings window needs to draw its controls. */
export interface Snapshot {
  config: AppConfig;
  /** The current character's resolved body feel (its defaults plus the person's overrides). */
  body: BodyTuning;
}

/** One control change or live action, sent from the settings window to the main window. */
export type Command =
  | { type: "state"; state: ActionName }
  | { type: "express"; name: ExpressionName }
  | { type: "mood"; mood: Mood }
  | { type: "gesture"; gesture: "greet" | "blink" | "squash" }
  | { type: "character"; id: CharacterId }
  | { type: "renderer"; id: string }
  | { type: "simulate"; kind: ScenarioKind }
  | { type: "speak"; text: string }
  | { type: "body"; patch: Partial<BodyTuning> }
  | { type: "resetBody" }
  | { type: "backdrop"; on: boolean }
  | { type: "backdropOpacity"; value: number }
  | { type: "backdropShape"; shape: BlobShape }
  | { type: "liveliness"; value: number }
  | { type: "moodOpacity"; value: number }
  | { type: "volume"; value: number }
  | { type: "fontSize"; size: FontSize }
  | { type: "soundOn"; on: boolean }
  | { type: "voiceOn"; on: boolean }
  | { type: "longReplies"; mode: LongMode }
  | { type: "showFps"; on: boolean }
  | { type: "sleepAfter"; min: number }
  | { type: "pastime"; name: ActionName | null }
  | { type: "scenes"; on: boolean };
