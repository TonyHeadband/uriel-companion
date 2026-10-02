import type { DebugDeps } from "../debug/panel";
import type { SettingsDeps } from "../ui/settings";
import type { Command } from "./protocol";

/** The callbacks the controls report to, as the main window implements them. */
export type Handlers = Omit<DebugDeps, "getBody" | "backdrop" | "liveliness" | "moodOpacity" | "scenes"> &
  Pick<SettingsDeps, "setVolume" | "setFontSize" | "setSoundOn" | "setVoiceOn" | "setLongReplies" | "setShowFps" | "setSleepAfterMin">;

export function applyCommand(c: Command, hd: Handlers): void {
  switch (c.type) {
    case "state": return hd.engine.force(c.state);
    case "express": return hd.engine.express(c.name);
    case "mood": return hd.engine.mood(c.mood);
    case "gesture": return hd.engine[c.gesture]();
    case "character": return hd.setCharacter(c.id);
    case "renderer": return hd.setRenderer(c.id);
    case "simulate": return hd.simulate(c.kind);
    case "speak": return hd.speak(c.text);
    case "body": return hd.setBody(c.patch);
    case "resetBody": return hd.resetBody();
    case "backdrop": return hd.setBackdrop(c.on);
    case "backdropOpacity": return hd.setBackdropOpacity(c.value);
    case "backdropShape": return hd.setBackdropShape(c.shape);
    case "liveliness": return hd.setLiveliness(c.value);
    case "moodOpacity": return hd.setMoodOpacity(c.value);
    case "volume": return hd.setVolume(c.value);
    case "fontSize": return hd.setFontSize(c.size);
    case "soundOn": return hd.setSoundOn(c.on);
    case "voiceOn": return hd.setVoiceOn(c.on);
    case "longReplies": return hd.setLongReplies(c.mode);
    case "showFps": return hd.setShowFps(c.on);
    case "sleepAfter": return hd.setSleepAfterMin(c.min);
    case "pastime": return hd.pastime(c.name);
    case "scenes": return hd.setScenes(c.on);
  }
}
