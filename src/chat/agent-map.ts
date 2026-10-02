import type { CompanionAction, NoticeCode, ToolResult } from "../api/gateway";
import type { ActionName, ExpressionName } from "../engine/states";

/** What a turn leaves on screen after the reply, until the next message. */
export type Outcome = "approval" | "question";

export interface Reaction {
  name: ExpressionName;
  ms: number;
}

const PROUD: Reaction = { name: "proud", ms: 1800 };
const ANNOYED: Reaction = { name: "annoyed", ms: 1200 };

/** What the character does while a tool runs. An untagged tool is a bug in uriel-tools, so it shows as one. */
export function toolAction(action: CompanionAction | null): ActionName {
  if (action === null) return "confused";
  return action === "lookup" ? "searching" : "working";
}

/** A tool's result shows as a short feeling over the current action, and may leave an outcome for after the reply. */
export function resultReaction(ev: ToolResult): { expression: Reaction | null; outcome: Outcome | null } {
  const expression = !ev.ok ? ANNOYED : ev.action === "confirm" ? PROUD : null;
  const outcome = ev.awaiting ? "approval" : ev.ok && ev.action === "ask" ? "question" : null;
  return { expression, outcome };
}

export function noticeReaction(code: NoticeCode | null): Reaction | null {
  return code === "tools_unavailable" ? ANNOYED : null;
}

/** A draft waiting for a yes matters more than a question. */
export function strongerOutcome(a: Outcome | null, b: Outcome | null): Outcome | null {
  return a === "approval" || b === "approval" ? "approval" : (a ?? b);
}
