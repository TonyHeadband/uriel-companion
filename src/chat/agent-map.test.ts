import type { CompanionAction, ToolResult } from "../api/gateway";
import { toolLabel } from "../strings";
import { noticeReaction, resultReaction, strongerOutcome, toolAction } from "./agent-map";

const result = (over: Partial<ToolResult> = {}): ToolResult => ({
  type: "tool_result", name: "x", category: null, action: "change", ok: true, awaiting: false, ...over,
});

test.each<[CompanionAction | null, string]>([
  ["lookup", "searching"],
  ["change", "working"],
  ["draft", "working"],
  ["confirm", "working"],
  ["ask", "working"],
  [null, "confused"],
])("a %s tool runs as %s", (action, expected) => {
  expect(toolAction(action)).toBe(expected);
});

test("a confirmed change is proud", () => {
  expect(resultReaction(result({ action: "confirm" }))).toEqual({ expression: { name: "proud", ms: 1800 }, outcome: null });
});

test("a failed tool is briefly annoyed, whatever it was", () => {
  for (const action of ["lookup", "confirm", null] as const) {
    expect(resultReaction(result({ action, ok: false })).expression).toEqual({ name: "annoyed", ms: 1200 });
  }
});

test("an ordinary result shows nothing", () => {
  expect(resultReaction(result({ action: "lookup" }))).toEqual({ expression: null, outcome: null });
  expect(resultReaction(result({ action: "draft" }))).toEqual({ expression: null, outcome: null });
});

test("awaiting holds approval, whatever the action", () => {
  expect(resultReaction(result({ action: "draft", awaiting: true })).outcome).toBe("approval");
  expect(resultReaction(result({ action: null, awaiting: true })).outcome).toBe("approval");
});

test("ask holds a question only when it went through", () => {
  expect(resultReaction(result({ action: "ask" })).outcome).toBe("question");
  expect(resultReaction(result({ action: "ask", ok: false })).outcome).toBeNull();
});

test("tools being down is annoying; other notices aren't", () => {
  expect(noticeReaction("tools_unavailable")).toEqual({ name: "annoyed", ms: 1200 });
  expect(noticeReaction("not_looked_up")).toBeNull();
  expect(noticeReaction(null)).toBeNull();
});

test("approval beats question; either beats nothing", () => {
  expect(strongerOutcome(null, null)).toBeNull();
  expect(strongerOutcome(null, "question")).toBe("question");
  expect(strongerOutcome("question", null)).toBe("question");
  expect(strongerOutcome("question", "approval")).toBe("approval");
  expect(strongerOutcome("approval", "question")).toBe("approval");
});

test("the signature tools have their own labels", () => {
  expect(toolLabel("preview_signature")).toBe("Preparing the signature");
  expect(toolLabel("place_signature")).toBe("Signing the document");
  expect(toolLabel("make_tea")).toBe("Using make tea");
});
