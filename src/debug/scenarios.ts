import type { Link } from "../api/link";
import type { CharacterEngine } from "../engine/character-engine";
import type { Presence } from "../engine/presence";
import type { Touch } from "../engine/touch";

export type ScenarioKind = "ok" | "error" | "nap" | "sleepy" | "pokes" | "away" | "flavours" | "confused";
export type TurnKind = "ok" | "error" | "flavours" | "confused";
export type Mood = "tired" | "happy" | null;

/** What a scenario drives: the real controller, touch and presence, as the main window wires them. */
export interface ScenarioDeps {
  /** Plays a scripted turn as if the person had sent it; resolves when the turn is over. */
  turn(kind: TurnKind): Promise<void>;
  doze(): void;
  mood(m: Mood): void;
  poke(): void;
  later(ms: number, fn: () => void): void;
  /** The agent stops answering, as a failed chat stream would report it; linkUp brings it back. */
  linkDown(): void;
  linkUp(): void;
}

/** Builds the deps from the live pieces; a scenario's turn counts as the person sending, as a real send does. */
export function scenarioDeps(p: {
  engine: Pick<CharacterEngine, "setBaseline">;
  presence: Pick<Presence, "activity" | "doze">;
  touch: Pick<Touch, "click">;
  link: Pick<Link, "reportDown" | "reportUp">;
  startTurn: (kind: TurnKind) => Promise<void>;
}): ScenarioDeps {
  return {
    turn: (kind) => {
      p.presence.activity();
      return p.startTurn(kind);
    },
    doze: () => p.presence.doze(),
    mood: (m) => p.engine.setBaseline(m),
    poke: () => p.touch.click(),
    later: (ms, fn) => void setTimeout(fn, ms),
    linkDown: () => p.link.reportDown(),
    linkUp: () => p.link.reportUp(),
  };
}

export const SCENARIOS: ReadonlyArray<readonly [ScenarioKind, string]> = [
  ["ok", "turn"],
  ["error", "failing turn"],
  ["nap", "nap"],
  ["sleepy", "sleepy turn"],
  ["pokes", "pokes in a turn"],
  ["away", "away and back"],
  ["flavours", "tool flavours"],
  ["confused", "confused"],
];

// Long enough for the yawn to end in sleep (YAWN_TO_SLEEP_MS), so the turn visibly wakes it.
const ASLEEP_MS = 1500;
// OK_TURN searches from 4 s to 10 s.
const MID_SEARCH_MS = 5500;
const AWAY_MS = 4000;

/** Debug scenarios for the state engine's combinations: an action with a mood over it, layers taking over each other. */
export function runScenario(kind: ScenarioKind, d: ScenarioDeps): void {
  switch (kind) {
    case "ok":
    case "error":
    case "flavours":
    case "confused":
      void d.turn(kind);
      return;
    case "nap":
      d.doze();
      return;
    case "sleepy":
      d.doze();
      d.mood("tired");
      d.later(ASLEEP_MS, () => void d.turn("ok").then(() => d.mood(null)));
      return;
    case "away":
      d.linkDown();
      d.later(AWAY_MS, () => d.linkUp());
      return;
    case "pokes":
      void d.turn("ok");
      d.later(MID_SEARCH_MS, () => {
        d.poke();
        d.poke();
        d.poke();
      });
      return;
  }
}
