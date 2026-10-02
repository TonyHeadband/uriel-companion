// @vitest-environment happy-dom
import { CharacterEngine } from "../engine/character-engine";
import { S } from "../strings";
import { customizationTab, pokeEngine, sayLine, SPEAK_SAMPLES } from "./panel";

function rig(setMoodOpacity: (v: number) => void = () => {}) {
  const { el } = customizationTab({
    engine: pokeEngine(new CharacterEngine({ now: () => 0 })),
    setCharacter() {}, setRenderer() {}, simulate() {}, speak() {},
    getBody: () => ({ firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 }), setBody() {}, resetBody() {},
    backdrop: { enabled: true, opacity: 0.5, shape: "round" }, setBackdrop() {}, setBackdropOpacity() {}, setBackdropShape() {},
    liveliness: 0.5, setLiveliness() {},
    pastime() {}, scenes: true, setScenes() {},
    moodOpacity: 0.85,
    setMoodOpacity,
  });
  return el;
}

test("the state opacity slider shows its value and reports changes", () => {
  const seen: number[] = [];
  const el = rig((v) => seen.push(v));
  const slider = el.querySelector("input[type=range]") as HTMLInputElement;
  expect(slider.min).toBe("0");
  expect(slider.max).toBe("1");
  expect(slider.value).toBe("0.85");
  slider.value = "0.4";
  slider.dispatchEvent(new Event("input"));
  expect(seen).toEqual([0.4]);
  expect(el.textContent).toContain("0.40");
});

test("state opacity sits right under the state buttons", () => {
  const titles = [...rig().querySelectorAll("h2")].map((t) => t.firstChild?.textContent?.trim());
  expect(titles.slice(0, 2)).toEqual(["State", S.stateOpacity]);
});

test("customization has no fps line and no sound section (both moved)", () => {
  const el = rig();
  expect(el.textContent).not.toContain("fps");
  expect([...el.querySelectorAll("h2")].map((t) => t.textContent)).not.toContain("Sound");
});
test("the Speak group says each sample sentence", () => {
  const spoken: string[] = [];
  const { el } = customizationTab({
    engine: pokeEngine(new CharacterEngine({ now: () => 0 })),
    setCharacter() {}, setRenderer() {}, simulate() {},
    moodOpacity: 1, setMoodOpacity() {},
    speak: (t) => spoken.push(t),
    getBody: () => ({ firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 }), setBody() {}, resetBody() {},
    backdrop: { enabled: true, opacity: 0.5, shape: "round" }, setBackdrop() {}, setBackdropOpacity() {}, setBackdropShape() {},
    liveliness: 0.5, setLiveliness() {},
    pastime() {}, scenes: true, setScenes() {},
  });
  const group = [...el.querySelectorAll("h2")].find((t) => t.textContent === "Speak")!.parentElement!;
  for (const b of group.querySelectorAll("button")) (b as HTMLButtonElement).click();
  expect(spoken).toEqual(SPEAK_SAMPLES.map(([, text]) => text));
});

test("a spoken test line is shown in the status strip until it's said", async () => {
  let finish!: (natural: boolean) => void;
  const speech = {
    speaking: false, push() {}, end() {}, stop() {}, update: () => null,
    drained: () => new Promise<boolean>((r) => (finish = r)),
  };
  const engine = { claim: () => ({}), release() {} };
  const shown: string[] = [];
  const ticker = { add: (l: string) => shown.push(l), clear: () => shown.push("<clear>") };
  sayLine("Hello! How are you? Fine.", speech, engine as never, ticker);
  expect(shown).toEqual(["<clear>", "Hello! How are you? Fine."]);
  finish(true);
  await Promise.resolve();
  expect(shown.at(-1)).toBe("<clear>");
});

test("a spoken test line never releases the claim of a chat turn already talking", async () => {
  const e = new CharacterEngine({ now: () => 0 });
  const turnToken = e.claim("task", "talking");
  const released: unknown[] = [];
  const engine = { claim: e.claim.bind(e), release: (l: "task", tok: never) => (released.push(tok), e.release(l, tok)) };
  let finish!: (natural: boolean) => void;
  const speech = { speaking: false, push() {}, end() {}, stop() {}, update: () => null, drained: () => new Promise<boolean>((r) => (finish = r)) };
  sayLine("Hi.", speech, engine as never, { add() {}, clear() {} });
  finish(true);
  await Promise.resolve();
  expect(released).toHaveLength(1);
  expect(released[0]).not.toBe(turnToken);
});

test("the Body sliders tune the current character and Reset restores its defaults", () => {
  const set: Array<Record<string, number>> = [];
  let resets = 0;
  let tuning = { firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 };
  const { el } = customizationTab({
    engine: pokeEngine(new CharacterEngine({ now: () => 0 })),
    setCharacter() {}, setRenderer() {}, simulate() {}, speak() {},
    moodOpacity: 1, setMoodOpacity() {},
    getBody: () => tuning,
    setBody: (p) => set.push(p as Record<string, number>),
    resetBody: () => { resets++; tuning = { firmness: 3, settle: 0.18, sway: 0.8, bump: 0.6 }; },
    backdrop: { enabled: true, opacity: 0.5, shape: "round" }, setBackdrop() {}, setBackdropOpacity() {}, setBackdropShape() {},
    liveliness: 0.5, setLiveliness() {},
    pastime() {}, scenes: true, setScenes() {},
  });
  const slider = el.querySelector(`input[aria-label='${S.firmness}']`) as HTMLInputElement;
  expect(slider.value).toBe("5");
  slider.value = "8";
  slider.dispatchEvent(new Event("input"));
  expect(set).toEqual([{ firmness: 8 }]);
  const reset = [...el.querySelectorAll("button")].find((b) => b.textContent === S.reset)!;
  reset.click();
  expect(resets).toBe(1);
  expect(slider.value).toBe("3");
});

test("the Background switch and opacity report changes", () => {
  const calls: string[] = [];
  const { el } = customizationTab({
    engine: pokeEngine(new CharacterEngine({ now: () => 0 })),
    setCharacter() {}, setRenderer() {}, simulate() {}, speak() {},
    moodOpacity: 1, setMoodOpacity() {},
    getBody: () => ({ firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 }), setBody() {}, resetBody() {},
    backdrop: { enabled: true, opacity: 0.5, shape: "round" },
    setBackdrop: (on) => calls.push(`on:${on}`),
    setBackdropOpacity: (v) => calls.push(`opacity:${v}`),
    setBackdropShape: (shape) => calls.push(`shape:${shape}`),
    liveliness: 0.5, setLiveliness() {},
    pastime() {}, scenes: true, setScenes() {},
  });
  const group = [...el.querySelectorAll("h2")].find((t) => t.textContent === S.background)!.parentElement!;
  (group.querySelector("button") as HTMLButtonElement).click();
  const slider = group.querySelector("input[type=range]") as HTMLInputElement;
  slider.value = "0.8";
  slider.dispatchEvent(new Event("input"));
  [...group.querySelectorAll("button")].find((b) => b.textContent === S.square)!.click();
  expect(calls).toEqual(["on:false", "opacity:0.8", "shape:square"]);
});

test("the Liveliness slider shows its value and reports changes", () => {
  const seen: number[] = [];
  const { el } = customizationTab({
    engine: pokeEngine(new CharacterEngine({ now: () => 0 })),
    setCharacter() {}, setRenderer() {}, simulate() {}, speak() {},
    moodOpacity: 1, setMoodOpacity() {},
    getBody: () => ({ firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 }), setBody() {}, resetBody() {},
    backdrop: { enabled: true, opacity: 0.5, shape: "round" }, setBackdrop() {}, setBackdropOpacity() {}, setBackdropShape() {},
    liveliness: 0.7,
    setLiveliness: (v) => seen.push(v),
    pastime() {}, scenes: true, setScenes() {},
  });
  const slider = el.querySelector(`input[aria-label="${S.liveliness}"]`) as HTMLInputElement;
  expect(slider.value).toBe("0.7");
  slider.value = "0.2";
  slider.dispatchEvent(new Event("input"));
  expect(seen).toEqual([0.2]);
});

test("customization is grouped into collapsible sections, Behavior open", () => {
  const sections = [...rig().querySelectorAll("details.sec")] as HTMLDetailsElement[];
  expect(sections.map((s) => s.querySelector("summary")!.textContent)).toEqual([
    S.secBehavior, S.secAppearance, S.secTesting,
  ]);
  expect(sections.map((s) => s.open)).toEqual([true, false, false]);
});

test("syncBody re-reads the body sliders without reporting back", () => {
  const set: unknown[] = [];
  let tuning = { firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 };
  const { el, syncBody } = customizationTab({
    engine: pokeEngine(new CharacterEngine({ now: () => 0 })),
    setCharacter() {}, setRenderer() {}, simulate() {}, speak() {},
    moodOpacity: 1, setMoodOpacity() {},
    getBody: () => tuning, setBody: (p) => set.push(p), resetBody() {},
    backdrop: { enabled: true, opacity: 0.5, shape: "round" }, setBackdrop() {}, setBackdropOpacity() {}, setBackdropShape() {},
    liveliness: 0.5, setLiveliness() {},
    pastime() {}, scenes: true, setScenes() {},
  });
  tuning = { firmness: 9, settle: 0.1, sway: 0.2, bump: 0.3 };
  syncBody();
  expect((el.querySelector(`input[aria-label='${S.firmness}']`) as HTMLInputElement).value).toBe("9");
  expect(set).toEqual([]);
});
