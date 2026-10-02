import { SseParser, type SseMessage } from "./sse";

export type CompanionAction = "lookup" | "change" | "draft" | "confirm" | "ask";
export type NoticeCode = "not_looked_up" | "tools_unavailable";
export type ToolResult = {
  type: "tool_result"; name: string; category: string | null; action: CompanionAction | null; ok: boolean; awaiting: boolean;
};

const ACTIONS: readonly CompanionAction[] = ["lookup", "change", "draft", "confirm", "ask"];
const CODES: readonly NoticeCode[] = ["not_looked_up", "tools_unavailable"];
export const HEALTH_TIMEOUT_MS = 3000;

export type ChatEvent =
  | { type: "start"; conversationId: string }
  | { type: "tool_call"; name: string; category: string | null; action: CompanionAction | null }
  | ToolResult
  | { type: "token"; text: string }
  | { type: "notice"; text: string; code: NoticeCode | null }
  | { type: "final"; text: string }
  | { type: "error"; message: string }
  | { type: "done" };

export interface ConversationSummary {
  id: string;
  title: string;
  updated_at: string;
}

export interface HistoryMessage {
  role: "user" | "tool" | "assistant";
  content: string;
}

export interface TokenSource {
  headers(): Promise<Record<string, string>>;
  /** Try to get a new access token; false means the person must sign in again. */
  refresh(): Promise<boolean>;
}

export class GatewayError extends Error {
  constructor(
    readonly kind: "unreachable" | "auth" | "http" | "keychain",
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export function toEvent(m: SseMessage): ChatEvent | null {
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(m.data);
  } catch {
    return null;
  }
  const s = (k: string) => (typeof d[k] === "string" ? (d[k] as string) : null);
  // A newer agent may send values this build doesn't know; they read as untagged rather than breaking the turn.
  const oneOf = <T extends string>(k: string, known: readonly T[]): T | null => {
    const v = s(k);
    return v !== null && (known as readonly string[]).includes(v) ? (v as T) : null;
  };
  const tool = () => ({ name: s("name")!, category: s("category"), action: oneOf("companion_action", ACTIONS) });
  switch (m.event) {
    case "start":
      return s("conversation_id") ? { type: "start", conversationId: s("conversation_id")! } : null;
    case "tool_call":
      return s("name") ? { type: "tool_call", ...tool() } : null;
    case "tool_result":
      return s("name") ? { type: "tool_result", ...tool(), ok: d.status === "success", awaiting: d.awaiting === true } : null;
    case "notice":
      return s("text") !== null ? { type: "notice", text: s("text")!, code: oneOf("code", CODES) } : null;
    case "token":
    case "final":
      return s("text") !== null ? { type: m.event, text: s("text")! } : null;
    case "error":
      return { type: "error", message: s("message") ?? "Something went wrong." };
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

async function detail(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
  } catch {
    // not JSON
  }
  return `HTTP ${res.status}`;
}

export class Gateway {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly tokens: TokenSource,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  async *chatStream(message: string, conversationId: string | null, signal?: AbortSignal): AsyncGenerator<ChatEvent> {
    const res = await this.request("/v1/chat/stream", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify({ message, conversation_id: conversationId }),
      signal,
    });
    if (!res.body) throw new GatewayError("unreachable", "empty response");
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    const parser = new SseParser();
    let done = false;
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<string>;
        try {
          chunk = await reader.read();
        } catch (e) {
          throw new GatewayError("unreachable", String(e));
        }
        const messages = chunk.done ? parser.end() : parser.push(chunk.value);
        for (const m of messages) {
          const ev = toEvent(m);
          if (!ev) continue;
          if (ev.type === "done") done = true;
          yield ev;
        }
        if (chunk.done) break;
      }
    } finally {
      reader.releaseLock();
    }
    if (!done) throw new GatewayError("unreachable", "the answer was cut off");
  }

  async conversations(): Promise<ConversationSummary[]> {
    return (await this.request("/v1/conversations", { method: "GET" })).json();
  }

  async messages(conversationId: string): Promise<HistoryMessage[]> {
    return (await this.request(`/v1/conversations/${conversationId}/messages`, { method: "GET" })).json();
  }

  /** Whether the agent answers at all: unauthenticated, so a signed-out person still sees it's there. Never throws. */
  async health(): Promise<boolean> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), HEALTH_TIMEOUT_MS);
    try {
      return (await this.fetchFn(this.base + "/health", { method: "GET", signal: ctl.signal })).ok;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  private async request(path: string, init: RequestInit): Promise<Response> {
    const go = async () => {
      let auth: Record<string, string>;
      try {
        auth = await this.tokens.headers();
      } catch (e) {
        // The Rust side prefixes keychain failures; anything else (DNS, token endpoint down) is a reachability problem.
        if (String(e).includes("keychain:")) throw new GatewayError("keychain", String(e));
        throw new GatewayError("unreachable", String(e));
      }
      try {
        return await this.fetchFn(this.base + path, {
          ...init,
          headers: { ...(init.headers as Record<string, string>), ...auth },
        });
      } catch (e) {
        throw new GatewayError("unreachable", String(e));
      }
    };
    let res = await go();
    if (res.status === 401 && (await this.tokens.refresh())) res = await go();
    if (res.status === 401 || res.status === 403) throw new GatewayError("auth", "sign in again", res.status);
    if (!res.ok) throw new GatewayError("http", await detail(res), res.status);
    return res;
  }
}
