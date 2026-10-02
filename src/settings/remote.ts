import type { DebugDeps } from "../debug/panel";
import type { BodyTuning } from "../engine/softbody";
import type { SettingsDeps } from "../ui/settings";
import type { Command, Snapshot } from "./protocol";

/** The deps for the two tabs when they live in the settings window: values from the snapshot, changes sent as commands. */
export function remoteDeps(
  snap: Snapshot,
  send: (c: Command) => void,
  getBody: () => BodyTuning,
): { debug: DebugDeps; settings: SettingsDeps } {
  const { config } = snap;
  const debug: DebugDeps = {
    engine: {
      force: (state) => send({ type: "state", state }),
      express: (name) => send({ type: "express", name }),
      mood: (mood) => send({ type: "mood", mood }),
      greet: () => send({ type: "gesture", gesture: "greet" }),
      blink: () => send({ type: "gesture", gesture: "blink" }),
      squash: () => send({ type: "gesture", gesture: "squash" }),
    },
    setCharacter: (id) => send({ type: "character", id }),
    setRenderer: (id) => send({ type: "renderer", id }),
    simulate: (kind) => send({ type: "simulate", kind }),
    speak: (text) => send({ type: "speak", text }),
    moodOpacity: config.character.mood_opacity,
    setMoodOpacity: (value) => send({ type: "moodOpacity", value }),
    getBody,
    setBody: (patch) => send({ type: "body", patch }),
    resetBody: () => send({ type: "resetBody" }),
    backdrop: config.ui.backdrop,
    setBackdrop: (on) => send({ type: "backdrop", on }),
    setBackdropOpacity: (value) => send({ type: "backdropOpacity", value }),
    setBackdropShape: (shape) => send({ type: "backdropShape", shape }),
    liveliness: config.ui.liveliness,
    setLiveliness: (value) => send({ type: "liveliness", value }),
    pastime: (name) => send({ type: "pastime", name }),
    scenes: config.ui.scenes,
    setScenes: (on) => send({ type: "scenes", on }),
  };
  const settings: SettingsDeps = {
    volume: config.sound.volume,
    setVolume: (value) => send({ type: "volume", value }),
    fontSize: config.ui.font_size,
    setFontSize: (size) => send({ type: "fontSize", size }),
    soundOn: config.sound.enabled,
    setSoundOn: (on) => send({ type: "soundOn", on }),
    voiceOn: config.speech.voice,
    setVoiceOn: (on) => send({ type: "voiceOn", on }),
    longReplies: config.speech.long,
    setLongReplies: (mode) => send({ type: "longReplies", mode }),
    showFps: config.ui.show_fps,
    setShowFps: (on) => send({ type: "showFps", on }),
    sleepAfterMin: config.ui.sleep_after_min,
    setSleepAfterMin: (min) => send({ type: "sleepAfter", min }),
  };
  return { debug, settings };
}
