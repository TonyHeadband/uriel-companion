// @vitest-environment happy-dom
import { S } from "../strings";
import { ChatLog } from "./chat-log";
import { Header } from "./header";
import { InputBar } from "./input";
import { setupScreen } from "./screens";
import { Stage } from "./stage";
import { Ticker } from "./ticker";

test("reply text is never parsed as HTML", () => {
  const log = new ChatLog();
  log.startReply();
  log.appendReply("<b>bold</b> ");
  log.appendReply("<script>alert(1)</script>");
  expect(log.el.querySelector("b")).toBeNull();
  expect(log.el.querySelector("script")).toBeNull();
  expect(log.el.querySelector(".reply")!.textContent).toBe("<b>bold</b> <script>alert(1)</script>");
});

test("typing dots show until the first token, and tokens join one reply", () => {
  const log = new ChatLog();
  log.addUser("hi");
  log.startReply();
  expect(log.el.querySelector(".typing")).not.toBeNull();
  log.appendReply("Hel");
  log.appendReply("lo");
  expect(log.el.querySelector(".typing")).toBeNull();
  expect(log.el.querySelectorAll(".reply")).toHaveLength(1);
  expect(log.el.querySelector(".row.user .bubble")!.textContent).toBe("hi");
});

test("an error note's button runs its action and removes the note", () => {
  const log = new ChatLog();
  const run = vi.fn();
  log.showError("I can't reach home right now.", { label: "Retry", run });
  const btn = log.el.querySelector(".error-note button") as HTMLButtonElement;
  expect(btn.textContent).toBe("Retry");
  btn.click();
  expect(run).toHaveBeenCalledOnce();
  expect(log.el.querySelector(".error-note")).toBeNull();
});

test("history shows user and assistant turns, not tool calls", () => {
  const log = new ChatLog();
  log.showHistory([
    { role: "user", content: "q" },
    { role: "tool", content: "search_documents" },
    { role: "assistant", content: "a" },
  ]);
  expect([...log.el.children].map((c) => c.textContent)).toEqual(["q", "a"]);
});

test("the status strip shows one line: the idle text, then the latest status", () => {
  const later: Array<() => void> = [];
  const t = new Ticker("Hi", (_ms, fn) => later.push(fn));
  const shown = () => [...t.el.querySelectorAll(".ln:not(.out)")].map((l) => l.textContent);
  expect(shown()).toEqual(["Hi"]);
  for (const l of ["a", "b", "b", "c", "d"]) t.add(l);
  expect(shown()).toEqual(["d"]);
  expect(t.el.querySelector(".ln:not(.out):last-child")?.classList.contains("cur")).toBe(true);
  t.clear();
  expect(shown()).toEqual(["Hi"]);
});

test("setIdle swaps the resting line at once", () => {
  const later: Array<() => void> = [];
  const t = new Ticker("Hi", (_ms, fn) => later.push(fn));
  t.setIdle("Reconnecting…");
  later.forEach((f) => f());
  expect(t.el.textContent).toBe("Reconnecting…");
});

test("setIdle leaves a live status alone; clearing falls back to the new resting line", () => {
  const later: Array<() => void> = [];
  const t = new Ticker("Hi", (_ms, fn) => later.push(fn));
  t.add("Thinking…");
  t.setIdle("Reconnecting…");
  later.splice(0).forEach((f) => f());
  expect(t.el.textContent).toBe("Thinking…");
  t.clear();
  later.splice(0).forEach((f) => f());
  expect(t.el.textContent).toBe("Reconnecting…");
});

test("an empty resting line shows nothing", () => {
  const t = new Ticker("", () => {});
  expect(t.el.textContent).toBe("");
});

test("pushed-out lines fade before they're removed", () => {
  const later: Array<() => void> = [];
  const t = new Ticker("Hi", (_ms, fn) => later.push(fn));
  for (const l of ["a", "b"]) t.add(l);
  const leaving = [...t.el.querySelectorAll(".ln.out")].map((l) => l.textContent);
  expect(leaving).toContain("a");
  for (const fn of later) fn();
  expect(t.el.querySelectorAll(".ln.out")).toHaveLength(0);
});

test("the stage is the banner, with the status strip under it", () => {
  const stage = new Stage("Hi");
  const [banner, strip] = [...stage.el.children];
  expect(banner.classList.contains("stage")).toBe(true);
  expect(banner.contains(stage.canvas)).toBe(true);
  expect(strip.classList.contains("strip")).toBe(true);
  expect(strip.contains(stage.ticker.el)).toBe(true);
  expect(stage.banner).toBe(banner);
});

test("the input sends trimmed text on Enter, and ignores empty, busy and IME composition", () => {
  const sent: string[] = [];
  const bar = new InputBar((t) => sent.push(t));
  document.body.append(bar.el);
  const input = bar.el.querySelector("input")!;
  const enter = (extra: KeyboardEventInit = {}) =>
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, ...extra }));
  input.value = "  hi  ";
  enter();
  expect(sent).toEqual(["hi"]);
  expect(input.value).toBe("");
  enter();
  input.value = "x";
  enter({ isComposing: true });
  bar.setBusy(true);
  enter();
  expect(sent).toEqual(["hi"]);
});

test("the header lists conversations and reports picks", () => {
  const picked: Array<string | null> = [];
  const muted: boolean[] = [];
  const header = new Header({ onSelect: (id) => picked.push(id), onMute: (m) => muted.push(m), onSettings() {} }, false);
  header.setConversations([{ id: "c1", title: "Taxes", updated_at: "" }, { id: "c2", title: "", updated_at: "" }], "c1");
  const select = header.el.querySelector("select")!;
  expect([...select.options].map((o) => o.textContent)).toEqual([S.newChat, "Taxes", S.untitled]);
  expect(select.value).toBe("c1");
  select.value = "";
  select.dispatchEvent(new Event("change"));
  select.value = "c2";
  select.dispatchEvent(new Event("change"));
  expect(picked).toEqual([null, "c2"]);
  const mute = header.el.querySelector("button")!;
  mute.click();
  expect(muted).toEqual([true]);
  expect(mute.getAttribute("aria-pressed")).toBe("true");
});

test("setup accepts only web addresses and strips the trailing slash", () => {
  const saved: string[] = [];
  const el = setupScreen((u) => saved.push(u), "https://uriel.example");
  const input = el.querySelector("input")!;
  const form = el; // the screen is the form itself
  expect(input.value).toBe("https://uriel.example");
  input.value = "uriel";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  expect(saved).toEqual([]);
  expect(el.textContent).toContain(S.setupBad);
  input.value = "https://home.example/";
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  expect(saved).toEqual(["https://home.example"]);
});
