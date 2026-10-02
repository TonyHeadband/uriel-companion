import { CONFUSED_TURN, OK_TURN, scriptedGateway, TOOL_FLAVOURS_TURN } from "./scripted";

test("a scripted gateway yields its events in order, waiting between them", async () => {
  const waits: number[] = [];
  const gw = scriptedGateway(OK_TURN, async (ms) => { waits.push(ms); });
  const types: string[] = [];
  for await (const e of gw.chatStream()) types.push(e.type);
  expect(types).toEqual(OK_TURN.map(([, e]) => e.type));
  expect(waits).toEqual(OK_TURN.map(([ms]) => ms));
  expect(types.at(-1)).toBe("done");
});

test("the ok turn holds thinking, searching and working long enough to watch each one move", () => {
  const phases = OK_TURN.filter(([, e]) => e.type === "tool_call" || (e.type === "token" && e.text === ""));
  for (const [ms] of phases) expect(ms).toBeGreaterThanOrEqual(4000);
});

test("the flavours turn looks up, confirms, then leaves a draft awaiting a yes", () => {
  const kinds = TOOL_FLAVOURS_TURN.map(([, e]) => (e.type === "tool_call" || e.type === "tool_result" ? `${e.type}:${e.action}` : null))
    .filter(Boolean);
  expect(kinds).toEqual([
    "tool_call:lookup", "tool_result:lookup", "tool_call:confirm", "tool_result:confirm", "tool_call:draft", "tool_result:draft",
  ]);
  expect(TOOL_FLAVOURS_TURN.some(([, e]) => e.type === "tool_result" && e.awaiting)).toBe(true);
});

test("the confused turn calls an untagged tool", () => {
  expect(CONFUSED_TURN.some(([, e]) => e.type === "tool_call" && e.action === null)).toBe(true);
});
