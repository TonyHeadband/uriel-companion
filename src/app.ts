import { Gateway, type TokenSource } from "./api/gateway";
import { Link } from "./api/link";
import { characterFor } from "./characters";
import { ChatController } from "./chat/controller";
import { saveConfig, type AppConfig, type Invoke } from "./config";
import { pokeEngine, sayLine } from "./debug/panel";
import { runScenario, scenarioDeps } from "./debug/scenarios";
import { SCRIPTS, scriptedGateway } from "./debug/scripted";
import { CharacterEngine } from "./engine/character-engine";
import { resolveTuning, SoftBody } from "./engine/softbody";
import { Touch } from "./engine/touch";
import { Pastimes } from "./engine/pastimes";
import { Presence } from "./engine/presence";
import { RenderLoop } from "./renderers/loop";
import type { Placement } from "./renderers/layout";
import { createRenderer } from "./renderers/renderer";
import { startBridge, type Bridge } from "./settings/bridge";
import { tauriBus } from "./settings/bus";
import { applyCommand, type Handlers } from "./settings/commands";
import { Synth } from "./sound/synth";
import { BlipSpeech } from "./speech/blip-speech";
import { BlipVoice, type Voice } from "./speech/blip-voice";
import { S } from "./strings";
import { Backdrop } from "./ui/backdrop";
import { ChatLog } from "./ui/chat-log";
import { chatView } from "./ui/chat-view";
import { Header } from "./ui/header";
import { InputBar } from "./ui/input";
import { FONT_SIZES, type FontSize, type WindowDims } from "./ui/settings";
import { Stage } from "./ui/stage";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

export function startApp(root: HTMLElement, config: AppConfig, invoke: Invoke, tokens: TokenSource, signIn: () => void): void {
  const synth = new Synth();
  synth.setEnabled(config.sound.enabled);
  synth.setVolume(config.sound.volume);
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const softBody = new SoftBody();
  const backdrop = new Backdrop({ reducedMotion });
  backdrop.setEnabled(config.ui.backdrop.enabled);
  backdrop.setOpacity(config.ui.backdrop.opacity);
  backdrop.setShape(config.ui.backdrop.shape);
  let character = characterFor(config.character.id);
  const voice = new BlipVoice(synth, character.voice);
  // Each syllable also pulses the body and ripples the backdrop, even with the voice switched off.
  const voiced: Voice = {
    syllable: (s, rate) => {
      voice.syllable(s, rate);
      softBody.bump();
      backdrop.ripple(0.35);
    },
    interrupted: () => voice.interrupted(),
  };
  const speech = new BlipSpeech(voiced);
  speech.mode = config.speech.long;
  voice.enabled = config.speech.voice;
  const engine = new CharacterEngine({
    now: () => performance.now(),
    onSound: (s) => synth.play(s),
    reducedMotion,
    mouth: (n) => speech.update(n),
  });
  engine.setLiveliness(config.ui.liveliness);
  const turnDeps = {
    speech,
    onInterrupt: () => { voice.interrupted(); engine.interrupted(); },
    later: (ms: number, fn: () => void) => void setTimeout(fn, ms),
  };
  const makeRenderer = (id: string) => {
    const r = createRenderer(id);
    r.moodOpacity = config.character.mood_opacity;
    return r;
  };
  let renderer = makeRenderer(config.character.renderer);
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let bridge: Bridge | undefined;
  const bodyTuning = () => resolveTuning(character.body, config.body[character.id]);
  const saveSoon = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void saveConfig(invoke, config), 400);
  };

  const stage = new Stage("", backdrop.canvas);
  const log = new ChatLog();
  const gateway = new Gateway(config.gateway_url, tokens);
  // The character is away until the agent answers; its first answer is the arrival, with the greeting.
  const link = new Link({
    health: () => gateway.health(),
    later: (ms, fn) => void setTimeout(fn, ms),
    onChange: (state) => {
      if (state === "away") {
        engine.claim("link", "away");
        stage.ticker.setIdle(S.reconnecting);
      } else if (state === "online") {
        engine.release("link");
        stage.ticker.setIdle(S.greeting);
        // An arrival restarts the quiet timer, so after a long away it doesn't yawn and sleep right after greeting.
        presence.activity();
      }
    },
  });
  engine.startAway();
  let controller: ChatController;
  const input = new InputBar((text) => {
    presence.activity();
    void controller.send(text).then(() => input.setPlaceholder(S.placeholderMore));
  });
  const header = new Header(
    {
      onSelect: (id) => void openConversation(id),
      onMute: (muted) => {
        synth.setEnabled(!muted);
        config.sound.enabled = !muted;
        bridge?.publish();
        void saveConfig(invoke, config);
      },
      onSettings: openSettings,
    },
    !config.sound.enabled,
  );
  const view = chatView(log, stage.ticker, input);
  controller = new ChatController({
    gateway, engine, view, signIn, link, sound: (s) => synth.play(s), onConversation: () => void refreshList(),
    ...turnDeps,
  });

  async function refreshList(): Promise<void> {
    try {
      header.setConversations(await gateway.conversations(), controller.conversationId);
    } catch {
      // The list is a convenience; a turn will surface connection problems.
    }
  }

  async function openConversation(id: string | null): Promise<void> {
    if (controller.busy) return;
    if (id === null) {
      controller.newConversation();
      log.clear();
      input.setPlaceholder(S.placeholderEmpty);
      return;
    }
    controller.openConversation(id);
    try {
      log.showHistory(await gateway.messages(id));
      input.setPlaceholder(S.placeholderMore);
    } catch {
      log.clear();
      log.showError(S.unreachable, null);
    }
  }

  root.replaceChildren(header.el, stage.el, log.el, input.el);

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
  // The stage keeps its proportions as the window is resized, so the canvas grows with it.
  new ResizeObserver(fit).observe(stage.canvas);

  const touch = new Touch({
    engine, now: () => performance.now(), sound: (s) => synth.play(s),
    onDizzy: (on) => (on ? stage.ticker.add(S.dizzy) : stage.ticker.clear()),
  });
  const presence = new Presence({ engine, now: () => performance.now(), sleepAfterMs: config.ui.sleep_after_min * 60_000 });
  const pastimes = new Pastimes({ engine, now: () => performance.now(), dozing: () => presence.isDozing, liveliness: config.ui.liveliness });
  pastimes.setEnabled(config.ui.scenes);
  engine.setScenes(config.ui.scenes);
  // The whole banner is the character's space, so hover and clicks only count on the character itself.
  let at: Placement = { ox: 0, oy: 0, oz: 0, zoom: 1 };
  let hovering = false;
  stage.canvas.addEventListener("pointermove", (e) => {
    const near = stage.touches(e.clientX, e.clientY, at);
    stage.canvas.classList.toggle("touchable", near);
    if (near !== hovering) {
      hovering = near;
      if (near) touch.hoverStart();
      else touch.hoverEnd();
    }
  });
  stage.canvas.addEventListener("pointerleave", () => {
    hovering = false;
    touch.hoverEnd();
  });
  stage.canvas.addEventListener("click", (e) => {
    if (!stage.touches(e.clientX, e.clientY, at)) return;
    if (controller.speaking) controller.interrupt();
    else {
      // A poke ends whatever it was doing on its own.
      pastimes.stop();
      touch.click();
      backdrop.ripple(1);
    }
  });
  window.addEventListener("pointermove", (e) => {
    engine.setLook(...stage.offsetFrom(e.clientX, e.clientY, at));
    touch.pointerMove();
    presence.activity();
  });
  window.addEventListener("keydown", () => presence.activity());

  let frames = 0;
  let fpsAt = performance.now();
  const loop = new RenderLoop((now) => {
    touch.tick();
    presence.tick();
    pastimes.tick();
    const pose = engine.update();
    at = pose;
    if (!reducedMotion) softBody.applyToPose(pose, renderer.restOutline(character, pose), bodyTuning(), now);
    stage.setMood(pose.color);
    renderer.draw(pose, character);
    backdrop.update(now, pose, pose.color);
    frames++;
    if (now - fpsAt >= 1000) {
      header.setFps(Math.round((frames * 1000) / (now - fpsAt)));
      frames = 0;
      fpsAt = now;
    }
  });
  loop.start();

  let tickTimer: ReturnType<typeof setTimeout> | undefined;
  const handlers: Handlers = {
    engine: pokeEngine(engine),
    setCharacter: (id) => {
      character = characterFor(id);
      voice.def = character.voice;
      config.character.id = character.id;
      saveSoon();
    },
    setRenderer: (id) => {
      renderer.dispose();
      renderer = makeRenderer(id);
      mount();
      config.character.renderer = renderer.id;
      saveSoon();
    },
    simulate: (kind) => runScenario(kind, scenarioDeps({
      engine, presence, touch, link,
      startTurn: (k) => {
        const fake = new ChatController({
          gateway: scriptedGateway(SCRIPTS[k].script), engine, view, signIn,
          sound: (s) => synth.play(s), ...turnDeps,
        });
        return fake.send(SCRIPTS[k].message);
      },
    })),
    speak: (text) => {
      controller.interrupt();
      sayLine(text, speech, engine, stage.ticker);
    },
    setBody: (p) => {
      config.body[character.id] = { ...config.body[character.id], ...p };
      saveSoon();
    },
    resetBody: () => {
      delete config.body[character.id];
      saveSoon();
    },
    setBackdrop: (on) => {
      backdrop.setEnabled(on);
      config.ui.backdrop.enabled = on;
      saveSoon();
    },
    setBackdropOpacity: (v) => {
      backdrop.setOpacity(v);
      config.ui.backdrop.opacity = v;
      saveSoon();
    },
    setBackdropShape: (shape) => {
      backdrop.setShape(shape);
      config.ui.backdrop.shape = shape;
      saveSoon();
    },
    pastime: (name) => pastimes.startNow(name ?? undefined),
    setScenes: (on) => {
      engine.setScenes(on);
      pastimes.setEnabled(on);
      config.ui.scenes = on;
      saveSoon();
    },
    setLiveliness: (v) => {
      engine.setLiveliness(v);
      pastimes.setLiveliness(v);
      config.ui.liveliness = v;
      saveSoon();
    },
    setMoodOpacity: (v) => {
      config.character.mood_opacity = v;
      renderer.moodOpacity = v;
      saveSoon();
    },
    setVolume: (v) => {
      synth.setVolume(v);
      config.sound.volume = v;
      saveSoon();
      // A short tick once dragging pauses, so the level can be heard.
      clearTimeout(tickTimer);
      tickTimer = setTimeout(() => synth.play("hover"), 120);
    },
    setFontSize: (f) => {
      applyFontSize(f);
      config.ui.font_size = f;
      saveSoon();
    },
    setSoundOn: (on) => {
      synth.setEnabled(on);
      header.setMuted(!on);
      config.sound.enabled = on;
      saveSoon();
    },
    setVoiceOn: (on) => {
      voice.enabled = on;
      config.speech.voice = on;
      saveSoon();
    },
    setLongReplies: (m) => {
      speech.mode = m;
      config.speech.long = m;
      saveSoon();
    },
    setShowFps: (on) => {
      header.showFps(on);
      config.ui.show_fps = on;
      saveSoon();
    },
    setSleepAfterMin: (m) => {
      presence.setSleepAfter(m * 60_000);
      config.ui.sleep_after_min = m;
      saveSoon();
    },
  };
  void startBridge(
    tauriBus,
    (c) => applyCommand(c, handlers),
    () => ({ config, body: bodyTuning() }),
    (focused) => loop.setPeerFocused(focused),
  )
    .then((b) => (bridge = b))
    .catch((e) => console.warn(`couldn't start the settings bridge: ${String(e)}`));

  function openSettings(): void {
    invoke("open_settings").catch((e) => console.warn(`couldn't open the settings window: ${String(e)}`));
  }
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") openSettings();
  });

  applyFontSize(config.ui.font_size);
  header.showFps(config.ui.show_fps);
  void restoreWindow(config.ui.window, (dims) => {
    config.ui.window = dims;
    saveSoon();
  });
  void refreshList();
  link.start();
  input.focus();
}

function applyFontSize(size: FontSize): void {
  document.documentElement.style.setProperty("--fs", String(FONT_SIZES[size]));
}

/** Reopen at the remembered size, then remember every size the person drags the window to. */
async function restoreWindow(dims: WindowDims, remember: (dims: WindowDims) => void): Promise<void> {
  const win = getCurrentWindow();
  try {
    await win.setSize(new LogicalSize(dims.width, dims.height));
    await win.onResized(async ({ payload }) => {
      const logical = payload.toLogical(await win.scaleFactor());
      remember({ width: Math.round(logical.width), height: Math.round(logical.height) });
    });
  } catch (e) {
    console.warn(`couldn't restore the window size: ${String(e)}`);
  }
}
