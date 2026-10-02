import { DEFAULT_CONFIG } from "../config";
import type { DebugDeps } from "../debug/panel";
import type { SettingsDeps } from "../ui/settings";
import { applyCommand } from "./commands";
import type { Command, Snapshot } from "./protocol";
import { recorder } from "./recorder";
import { remoteDeps } from "./remote";

const body = { firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 };
const snap: Snapshot = {
  config: {
    ...DEFAULT_CONFIG,
    sound: { enabled: false, volume: 0.2 },
    speech: { long: "fit", voice: false },
    ui: { ...DEFAULT_CONFIG.ui, show_fps: true },
  },
  body,
};

test("the controls start from the snapshot", () => {
  const { debug, settings } = remoteDeps(snap, () => {}, () => body);
  expect(settings.soundOn).toBe(false);
  expect(settings.volume).toBe(0.2);
  expect(settings.voiceOn).toBe(false);
  expect(settings.longReplies).toBe("fit");
  expect(settings.showFps).toBe(true);
  expect(settings.fontSize).toBe(DEFAULT_CONFIG.ui.font_size);
  expect(debug.liveliness).toBe(DEFAULT_CONFIG.ui.liveliness);
  expect(debug.backdrop).toEqual(DEFAULT_CONFIG.ui.backdrop);
  expect(debug.scenes).toBe(DEFAULT_CONFIG.ui.scenes);
  expect(debug.moodOpacity).toBe(DEFAULT_CONFIG.character.mood_opacity);
  expect(debug.getBody()).toEqual(body);
});

test("getBody reads through, so a later snapshot is picked up", () => {
  let current = body;
  const { debug } = remoteDeps(snap, () => {}, () => current);
  current = { ...body, firmness: 9 };
  expect(debug.getBody().firmness).toBe(9);
});

// Every setter remoteDeps supplies, the command it must send and the handler call that command must end up as.
const setters: Array<[string, (d: DebugDeps, s: SettingsDeps) => void, Command, string]> = [
  ["engine.force", (d) => d.engine.force("working"), { type: "state", state: "working" }, 'force("working")'],
  ["engine.express", (d) => d.engine.express("annoyed"), { type: "express", name: "annoyed" }, 'express("annoyed")'],
  ["engine.mood", (d) => d.engine.mood("tired"), { type: "mood", mood: "tired" }, 'mood("tired")'],
  ["engine.greet", (d) => d.engine.greet(), { type: "gesture", gesture: "greet" }, "greet()"],
  ["engine.blink", (d) => d.engine.blink(), { type: "gesture", gesture: "blink" }, "blink()"],
  ["engine.squash", (d) => d.engine.squash(), { type: "gesture", gesture: "squash" }, "squash()"],
  ["setCharacter", (d) => d.setCharacter("grid"), { type: "character", id: "grid" }, 'setCharacter("grid")'],
  ["setRenderer", (d) => d.setRenderer("2.5d"), { type: "renderer", id: "2.5d" }, 'setRenderer("2.5d")'],
  ["simulate", (d) => d.simulate("error"), { type: "simulate", kind: "error" }, 'simulate("error")'],
  ["speak", (d) => d.speak("hi"), { type: "speak", text: "hi" }, 'speak("hi")'],
  ["setBody", (d) => d.setBody({ bump: 0.9 }), { type: "body", patch: { bump: 0.9 } }, 'setBody({"bump":0.9})'],
  ["resetBody", (d) => d.resetBody(), { type: "resetBody" }, "resetBody()"],
  ["setBackdrop", (d) => d.setBackdrop(false), { type: "backdrop", on: false }, "setBackdrop(false)"],
  ["setBackdropOpacity", (d) => d.setBackdropOpacity(0.3), { type: "backdropOpacity", value: 0.3 }, "setBackdropOpacity(0.3)"],
  ["setBackdropShape", (d) => d.setBackdropShape("square"), { type: "backdropShape", shape: "square" }, 'setBackdropShape("square")'],
  ["setLiveliness", (d) => d.setLiveliness(0.2), { type: "liveliness", value: 0.2 }, "setLiveliness(0.2)"],
  ["pastime", (d) => d.pastime("reading"), { type: "pastime", name: "reading" }, 'pastime("reading")'],
  ["setScenes", (d) => d.setScenes(false), { type: "scenes", on: false }, "setScenes(false)"],
  ["setMoodOpacity", (d) => d.setMoodOpacity(0.4), { type: "moodOpacity", value: 0.4 }, "setMoodOpacity(0.4)"],
  ["setVolume", (_, s) => s.setVolume(0.3), { type: "volume", value: 0.3 }, "setVolume(0.3)"],
  ["setFontSize", (_, s) => s.setFontSize("large"), { type: "fontSize", size: "large" }, 'setFontSize("large")'],
  ["setSoundOn", (_, s) => s.setSoundOn(false), { type: "soundOn", on: false }, "setSoundOn(false)"],
  ["setVoiceOn", (_, s) => s.setVoiceOn(false), { type: "voiceOn", on: false }, "setVoiceOn(false)"],
  ["setLongReplies", (_, s) => s.setLongReplies("first"), { type: "longReplies", mode: "first" }, 'setLongReplies("first")'],
  ["setShowFps", (_, s) => s.setShowFps(true), { type: "showFps", on: true }, "setShowFps(true)"],
  ["setSleepAfterMin", (_, s) => s.setSleepAfterMin(25), { type: "sleepAfter", min: 25 }, "setSleepAfterMin(25)"],
];

test.each(setters)("%s sends its command and the handlers apply it", (_name, invoke, command, call) => {
  const sent: Command[] = [];
  const { debug, settings } = remoteDeps(snap, (c) => sent.push(c), () => body);
  invoke(debug, settings);
  expect(sent).toEqual([command]);
  const { handlers, calls } = recorder();
  for (const c of sent) applyCommand(c, handlers);
  expect(calls).toEqual([call]);
});

test("the table covers every setter remoteDeps supplies", () => {
  const { debug, settings } = remoteDeps(snap, () => {}, () => body);
  const supplied = [
    ...Object.keys(debug.engine).map((k) => `engine.${k}`),
    ...[...Object.keys(debug), ...Object.keys(settings)].filter((k) => /^(set|resetBody$|simulate$|speak$|pastime$)/.test(k)),
  ];
  expect(setters.map(([name]) => name).sort()).toEqual(supplied.sort());
});
