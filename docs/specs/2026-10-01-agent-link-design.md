# Agent link: the companion reflects what the agent does, and whether it's there

Status: design (2026-10-01). Builds on the [state engine](2026-10-01-state-engine-design.md). Covers issues #17 (agent event mapping) and #18 (away when the agent can't be reached).

## Why
The companion guesses what the agent is doing:
- `src/api/gateway.ts` reads only `tool_call {name}`. It drops the agent's `category` and `companion_action`, ignores `tool_result`, and keeps only a notice's text.
- The controller picks searching or working from a hardcoded list of two search tools (`SEARCH_TOOLS` in `src/strings.ts`). Every other tool looks like working, and `question` and `approval` never show.

The agent now says what each tool does. Since uriel-agent 0.10.0 with uriel-tools 0.11.0, the stream carries:
- `tool_call {name, category, companion_action}`
- `tool_result {name, category, companion_action, status, awaiting}`
- `notice {text, code}`

The companion should use these, and show plainly when a tool isn't tagged.

The companion also can't tell whether the agent is there at all:
- A gateway without `/v1/chat/stream` answers 404, and the person sees a raw "Not Found" with no Retry.
- A gateway that is down only shows up when a message fails.

## Decisions
- **Typed table, not controller logic.** A pure `agent-map` module turns agent events into reactions. The controller applies them through the state engine. A new kind of tool is one table row.
- **An untagged tool shows `confused`.** A tool with no `companion_action` is a bug to fix in uriel-tools, so the companion shows it as a distinct new action instead of guessing. The name fallback and `SEARCH_TOOLS` are removed.
- **Outcomes are held after the reply.** A draft waiting for the person's yes (`awaiting`) shows `approval`, and a question from `ask` shows `question`. Each holds until the next message or a conversation switch.
- **Background presence check.** A connection watcher polls the gateway's `GET /health` and puts the character away when the agent can't be reached, and back when it returns, without waiting for a message to fail.
- **Away means absent.** The character leaves the stage, the status line says "Reconnecting…", and on return it slides in from the side and greets. Launching the app is an arrival too.
- **The UI doesn't gate.** Input stays enabled while away; a send still tries.
- **Grid is the only shipped character.** Nothing here may depend on angel, flame or orb. The away and arrival motion uses generic pose props and must read right on grid's square geometry.

## Design
### 1. Events
`ChatEvent` in `src/api/gateway.ts` gains typed fields. The wire is snake_case and the TypeScript is camelCase:
```ts
export type CompanionAction = "lookup" | "change" | "draft" | "confirm" | "ask";
export type NoticeCode = "not_looked_up" | "tools_unavailable";

| { type: "tool_call"; name: string; category: string | null; action: CompanionAction | null }
| { type: "tool_result"; name: string; category: string | null; action: CompanionAction | null; ok: boolean; awaiting: boolean }
| { type: "notice"; text: string; code: NoticeCode | null }
```
Parsing rules in `toEvent`:
- An unknown `companion_action` or `code` string becomes `null`, so a newer agent never breaks an older companion.
- `ok` is `status === "success"`. `awaiting` is `awaiting === true`.
- A `tool_result` without a `name` is dropped, as `tool_call` is today.
- Unknown events are still ignored.

### 2. The mapping table
`src/chat/agent-map.ts` is pure: no engine, no view, no clock.

| Agent says | While the tool runs | When its result comes back | After the reply |
|---|---|---|---|
| `lookup` | `searching` | | |
| `change` | `working` | | |
| `draft` | `working` | | `approval` if `awaiting` |
| `confirm` | `working` | `proud` expression | |
| `ask` | `working` | | `question` |
| untagged (`null`) | `confused` | | |
| any, `status: error` | | short `annoyed` expression; the turn carries on | |
| any, `awaiting: true` | | | `approval` |

```ts
export type Outcome = "approval" | "question";
export function toolAction(action: CompanionAction | null): ActionName;          // searching | working | confused
export function resultReaction(ev: ToolResult): { expression: ExpressionName | null; outcome: Outcome | null };
export function noticeReaction(code: NoticeCode | null): ExpressionName | null;  // tools_unavailable → annoyed
export function strongerOutcome(a: Outcome | null, b: Outcome | null): Outcome | null; // approval beats question
```
- `resultReaction` gives `proud` only when `ok` and `confirm`, and `annoyed` when `!ok`. The outcome is `approval` when `awaiting` (whatever the action), otherwise `question` when `ok` and `ask`, otherwise `null`.
- `noticeReaction` returns `annoyed` for `tools_unavailable` and `null` for `not_looked_up` or no code.
- Short expressions last 1200 ms (`annoyed`) and 1800 ms (`proud`, its default).
- Status-line labels stay name-based in `src/strings.ts`. They gain `preview_signature` → "Preparing the signature" and `place_signature` → "Signing the document". Unknown tools still read "Using …".

### 3. The `confused` action
A new entry in `ACTIONS`:
- **Colour:** lime (`#A3E635`), tint 0.72, glow 0.5.
- **Face:** `eye: "dot"`, `tilt: -0.17`. That is the opposite lean to `question`, so they don't read the same.
- **Badge:** `badge: "question"`.
- **Motion:** `range { x: 0.3, y: 0.05 }`, `every [3000, 5000]`, `pace 2`.
- **Sound:** none.

### 4. The controller
`ChatController.run` changes as follows:
- **`tool_call`:** claims `toolAction(ev.action)` on the task layer, shows `toolLabel(ev.name)`, and marks that tools ran. The finished beat before the reply works as now.
- **`tool_result`:** plays `resultReaction`'s expression through `engine.express`, and folds its outcome into the turn's outcome with `strongerOutcome`. It does not change the action.
- **`notice`:** shows the text as now, and plays `noticeReaction(code)`.
- **End of the turn, after the speech:**
  - With an outcome: `engine.claim("task", outcome)`, with no timer. It holds.
  - With none: release the task layer, which gives idle, as now.
  - An interrupted or silenced reply still claims its outcome, since the draft or question exists either way.
- **Clearing a held outcome:**
  - The next message replaces it with `thinking`.
  - `newConversation()` and `openConversation()` release the task layer, since the outcome belongs to the conversation being left.
  - A failed turn shows `error` as now.
- `ControllerDeps.engine` gains `express`.

Interplay with the other layers:
- Dizzy covers a held outcome for 3 s, and then the outcome resumes.
- While an outcome is held, the character doesn't fall asleep, because the task layer is claimed. The reminder stays visible.

### 5. The connection watcher
`src/api/link.ts` is a pure unit on an injected clock and timer.
```ts
export type LinkState = "connecting" | "online" | "away";
export interface LinkDeps {
  health: () => Promise<boolean>;            // Gateway.health(): GET /health, 3 s timeout, true on 2xx
  later: (ms: number, fn: () => void) => void;
  onChange: (state: LinkState) => void;
}
export class Link {
  start(): void;          // first check now
  reportDown(): void;     // a chat stream was unreachable or 404: away now
  reportUp(): void;       // a chat stream got through: online now
  readonly state: LinkState;
}
```
**Checks:**
- One check at `start()`.
- Then every 30 s while online, and every 5 s while connecting or away.
- Checks never overlap.

**State changes:**
- **Away:** after two failed checks in a row, or at once on `reportDown()`. While `connecting`, the first failure is enough, so launching against a down agent doesn't wait 5 s more.
- **Online:** on the first successful check, or on `reportUp()`.
- **Not every failure counts:** an auth failure (401 after a failed refresh) or the keychain is not the agent being away. Only `unreachable` errors, and `http` 404 from `/v1/chat/stream`, call `reportDown()`.
- `onChange` fires only when the state actually changes.

`Gateway` gains:
```ts
async health(): Promise<boolean>;  // unauthenticated, never throws
```

### 6. Away on the stage
- **A new top layer, `link`.** `LAYERS` becomes `["link", "interaction", "task", "rest", "life"]`.
- **The `away` action:**
  - It sets a new `ActionDef` flag, `offstage: true`, with no badge, the idle colour, `glow: 0` and no sound.
  - It allows no expressions (`allows: []`).
- **A new pose offset, `ax`:**
  - It is added to `ox` and smoothed toward `OFFSTAGE` (about 6 R, past the banner's 3.9 R edge) while the action is offstage, otherwise toward 0. Pace is about 0.6 s.
  - Leaving slides the character out to the side, and returning slides it in. The soft body and backdrop react to the movement for free.
  - `ax` is not clamped by the wander limit.
  - Under reduced motion it jumps.
- **Arriving:** when `away` is released, the action underneath resumes, and the engine plays `greet()` (hands, happy face, greet sound).
- **App wiring:**
  - `onChange("away")` → `engine.claim("link", "away")` and the ticker shows `S.reconnecting` ("Reconnecting…").
  - `onChange("online")` → `engine.release("link")` and the ticker clears.
  - `connecting` → the character starts claimed `away` with no ticker text, so the stage starts empty. The first `online` is the arrival, which replaces today's `engine.greet()` at start.
- **Presence:** no yawn or sleep while `link` is claimed.
- **Input:** stays enabled while away. A send still tries, and its stream result calls `reportUp` or `reportDown`.

### 7. Errors
- A 404 from `/v1/chat/stream` now reads as `S.unreachable` with Retry, instead of the raw "Not Found", and calls `link.reportDown()`.
- Other HTTP 4xx errors show as now.

### 8. Debug
New Simulate scenarios:
- **"away and back":** `link.reportDown()`, then after 4 s `link.reportUp()`. It drives the real watcher and the real arrival.
- **"tool flavours":** a scripted turn that calls a `lookup`, a `confirm` (proud) and a `draft` with `awaiting`, then ends holding approval.
- **"confused":** a scripted turn with an untagged tool.

`OK_TURN` in `src/debug/scripted.ts` gains `companion_action` on its tool calls, so the existing "turn" scenario isn't confused.

## Testing
- **`gateway`:** parsing of every new field, including unknown action and code strings becoming null, a nameless `tool_result` dropped, and `ok` and `awaiting` as strict booleans. `health()` is true on 200 and false on error or timeout.
- **`agent-map`:** every table row, and `strongerOutcome`.
- **`link`:**
  - first-check failure goes away at once;
  - online needs two failures in a row to go away;
  - the 30 s and 5 s cadence;
  - `reportDown` and `reportUp`;
  - no overlapping checks;
  - `onChange` only on change.
- **Controller:**
  - lookup → searching, change → working, untagged → confused;
  - a confirm result expresses proud;
  - an error result expresses annoyed and the turn still finishes;
  - `awaiting` holds approval after the reply and the next message clears it;
  - `ask` holds question;
  - approval beats question;
  - switching conversation clears a held outcome;
  - `tools_unavailable` expresses annoyed;
  - a stream 404 reports down and shows the unreachable note with Retry.
- **Engine:**
  - `away` moves `ox` past the banner edge and back;
  - leaving `away` greets;
  - `away` allows no expressions;
  - reduced motion jumps.
- **Presence:** no yawn while `link` is claimed.
- **Invariant:** the existing "asleep and in a mood, a turn shows the same actions" test still holds with tagged events.
- **Manual (`docs/manual-checks.md`):**
  - stop the gateway → the character slides out and "Reconnecting…" shows; start it again → the character slides in and waves;
  - launch with the gateway down;
  - a draft request holds amber until the next message;
  - an untagged tool shows lime.

## Out of scope
- Showing tool results or drafts in the chat log.
- Answering an approval from the companion UI with buttons. Today the person types yes.
- Per-category colours.
- Retry and backoff beyond the 5 s away cadence.
