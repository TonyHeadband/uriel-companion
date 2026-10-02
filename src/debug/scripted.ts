import type { ChatEvent } from "../api/gateway";
import type { TurnKind } from "./scenarios";

export type Script = ReadonlyArray<readonly [delayMs: number, event: ChatEvent]>;

const tokens = (text: string): Array<readonly [number, ChatEvent]> =>
  text.split(/(?<= )/).map((t) => [60, { type: "token", text: t }] as const);

// Each phase lasts a few seconds so its motion (drift, darting, pacing) is easy to watch.
export const OK_TURN: Script = [
  [0, { type: "start", conversationId: "debug" }],
  [4000, { type: "tool_call", name: "search_documents", category: "documents", action: "lookup" }],
  [6000, { type: "tool_call", name: "fill_form", category: "forms", action: "change" }],
  [6000, { type: "token", text: "" }],
  ...tokens(
    "I found your passport scan in Documents/IDs and filled in the renewal form. " +
      "It only needs your signature now, so I left it open for you. ",
  ),
  [200, { type: "done" }],
];

export const ERROR_TURN: Script = [
  [0, { type: "start", conversationId: "debug" }],
  [900, { type: "tool_call", name: "web_search", category: "web", action: "lookup" }],
  [1500, { type: "error", message: "The assistant is unavailable right now. Please try again shortly." }],
  [50, { type: "done" }],
];

// Each tool a few seconds long: searching, a proud signature, then a draft left waiting for a yes (amber after the reply).
export const TOOL_FLAVOURS_TURN: Script = [
  [0, { type: "start", conversationId: "debug" }],
  [1500, { type: "tool_call", name: "search_documents", category: "documents", action: "lookup" }],
  [3000, { type: "tool_result", name: "search_documents", category: "documents", action: "lookup", ok: true, awaiting: false }],
  [100, { type: "tool_call", name: "place_signature", category: "documents", action: "confirm" }],
  [2500, { type: "tool_result", name: "place_signature", category: "documents", action: "confirm", ok: true, awaiting: false }],
  [1500, { type: "tool_call", name: "preview_signature", category: "documents", action: "draft" }],
  [2500, { type: "tool_result", name: "preview_signature", category: "documents", action: "draft", ok: true, awaiting: true }],
  ...tokens("I signed the lease and drafted the cover letter. Shall I send it? "),
  [200, { type: "done" }],
];

// A tool uriel-tools forgot to tag: lime and confused while it runs.
export const CONFUSED_TURN: Script = [
  [0, { type: "start", conversationId: "debug" }],
  [1500, { type: "tool_call", name: "mystery_tool", category: null, action: null }],
  [4000, { type: "tool_result", name: "mystery_tool", category: null, action: null, ok: true, awaiting: false }],
  ...tokens("That tool didn't say what it does. "),
  [200, { type: "done" }],
];

/** A stand-in gateway for the debug panel and the preview: plays a script through the real controller. */
export function scriptedGateway(
  script: Script,
  wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
) {
  return {
    async *chatStream(): AsyncGenerator<ChatEvent> {
      for (const [ms, event] of script) {
        await wait(ms);
        yield event;
      }
    },
  };
}

export const SCRIPTS: Record<TurnKind, { script: Script; message: string }> = {
  ok: { script: OK_TURN, message: "Renew my passport" },
  error: { script: ERROR_TURN, message: "What's the weather?" },
  flavours: { script: TOOL_FLAVOURS_TURN, message: "Sign the lease and draft the cover letter" },
  confused: { script: CONFUSED_TURN, message: "Do the mystery thing" },
};
