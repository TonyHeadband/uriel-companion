import "./style.css";
import { characterFor } from "./characters";
import { ChatController } from "./chat/controller";
import { customizationTab, pokeEngine, sayLine } from "./debug/panel";
import { runScenario, scenarioDeps } from "./debug/scenarios";
import { SCRIPTS, scriptedGateway } from "./debug/scripted";
import { Pastimes } from "./engine/pastimes";
import { Presence } from "./engine/presence";
import { Touch } from "./engine/touch";
import { CharacterEngine } from "./engine/character-engine";
import { resolveTuning, SoftBody, type BodyTuning } from "./engine/softbody";
import { seeded } from "./engine/random";
import { ACTIONS } from "./engine/actions";
import { EXPRESSIONS } from "./engine/expressions";
import type { ExpressionName, ActionName } from "./engine/states";
import { RenderLoop } from "./renderers/loop";
import type { Placement } from "./renderers/layout";
import { createRenderer } from "./renderers/renderer";
import { Synth } from "./sound/synth";
import { BlipSpeech } from "./speech/blip-speech";
import { BlipVoice, type Voice } from "./speech/blip-voice";
import { S } from "./strings";
import { Backdrop, type BlobShape } from "./ui/backdrop";
import { ChatLog } from "./ui/chat-log";
import { chatView } from "./ui/chat-view";
import { InputBar } from "./ui/input";
import { settingsPanel } from "./ui/panel";
import { FONT_SIZES, settingsTab } from "./ui/settings";
import { Stage } from "./ui/stage";

// The character playground: tune it in a browser, and take reproducible screenshots with ?t=.
const q = new URLSearchParams(location.search);
const frozenAt = q.has("t") ? Number(q.get("t")) : null;
let clock = 0;
const synth = new Synth();
synth.setEnabled(frozenAt === null);
let character = characterFor(q.get("character") ?? "grid");
const voice = new BlipVoice(synth, character.voice);
const softBody = new SoftBody();
const backdrop = new Backdrop();
const backdropSettings = { enabled: true, opacity: 0.5, shape: "round" as BlobShape };
backdrop.setOpacity(backdropSettings.opacity);
const bodyOverrides: Partial<Record<string, Partial<BodyTuning>>> = {};
const bodyTuning = () => resolveTuning(character.body, bodyOverrides[character.id]);
const voiced: Voice = {
  syllable: (s, rate) => {
    voice.syllable(s, rate);
    softBody.bump();
    backdrop.ripple(0.35);
  },
  interrupted: () => voice.interrupted(),
};
const speech = new BlipSpeech(voiced);
const engine = new CharacterEngine({
  now: () => (frozenAt === null ? performance.now() : clock),
  random: seeded(Number(q.get("seed") ?? 1)),
  onSound: (s) => synth.play(s),
  mouth: (n) => speech.update(n),
});
let liveliness = q.has("live") ? Number(q.get("live")) : 0.5;
engine.setLiveliness(liveliness);
const turnDeps = {
  speech,
  onInterrupt: () => { voice.interrupted(); engine.interrupted(); },
  later: (ms: number, fn: () => void) => void setTimeout(fn, ms),
};
let moodOpacity = q.has("mood") ? Number(q.get("mood")) : 1;
const makeRenderer = (id: string) => {
  const r = createRenderer(id);
  r.moodOpacity = moodOpacity;
  return r;
};
let renderer = makeRenderer(q.get("renderer") ?? "2.5d");

const root = document.getElementById("app")!;
const stage = new Stage(S.greeting, backdrop.canvas);
const log = new ChatLog();
const input = new InputBar(() => {});
root.replaceChildren(stage.el, log.el, input.el);
const fit = () => {
  const r = stage.canvas.getBoundingClientRect();
  renderer.resize(r.width, r.height, window.devicePixelRatio || 1);
  const s = stage.banner.getBoundingClientRect();
  backdrop.resize(s.width, s.height);
};
const mount = () => {
  renderer.mount(stage.canvas);
  fit();
};
mount();
new ResizeObserver(fit).observe(stage.canvas);

const state = q.get("state");
// Pastimes go on the life layer, as the scheduler starts them.
if (state && state in ACTIONS) engine.claim(ACTIONS[state as ActionName].pastime ? "life" : "task", state as ActionName);
const emote = q.get("emote");
if (emote && emote in EXPRESSIONS) engine.express(emote as ExpressionName);

if (frozenAt !== null) {
  for (clock = 0; clock < frozenAt; clock += 16) engine.update();
  clock = frozenAt;
  const pose = engine.update();
  // Screenshots pose the body at a fixed angle.
  if (q.has("turn")) pose.turn = Number(q.get("turn"));
  if (q.has("tip")) pose.tip = Number(q.get("tip"));
  softBody.applyToPose(pose, renderer.restOutline(character, pose), bodyTuning(), clock);
  stage.setMood(pose.color);
  const drawFrozen = () => {
    renderer.draw(pose, character);
    backdrop.update(clock, pose, pose.color);
  };
  drawFrozen();
  // Resizing a canvas clears it, and the observer's first callback arrives after this draw.
  new ResizeObserver(drawFrozen).observe(stage.canvas);
  document.body.dataset.ready = "1";
} else {
  // Real pokes and sleep, so the Simulate scenarios play here as in the app; it only dozes when asked to.
  const touch = new Touch({ engine, now: () => performance.now(), sound: (s) => synth.play(s), onDizzy: () => {} });
  const presence = new Presence({ engine, now: () => performance.now(), sleepAfterMs: Infinity });
  const pastimes = new Pastimes({ engine, now: () => performance.now(), dozing: () => presence.isDozing, liveliness });
  let at: Placement = { ox: 0, oy: 0, oz: 0, zoom: 1 };
  stage.canvas.addEventListener("click", (e) => {
    if (!stage.touches(e.clientX, e.clientY, at)) return;
    pastimes.stop();
    touch.click();
    backdrop.ripple(1);
  });
  window.addEventListener("pointermove", (e) => {
    engine.setLook(...stage.offsetFrom(e.clientX, e.clientY, at));
    stage.canvas.classList.toggle("touchable", stage.touches(e.clientX, e.clientY, at));
    touch.pointerMove();
    presence.activity();
  });
  window.addEventListener("keydown", () => presence.activity());
  new RenderLoop((now) => {
    touch.tick();
    presence.tick();
    pastimes.tick();
    const pose = engine.update();
    at = pose;
    softBody.applyToPose(pose, renderer.restOutline(character, pose), bodyTuning(), now);
    stage.setMood(pose.color);
    renderer.draw(pose, character);
    backdrop.update(now, pose, pose.color);
  }).start();
  const view = chatView(log, stage.ticker, input);
  const customization =
    customizationTab({
      engine: pokeEngine(engine),
      setCharacter: (id) => {
        character = characterFor(id);
        voice.def = character.voice;
      },
      setRenderer: (id) => {
        renderer.dispose();
        renderer = makeRenderer(id);
        mount();
      },
      simulate: (kind) => runScenario(kind, scenarioDeps({
        engine, presence, touch,
        // The preview has no agent to lose.
        link: { reportDown: () => {}, reportUp: () => {} },
        startTurn: (k) => {
          const c = new ChatController({
            gateway: scriptedGateway(SCRIPTS[k].script), engine, view,
            signIn: () => {}, sound: (s) => synth.play(s),
            ...turnDeps,
          });
          return c.send(SCRIPTS[k].message);
        },
      })),
      speak: (text) => {
        speech.stop();
        sayLine(text, speech, engine, stage.ticker);
      },
      getBody: bodyTuning,
      setBody: (p) => (bodyOverrides[character.id] = { ...bodyOverrides[character.id], ...p }),
      resetBody: () => delete bodyOverrides[character.id],
      backdrop: backdropSettings,
      setBackdrop: (on) => backdrop.setEnabled((backdropSettings.enabled = on)),
      setBackdropOpacity: (v) => backdrop.setOpacity((backdropSettings.opacity = v)),
      setBackdropShape: (shape) => backdrop.setShape((backdropSettings.shape = shape)),
      liveliness,
      setLiveliness: (v) => {
        engine.setLiveliness((liveliness = v));
        pastimes.setLiveliness(v);
      },
      pastime: (name) => pastimes.startNow(name ?? undefined),
      scenes: true,
      setScenes: (on) => {
        engine.setScenes(on);
        pastimes.setEnabled(on);
      },
      moodOpacity,
      setMoodOpacity: (v) => {
        moodOpacity = v;
        renderer.moodOpacity = v;
      },
    });
  const settings = settingsTab({
    volume: synth.volume,
    fontSize: "normal",
    setVolume: (v) => synth.setVolume(v),
    setFontSize: (f) => document.documentElement.style.setProperty("--fs", String(FONT_SIZES[f])),
    soundOn: synth.enabled,
    setSoundOn: (on) => synth.setEnabled(on),
    showFps: false,
    setShowFps: () => {},
    voiceOn: true,
    setVoiceOn: (on) => (voice.enabled = on),
    longReplies: "all",
    setLongReplies: (m) => (speech.mode = m),
    sleepAfterMin: 10,
    setSleepAfterMin: () => {},
  });
  const panel = settingsPanel(customization.el, settings.el);
  panel.classList.add("side");
  document.body.append(panel);
  engine.greet();
}
