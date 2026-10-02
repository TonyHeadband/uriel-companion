import { Arbiter } from "../engine/arbiter";
import { Scheduler } from "../engine/scheduler";
import { GatewayError, type ChatEvent, type CompanionAction } from "../api/gateway";
import type { ActionName, ExpressionName } from "../engine/states";
import { FINISH_BEAT_MS, S } from "../strings";
import { ChatController, type ChatView, type ErrorAction } from "./controller";

function fakeSpeech(hold = false) {
  let resolve: ((natural: boolean) => void) | null = null;
  const s = {
    speaking: false,
    ended: false,
    stopped: 0,
    pushed: [] as string[],
    push(t: string) { s.pushed.push(t); s.speaking = true; s.ended = false; },
    end() { s.ended = true; if (!hold) s.speaking = false; },
    stop() {
      if (!s.speaking) return;
      s.stopped++;
      s.speaking = false;
      s.ended = false;
      resolve?.(false);
      resolve = null;
    },
    drained(): Promise<boolean> { return s.speaking ? new Promise((r) => (resolve = r)) : Promise.resolve(true); },
    /** Finishes held speech naturally. */
    drain() { s.speaking = false; resolve?.(true); resolve = null; },
  };
  return s;
}

function rig(
  script: Array<ChatEvent | Error | (() => void)> | (() => Array<ChatEvent | Error | (() => void)>),
  opts: { holdSpeech?: boolean } = {},
) {
  const calls: string[] = [];
  const states: ActionName[] = [];
  const expressions: string[] = [];
  const sounds: string[] = [];
  let lastAction: ErrorAction | null = null;
  let streams = 0;
  let clock = 0;
  const sched = new Scheduler(() => clock);
  const arbiter = new Arbiter(sched, (c) => states.push(c.action));
  const engine = {
    claim: arbiter.claim.bind(arbiter),
    release: arbiter.release.bind(arbiter),
    get state() { return arbiter.current; },
    express: (name: ExpressionName, ms?: number) => { expressions.push(`${name}:${ms}`); return null; },
  };
  const link = { reportUp: vi.fn(), reportDown: vi.fn() };
  const advance = (ms: number) => { clock += ms; sched.run(); };
  const view: ChatView = {
    addUser: (t) => calls.push(`user:${t}`),
    startReply: () => calls.push("typing"),
    appendReply: (t) => calls.push(`reply:${t}`),
    addNotice: (t) => calls.push(`notice:${t}`),
    showError: (m, a) => { calls.push(`error:${m}:${a?.label ?? "-"}`); lastAction = a; },
    setBusy: (b) => calls.push(`busy:${b}`),
    addActivity: (l) => calls.push(`activity:${l}`),
    clearActivity: () => calls.push("activity-clear"),
  };
  const signIn = vi.fn();
  const onConversation = vi.fn();
  const gateway = {
    async *chatStream() {
      streams++;
      const items = typeof script === "function" ? script() : script;
      for (const item of items) {
        await Promise.resolve();
        if (typeof item === "function") {
          item();
          continue;
        }
        if (item instanceof Error) throw item;
        yield item;
      }
    },
  };
  const speech = fakeSpeech(opts.holdSpeech);
  const onInterrupt = vi.fn();
  const c = new ChatController({
    gateway, engine, view, sound: (s) => sounds.push(s), signIn, onConversation,
    speech, onInterrupt, link, later: (ms, fn) => sched.after(ms, fn),
  });
  return { c, link, expressions, speech, onInterrupt, calls, states, sounds, advance, signIn, onConversation, engine, streams: () => streams, action: () => lastAction };
}

const DONE: ChatEvent = { type: "done" };
const call = (name: string, action: CompanionAction | null = "change"): ChatEvent => ({ type: "tool_call", name, category: null, action });

const result = (action: CompanionAction | null, over: { ok?: boolean; awaiting?: boolean } = {}): ChatEvent => ({
  type: "tool_result", name: "t", category: null, action, ok: over.ok ?? true, awaiting: over.awaiting ?? false,
});

test("a tool turn: thinking, searching, the finished beat, then the reply and idle", async () => {
  const r = rig([
    { type: "start", conversationId: "c1" },
    call("search_documents", "lookup"),
    { type: "token", text: "Found " },
    { type: "token", text: "it." },
    DONE,
  ]);
  const p = r.c.send("  where is my passport?  ");
  await vi.waitFor(() => expect(r.c.busy).toBe(false));
  // The text is all there; the voice waits for the beat.
  expect(r.engine.state).toBe("finished");
  expect(r.speech.pushed).toEqual([]);
  r.advance(FINISH_BEAT_MS - 1);
  expect(r.engine.state).toBe("finished");
  r.advance(1);
  expect(r.engine.state).toBe("talking");
  expect(r.speech.pushed).toEqual(["Found ", "it."]);
  await p;
  expect(r.calls).toEqual([
    "user:where is my passport?",
    "busy:true",
    "activity-clear",
    `activity:${S.thinking}`,
    "typing",
    "activity:Searching documents",
    "reply:Found ",
    "activity-clear",
    "reply:it.",
    "busy:false",
  ]);
  expect(r.states).toEqual(["thinking", "searching", "finished", "talking", "idle"]);
  expect(r.sounds).toEqual(["send"]);
  expect(r.c.conversationId).toBe("c1");
  expect(r.onConversation).toHaveBeenCalledWith("c1");
});

test("other tools show as working with a friendly label", async () => {
  const r = rig([call("fill_form"), DONE]);
  await r.c.send("x");
  expect(r.states).toContain("working");
  expect(r.calls).toContain("activity:Using fill form");
});

test("a tool call during the beat shows its work; the beat then hands over to talking with every word", async () => {
  const r = rig([
    call("fill_form"),
    { type: "token", text: "Done. " },
    call("search_documents", "lookup"),
    { type: "token", text: "Found it." },
    DONE,
  ]);
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.c.busy).toBe(false));
  expect(r.states).toEqual(["thinking", "working", "finished", "searching"]);
  expect(r.speech.pushed).toEqual([]);
  r.advance(FINISH_BEAT_MS);
  expect(r.engine.state).toBe("talking");
  expect(r.speech.pushed).toEqual(["Done. ", "Found it."]);
  await p;
  expect(r.engine.state).toBe("idle");
});

test("a click during the beat drops the held voice and the turn settles", async () => {
  const r = rig([call("fill_form"), { type: "token", text: "Hello" }, DONE]);
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.c.busy).toBe(false));
  expect(r.c.speaking).toBe(true);
  r.c.interrupt();
  expect(r.onInterrupt).toHaveBeenCalledOnce();
  r.advance(FINISH_BEAT_MS);
  await p;
  expect(r.speech.pushed).toEqual([]);
  expect(r.engine.state).toBe("idle");
});

test("final is shown only when no tokens came", async () => {
  const a = rig([{ type: "final", text: "Couldn't finish." }, DONE]);
  await a.c.send("x");
  expect(a.calls).toContain("reply:Couldn't finish.");
  const b = rig([{ type: "token", text: "Hi" }, { type: "final", text: "Hi" }, DONE]);
  await b.c.send("x");
  expect(b.calls.filter((c) => c.startsWith("reply:"))).toEqual(["reply:Hi"]);
});

test("a server error shows Retry, and Retry reruns without a second user bubble", async () => {
  let attempt = 0;
  const r = rig(() => (attempt++ === 0 ? [{ type: "error", message: "Tools are down." }, DONE] : [{ type: "token", text: "ok" }, DONE]));
  await r.c.send("x");
  expect(r.engine.state).toBe("error");
  expect(r.calls).toContain(`error:Tools are down.:${S.retry}`);
  r.action()!.run();
  await vi.waitFor(() => expect(r.states.at(-1)).toBe("idle"));
  expect(r.calls).toContain("reply:ok");
  expect(r.calls.filter((c) => c.startsWith("user:"))).toHaveLength(1);
  expect(r.streams()).toBe(2);
});

test("a dropped stream keeps the partial reply and offers Retry", async () => {
  const r = rig([{ type: "token", text: "par" }, new GatewayError("unreachable", "cut off")]);
  await r.c.send("x");
  expect(r.calls).toContain("reply:par");
  expect(r.calls).toContain(`error:${S.unreachable}:${S.retry}`);
  expect(r.engine.state).toBe("error");
  expect(r.calls.at(-1)).not.toBe("activity-clear");
});

test("an auth failure offers Sign in", async () => {
  const r = rig([new GatewayError("auth", "sign in again", 401)]);
  await r.c.send("x");
  expect(r.calls).toContain(`error:${S.signedOut}:${S.signIn}`);
  r.action()!.run();
  expect(r.signIn).toHaveBeenCalledOnce();
});

test("an HTTP error shows the gateway's message without Retry", async () => {
  const r = rig([new GatewayError("http", "message is too long", 422)]);
  await r.c.send("x");
  expect(r.calls).toContain("error:message is too long:-");
});

test("a second send while busy is ignored", async () => {
  const r = rig([{ type: "token", text: "a" }, DONE]);
  const first = r.c.send("one");
  await r.c.send("two");
  await first;
  expect(r.streams()).toBe(1);
  expect(r.calls.filter((c) => c.startsWith("user:"))).toEqual(["user:one"]);
});

test("blank messages do nothing", async () => {
  const r = rig([DONE]);
  await r.c.send("   ");
  expect(r.calls).toEqual([]);
});

test("new and opened conversations change the id, but not mid-turn", async () => {
  const r = rig([{ type: "start", conversationId: "c9" }, DONE]);
  r.c.openConversation("c2");
  expect(r.c.conversationId).toBe("c2");
  r.c.newConversation();
  expect(r.c.conversationId).toBeNull();
  const p = r.c.send("x");
  r.c.newConversation();
  await p;
  expect(r.c.conversationId).toBe("c9");
});

test("a stale Retry can't start a second turn while one is running", async () => {
  let streams = 0;
  let release!: () => void;
  const hold = new Promise<void>((r) => (release = r));
  let action: ErrorAction | null = null;
  const arbiter = new Arbiter(new Scheduler(() => 0), () => {});
  const engine = {
    claim: arbiter.claim.bind(arbiter),
    release: arbiter.release.bind(arbiter),
    get state() { return arbiter.current; },
    express: () => null,
  };
  const view: ChatView = {
    addUser() {}, startReply() {}, appendReply() {}, addNotice() {}, setBusy() {}, addActivity() {}, clearActivity() {},
    showError: (_m, a) => { action = a; },
  };
  const gateway = {
    async *chatStream(): AsyncGenerator<ChatEvent> {
      const n = ++streams;
      if (n === 1) throw new GatewayError("unreachable", "down");
      await hold;
      yield { type: "done" };
    },
  };
  const c = new ChatController({ gateway, engine, view, sound() {}, signIn() {}, later() {}, speech: fakeSpeech(), onInterrupt() {} });
  await c.send("first");
  const second = c.send("second");
  action!.run(); // the old note's Retry, clicked while "second" streams
  release();
  await second;
  expect(streams).toBe(2);
});

test("a gateway 5xx reads as can't-reach-home with Retry", async () => {
  const r = rig([new GatewayError("http", "HTTP 502", 502)]);
  await r.c.send("x");
  expect(r.calls).toContain(`error:${S.unreachable}:${S.retry}`);
});

test("a keychain failure says so, with no Retry", async () => {
  const r = rig([new GatewayError("keychain", "keychain: no secret service")]);
  await r.c.send("x");
  expect(r.calls).toContain(`error:${S.keychain}:-`);
});

test("a chat-only reply is spoken and settles to idle, with no finished hop or chime", async () => {
  const r = rig([{ type: "token", text: "Hi " }, { type: "token", text: "there" }, DONE]);
  await r.c.send("x");
  expect(r.speech.pushed).toEqual(["Hi ", "there"]);
  expect(r.speech.ended).toBe(true);
  expect(r.states).toEqual(["thinking", "talking", "idle"]);
});

test("the status line clears as the reply's first words arrive, not after", async () => {
  const r = rig([{ type: "token", text: "Hi " }, { type: "token", text: "there" }, DONE]);
  await r.c.send("x");
  const words = r.calls.indexOf("reply:Hi ");
  expect(r.calls.slice(words, words + 3)).toEqual(["reply:Hi ", "activity-clear", "reply:there"]);
  expect(r.calls.filter((c) => c === "activity-clear")).toHaveLength(2);
});

test("a final-only reply is spoken too", async () => {
  const r = rig([{ type: "final", text: "Couldn't finish." }, DONE]);
  await r.c.send("x");
  expect(r.speech.pushed).toEqual(["Couldn't finish."]);
});

test("the turn ends when the speech does; the input is free while it talks", async () => {
  const r = rig([call("fill_form"), { type: "token", text: "Hello" }, DONE], { holdSpeech: true });
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.c.busy).toBe(false));
  r.advance(FINISH_BEAT_MS);
  await vi.waitFor(() => expect(r.speech.ended).toBe(true));
  expect(r.engine.state).toBe("talking");
  r.speech.drain();
  await p;
  expect(r.engine.state).toBe("idle");
});

test("a new message interrupts the speech and starts the next turn", async () => {
  const r = rig([call("fill_form"), { type: "token", text: "Hello" }, DONE], { holdSpeech: true });
  const first = r.c.send("one");
  await vi.waitFor(() => expect(r.c.busy).toBe(false));
  r.advance(FINISH_BEAT_MS);
  await vi.waitFor(() => expect(r.speech.ended).toBe(true));
  const second = r.c.send("two");
  expect(r.speech.stopped).toBe(1);
  expect(r.onInterrupt).toHaveBeenCalledOnce();
  await first;
  await vi.waitFor(() => expect(r.engine.state).toBe("finished"));
  r.advance(FINISH_BEAT_MS);
  await vi.waitFor(() => expect(r.speech.ended).toBe(true));
  r.speech.drain();
  await second;
  const lastThinking = r.states.lastIndexOf("thinking");
  expect(r.states.slice(lastThinking)).toEqual(["thinking", "working", "finished", "talking", "idle"]);
  // The first turn, cut off, never settled to idle on its own.
  expect(r.states.slice(0, lastThinking)).not.toContain("idle");
});

test("a click mid-reply silences the rest of the turn, which ends idle without the chime", async () => {
  let r!: ReturnType<typeof rig>;
  r = rig([{ type: "token", text: "Hello " }, () => r.c.interrupt(), { type: "token", text: "world" }, DONE]);
  await r.c.send("x");
  expect(r.speech.pushed).toEqual(["Hello "]);
  expect(r.calls).toContain("reply:world");
  expect(r.onInterrupt).toHaveBeenCalledOnce();
  expect(r.engine.state).toBe("idle");
  r.advance(FINISH_BEAT_MS);
  expect(r.states).not.toContain("finished");
});

test("interrupt does nothing when silent", () => {
  const r = rig([DONE]);
  r.c.interrupt();
  expect(r.onInterrupt).not.toHaveBeenCalled();
});

test("an error cuts the speech without the interrupt chirp", async () => {
  const r = rig([{ type: "token", text: "par" }, new GatewayError("unreachable", "cut off")]);
  await r.c.send("x");
  expect(r.speech.stopped).toBe(1);
  expect(r.onInterrupt).not.toHaveBeenCalled();
  expect(r.engine.state).toBe("error");
});

test("a stale Retry cuts off the speech too, and the old turn doesn't touch the new one's state", async () => {
  let attempt = 0;
  const r = rig(() => (attempt++ === 0 ? [{ type: "error", message: "down" }, DONE] : [{ type: "token", text: "ok" }, DONE]), {
    holdSpeech: true,
  });
  await r.c.send("x"); // fails, leaving a Retry
  const retry = r.action()!;
  const answered = r.c.send("y"); // succeeds and is still talking
  await vi.waitFor(() => expect(r.speech.ended).toBe(true));
  retry.run();
  expect(r.speech.stopped).toBe(1);
  expect(r.onInterrupt).toHaveBeenCalledOnce();
  await answered;
  expect(r.engine.state).not.toBe("finished");
  expect(r.engine.state).not.toBe("idle");
});

test("leaving the conversation hushes the speech quietly", async () => {
  const r = rig([{ type: "token", text: "Hello" }, DONE], { holdSpeech: true });
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.speech.ended).toBe(true));
  r.c.newConversation();
  await p;
  expect(r.speech.stopped).toBe(1);
  expect(r.onInterrupt).not.toHaveBeenCalled();
  expect(r.engine.state).toBe("idle");
  r.advance(FINISH_BEAT_MS);
  expect(r.states).not.toContain("finished");
});

test("words after a tool call bring the talking look back", async () => {
  const r = rig([
    { type: "token", text: "Let me check. " },
    call("fill_form"),
    { type: "token", text: "Done." },
    DONE,
  ]);
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.c.busy).toBe(false));
  r.advance(FINISH_BEAT_MS);
  await p;
  expect(r.states).toEqual(["thinking", "talking", "working", "finished", "talking", "idle"]);
});

test("a click mid-reply settles to idle right away", async () => {
  let r!: ReturnType<typeof rig>;
  let after = "";
  r = rig([{ type: "token", text: "Hello " }, () => { r.c.interrupt(); after = r.engine.state; }, { type: "token", text: "world" }, DONE]);
  await r.c.send("x");
  expect(after).toBe("idle");
});


test.each([
  ["lookup", "searching"],
  ["change", "working"],
  [null, "confused"],
] as const)("a %s tool shows %s", async (action, state) => {
  const r = rig([call("anything", action), DONE]);
  await r.c.send("x");
  expect(r.states).toContain(state);
});

test("a tool's name no longer decides searching", async () => {
  const r = rig([call("search_documents", "change"), DONE]);
  await r.c.send("x");
  expect(r.states).not.toContain("searching");
});

test("a confirmed change is proud, over the work", async () => {
  const r = rig([call("place_signature", "confirm"), result("confirm"), DONE]);
  await r.c.send("x");
  expect(r.expressions).toEqual(["proud:1800"]);
});

test("a failed tool is briefly annoyed and the turn carries on", async () => {
  const r = rig([call("fill_form"), result("change", { ok: false }), { type: "token", text: "Sorry." }, DONE]);
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.c.busy).toBe(false));
  r.advance(FINISH_BEAT_MS);
  await p;
  expect(r.expressions).toEqual(["annoyed:1200"]);
  expect(r.engine.state).toBe("idle");
});

test("a draft awaiting a yes holds approval after the reply, until the next message", async () => {
  const r = rig(() => [call("preview_signature", "draft"), result("draft", { awaiting: true }), DONE]);
  await r.c.send("sign it");
  expect(r.engine.state).toBe("approval");
  const next = r.c.send("yes");
  expect(r.engine.state).toBe("thinking");
  await next;
});

test("an ask holds question", async () => {
  const r = rig([call("ask_user", "ask"), result("ask"), DONE]);
  await r.c.send("x");
  expect(r.engine.state).toBe("question");
});

test("approval beats question, in either order", async () => {
  for (const events of [
    [result("ask"), result("draft", { awaiting: true })],
    [result("draft", { awaiting: true }), result("ask")],
  ]) {
    const r = rig([call("t", "draft"), ...events, DONE]);
    await r.c.send("x");
    expect(r.engine.state).toBe("approval");
  }
});

test("a held outcome survives a click mid-reply", async () => {
  const r = rig([result("draft", { awaiting: true }), { type: "token", text: "Ready to sign?" }, DONE], { holdSpeech: true });
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.speech.ended).toBe(true));
  r.c.interrupt();
  await p;
  expect(r.engine.state).toBe("approval");
});

test("switching conversation clears a held outcome", async () => {
  const r = rig([result("draft", { awaiting: true }), DONE]);
  await r.c.send("x");
  expect(r.engine.state).toBe("approval");
  r.c.openConversation("c2");
  expect(r.engine.state).toBe("idle");
  await r.c.send("y");
  expect(r.engine.state).toBe("approval");
  r.c.newConversation();
  expect(r.engine.state).toBe("idle");
});

test.each([
  ["openConversation", (c: ReturnType<typeof rig>["c"]) => c.openConversation("c2")],
  ["newConversation", (c: ReturnType<typeof rig>["c"]) => c.newConversation()],
])("%s while the reply is still spoken leaves no outcome on the new conversation", async (_n, leave) => {
  const r = rig([result("draft", { awaiting: true }), { type: "token", text: "Ready to sign?" }, DONE], { holdSpeech: true });
  const p = r.c.send("x");
  await vi.waitFor(() => expect(r.speech.ended).toBe(true));
  expect(r.engine.state).not.toBe("approval");
  leave(r.c);
  await p;
  expect(r.engine.state).toBe("idle");
});

test("tools being down shows the notice and is annoyed", async () => {
  const r = rig([{ type: "notice", text: "My tools are down.", code: "tools_unavailable" }, DONE]);
  await r.c.send("x");
  expect(r.calls).toContain("notice:My tools are down.");
  expect(r.expressions).toEqual(["annoyed:1200"]);
});

test("a stream that gets through reports the agent up", async () => {
  const r = rig([{ type: "token", text: "hi" }, DONE]);
  await r.c.send("x");
  expect(r.link.reportUp).toHaveBeenCalledOnce();
  expect(r.link.reportDown).not.toHaveBeenCalled();
});

test("a stream 404 reads as can't-reach-home with Retry and reports the agent down", async () => {
  const r = rig([new GatewayError("http", "Not Found", 404)]);
  await r.c.send("x");
  expect(r.calls).toContain(`error:${S.unreachable}:${S.retry}`);
  expect(r.link.reportDown).toHaveBeenCalledOnce();
});

test("an unreachable gateway reports down; auth, keychain, other 4xx and 5xx don't", async () => {
  const down = rig([new GatewayError("unreachable", "Failed to fetch")]);
  await down.c.send("x");
  expect(down.link.reportDown).toHaveBeenCalledOnce();
  for (const e of [
    new GatewayError("auth", "sign in again", 401),
    new GatewayError("keychain", "keychain: locked"),
    new GatewayError("http", "too long", 422),
    new GatewayError("http", "HTTP 502", 502),
  ]) {
    const r = rig([e]);
    await r.c.send("x");
    expect(r.link.reportDown).not.toHaveBeenCalled();
  }
});
