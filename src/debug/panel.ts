import { CHARACTERS, type CharacterId } from "../characters";
import type { CharacterEngine } from "../engine/character-engine";
import type { BodyTuning } from "../engine/softbody";
import type { BlobShape } from "../ui/backdrop";
import { ACTIONS } from "../engine/actions";
import { EXPRESSIONS } from "../engine/expressions";
import type { ExpressionName, ActionName } from "../engine/states";
import { S } from "../strings";
import type { SpeechBackend } from "../speech/backend";
import { h } from "../ui/dom";
import { SCENARIOS, type Mood, type ScenarioKind } from "./scenarios";
import { section } from "../ui/section";

/** The engine calls the controls make; the settings window forwards them instead of owning an engine. */
export interface EnginePoke {
  /** Shows an action over everything else; idle hands the character back to whoever else holds it. */
  force(action: ActionName): void;
  express(name: ExpressionName): void;
  /** The baseline mood under every action; null for none. */
  mood(m: Mood): void;
  greet(): void;
  blink(): void;
  squash(): void;
}

/** The controls' engine calls, made on a real engine: forced actions take the task layer. */
export function pokeEngine(
  e: Pick<CharacterEngine, "claim" | "release" | "express" | "setBaseline" | "greet" | "blink" | "squash">,
): EnginePoke {
  return {
    force: (action) => (action === "idle" ? e.release("task") : void e.claim("task", action, { restart: true })),
    express: (name) => void e.express(name),
    mood: (m) => e.setBaseline(m),
    greet: () => e.greet(),
    blink: () => e.blink(),
    squash: () => e.squash(),
  };
}

export interface CustomizationTab {
  el: HTMLElement;
  /** Re-reads the current character's body feel, after a switch or reset made elsewhere. */
  syncBody: () => void;
}

export interface DebugDeps {
  engine: EnginePoke;
  setCharacter: (id: CharacterId) => void;
  setRenderer: (id: string) => void;
  simulate: (kind: ScenarioKind) => void;
  moodOpacity: number;
  setMoodOpacity: (v: number) => void;
  speak: (text: string) => void;
  getBody: () => BodyTuning;
  setBody: (p: Partial<BodyTuning>) => void;
  resetBody: () => void;
  backdrop: { enabled: boolean; opacity: number; shape: BlobShape };
  setBackdrop: (on: boolean) => void;
  setBackdropOpacity: (v: number) => void;
  setBackdropShape: (shape: BlobShape) => void;
  liveliness: number;
  setLiveliness: (v: number) => void;
  /** Starts that pastime now, or any one for null, the way the scheduler would. */
  pastime: (name: ActionName | null) => void;
  scenes: boolean;
  setScenes: (on: boolean) => void;
}

/** Sample lines for tuning the mouth and voice by eye and ear. */
export const SPEAK_SAMPLES: ReadonlyArray<readonly [string, string]> = [
  ["hello", "Hello! I'm Uriel. How can I help you today?"],
  ["question", "Do you want me to file the form for you?"],
  ["italiano", "Ciao! Oggi è una bella giornata, vero?"],
  [
    "long",
    "I found three forms that match. The first one is the passport renewal, which needs a photo and your old passport. " +
      "The second is the change of address, and the third is the library card. Shall I start with the passport?",
  ],
];

/**
 * Speaks a line outside a chat turn, showing it in the status strip, then settles back to idle. If something else
 * took over (a real turn), the ticker and the state are left to it.
 */
export function sayLine(
  text: string,
  speech: SpeechBackend,
  engine: Pick<CharacterEngine, "claim" | "release">,
  ticker: { add(line: string): void; clear(): void },
): void {
  ticker.clear();
  ticker.add(text);
  // restart: a plain claim returns a running turn's own token, and releasing it would end that turn's claim.
  const tok = engine.claim("task", "talking", { restart: true });
  speech.push(text);
  speech.end();
  void speech.drained().then((natural) => {
    if (!natural) return;
    ticker.clear();
    engine.release("task", tok);
  });
}

function group(title: string, buttons: Array<[string, () => void]>): HTMLElement {
  const row = h("div", { class: "btns" });
  for (const [label, run] of buttons) {
    const b = h("button", { class: "btn", type: "button", text: label });
    b.addEventListener("click", run);
    row.append(b);
  }
  return h("div", {}, h("h2", { text: title }), row);
}

function slider(
  label: string, min: number, max: number, step: number, value: number, onInput: (v: number) => void,
): { el: HTMLElement; set(v: number): void } {
  const fmt = (v: number) => (step < 1 ? v.toFixed(2) : String(v));
  const shown = h("span", { text: fmt(value) });
  const input = h("input", { type: "range", min: String(min), max: String(max), step: String(step), "aria-label": label });
  input.value = String(value);
  input.addEventListener("input", () => {
    const v = Number(input.value);
    shown.textContent = fmt(v);
    onInput(v);
  });
  const set = (v: number) => {
    input.value = String(v);
    shown.textContent = fmt(v);
  };
  return { el: h("div", {}, h("h2", {}, `${label} `, shown), input), set };
}

function moodSlider(d: DebugDeps): HTMLElement {
  return slider(S.stateOpacity, 0, 1, 0.05, d.moodOpacity, d.setMoodOpacity).el;
}

/** The current character's body feel; Reset goes back to its defaults, refresh() re-reads after a character switch. */
function bodySection(d: DebugDeps): { el: HTMLElement; refresh(): void } {
  const t = d.getBody();
  const sliders = {
    firmness: slider(S.firmness, 1, 15, 0.5, t.firmness, (v) => d.setBody({ firmness: v })),
    settle: slider(S.settle, 0, 1, 0.05, t.settle, (v) => d.setBody({ settle: v })),
    sway: slider(S.sway, 0, 1, 0.05, t.sway, (v) => d.setBody({ sway: v })),
    bump: slider(S.bump, 0, 1, 0.05, t.bump, (v) => d.setBody({ bump: v })),
  };
  const refresh = () => {
    const now = d.getBody();
    for (const key of Object.keys(sliders) as Array<keyof BodyTuning>) sliders[key].set(now[key]);
  };
  const reset = h("button", { class: "btn", type: "button", text: S.reset });
  reset.addEventListener("click", () => {
    d.resetBody();
    refresh();
  });
  const el = h("div", {}, h("h2", { text: S.body }), ...Object.values(sliders).map((s) => s.el), h("div", { class: "btns" }, reset));
  return { el, refresh };
}

/** An on/off button that starts at `on` and reports each flip. */
function onOff(on: boolean, set: (on: boolean) => void): HTMLButtonElement {
  const toggle = h("button", { class: "btn", type: "button" });
  const render = () => {
    toggle.textContent = on ? S.on : S.off;
    toggle.setAttribute("aria-pressed", String(on));
  };
  render();
  toggle.addEventListener("click", () => {
    on = !on;
    render();
    set(on);
  });
  return toggle;
}

/** Furniture for search, work and sleep, and idle pastimes; off is lighter on slower machines. */
function scenesSection(d: DebugDeps): HTMLElement {
  return h("div", {}, h("h2", { text: S.scenes }), h("div", { class: "btns" }, onOff(d.scenes, d.setScenes)));
}

function backgroundSection(d: DebugDeps): HTMLElement {
  const toggle = onOff(d.backdrop.enabled, d.setBackdrop);
  const opacity = slider(S.opacity, 0, 1, 0.05, d.backdrop.opacity, d.setBackdropOpacity);
  const shapes = (["round", "square"] as const).map((shape) => {
    const b = h("button", { class: "btn", type: "button", text: shape === "round" ? S.round : S.square });
    b.setAttribute("aria-pressed", String(shape === d.backdrop.shape));
    b.addEventListener("click", () => {
      for (const other of shapes) other.setAttribute("aria-pressed", String(other === b));
      d.setBackdropShape(shape);
    });
    return b;
  });
  return h("div", {}, h("h2", { text: S.background }), h("div", { class: "btns" }, toggle, ...shapes), opacity.el);
}

/** The Customization page: force any state, emote, character or renderer; play a fake turn. */
export function customizationTab(d: DebugDeps): CustomizationTab {
  const body = bodySection(d);
  const el = h(
    "div",
    {},
    section(
      S.secBehavior, true,
      group("State", (Object.keys(ACTIONS) as ActionName[]).filter((s) => !ACTIONS[s].pastime).map((s) => [s, () => d.engine.force(s)])),
      moodSlider(d),
      slider(S.liveliness, 0, 1, 0.05, d.liveliness, d.setLiveliness).el,
      group("Emote", (Object.keys(EXPRESSIONS) as ExpressionName[]).map((e) => [e, () => d.engine.express(e)])),
      group(S.idleActivities, [
        ...(Object.keys(ACTIONS) as ActionName[]).filter((s) => ACTIONS[s].pastime).map((s): [string, () => void] => [s, () => d.pastime(s)]),
        ["random now", () => d.pastime(null)],
      ]),
      group("Mood", ([["none", null], ["tired", "tired"], ["happy", "happy"]] as const).map(([label, m]) => [label, () => d.engine.mood(m)])),
      group("Gesture", [["greet", () => d.engine.greet()], ["blink", () => d.engine.blink()], ["squash", () => d.engine.squash()]]),
    ),
    section(
      S.secAppearance, false,
      group("Character", (Object.keys(CHARACTERS) as CharacterId[]).map((c) => [c, () => {
        d.setCharacter(c);
        body.refresh();
      }])),
      group("Renderer", ["2d", "2.5d", "3d"].map((r) => [r, () => d.setRenderer(r)])),
      body.el,
      backgroundSection(d),
      scenesSection(d),
    ),
    section(
      S.secTesting, false,
      group("Simulate", SCENARIOS.map(([kind, label]) => [label, () => d.simulate(kind)])),
      group("Speak", SPEAK_SAMPLES.map(([label, text]) => [label, () => d.speak(text)])),
    ),
  );
  return { el, syncBody: body.refresh };
}
