// @vitest-environment happy-dom
import { S } from "../strings";
import { Header } from "./header";
import { settingsPanel } from "./panel";
import { settingsTab, type FontSize } from "./settings";

function rig() {
  const calls: string[] = [];
  const { el } = settingsTab({
    volume: 0.12,
    fontSize: "normal",
    setVolume: (v) => calls.push(`volume:${v}`),
    setFontSize: (f: FontSize) => calls.push(`font:${f}`),
    longReplies: "all",
    setLongReplies: (m) => calls.push(`long:${m}`),
    voiceOn: true,
    setVoiceOn() {},
    soundOn: true,
    setSoundOn() {},
    showFps: false,
    setShowFps() {},
    sleepAfterMin: 10,
    setSleepAfterMin: (m) => calls.push(`sleep:${m}`),
  });
  return { el, calls };
}

test("the volume slider shows a percentage of the full 0–0.5 range", () => {
  const { el, calls } = rig();
  const slider = el.querySelector(`input[aria-label="${S.volume}"]`) as HTMLInputElement;
  expect(slider.value).toBe("24");
  expect(el.textContent).toContain("24%");
  slider.value = "50";
  slider.dispatchEvent(new Event("input"));
  expect(calls).toEqual(["volume:0.25"]);
  expect(el.textContent).toContain("50%");
});

test("text size is a pick-one choice that reports and marks the pick", () => {
  const { el, calls } = rig();
  const group = (title: string) => [...el.querySelectorAll("h2")].find((t) => t.textContent === title)!.parentElement!;
  const button = (title: string, text: string) =>
    [...group(title).querySelectorAll("button")].find((b) => b.textContent === text)!;
  expect(button(S.fontSize, S.fontNormal).getAttribute("aria-pressed")).toBe("true");
  button(S.fontSize, S.fontLarge).click();
  expect(button(S.fontSize, S.fontLarge).getAttribute("aria-pressed")).toBe("true");
  expect(button(S.fontSize, S.fontNormal).getAttribute("aria-pressed")).toBe("false");
  expect(calls).toEqual(["font:large"]);
});

test("the panel opens on Customization and switches tabs", () => {
  const custom = document.createElement("div");
  custom.textContent = "custom";
  const settings = document.createElement("div");
  settings.textContent = "settings";
  const panel = settingsPanel(custom, settings);
  const tab = (name: string) => [...panel.querySelectorAll("[role=tab]")].find((t) => t.textContent === name) as HTMLElement;
  expect(custom.hidden).toBe(false);
  expect(settings.hidden).toBe(true);
  tab(S.tabSettings).click();
  expect(custom.hidden).toBe(true);
  expect(settings.hidden).toBe(false);
  expect(tab(S.tabSettings).getAttribute("aria-selected")).toBe("true");
});

test("the header's gear button opens the settings", () => {
  const onSettings = vi.fn();
  const header = new Header({ onSelect() {}, onMute() {}, onSettings }, false);
  (header.el.querySelector("[aria-label='" + S.settings + "']") as HTMLElement).click();
  expect(onSettings).toHaveBeenCalledOnce();
});

test("there are no window-size presets: the window is resized by dragging", () => {
  const { el } = rig();
  expect([...el.querySelectorAll("h2")].map((t) => t.textContent)).not.toContain("Window size");
});

function toggles(on = { sound: true, fps: false }) {
  const calls: string[] = [];
  const tab = settingsTab({
    volume: 0.12,
    fontSize: "normal",
    setVolume() {},
    setFontSize() {},
    soundOn: on.sound,
    setSoundOn: (v) => calls.push(`sound:${v}`),
    showFps: on.fps,
    setShowFps: (v) => calls.push(`fps:${v}`),
    longReplies: "all",
    setLongReplies() {},
    voiceOn: true,
    setVoiceOn: (v) => calls.push(`voice:${v}`),
    sleepAfterMin: 10,
    setSleepAfterMin: () => {},
  });
  const el = tab.el;
  const toggle = (title: string) =>
    [...el.querySelectorAll("h2")].find((t) => t.textContent === title)!.parentElement!.querySelector("button")!;
  return { el, calls, toggle, tab };
}

test("sound and the fps counter are on/off toggles in settings", () => {
  const { calls, toggle } = toggles();
  expect(toggle(S.sound).getAttribute("aria-pressed")).toBe("true");
  expect(toggle(S.showFps).getAttribute("aria-pressed")).toBe("false");
  toggle(S.sound).click();
  toggle(S.showFps).click();
  expect(toggle(S.sound).getAttribute("aria-pressed")).toBe("false");
  expect(toggle(S.showFps).getAttribute("aria-pressed")).toBe("true");
  expect(calls).toEqual(["sound:false", "fps:true"]);
});

test("the header shows fps left of the speaker, only when enabled", () => {
  const header = new Header({ onSelect() {}, onMute() {}, onSettings() {} }, false);
  const fps = header.el.querySelector(".fps") as HTMLElement;
  const mute = header.el.querySelector("[aria-label='" + S.mute + "']")!;
  expect(fps.nextElementSibling).toBe(mute);
  expect(fps.hidden).toBe(true);
  header.showFps(true);
  header.setFps(58);
  expect(fps.hidden).toBe(false);
  expect(fps.textContent).toBe("58 fps");
});

test("the header speaker follows sound changes made elsewhere", () => {
  const header = new Header({ onSelect() {}, onMute() {}, onSettings() {} }, false);
  header.setMuted(true);
  const mute = header.el.querySelector("[aria-label='" + S.mute + "']")!;
  expect(mute.getAttribute("aria-pressed")).toBe("true");
  expect(mute.textContent).toBe("🔇");
});

test("the sound toggle follows the header speaker without reporting back", () => {
  const { calls, toggle, tab } = toggles();
  tab.syncSound(false);
  expect(toggle(S.sound).getAttribute("aria-pressed")).toBe("false");
  expect(toggle(S.sound).textContent).toBe(S.off);
  expect(calls).toEqual([]);
  toggle(S.sound).click();
  expect(calls).toEqual(["sound:true"]);
});

test("long replies is a pick-one choice", () => {
  const { el, calls } = rig();
  const group = [...el.querySelectorAll("h2")].find((t) => t.textContent === S.longReplies)!.parentElement!;
  const button = (text: string) => [...group.querySelectorAll("button")].find((b) => b.textContent === text)!;
  expect(button(S.longAll).getAttribute("aria-pressed")).toBe("true");
  button(S.longFit).click();
  expect(button(S.longFit).getAttribute("aria-pressed")).toBe("true");
  expect(calls).toEqual(["long:fit"]);
});

test("the voice has its own on/off, separate from sound", () => {
  const { calls, toggle } = toggles();
  expect(toggle(S.voice).getAttribute("aria-pressed")).toBe("true");
  toggle(S.voice).click();
  expect(calls).toEqual(["voice:false"]);
});

test("the sleep slider shows minutes and reports them", () => {
  const { el, calls } = rig();
  const slider = el.querySelector(`input[aria-label="${S.sleepAfter}"]`) as HTMLInputElement;
  expect(slider.value).toBe("10");
  expect(el.textContent).toContain("10 min");
  slider.value = "25";
  slider.dispatchEvent(new Event("input"));
  expect(calls).toEqual(["sleep:25"]);
  expect(el.textContent).toContain("25 min");
});

test("settings are grouped into collapsible sections, Audio open", () => {
  const sections = [...rig().el.querySelectorAll("details.sec")] as HTMLDetailsElement[];
  expect(sections.map((s) => s.querySelector("summary")!.textContent)).toEqual([
    S.secAudio, S.secSpeech, S.secDisplay,
  ]);
  expect(sections.map((s) => s.open)).toEqual([true, false, false]);
});
