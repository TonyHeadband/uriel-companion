import type { Handlers } from "./commands";

/** Handlers that log each call as `name(json args)`, for tests. */
export function recorder() {
  const calls: string[] = [];
  const rec = (name: string) => (...args: unknown[]) => void calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(",")})`);
  const handlers: Handlers = {
    engine: { force: rec("force"), express: rec("express"), mood: rec("mood"), greet: rec("greet"), blink: rec("blink"), squash: rec("squash") },
    setCharacter: rec("setCharacter"), setRenderer: rec("setRenderer"), simulate: rec("simulate"), speak: rec("speak"),
    setBody: rec("setBody"), resetBody: rec("resetBody"),
    setBackdrop: rec("setBackdrop"), setBackdropOpacity: rec("setBackdropOpacity"), setBackdropShape: rec("setBackdropShape"),
    setLiveliness: rec("setLiveliness"), setMoodOpacity: rec("setMoodOpacity"),
    pastime: rec("pastime"), setScenes: rec("setScenes"),
    setVolume: rec("setVolume"), setFontSize: rec("setFontSize"), setSoundOn: rec("setSoundOn"),
    setVoiceOn: rec("setVoiceOn"), setLongReplies: rec("setLongReplies"), setShowFps: rec("setShowFps"),
    setSleepAfterMin: rec("setSleepAfterMin"),
  };
  return { handlers, calls };
}
