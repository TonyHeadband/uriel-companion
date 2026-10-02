import { applyCommand } from "./commands";
import type { Command } from "./protocol";
import { recorder } from "./recorder";

const cases: Array<[Command, string]> = [
  [{ type: "state", state: "working" }, 'force("working")'],
  [{ type: "express", name: "annoyed" }, 'express("annoyed")'],
  [{ type: "mood", mood: "tired" }, 'mood("tired")'],
  [{ type: "simulate", kind: "sleepy" }, 'simulate("sleepy")'],
  [{ type: "gesture", gesture: "squash" }, "squash()"],
  [{ type: "character", id: "grid" }, 'setCharacter("grid")'],
  [{ type: "renderer", id: "2.5d" }, 'setRenderer("2.5d")'],
  [{ type: "simulate", kind: "error" }, 'simulate("error")'],
  [{ type: "speak", text: "hi" }, 'speak("hi")'],
  [{ type: "body", patch: { sway: 0.1 } }, 'setBody({"sway":0.1})'],
  [{ type: "resetBody" }, "resetBody()"],
  [{ type: "backdrop", on: false }, "setBackdrop(false)"],
  [{ type: "backdropOpacity", value: 0.3 }, "setBackdropOpacity(0.3)"],
  [{ type: "backdropShape", shape: "square" }, 'setBackdropShape("square")'],
  [{ type: "liveliness", value: 0.9 }, "setLiveliness(0.9)"],
  [{ type: "pastime", name: "coffee" }, 'pastime("coffee")'],
  [{ type: "pastime", name: null }, "pastime(null)"],
  [{ type: "scenes", on: false }, "setScenes(false)"],
  [{ type: "moodOpacity", value: 0.4 }, "setMoodOpacity(0.4)"],
  [{ type: "volume", value: 0.2 }, "setVolume(0.2)"],
  [{ type: "fontSize", size: "large" }, 'setFontSize("large")'],
  [{ type: "soundOn", on: false }, "setSoundOn(false)"],
  [{ type: "voiceOn", on: false }, "setVoiceOn(false)"],
  [{ type: "longReplies", mode: "fit" }, 'setLongReplies("fit")'],
  [{ type: "showFps", on: true }, "setShowFps(true)"],
  [{ type: "sleepAfter", min: 25 }, "setSleepAfterMin(25)"],
];

test.each(cases)("%j calls the matching handler", (command, expected) => {
  const { handlers, calls } = recorder();
  applyCommand(command, handlers);
  expect(calls).toEqual([expected]);
});
