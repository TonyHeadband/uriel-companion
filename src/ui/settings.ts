import { MAX_VOLUME } from "../sound/synth";
import type { LongMode } from "../speech/blip-speech";
import { S } from "../strings";
import { h } from "./dom";
import { section } from "./section";

/** Text scale applied to the chat (the character keeps its size). */
export const FONT_SIZES = { small: 0.9, normal: 1, large: 1.15, xlarge: 1.3 } as const;
export type FontSize = keyof typeof FONT_SIZES;

/** The window is resized by dragging and the size is remembered. Below this the stage and the chat stop fitting. Mirrored in tauri.conf.json (minWidth/minHeight). */
export const MIN_WINDOW = { width: 340, height: 480 } as const;

export interface WindowDims {
  width: number;
  height: number;
}

export interface SettingsDeps {
  /** 0–MAX_VOLUME, shown as a percentage. */
  volume: number;
  fontSize: FontSize;
  setVolume: (v: number) => void;
  setFontSize: (f: FontSize) => void;
  soundOn: boolean;
  setSoundOn: (on: boolean) => void;
  showFps: boolean;
  setShowFps: (on: boolean) => void;
  longReplies: LongMode;
  setLongReplies: (m: LongMode) => void;
  voiceOn: boolean;
  setVoiceOn: (on: boolean) => void;
  sleepAfterMin: number;
  setSleepAfterMin: (min: number) => void;
}

function choices<T extends string>(
  title: string,
  options: Array<[T, string]>,
  current: T,
  pick: (v: T) => void,
): HTMLElement {
  const buttons = options.map(([value, label]) => {
    const b = h("button", { class: "btn", type: "button", text: label, "aria-pressed": String(value === current) });
    b.addEventListener("click", () => {
      for (const other of buttons) other.setAttribute("aria-pressed", String(other === b));
      pick(value);
    });
    return b;
  });
  return h("div", {}, h("h2", { text: title }), h("div", { class: "btns" }, ...buttons));
}

interface Toggle {
  el: HTMLElement;
  /** Shows a change made elsewhere, without reporting it back. */
  sync: (on: boolean) => void;
}

function toggle(title: string, on: boolean, set: (on: boolean) => void): Toggle {
  const b = h("button", { class: "btn", type: "button" });
  const sync = (value: boolean) => {
    on = value;
    b.textContent = on ? S.on : S.off;
    b.setAttribute("aria-pressed", String(on));
  };
  sync(on);
  b.addEventListener("click", () => {
    sync(!on);
    set(on);
  });
  return { el: h("div", {}, h("h2", { text: title }), h("div", { class: "btns" }, b)), sync };
}

export interface SettingsTab {
  el: HTMLElement;
  /** Keeps the sound toggle in step with the header speaker. */
  syncSound: (on: boolean) => void;
}

export function settingsTab(d: SettingsDeps): SettingsTab {
  const sound = toggle(S.sound, d.soundOn, d.setSoundOn);
  const percent = (v: number) => Math.round((v / MAX_VOLUME) * 100);
  const value = h("span", { text: `${percent(d.volume)}%` });
  const slider = h("input", { type: "range", min: "0", max: "100", step: "1", "aria-label": S.volume });
  slider.value = String(percent(d.volume));
  slider.addEventListener("input", () => {
    value.textContent = `${slider.value}%`;
    d.setVolume((Number(slider.value) / 100) * MAX_VOLUME);
  });
  const sleepValue = h("span", { text: `${d.sleepAfterMin} min` });
  const sleep = h("input", { type: "range", min: "1", max: "120", step: "1", "aria-label": S.sleepAfter });
  sleep.value = String(d.sleepAfterMin);
  sleep.addEventListener("input", () => {
    sleepValue.textContent = `${sleep.value} min`;
    d.setSleepAfterMin(Number(sleep.value));
  });
  const el = h(
    "div",
    {},
    section(S.secAudio, true, sound.el, h("div", {}, h("h2", {}, `${S.volume} `, value), slider)),
    section(
      S.secSpeech, false,
      toggle(S.voice, d.voiceOn, d.setVoiceOn).el,
      choices<LongMode>(
        S.longReplies,
        [["all", S.longAll], ["fit", S.longFit], ["first", S.longFirst]],
        d.longReplies,
        d.setLongReplies,
      ),
    ),
    section(
      S.secDisplay, false,
      choices<FontSize>(
        S.fontSize,
        [["small", S.fontSmall], ["normal", S.fontNormal], ["large", S.fontLarge], ["xlarge", S.fontXLarge]],
        d.fontSize,
        d.setFontSize,
      ),
      toggle(S.showFps, d.showFps, d.setShowFps).el,
      h("div", {}, h("h2", {}, `${S.sleepAfter} `, sleepValue), sleep),
    ),
  );
  return { el, syncSound: sound.sync };
}
