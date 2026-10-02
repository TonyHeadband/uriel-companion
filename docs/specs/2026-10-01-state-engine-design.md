# State engine: actions, expressions and who owns the character

Status: design (2026-10-01). First of four sub-projects toward a companion that has a life of its own: **state engine** (this) → idle life director → deeper states and new visuals → games.

## Why
Today the character is driven by one `setState()` setter with three writers that don't know about each other:
- `ChatController` sets the turn states (`thinking`, `talking`, `working`, `searching`, `finished`, `error`, back to `idle`);
- `Touch` sets `dizzy` and `sleeping`;
- the debug panel and `preview.ts` force any state.

Conflicts are settled by one-off guards: `if (engine.state === "finished")` in the controller, `beforeDizzy` in `Touch`, `!busy && e.state === "idle"` before sleeping, `turn !== this.turn` for stale turns. An idle-life director would be a fourth writer and every new one multiplies the guards.

A state's behaviour is also spread over three places: the `STATES`/`MOTION` tables in `src/engine/states.ts`, the entry animations in the `setState` switch, and special cases in `update()` (sleeping's gaze, dizzy's sway, no blinks while asleep or dizzy). Emotes are a single eye-override slot: a new one replaces the old, and their delayed steps (`after()` timers) are never cancelled, so e.g. the yawn can close the eyes after something else has taken over.

And what the character *does* is tied to how it *looks*: there is no way to show "working, but sleepy".

## Decisions
- **Two axes: action × expression.**
  - The **action** is what the character is doing (`working`, `searching`, `sleeping`…). It owns the body: colour, tint, glow, badge, motion, body rhythm, entry gestures and sound.
  - The **expression** is how it feels. It owns the face: eye shape, blinking, eye scale, blush, tilt, gaze, expression particles and gestures, plus optional motion modifiers.
  - Speech always owns the mouth.
- **Colour belongs to the action.** It is the person's at-a-glance signal of what is happening; mood never changes it. The face, motion and particles are free for the companion's personality.
- **The behaviour layer is display only.** Nothing in the arbiter, expressions or presence may delay, block or drop a message, reply, speech or input. A send while asleep shows `thinking` in the same frame. `allows` filters expressions, never actions. One deliberate exception, chosen while testing (2026-10-01): after tool work the controller plays a short **finished beat** (`FINISH_BEAT_MS`, hop, roll and chime) before the reply, to call the person back, and the reply's *voice* waits for it while its text streams on.
- **Layered ownership, not a transition graph.** Writers claim one of four priority layers; the highest claimed layer is shown. Statecharts (every transition listed) and utility AI (every behaviour scores itself each frame) were considered: most transitions come from outside the engine (gateway events, the pointer), and chat states are deterministic, so both would add ceremony without solving the ownership problem.
- **Behaviour stays in typed TS data.** No user-editable config files: changes are made in code, by people or agents. Each action and expression is one data entry plus, at most, a named gesture.
- **One user setting:** sleep timeout, `ui.sleep_after_min` (default 10). Idle life on/off and frequency come with the idle life director.

## Design
### Units
```
ChatController ──claim/release "task"────────┐
Touch ─────────claim "interaction" (dizzy)───┤
               push expressions (poke, love) ┼──► Arbiter ──► current action ──┐
Presence ──────claim "rest" (sleep)──────────┤                                 ├──► CharacterEngine ──► Pose
(future) LifeDirector ── claim "life" ───────┘                                 │
                                  ExpressionStack (baseline mood + transients) ┘
```

| Unit | Job | Depends on |
|---|---|---|
| `src/engine/behaviour/gestures.ts` | Named keyframe tracks (`hop`, `littleHop`, `shake`, `spin1`, `spin2`, `yawnStretch`…), taken out of the `switch` statements | `anim`, `tweens` |
| `src/engine/behaviour/actions.ts` | `ACTIONS`: one entry per action | gestures |
| `src/engine/behaviour/expressions.ts` | `EXPRESSIONS`: one entry per expression | gestures |
| `src/engine/scheduler.ts` | Cancellable timers grouped by owner; cancelling an owner drops all its timers | clock |
| `src/engine/arbiter.ts` | Priority layers, `claim`/`release`, the current action, enter vs resume. Pure logic | scheduler |
| `src/engine/expression-stack.ts` | `push`/`cancel`/`setBaseline`, resolving the face over an action | scheduler |
| `src/engine/presence.ts` | Tracks the person's activity; yawns, claims and releases `rest` | arbiter, expression stack |
| `CharacterEngine` | Composes the above into a `Pose`: action → body, expressions → face, speech → mouth; smoothing, blinks, particles. It no longer decides anything | all of the above |

`src/engine/states.ts` keeps the shared types (`ActionName`, `ExpressionName`, `EyeShape`, `BadgeKind`, `Motion`) and loses its tables.

### Data shapes
```ts
// gestures.ts — one or more tracks; keys can stretch to the expression's duration (today's hold())
type Gesture = ReadonlyArray<{ prop: Prop; keys: (ms: number) => Key[] }>;
export const GESTURES = {
  blink, squash, hop, littleHop, shake, spin1, spin2,                                  // action entries, pokes
  bigHop, eyesWide, smallHop, blushHold, blushFlash, tiltBack, tiltSide, yawnStretch, // expressions
} satisfies Record<string, Gesture>;
export type GestureName = keyof typeof GESTURES;

type Gaze = "cursor" | "scan" | "down" | "sway" | { fixed: readonly [number, number] };

interface ActionDef {
  color: RGB; tint: number; glow: number; badge: BadgeKind | null; sound?: SoundName;
  motion: Motion;                       // today's MOTION entry, unchanged
  rhythm?: "bounce" | "breathe";
  enter?: Array<GestureName | { particles: ParticleKind; count: number; at: number }>;
  face: { eye: EyeShape; gaze?: Gaze; tilt?: number; blink?: boolean };  // gaze defaults to "cursor", blink to true
  ambient?: { particles: ParticleKind; every: number };                     // sleeping's z's
  /** Expressions that may show over this action; omitted means all. */
  allows?: readonly ExpressionName[];
}

interface ExpressionDef {
  /** 0 baseline mood, 10 ambient (yawn, happy), 20 reaction (love, annoyed, surprised). */
  priority: number;
  eye?: EyeShape;
  then?: { at: number; eye: EyeShape };   // yawn: tired, then closed at 700 ms
  blush?: number; tilt?: number; gaze?: Gaze;
  gestures?: GestureName[];
  particles?: { kind: ParticleKind; count: number; at?: number };
  sound?: SoundName;
  modifiers?: { pace?: number; range?: number };
}
```
Today's `STATES`, `MOTION`, the `setState`/`emote` switches and the `update()` special cases all map onto these entries. Examples:
- `sleeping`: `face: { eye: "closed", gaze: "down", blink: false }`, `rhythm: "breathe"`, `ambient: { particles: "z", every: 1300 }`, `allows: ["surprised"]`.
- `dizzy`: `face: { eye: "spiral", gaze: "sway", blink: false }`, `enter: ["shake", "spin2"]`, `allows: []`.
- `finished`: `enter: ["littleHop", "spin1", { particles: "spark", count: 5, at: 500 }]`.

An action without `enter` blinks on entry, as the `setState` switch's default branch does today.

### Resolving a frame
1. `action = arbiter.current`.
2. The face starts from `action.face`.
3. Active expressions are sorted from lowest to highest priority, the baseline first, with ties going to the newest. Any expression `action.allows` leaves out is skipped. Each remaining expression overrides **only the fields it defines**, so the highest one wins per field. Love's blush and yawn's tired eyes can show together.
4. The `pace` and `range` modifiers of every shown expression multiply, and are applied after liveliness and before the banner clamp.
5. When an expression starts, it plays its gestures, particles and sound once. Its timers belong to its handle. Cancelling the handle, letting it expire or having the action block it stops them; tweens already running finish.
6. When the action changes, the badge swaps, the sound plays, the entry gestures run and the character centres if the motion says so. These timers belong to the claim, so the finished sparks can no longer fire after the state has moved on.

Example: `working` + `yawn` shows blue colour, desk sliding and the dots badge, together with tired then closed eyes, a stretch and a z particle. A sleepy baseline would also slow the sliding.

### Arbiter
Layers, highest first: **`interaction` > `task` > `rest` > `life`**. A poke from the person beats even a chat turn for the few seconds dizzy lasts; the turn carries on underneath and resumes when it ends (decided while testing, 2026-10-01). Rest sits above life so falling asleep interrupts idle activities.

```ts
claim(layer: Layer, action: ActionName, opts?: { ms?: number }): ClaimToken;
release(layer: Layer, token?: ClaimToken): void;
readonly current: ActionName;   // "idle" when every layer is empty
```
- **Timed claims** release themselves after `ms`. They replace `Touch`'s `dizzyUntil`. A hidden claim's time keeps running.
- **Claiming** the layer's current action again does nothing, as `setState` does today. A different action replaces the claim and cancels its timers.
- **Releasing with a token** only works while that claim still holds the layer, so a stale turn can't release a newer one.
- **Enter vs resume.** A claim that becomes visible for the first time *enters*: badge, colour, sound, entry gestures, centring. A lower claim that becomes visible again because the one above released *resumes*: body channels and wander only, with no sound and no entry gesture. When dizzy ends over an idle activity on `life`, the activity carries on without replaying its entry.

Who claims what, with today's behaviour unchanged:
- **task** (`ChatController`): `thinking`, `talking`, `working` or `searching` during a turn. `error` holds until the next turn. `finished` plays only after tool work, as the beat between the work and the reply (searching/working → finished → talking); a chat-only reply goes thinking → talking. When the reply's speech ends the layer is released and the character settles to idle. An interrupt or hush releases the layer.
- **interaction** (`Touch`): `dizzy`, a timed claim of `DIZZY_MS`, with the ticker message shown while it lasts. Pokes and hover only push expressions (`annoyed`, `love`). Three quick pokes make it dizzy during a turn too, as before this work; when dizzy ends the turn's action resumes without its entry sound.
- **rest** (`Presence`): `sleeping`.
- **life:** unused until the idle life director.
- The debug panel and `preview.ts` claim at `task`, so a forced state shows over everything.

`setState` is removed; `engine.emote()` becomes `engine.express(name, ms) → handle`.

### Presence
- `presence.activity()` is called on window `pointermove`, on `keydown` and on every send. Keyboard-only chatting no longer puts the character to sleep (#16).
- **Falling asleep:** once `sleep_after_min` has passed with no activity, and `task` and `interaction` are both empty, it pushes `yawn` for 1.2 s and claims `rest: sleeping` 1 s later. Both belong to Presence, so activity during the yawn cancels the whole sequence.
- **Waking:** any activity releases `rest`, and whatever is below resumes. A send while asleep claims `task: thinking` above rest in the same frame and wakes it through `activity()`.
- **Setting:** `ui.sleep_after_min`, default 10, clamped to 1–120 in `normalizeConfig`, with a slider in the Settings tab.

### Reduced motion
Unchanged: gestures jump to their end, particles and wander are skipped, and blinks and colour stay. That logic moves from `animate()` into the gesture runner.

## Migration
Each step leaves the app working and the tests green.
1. Add `scheduler.ts` and `gestures.ts`; the engine's `after()` and keyframe constants move onto them.
2. Split the tables into `ACTIONS` and `EXPRESSIONS`; the engine resolves from data. Delete the `setState`/`emote` switches and the special cases in `update()`.
3. Replace `eyeOverride` with `ExpressionStack`.
4. Add `Arbiter`. `ChatController`, `Touch`, the debug panel and `preview.ts` switch to `claim`/`release`; remove `setState`.
5. Add `Presence`, the #16 fix and the `sleep_after_min` setting.

## Testing
Everything runs on the injected clock and RNG.
- **New unit tests:**
  - Scheduler: cancelling by owner.
  - Arbiter: priority, timed release, token-guarded release, enter vs resume, a hidden timed claim expiring.
  - Expression stack: per-field resolution, `allows`, ties going to the newest, cancelling a handle stops its pending steps, modifiers multiplying.
  - Presence: yawn then sleep, activity cancelling it, `keydown` counting (#16), no sleep while `task` or `interaction` is claimed, waking resumes the layer below.
- **Existing tests:** `character-engine`, `controller` and `touch` tests move to the new API with their pose and behaviour assertions unchanged. That is the evidence nothing visible regressed.
- **Invariant test:** with `rest` claimed and a sleepy baseline set, a scripted turn reaches `thinking` → `working` → `talking` in the same frames as without them, and the reply text is unchanged.
- Manual: the existing checks in `docs/manual-checks.md`, plus keyboard-only chatting past the sleep timeout.

## Out of scope
Each of these is a later sub-project:
- the idle life director, wall-clock time of day, and its settings;
- what sets the baseline mood, and mood that drifts over time;
- new actions and expressions, and their visuals;
- games and input routing;
- triggers for `question` and `approval`.
