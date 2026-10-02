# Toon 2.5D: grid turns, pirouettes, and pulls tools from behind its back

Status: design (2026-10-01). Builds on the [state engine](2026-10-01-state-engine-design.md) and the [agent link](2026-10-01-agent-link-design.md).

## Why
Grid is drawn by `Flat2D` (`src/renderers/flat2d.ts`) as one flat Canvas2D superellipse.
- `yaw`, `pitch` and `roll` only slide the eyes and mouth over a pretend head sphere (`onHead`). The body never turns and has no back.
- The spins (`spin1` on `finished`, `spin2` on `dizzy`) animate `roll`, so they too move only the face.
- The hands are two blobs beside the body, drawn after it, with no depth. Nothing models an object the character holds.

The character should feel soft and toonish-3D without a real 3D engine. It should turn and pirouette. Each kind of tool work should also show as an item it pulls from behind its back: a magnifier while searching, a pen while working, a stamp while waiting for approval.

## Decisions
- **One pose, every renderer.** The engine never knows which renderer is drawing. Events, actions, gestures and timings are identical for 2d and 2.5d. The `Pose` is the only contract, and every renderer must draw every pose field sensibly. A field that only one renderer understands would break the other the day the engine starts using it.
- **A new renderer, not an upgrade.** It fills the existing `"2.5d"` slot in `createRenderer` (`src/renderers/renderer.ts`). Flat2D stays and is selectable.
- **A projected rounded slab, in Canvas2D.** There is no WebGL and no new dependency. Grid becomes a rounded box 0.6 R deep. Each frame it is rotated about the vertical axis and projected.
- **Toon shading:** hard bands from one fixed light, no soft gradients. The neon edge, glow and mood fill carry over from Flat2D.
- **A body turn separate from the gaze.** A new pose prop, `turn`, turns the body. `yaw` stays the gaze.
- **Items belong to actions:** `searching` → lens, `working` → pen, `approval` → stamp. The engine plays the reach and stow. The renderer decides how a reach looks.
- **Turns:** a pirouette for celebrations and the arrival, an occasional look-around while idle, a turn jolt on a poke, and a two-turn spin when dizzy.
- **2.5d becomes the default renderer**, and 2d stays in Settings.
- **Grid is the only shipped character.** Flat2D's leftover `halo` and `round` branches for the removed characters go when the shared parts move out.

## Design
### 1. Pose
`src/engine/props.ts` gains two props:

| Prop | Rest | Smoothing | Meaning |
|---|---|---|---|
| `turn` | 0 | `K_BODY` | Body yaw in radians. Spins wind it past 2π and `settle` snaps it back to 0. |
| `tip` | 0 | `K_BODY` | Body pitch in radians: positive tips the top toward the viewer (leaning forward, looking down). |
| `reach` | 0 | `K_BODY` | The right hand's reach: 0 at its side, 0.4 behind the body, 1 in front holding the item. |

`Pose` (`src/engine/pose.ts`) gains `turn: number`, `reach: number` and `item: ItemKind | null`:
```ts
export type ItemKind = "lens" | "pen" | "stamp";
```
`item` is the item in the hand. It is set by the engine (§5), not smoothed. It is null when the hand is empty.

### 2. Every renderer draws every field
| Field | 2.5d | 2d |
|---|---|---|
| `tip` | Tips the slab about the horizontal axis: the top wall shows (lit) when tipped forward, the bottom (shaded) when tipped back, and the face moves down or up. | Subtracts `tip` from the face's pitch, so the face slides down the head sphere when tipped forward. |
| `turn` | Turns the slab (§3). The face is drawn at `turn + yaw`. | Adds `turn` to the face's yaw, so the face sweeps across and back as today's roll spins do. The body narrows by `0.85 + 0.15·|cos turn|` for a hint of turning. |
| `reach` | The right hand follows a 3D path: behind the body (hidden) at 0.4, in front at 1 (§4). | The right hand shrinks away from 0.2 to 0.4 and grows back from 0.6 to 1 at its in-front position, the way hands already appear. |
| `item` | Drawn in the right hand when `reach > 0.4`. Hidden behind the body until it comes round. | Drawn in the right hand when `reach > 0.6`, growing with it. |

Both renderers draw the items with the same art from `src/renderers/items.ts`.

**The conformance test** is a shared table of poses fed to both renderers through the fake ctx. It covers:
- rest
- `turn` of π/4, π/2 and π
- mid-spin (`turn` = 5)
- `reach` of 0.4
- `reach` of 1 with each item
- `reach` of 1 with `item: null`
- away (`ox` = 6)

Each renderer must draw every pose without throwing and keep the body inside the canvas, except away. It must draw the item when `reach ≥ 0.7`. A new pose field adds rows here.

### 3. The slab (`src/renderers/slab.ts`, pure)
`CharacterDef` gains an optional `depth` (units of R; grid: 0.6). The existing `outline()` is the front face. All the functions below are pure and work in units of R.

- **`silhouette(front, turn, depth)`:** for each outline point (x, y), the projected point is x' = `sign(x)·(|x|·|cos θ| + (depth/2)·|sin θ|)` with y unchanged. It keeps the point count (96 for grid), so the soft body deforms it unchanged.
- **`faceX(x, turn, depth)`:** where a point on the front face lands, `x·cos θ + (depth/2)·sin θ`. The back face uses `−x·cos θ − (depth/2)·sin θ`.
- **`facing(turn)`:**
  - `"front"` while `cos θ > 0.15`
  - `"back"` while `cos θ < −0.15`
  - otherwise `"side"`
- **`project(x, y, z, turn)` → `{x, y, z}`:** rotates a body-space point about the vertical axis. z > 0 is toward the viewer.

The soft body deforms whatever rest outline it is given, and the renderer is what knows that outline:
- `Renderer` gains `restOutline(ch, pose): Array<readonly [number, number]>`.
- Flat2D returns `ch.outline(1, pose)`, and 2.5d returns the silhouette.
- `SoftBody.applyToPose` takes the rest outline as a parameter, and `app.ts` passes it `renderer.restOutline(...)`. The engine stays renderer-agnostic.

`BodyMotion` gains `turn`, which adds to the sway the way `yaw` does.

### 4. The toon renderer (`src/renderers/toon25d.ts`)
**Draw order:**
1. Glow
2. Hands with z < 0, and their item
3. Body:
   - silhouette fill (shade band)
   - visible face (lit or mid band)
   - side band
   - highlight strip
   - mood fill clipped to the silhouette
4. Face or back panel
5. Neon edge on the silhouette
6. Hands with z ≥ 0, and their item
7. Badge
8. Particles

**Shading:**
- The light comes from the top left but mostly from the front, `L = normalize(−0.25, −0.6, 0.76)`. The face then stays in the lit band across the everyday lean (±0.45 rad), and darkens only on a real turn.
- 2.5d never draws the slab dead-on: it adds a rest angle of −0.087 rad (about 5° toward the light) to `turn`, so face-on it shows a sliver of shaded side. This is the renderer's choice; the engine's `turn` is unchanged.
- The front normal is `(sin θ, 0, cos θ)`, the back normal its negative, and the side normal `(cos θ, 0, −sin θ)` with the sign facing the viewer.
- Brightness is `n·L` quantised to 3 bands, each edge blended over a narrow window (0.06 of `n·L`) so crossing it fades instead of popping: lit ≥ 0.55, mid ≥ 0.15, shade otherwise. Each band is the base colour mixed toward white or black by a fixed step.
- The highlight strip is a thin band inside the silhouette's top-left edge, drawn while `facing` is front or back.

**Face and back:**
- The eyes and mouth sit on the front face. Their x comes from `faceX`, their width is scaled by `cos θ`, and their alpha ramps from 1 at `cos θ = 0.35` down to 0 at 0.15.
- Gaze `yaw` and `pitch` still offset them on the head sphere, as today.
- The back panel shows while `facing` is back: a 3×3 grid of small rounded squares in the ink colour at 35% alpha.

**Hands:**
- Each hand's body-space position is `(±1.15, 0.42, 0)`.
- The right hand's position follows `reach` along keyed points, linear between keys:

| reach | Right hand at (x, y, z) |
|---|---|
| 0 | (1.15, 0.42, 0) |
| 0.4 | (0.45, 0.1, −0.8) |
| 0.7 | (1.05, 0.25, 0.2) |
| 1 | (0.95, 0.4, 0.7) |

- Each hand goes through `project(..., turn)`. Its size is scaled by `1 + 0.15·z`, and z decides whether it is drawn before or after the body.

**Overlays:** the badge and particles are in screen space and ignore `turn`.

### 5. Shared parts (`src/renderers/parts.ts`)
- **What moves out of `flat2d.ts`:** square eyes, mouth visemes, blush, badge, particles and hands. Each takes a context, a position and a scale, so both renderers call them.
- **What goes:** the `halo` accessory, `round` geometry branches and `tintBody`, along with their `CharacterDef` fields. No shipped character uses them.
- **Unchanged:** Flat2D's look at `turn = 0` and `reach = 0`. The existing Flat2D tests stay green.

### 6. Items (`src/renderers/items.ts`)
`drawItem(ctx, kind, x, y, size, ink, accent)` draws in square geometry: straight strokes and rounded squares, no circles. The items are:
- **`lens`:** a rounded-square frame with a diagonal handle.
- **`pen`:** a slanted bar with a pointed nib.
- **`stamp`:** a handle on a wide block.

`accent` is the current action colour, so a held item matches the state.

### 7. The engine
**Actions:** `ActionDef` gains `item?: ItemKind`, set on `searching: "lens"`, `working: "pen"` and `approval: "stamp"`.

**New gestures** (`src/engine/gestures.ts`):

| Gesture | Tracks |
|---|---|
| `pirouette` | `turn` → 2π from wherever it leans, 900 ms, `Ease.inOut`, `settle: 0` |
| `spin2` | `turn` instead of `roll`; 2 turns, 1300 ms |
| `turnJolt(side)` | `turn` → 0.3·side, 90 ms, `Ease.out`, then → 0, 260 ms, `Ease.back` |
| `lookAround(side)` | `turn` → 0.6·side, 450 ms, hold 1200 ms, → 0, 500 ms |

`turnJolt` and `lookAround` are functions of the side (1 or −1), outside `GESTURES`, since the engine picks the side.

The reach and stow are keyframe lists (`REACH_KEYS`: → 1, 600 ms, `Ease.out`; `STOW_BEHIND`: → 0.4, 250 ms, `Ease.inOut`; `STOW_SIDE`: → 0, 250 ms, `Ease.out`), not gestures. The engine chains them, because the item changes hands at 0.4.

`spin1` is removed: `finished` enters with `pirouette`, and `proud` gains `pirouette` alongside `tiltBack`.

**The item lifecycle:**
- When the current action changes, the engine compares the old and new `item`.
  - **Same item:** nothing happens.
  - **None to some:** set `item`, then play `reach`.
  - **Some to none:** play `stow`, and clear `item` when it ends.
  - **Some to another:** play `stow` as far as 0.4, swap `item` there, then play `reach`.
- This runs whatever the layer, so a dizzy over working stows the pen, and working resuming takes it out again.
- An action left mid-reach stows from wherever `reach` is.

**One heading for eyes, body and travel:** each frame the engine computes a heading in gaze units (yaw right, pitch up). Standing still it is what the character attends to: the mouse, an idle glance, or the state's fixed look (down, or at you). The more it still has to go, full at 0.3 R, the more the heading points where it's going instead: 0.6 yaw and 0.45 pitch along the travel direction. The eyes follow the heading, plus small saccades (±0.04 yaw, ±0.03 pitch, a new hop every 0.45 s, from the clock, none under reduced motion). The body follows it by fixed shares, `turn = 0.7 · heading yaw` and `tip = −0.5 · heading pitch`, so it never points a different way from the eyes. Searching's scan and dizzy's sway stay the eyes' own; the body keeps to the heading there, and the scan gives way to the heading as the character sets off. This replaces the old `lead` motion flag.

**Idle look-around:** while the effective action is `idle` and the mouse has been still (the existing glance condition), the engine plays `lookAround` every 20–40 s, picking ± at random. It never plays over another action.

**Poke:** `Touch.click` plays `turnJolt` (sign random) along with the existing squash, except when the poke turns into dizzy.

**Arrival:** leaving an offstage action plays `pirouette` and `greet()` together, so it spins in waving.

**Reduced motion:**
- `pirouette`, `spin2`, `lookAround` and `turnJolt` don't play.
- `reach` and `stow` jump to their end values, so the item still appears and goes.

### 8. Wiring
- `createRenderer("2.5d")` returns `Toon25D`. `"3d"` still warns and falls back, now to 2.5d.
- `config.ts` defaults `character.renderer` to `"2.5d"`. An existing config that names `"2d"` keeps it.
- The Settings renderer switch and `preview.ts?renderer=` already exist and need no change, apart from their option labels if they list the renderers.
- `scripts/screenshots.mjs` adds 2.5d frames at turn 0, π/4, π/2 and π, and one holding each item.

## Testing
- **`slab`:**
  - The silhouette half-width is 1 at turn 0, depth/2 at π/2, and 1 at π.
  - The point count is preserved.
  - `facing` at 0, π/2 and π.
  - `project` puts the right hand at z < 0 when turn = π/2.
- **Conformance (§2):** both renderers draw every row.
- **`toon25d`, using the fake ctx:**
  - The face is drawn at turn 0 and not at π.
  - The back panel is drawn at π.
  - At `reach = 0.4` the hand is drawn before the first body fill.
  - At `reach = 1` the item is drawn after the neon edge.
- **`flat2d`:**
  - The existing tests stay green.
  - At `reach = 0.4` the right hand isn't drawn.
  - At `reach = 1` the item is drawn.
  - `turn` moves the eyes.
- **`parts`:** covered by the renderer tests. No separate unit is needed beyond what moves.
- **Engine:**
  - `pirouette` ends with `turn` exactly 0.
  - working → searching swaps pen for lens through 0.4.
  - working → idle stows and clears the item.
  - dizzy over working stows, and resuming working reaches.
  - lookAround plays while idle with a still mouse and never while working.
  - The arrival plays pirouette then greet.
  - Under reduced motion, reach jumps to 1 and pirouette doesn't play.
- **Soft body:** with `turn` set, the outline it returns has the silhouette's point count.
- **Manual (`docs/manual-checks.md`):**
  - Switch the renderer live in Settings, both ways.
  - "tool flavours": lens, then stamp held at the end.
  - "away and back": it spins in waving.
  - Poke for a jolt, and five pokes for the dizzy spin.
  - Idle about 40 s for a look-around.
  - The 2d renderer shows the same items and spins without breaking.

## Out of scope
- Real lighting, perspective cameras or WebGL.
- Items for other actions, and for expressions.
- Left-hand items, or two-handed holds.
- Per-character depth tuning in Customization.
