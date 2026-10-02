import type { CharacterId } from "./characters";
import { CHARACTERS } from "./characters";
import { DEFAULT_VOLUME, MAX_VOLUME } from "./sound/synth";
import type { BodyTuning } from "./engine/softbody";
import type { BlobShape } from "./ui/backdrop";
import { LONG_MODES, type LongMode } from "./speech/blip-speech";
import { FONT_SIZES, MIN_WINDOW, type FontSize, type WindowDims } from "./ui/settings";

export type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

export interface AppConfig {
  gateway_url: string;
  auth: { mode: "oidc" | "api_key"; issuer: string; client_id: string; redirect_port: number };
  character: { id: CharacterId; renderer: string; mood_opacity: number };
  sound: { enabled: boolean; volume: number };
  speech: { long: LongMode; voice: boolean };
  body: Partial<Record<CharacterId, Partial<BodyTuning>>>;
  ui: {
    font_size: FontSize;
    show_fps: boolean;
    window: WindowDims;
    backdrop: { enabled: boolean; opacity: number; shape: BlobShape };
    /** 0–1: how far and how quickly the character moves around in every state. */
    liveliness: number;
    /** Minutes without activity before the character falls asleep. */
    sleep_after_min: number;
    /** Furniture scenes and idle pastimes; off for the plain close-up. */
    scenes: boolean;
  };
}

export const DEFAULT_CONFIG: AppConfig = {
  gateway_url: "",
  // redirect_port 0 = any free port; Task 1 may have fixed it (e.g. 53682).
  auth: { mode: "oidc", issuer: "https://auth.example.com", client_id: "uriel-companion", redirect_port: 0 },
  character: { id: "grid", renderer: "2.5d", mood_opacity: 1 },
  sound: { enabled: true, volume: DEFAULT_VOLUME },
  speech: { long: "all", voice: true },
  body: {},
  ui: {
    font_size: "normal",
    show_fps: false,
    window: { width: 420, height: 640 },
    backdrop: { enabled: true, opacity: 0.5, shape: "round" },
    liveliness: 0.5,
    sleep_after_min: 10,
    scenes: true,
  },
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown, d: string) => (typeof v === "string" ? v : d);

function windowDims(raw: unknown, fallback: WindowDims): WindowDims {
  const w = obj(raw);
  if (typeof w.width !== "number" || typeof w.height !== "number") return fallback;
  return { width: Math.max(MIN_WINDOW.width, w.width), height: Math.max(MIN_WINDOW.height, w.height) };
}

const BODY_RANGES: Record<keyof BodyTuning, readonly [number, number]> = {
  firmness: [1, 15], settle: [0, 1], sway: [0, 1], bump: [0, 1],
};

/** Keeps only numeric overrides for known characters, clamped to each slider's range. */
function bodyOverrides(raw: unknown): AppConfig["body"] {
  const out: AppConfig["body"] = {};
  for (const [id, value] of Object.entries(obj(raw))) {
    if (!(id in CHARACTERS)) continue;
    const t: Partial<BodyTuning> = {};
    for (const [key, [lo, hi]] of Object.entries(BODY_RANGES) as Array<[keyof BodyTuning, readonly [number, number]]>) {
      const v = obj(value)[key];
      if (typeof v === "number" && Number.isFinite(v)) t[key] = Math.max(lo, Math.min(hi, v));
    }
    if (Object.keys(t).length) out[id as CharacterId] = t;
  }
  return out;
}

export function normalizeConfig(raw: unknown): AppConfig {
  const r = obj(raw);
  const a = obj(r.auth);
  const c = obj(r.character);
  const s = obj(r.sound);
  const sp = obj(r.speech);
  const u = obj(r.ui);
  const bd = obj(u.backdrop);
  const d = DEFAULT_CONFIG;
  const port = a.redirect_port;
  return {
    gateway_url: str(r.gateway_url, d.gateway_url).trim().replace(/\/+$/, ""),
    auth: {
      mode: a.mode === "api_key" ? "api_key" : "oidc",
      issuer: str(a.issuer, d.auth.issuer),
      client_id: str(a.client_id, d.auth.client_id),
      redirect_port: Number.isInteger(port) && (port as number) >= 0 && (port as number) <= 65535 ? (port as number) : d.auth.redirect_port,
    },
    character: {
      id: typeof c.id === "string" && c.id in CHARACTERS ? (c.id as CharacterId) : d.character.id,
      renderer: str(c.renderer, d.character.renderer),
      mood_opacity:
        typeof c.mood_opacity === "number" ? Math.max(0, Math.min(1, c.mood_opacity)) : d.character.mood_opacity,
    },
    sound: {
      enabled: typeof s.enabled === "boolean" ? s.enabled : d.sound.enabled,
      volume: typeof s.volume === "number" ? Math.max(0, Math.min(MAX_VOLUME, s.volume)) : d.sound.volume,
    },
    speech: {
      long: (LONG_MODES as readonly unknown[]).includes(sp.long) ? (sp.long as LongMode) : d.speech.long,
      voice: typeof sp.voice === "boolean" ? sp.voice : d.speech.voice,
    },
    body: bodyOverrides(r.body),
    ui: {
      font_size: typeof u.font_size === "string" && u.font_size in FONT_SIZES ? (u.font_size as FontSize) : d.ui.font_size,
      show_fps: typeof u.show_fps === "boolean" ? u.show_fps : d.ui.show_fps,
      window: windowDims(u.window, d.ui.window),
      backdrop: {
        enabled: typeof bd.enabled === "boolean" ? bd.enabled : d.ui.backdrop.enabled,
        opacity: typeof bd.opacity === "number" ? Math.max(0, Math.min(1, bd.opacity)) : d.ui.backdrop.opacity,
        shape: bd.shape === "square" ? "square" : "round",
      },
      liveliness: typeof u.liveliness === "number" ? Math.max(0, Math.min(1, u.liveliness)) : d.ui.liveliness,
      sleep_after_min:
        typeof u.sleep_after_min === "number" && Number.isFinite(u.sleep_after_min)
          ? Math.round(Math.max(1, Math.min(120, u.sleep_after_min)))
          : d.ui.sleep_after_min,
      scenes: typeof u.scenes === "boolean" ? u.scenes : d.ui.scenes,
    },
  };
}

export async function loadConfig(invoke: Invoke): Promise<AppConfig> {
  try {
    return normalizeConfig(await invoke("load_config"));
  } catch (e) {
    // A broken file must not brick the app; it's left alone until the next save.
    console.warn(`config unreadable, using defaults: ${String(e)}`);
    return normalizeConfig(null);
  }
}

export async function saveConfig(invoke: Invoke, cfg: AppConfig): Promise<void> {
  await invoke("save_config", { value: cfg });
}
