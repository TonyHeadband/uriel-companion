import { Gateway, GatewayError, HEALTH_TIMEOUT_MS, toEvent, type ChatEvent, type TokenSource } from "./gateway";

const enc = new TextEncoder();

function sseResponse(chunks: string[], status = 200): Response {
  const stream = new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(stream, { status, headers: { "content-type": "text/event-stream" } });
}

const ev = (event: string, data: object) => `event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;

function tokens(over: Partial<TokenSource> = {}): TokenSource {
  return { headers: async () => ({ authorization: "Bearer t1" }), refresh: async () => false, ...over };
}

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

test("streams typed events and sends the message with the bearer token", async () => {
  const fetchFn = vi.fn(async () =>
    sseResponse([
      ev("start", { conversation_id: "c1" }),
      ev("tool_call", { name: "search_documents" }),
      ev("token", { text: "Hel" }) + ev("token", { text: "lo" }),
      ev("done", {}),
    ]),
  );
  const gw = new Gateway("https://uriel.example/", tokens(), fetchFn);
  const events = await collect(gw.chatStream("hi", null));
  expect(events).toEqual([
    { type: "start", conversationId: "c1" },
    { type: "tool_call", name: "search_documents", category: null, action: null },
    { type: "token", text: "Hel" },
    { type: "token", text: "lo" },
    { type: "done" },
  ]);
  const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("https://uriel.example/v1/chat/stream");
  expect(JSON.parse(init.body as string)).toEqual({ message: "hi", conversation_id: null });
  expect((init.headers as Record<string, string>).authorization).toBe("Bearer t1");
});

test("401 refreshes once and retries", async () => {
  let n = 0;
  const fetchFn = vi.fn(async () => (n++ === 0 ? new Response("", { status: 401 }) : sseResponse([ev("done", {})])));
  const refresh = vi.fn(async () => true);
  const events = await collect(new Gateway("https://u", tokens({ refresh }), fetchFn).chatStream("hi", null));
  expect(refresh).toHaveBeenCalledOnce();
  expect(fetchFn).toHaveBeenCalledTimes(2);
  expect(events).toEqual([{ type: "done" }]);
});

test("401 with a refused refresh is an auth error", async () => {
  const gw = new Gateway("https://u", tokens(), async () => new Response("", { status: 401 }));
  await expect(collect(gw.chatStream("hi", null))).rejects.toMatchObject({ kind: "auth" });
});

test("a network failure is unreachable", async () => {
  const gw = new Gateway("https://u", tokens(), async () => {
    throw new TypeError("Failed to fetch");
  });
  await expect(collect(gw.chatStream("hi", null))).rejects.toMatchObject({ kind: "unreachable" });
});

test("a token source that can't produce a token (offline refresh) is unreachable, not auth", async () => {
  const gw = new Gateway("https://u", tokens({ headers: async () => { throw new Error("dns"); } }), vi.fn());
  await expect(collect(gw.chatStream("hi", null))).rejects.toMatchObject({ kind: "unreachable" });
});

test("a stream that ends without done is a dropped connection", async () => {
  const gw = new Gateway("https://u", tokens(), async () => sseResponse([ev("token", { text: "par" })]));
  const seen: ChatEvent[] = [];
  const run = async () => {
    for await (const e of gw.chatStream("hi", null)) seen.push(e);
  };
  await expect(run()).rejects.toBeInstanceOf(GatewayError);
  expect(seen).toEqual([{ type: "token", text: "par" }]);
});

test("422 carries the gateway's message", async () => {
  const gw = new Gateway("https://u", tokens(), async () =>
    Response.json({ detail: "message is too long" }, { status: 422 }),
  );
  await expect(collect(gw.chatStream("x", null))).rejects.toMatchObject({
    kind: "http",
    status: 422,
    message: "message is too long",
  });
});

test("unknown events and bad JSON are skipped", async () => {
  const gw = new Gateway("https://u", tokens(), async () =>
    sseResponse(["event: mystery\r\ndata: {}\r\n\r\n", "event: token\r\ndata: nope\r\n\r\n", ev("done", {})]),
  );
  expect(await collect(gw.chatStream("x", null))).toEqual([{ type: "done" }]);
});

test("lists conversations and loads a conversation's messages", async () => {
  const fetchFn = vi.fn(async (url: string) =>
    url.endsWith("/v1/conversations")
      ? Response.json([{ id: "c1", title: "Taxes", updated_at: "2026-09-30T10:00:00Z" }])
      : Response.json([{ role: "user", content: "hi" }]),
  );
  const gw = new Gateway("https://u", tokens(), fetchFn as unknown as typeof fetch);
  expect(await gw.conversations()).toEqual([{ id: "c1", title: "Taxes", updated_at: "2026-09-30T10:00:00Z" }]);
  expect(await gw.messages("c1")).toEqual([{ role: "user", content: "hi" }]);
  expect(fetchFn.mock.calls[1][0]).toBe("https://u/v1/conversations/c1/messages");
});

test("a keychain failure is its own kind, not unreachable", async () => {
  const gw = new Gateway("https://u", tokens({ headers: async () => { throw "keychain: no secret service"; } }), vi.fn());
  await expect(collect(gw.chatStream("hi", null))).rejects.toMatchObject({ kind: "keychain" });
});

const msg = (event: string, data: unknown) => ({ event, data: JSON.stringify(data) });

test("tool_call carries the agent's category and action", () => {
  expect(toEvent(msg("tool_call", { name: "fill_form", category: "forms", companion_action: "change" }))).toEqual({
    type: "tool_call", name: "fill_form", category: "forms", action: "change",
  });
});

test("an unknown or missing companion_action is null, so a newer agent doesn't break the companion", () => {
  expect(toEvent(msg("tool_call", { name: "x", companion_action: "teleport" }))).toMatchObject({ action: null, category: null });
  expect(toEvent(msg("tool_call", { name: "x" }))).toMatchObject({ action: null });
});

test("tool_result: ok only on success, awaiting only when strictly true", () => {
  expect(toEvent(msg("tool_result", { name: "place_signature", category: "docs", companion_action: "confirm", status: "success", awaiting: false })))
    .toEqual({ type: "tool_result", name: "place_signature", category: "docs", action: "confirm", ok: true, awaiting: false });
  expect(toEvent(msg("tool_result", { name: "x", status: "error", awaiting: "yes" }))).toMatchObject({ ok: false, awaiting: false });
  expect(toEvent(msg("tool_result", { name: "x", status: "success", awaiting: true }))).toMatchObject({ ok: true, awaiting: true });
});

test("a nameless tool_result is dropped", () => {
  expect(toEvent(msg("tool_result", { status: "success" }))).toBeNull();
});

test("notice carries its code; an unknown code is null", () => {
  expect(toEvent(msg("notice", { text: "Tools are down", code: "tools_unavailable" }))).toEqual({
    type: "notice", text: "Tools are down", code: "tools_unavailable",
  });
  expect(toEvent(msg("notice", { text: "Hm", code: "nope" }))).toEqual({ type: "notice", text: "Hm", code: null });
  expect(toEvent(msg("notice", { text: "Hm" }))).toEqual({ type: "notice", text: "Hm", code: null });
});

test("health: GET /health without auth; true on 2xx", async () => {
  const headers = vi.fn();
  const fetchFn = vi.fn(async () => new Response('{"status":"ok"}', { status: 200 }));
  const gw = new Gateway("http://localhost:8100/", tokens({ headers }), fetchFn);
  expect(await gw.health()).toBe(true);
  const [url, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("http://localhost:8100/health");
  expect(init.method).toBe("GET");
  expect(headers).not.toHaveBeenCalled();
});

test("health is false on a non-2xx answer or a network error, and never throws", async () => {
  const down = new Gateway("http://x", tokens(), vi.fn(async () => new Response("", { status: 503 })));
  expect(await down.health()).toBe(false);
  const gone = new Gateway("http://x", tokens(), vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
  expect(await gone.health()).toBe(false);
});

test("health gives up after its timeout", async () => {
  vi.useFakeTimers();
  try {
    const fetchFn = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_res, rej) => {
      init?.signal?.addEventListener("abort", () => rej(new DOMException("aborted", "AbortError")));
    }));
    const gw = new Gateway("http://x", tokens(), fetchFn as unknown as typeof fetch);
    const p = gw.health();
    await vi.advanceTimersByTimeAsync(HEALTH_TIMEOUT_MS);
    expect(await p).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
