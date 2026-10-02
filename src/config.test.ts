import { DEFAULT_CONFIG, loadConfig, normalizeConfig, saveConfig } from "./config";

test("nothing on disk gives the defaults", () => {
  expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
  expect(DEFAULT_CONFIG.gateway_url).toBe("");
  expect(DEFAULT_CONFIG.character).toEqual({ id: "grid", renderer: "2.5d", mood_opacity: 1 });
  expect(DEFAULT_CONFIG.ui.show_fps).toBe(false);
});

test("the fps counter setting is kept when it is a boolean", () => {
  expect(normalizeConfig({ ui: { show_fps: true } }).ui.show_fps).toBe(true);
  expect(normalizeConfig({ ui: { show_fps: "yes" } }).ui.show_fps).toBe(false);
});

test("valid values are kept and the gateway URL loses its trailing slash", () => {
  const cfg = normalizeConfig({
    gateway_url: "https://uriel.example/",
    auth: { mode: "api_key", issuer: "https://auth.example", client_id: "x", redirect_port: 53682 },
    character: { id: "grid", renderer: "3d" },
    sound: { enabled: false, volume: 0.05 },
  });
  expect(cfg.gateway_url).toBe("https://uriel.example");
  expect(cfg.auth).toEqual({ mode: "api_key", issuer: "https://auth.example", client_id: "x", redirect_port: 53682 });
  expect(cfg.character).toEqual({ id: "grid", renderer: "3d", mood_opacity: 1 });
  expect(cfg.sound).toEqual({ enabled: false, volume: 0.05 });
});

test("bad values fall back, volume is clamped", () => {
  const cfg = normalizeConfig({
    auth: { mode: "magic", redirect_port: -3 },
    character: { id: "dragon", renderer: 7 },
    sound: { enabled: "yes", volume: 9 },
  });
  expect(cfg.auth.mode).toBe("oidc");
  expect(cfg.auth.redirect_port).toBe(DEFAULT_CONFIG.auth.redirect_port);
  expect(cfg.character).toEqual({ id: "grid", renderer: "2.5d", mood_opacity: 1 });
  expect(cfg.sound).toEqual({ enabled: true, volume: 0.5 });
});

test("a broken config file still starts the app with defaults", async () => {
  const invoke = vi.fn(async () => { throw new Error("config.json: expected value"); });
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(await loadConfig(invoke)).toEqual(DEFAULT_CONFIG);
  expect(warn).toHaveBeenCalled();
});

test("save sends the whole config", async () => {
  const invoke = vi.fn(async () => undefined);
  await saveConfig(invoke, DEFAULT_CONFIG);
  expect(invoke).toHaveBeenCalledWith("save_config", { value: DEFAULT_CONFIG });
});

test("mood opacity defaults to 1 and is clamped to 0–1", () => {
  expect(DEFAULT_CONFIG.character.mood_opacity).toBe(1);
  expect(normalizeConfig({ character: { mood_opacity: 0.4 } }).character.mood_opacity).toBe(0.4);
  expect(normalizeConfig({ character: { mood_opacity: 3 } }).character.mood_opacity).toBe(1);
  expect(normalizeConfig({ character: { mood_opacity: "x" } }).character.mood_opacity).toBe(1);
});

test("text size and window size default to normal and 420×640, and unknown values fall back", () => {
  expect(DEFAULT_CONFIG.ui).toEqual({
    font_size: "normal",
    show_fps: false,
    window: { width: 420, height: 640 },
    backdrop: { enabled: true, opacity: 0.5, shape: "round" },
    liveliness: 0.5,
    sleep_after_min: 10,
    scenes: true,
  });
  expect(normalizeConfig({ ui: { font_size: "xlarge", window: { width: 500, height: 900 } } }).ui).toEqual({
    font_size: "xlarge",
    show_fps: false,
    window: { width: 500, height: 900 },
    backdrop: { enabled: true, opacity: 0.5, shape: "round" },
    liveliness: 0.5,
    sleep_after_min: 10,
    scenes: true,
  });
  expect(normalizeConfig({ ui: { font_size: "huge", window: "big" } }).ui).toEqual(DEFAULT_CONFIG.ui);
});

test("a remembered window smaller than the minimum is grown to it", () => {
  expect(normalizeConfig({ ui: { window: { width: 100, height: 200 } } }).ui.window).toEqual({ width: 340, height: 480 });
});

test("long replies default to speaking it all, and unknown modes fall back", () => {
  expect(DEFAULT_CONFIG.speech).toEqual({ long: "all", voice: true });
  expect(normalizeConfig({ speech: { long: "fit" } }).speech.long).toBe("fit");
  expect(normalizeConfig({ speech: { long: "loud" } }).speech.long).toBe("all");
});

test("the voice is on by default and kept only as a boolean", () => {
  expect(DEFAULT_CONFIG.speech.voice).toBe(true);
  expect(normalizeConfig({ speech: { voice: false } }).speech.voice).toBe(false);
  expect(normalizeConfig({ speech: { voice: "no" } }).speech.voice).toBe(true);
});

test("body overrides are kept per character, clamped, and unknown characters dropped", () => {
  expect(DEFAULT_CONFIG.body).toEqual({});
  const cfg = normalizeConfig({ body: { grid: { firmness: 40, sway: 0.2, bump: "x" }, dragon: { sway: 1 } } });
  expect(cfg.body).toEqual({ grid: { firmness: 15, sway: 0.2 } });
});

test("the backdrop is on at half opacity by default, and clamped", () => {
  expect(DEFAULT_CONFIG.ui.backdrop).toEqual({ enabled: true, opacity: 0.5, shape: "round" });
  expect(normalizeConfig({ ui: { backdrop: { enabled: false, opacity: 3, shape: "square" } } }).ui.backdrop).toEqual({
    enabled: false, opacity: 1, shape: "square",
  });
  expect(normalizeConfig({ ui: { backdrop: { shape: "hexagon" } } }).ui.backdrop.shape).toBe("round");
});

test("liveliness defaults to the designed 0.5, and is clamped to 0–1", () => {
  expect(DEFAULT_CONFIG.ui.liveliness).toBe(0.5);
  expect(normalizeConfig({ ui: { liveliness: 0.8 } }).ui.liveliness).toBe(0.8);
  expect(normalizeConfig({ ui: { liveliness: -2 } }).ui.liveliness).toBe(0);
  expect(normalizeConfig({ ui: { liveliness: "lots" } }).ui.liveliness).toBe(0.5);
});

test("sleep timeout defaults to 10 minutes, clamped to 1–120", () => {
  expect(DEFAULT_CONFIG.ui.sleep_after_min).toBe(10);
  expect(normalizeConfig({ ui: { sleep_after_min: 30 } }).ui.sleep_after_min).toBe(30);
  expect(normalizeConfig({ ui: { sleep_after_min: 0 } }).ui.sleep_after_min).toBe(1);
  expect(normalizeConfig({ ui: { sleep_after_min: 500 } }).ui.sleep_after_min).toBe(120);
  expect(normalizeConfig({ ui: { sleep_after_min: "soon" } }).ui.sleep_after_min).toBe(10);
});

test("a saved 2d renderer is kept", () => {
  expect(normalizeConfig({ character: { renderer: "2d" } }).character.renderer).toBe("2d");
});

test("scenes defaults on and keeps a saved off", () => {
  expect(normalizeConfig({}).ui.scenes).toBe(true);
  expect(normalizeConfig({ ui: { scenes: false } }).ui.scenes).toBe(false);
});
