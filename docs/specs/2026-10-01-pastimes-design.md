# Pastimes: things grid does when nothing's going on

Status: built, phases 1 and 2 (2026-10-01); phase 2 via [Routines](2026-10-01-routines-design.md). Builds on [Environment](2026-10-01-environment-design.md).

## Why
Idle is one behaviour: drifting, glancing around and the odd look over the shoulder. Over minutes it gets monotonous. Now that scenes can bring furniture and objects in, idle can break up with small activities that make the character feel like it lives there.

## Decisions
- **Five pastimes:** reading in an armchair, a coffee break, watering a plant, playing with a ball, and jumping rope.
- **Phased:**
  - Phase 1 is the framework plus reading, coffee and watering. These are "use a held item at a spot".
  - Phase 2 is ball and jump rope. These need objects that move on their own: a ball rolling in depth, and a rope swinging round the body.
- **Timing:**
  - While plain idle shows, one pastime starts every 1–3 min, scaled by liveliness. It lasts 15–30 s.
  - The same one never comes twice in a row.
- **What ends a pastime:** a chat turn or other task, falling asleep, or a poke. Each ends it for good. It is not resumed afterwards.
  - Moving the pointer doesn't end it. The eyes follow the pointer as usual.
- **Calm modes still play pastimes.** At liveliness 0 or with reduced motion, the scene still rises and the pastime plays where the character stands, without walking, as scenes already do.
- **One settings switch, "Scenes", default on.** Off means no scene for any action (search, work, sleep) and no pastimes. It is the performance switch: off is the plain close-up of before.
- **Debuggable:** Customization gets an "Idle activities" group, with one button per pastime plus "Random now". The buttons go through the scheduler, the same path as a real start.

## Design
### 1. Pastimes are actions on the `life` layer
- **New `ActionName`s:** `reading`, `coffee`, `watering`, plus `ball` and `jumprope` in phase 2.
- **Each is an ordinary `ActionDef`** (`src/engine/actions.ts`) with colour, glow, face, motion, an optional `scene` and an optional `item`. A new flag, `pastime: true`, marks them.
  - The debug "State" group skips pastimes, which get their own group.
  - The scheduler picks only from pastimes.
- **They are claimed on `life`,** the layer `src/engine/arbiter.ts` already reserves below `rest` and doesn't use yet. `task`, `rest`, `interaction` and `link` all cover it without new arbitration code.

| Pastime | Colour | Scene | Item | Spot |
|---|---|---|---|---|
| `reading` | warm amber | `nook`: an armchair and a floor lamp | `book` | sitting in the armchair (`lift`), facing us |
| `coffee` | coffee brown | `cafe`: a small table and a stool | `mug` | on the stool behind the table, facing us |
| `watering` | sky blue | `garden`: a plant on a stand | `can` | beside the stand, side-on toward the plant |

### 2. The scheduler: `src/engine/pastimes.ts`
`Pastimes` is a class shaped like `Presence`: dependencies injected (`engine`, `now`, `random`), and `tick()` called every frame.

- **When it waits:** only while nothing but idle shows, meaning no `link`, `task`, `interaction` or `rest` claim and its own `life` claim not held.
  - The wait is 1–3 min, divided by `0.5 + liveliness`, so liveliness 1 comes about 1.5× as often as the default.
- **When the wait is up,** it claims a random pastime on `life` with `{ ms: 15–30 s }`. It never picks the last one again.
- **Covered means over:** if any higher layer is claimed while its claim is held, it releases `life`. That covers a task, sleep and dizzy.
- **Plain pokes** aren't claims. `stop()` ends the current pastime, and the app's click handler calls it next to `touch.click()`.
- **Off:** `setEnabled(false)` releases `life` and stops scheduling. It follows the Scenes switch.
- **`startNow(name?)`:** starts that pastime, or a random one, right away. The debug buttons use it.
- **Restart:** after a pastime ends the wait starts again, so pastimes don't run back to back.

### 3. Beats: the repeating part of a pastime
An `ActionDef.beat` says what repeats while the pastime shows, as `{ every: [min, max] ms, use: Key[], blink?: boolean, mouth?: Viseme }`. With `mouth`, the pose's mouth takes that shape, opening with `use`, whenever nothing is speaking.

- **`use`** is a new engine channel and pose field, 0–1: how far the held item is in use. It is tweened by the beat's keys and rests at 0.
- **The engine plays the beat** while the action shows and the character has settled at its spot, the same condition that drives `scribble` now.
- **Renderers draw `use` on the held item,** in `src/renderers/items.ts`, shared by both renderers:
  - `book`: an open book, pages in the accent. At high `use` the right page sweeps over to the left (a page turn).
  - `mug`: a small cup with a handle. `use` brings it in to the mouth, which is level with the resting hand, and tilts it a little (a sip), so it never covers the eyes. The beat's `mouth: "O"` opens the mouth round with the sip. Speech always takes the mouth first.
  - `can`: a watering can with a spout. `use` tilts it spout-down (a pour).

| Pastime | every | `use` keys | with the item |
|---|---|---|---|
| reading | 4–6 s | up over 300 ms, back over 300 ms | the eyes blink after a turn |
| coffee | 3–5 s | up over 500 ms, hold 600 ms, down over 500 ms | steam curls up while the mug rests |
| watering | 3–4 s | tilt over 400 ms, hold 900 ms, back over 400 ms | drops fall from the spout once it pours |

- **Steam and drops are drawn with the item,** by `drawItem` from `use` and the time, so they always leave from the mug and the spout. The engine adds no particle kinds: it can't know where a renderer draws the item.
- **Where the hand holds an item:** `handShift` also places the book in front and low, so it never hides the eyes, and the can up and out over the pot.

### 4. Fixtures and scenes (`src/scene/`)
- **New fixtures:** `armchair` (seat, back, arms), `floorLamp` (base, pole, shade with the `lamp` role), `cafeTable` (top and a central leg), and `plantStand` (stand, pot and leaf boxes). The plant doesn't react to watering. A plant that perks up would need per-scene state, so it waits until something else needs that too.
- **New scenes `nook`, `cafe` and `garden`.** Each has one spot, a zoom and a brisk `pace`.
- **The armchair is roomy:** the seat between its arms is as wide as the character.
- **The armchair is drawn in depth like the bed:** it splits into `armchair` (seat and back, behind) and `armchairArms` (in front), so the character sits between them.
- **Plan tests:** `src/scene/plan.test.ts` and `src/renderers/scenery.test.ts` run over every scene, so the new scenes are checked for spots on open floor, walks that avoid fixtures, and fit in the banner.

### 5. The Scenes switch
- **Config:** `ui.scenes: boolean`, default `true`, normalised in `src/config.ts`. The Rust side stores the config without knowing its fields, so it needs no change.
- **Engine:** `CharacterEngine.setScenes(on)`. Off, `enter` passes `null` to `scene.set`, and a scene already showing sinks.
- **Scheduler:** `Pastimes.setEnabled(on)`.
- **UI:** a toggle in Customization next to Background, wired through `src/settings/commands.ts` and `remote.ts` like the backdrop toggle, and saved with `saveSoon()`.

### 6. Debug panel (`src/debug/panel.ts`)
- **"Idle activities" group:** a button per pastime plus "Random now", each calling `pastimes.startNow(...)`.
- **"State" group:** filters out pastimes.
- **Preview:** `preview.html` accepts `state=reading` etc. through the existing `?state=`. Frozen screenshots claim on `life` for pastimes so they match the real path.

### 7. Phase 2 (superseded by [Routines](2026-10-01-routines-design.md))
- **Ball:**
  - The pose gets `prop: { kind: "ball"; x; y; z; spin } | null`, a free-moving object in world units.
  - The engine simulates it: a roll with friction, a bounce, and a kick when the character reaches it. The character walks to the ball rather than to fixed spots.
  - Both renderers draw it in the depth list, as a layer at its own z.
- **Jump rope:**
  - The `rope` item is held in both hands. Its phase is `use`, wrapping 0–1 per turn.
  - Renderers draw the rope as an arc round the body: in front for half a turn and behind for the other half, split around the body in the depth order.
  - `oy` hops are timed to the rope passing under the feet.

## Testing
- **`src/engine/pastimes.test.ts`:**
  - No pastime before the wait.
  - One starts within 1–3 min of plain idle; liveliness changes the wait.
  - The same one never comes twice in a row.
  - It ends after its `ms`.
  - A task, `rest` or `interaction` claim ends it for good, with no resume.
  - `stop()` ends it.
  - `setEnabled(false)` ends it and stops scheduling.
  - `startNow` starts the one asked for.
- **Engine:** `use` stays at rest until settled, then beats within its `every` window. With scenes off, no scene shows for searching, working or sleeping.
- **Conformance:** rows for `book`, `mug` and `can`, each at `use` 0, 0.5 and 1, in both renderers. `src/renderers/items.test.ts` draws each one for real at those values.
- **Scenes:** the existing per-scene plan and fit tests cover `nook`, `cafe` and `garden`.
- **Screenshots:** `scene-reading`, `scene-coffee` and `scene-watering` in both renderers.
- **Manual checks:**
  - Leave it idle with the mouse still: a pastime comes within about 3 min.
  - Send a message mid-pastime: it ends and doesn't come back.
  - Turn Scenes off: no furniture anywhere.
