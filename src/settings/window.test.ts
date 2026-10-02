// @vitest-environment happy-dom
import { DEFAULT_CONFIG } from "../config";
import { S } from "../strings";
import { fakeBus } from "./fake-bus";
import { EVENTS, type Snapshot } from "./protocol";
import { startSettingsWindow } from "./window";

const snapshot = (soundOn = true, firmness = 5): Snapshot => ({
  config: { ...DEFAULT_CONFIG, sound: { ...DEFAULT_CONFIG.sound, enabled: soundOn } },
  body: { firmness, settle: 0.35, sway: 0.5, bump: 0.4 },
});

async function open() {
  const root = document.createElement("div");
  const { bus, emitted, deliver } = fakeBus();
  await startSettingsWindow(root, bus);
  return { root, emitted, deliver };
}

const toggleFor = (root: HTMLElement, title: string) =>
  [...root.querySelectorAll("h2")].find((t) => t.textContent === title)!.parentElement!.querySelector("button")!;

test("it announces itself after listening and waits for the first snapshot", async () => {
  const { root, emitted } = await open();
  expect(emitted).toEqual([[EVENTS.ready, undefined]]);
  expect(root.textContent).toContain(S.settingsWaiting);
});

test("the first snapshot builds the pages and a change goes out as a command", async () => {
  const { root, emitted, deliver } = await open();
  deliver(EVENTS.snapshot, snapshot());
  expect(root.textContent).not.toContain(S.settingsWaiting);
  expect(root.querySelectorAll("[role=tab]")).toHaveLength(2);
  const slider = root.querySelector(`input[aria-label="${S.liveliness}"]`) as HTMLInputElement;
  slider.value = "0.9";
  slider.dispatchEvent(new Event("input"));
  expect(emitted.at(-1)).toEqual([EVENTS.command, { type: "liveliness", value: 0.9 }]);
});

test("it tells the main window when its own focus changes, once per change", async () => {
  let on = false;
  let changed = () => {};
  const focus = { focused: () => on, watch: (cb: () => void) => { changed = cb; } };
  const setFocus = (value: boolean) => { on = value; changed(); };
  const { bus, emitted } = fakeBus();
  await startSettingsWindow(document.createElement("div"), bus, focus);
  const sent = () => emitted.filter(([event]) => event === EVENTS.focus).map(([, payload]) => payload);
  expect(sent()).toEqual([]);
  setFocus(true);
  setFocus(true);
  setFocus(false);
  expect(sent()).toEqual([true, false]);
});

test("a later snapshot syncs the sound toggle and body sliders without rebuilding", async () => {
  const { root, emitted, deliver } = await open();
  deliver(EVENTS.snapshot, snapshot(true, 5));
  const pages = root.firstElementChild;
  const firmness = root.querySelector(`input[aria-label='${S.firmness}']`) as HTMLInputElement;
  const before = emitted.length;
  deliver(EVENTS.snapshot, snapshot(false, 9));
  expect(root.firstElementChild).toBe(pages);
  expect(toggleFor(root, S.sound).getAttribute("aria-pressed")).toBe("false");
  expect(firmness.value).toBe("9");
  expect(emitted).toHaveLength(before);
});
