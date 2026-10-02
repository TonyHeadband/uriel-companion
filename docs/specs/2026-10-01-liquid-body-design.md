# Liquid body: soft-body wobble, idle wandering and a liquid background

Status: design (2026-10-01). Builds on the [companion app design](2026-09-30-companion-app-design.md) and the
[talking mouth](2026-10-01-talking-mouth-design.md).

## Why
The character already has a face that lives (blinks, looks, talks), but its body is a rigid shape parked in the middle
of the banner. A body that jiggles like jelly or a water drop, a character that potters about while idle, and a
liquid backdrop make Uriel feel physical and alive, cheaply, without a fluid simulation.

## What it does
- **Soft body.** The outline wobbles when the body moves (wander, hop, squash, shake, roll, poke), sways when it
  turns its gaze, and pulses gently with each spoken syllable, then settles. Each character has its own feel: angel
  and orb are jelly, flame is watery, grid is almost stiff so the square stays crisp.
- **Idle life (idle state only, as a test before the other animations get the same treatment).** The character
  drifts to a new spot inside its own square every few seconds, and when the mouse is still its eyes look around on
  their own, often towards where it's about to go. Moving the mouse takes the gaze back at once.
- **Liquid background.** Behind the whole banner (and the answer text), a few soft blobs drift, merge and split like
  a lava lamp, tinted by the mood colour and pushed by the character's movement. A poke or a spoken syllable drops a
  ripple that rings out through them.

## Decisions
- **Composed in the frame loop, renderer-agnostic.** `engine.update()` → `softBody.apply(pose, character)` →
  `renderer.draw()`, with the background its own layer. The engine stays character-agnostic; renderers only learn to
  draw a deformed outline when the pose carries one, so 2.5D and 3D inherit everything.
- **Fake, not simulated.** A spring ring for the body, a metaball field and a coarse wave grid for the background. No
  fluid solver, no WebGL (WebGL is unverified on the NVIDIA + Wayland setup where DMA-BUF is disabled).
- **Wander stays in its corner.** Inside the character's square (left ~42% of the banner), never under the text: about
  ±0.3 R sideways and ±0.2 R up and down, which leaves room inside the square for a poke squash, the soft body's
  overshoot, the hands and the angel's halo.
- **Tunable per character, by feel.** Each character ships defaults; a "Body" section in Customization tunes the
  current character live and the overrides are saved per character.
- **Reduced motion:** no wander, no wobble, a still background, no ripples. The occasional glance stays (eyes only).
- **Frame budget:** ~100 spring points and a ~100 × 43 field per frame; same loop rules as today (full rate focused,
  ~30 fps unfocused, nothing hidden).

## Idle life (engine)
`CharacterEngine` gains two behaviours, active only while the state is `idle`:

- **Wander.** New smoothed props `wx`, `wy` (units of R) added to the pose's `ox`, `oy`. Every 3–6 s a new target is
  picked uniformly in x ∈ [−0.3, 0.3], y ∈ [−0.2, 0.2]; the props ease towards it (time constant ~0.8 s). Leaving
  `idle` sets the target to (0, 0), so it drifts home while the next state's gesture plays.
- **Look-around.** `setLook()` records when the mouse last moved. While idle and the mouse has been still ≥ 2 s, every
  1.5–4 s a random gaze target is picked (x ∈ [−0.8, 0.8], y ∈ [−0.4, 0.5], in the same units `setLook` produces).
  40% of the time the next wander target is chosen in that direction and starts ~400 ms after the glance, so it reads
  as "going over there". A mouse move cancels the glance immediately.
- Randomness uses the engine's injected `random`, so tests and the preview stay reproducible.

## Soft body (`src/engine/softbody.ts`, pure)
```ts
interface BodyTuning {
  /** Wobble frequency in Hz: higher is firmer. */
  firmness: number;
  /** Damping ratio 0–1: higher settles faster with less overshoot. */
  settle: number;
  /** 0–1: how much a gaze turn pushes the top of the body sideways. */
  sway: number;
  /** 0–1: how strong the outward pulse is on each spoken syllable. */
  bump: number;
}

class SoftBody {
  /** Advances to now and returns the deformed outline in units of R, plus how far the face should follow it. */
  apply(rest: ReadonlyArray<readonly [number, number]>, motion: BodyMotion, tuning: BodyTuning, nowMs: number):
    { outline: Array<readonly [number, number]>; face: readonly [number, number] };
  /** A spoken syllable: a small outward pulse. */
  bump(): void;
  reset(): void;
}
interface BodyMotion { x: number; y: number; yaw: number; sx: number; sy: number; tilt: number }
```
- Each outline point has an offset and a velocity relative to its rest position (rest = the character's outline at
  R = 1 for this frame, so the flame's flicker still works).
- **Inertia:** when the body moves by Δ (from `ox`/`oy` incl. wander) or scales/tilts, every point's offset is pushed
  by −Δ (it lags), then springs back: `a = −ω²·d − 2ζω·v + ω²·s·(avg(neighbours) − d)` with ω = 2π·firmness,
  ζ = settle, s = 0.5 (neighbour smoothing keeps the edge smooth, never spiky).
- **Sway:** a change in gaze yaw pushes points sideways in proportion to their height above the bottom, times `sway`.
- **Bump:** `bump()` adds an outward velocity along each point's normal, times `bump`.
- Offsets are clamped to 0.3 R. Integration is semi-implicit Euler in substeps of ≤ 1/120 s; a gap over 200 ms (window
  was hidden) resets to rest instead of integrating, so nothing explodes. A change in point count (character switch)
  resets too.
- **Face follows the body:** `face` is the mean offset of the upper half of the points; the renderer shifts eyes and
  mouth by it, so the face rides the wobble instead of floating over it.

Defaults (`CharacterDef.body`):

| Character | firmness (Hz) | settle | sway | bump |
|---|---|---|---|---|
| angel | 5 | 0.35 | 0.5 | 0.4 |
| orb | 4.5 | 0.3 | 0.5 | 0.4 |
| flame | 3 | 0.18 | 0.8 | 0.6 |
| grid | 12 | 0.8 | 0.1 | 0.15 |

`Pose` gains `body: { outline: ReadonlyArray<readonly [number, number]>; face: readonly [number, number] } | null`
(null when the soft body is off, e.g. reduced motion); `Flat2D` uses `pose.body.outline × R` instead of
`ch.outline(R, pose)` when present, and translates the face by `pose.body.face × R`.

## Liquid background (`src/ui/backdrop.ts`)
A `<canvas class="backdrop">` inside the stage card, behind the ticker text, covering the whole banner. It renders at
a quarter of the CSS size and is scaled up with smoothing, which also softens the edges.

- **Blobs:** 4 metaballs, radius 0.18–0.28 of the banner height, drifting at 0.02–0.05 banner-heights per second and
  bouncing off the edges. Field `f = Σ r²/d²`; alpha = smoothstep(0.8, 1.2, f). Colour = the current mood colour.
- **Pushed by the character:** blobs within 0.6 banner-heights of the character get its velocity × 0.6 added (the
  character's banner position comes from `ox`/`oy` and its square).
- **Ripples:** a 64 × 28 height grid with the standard wave update and 0.985 damping per step. A poke drops amplitude 1
  at the character; each spoken syllable drops 0.35. The ripple slope shades the blobs (± 25% brightness) and adds a
  faint sheen where there are no blobs, so a ripple is visible on its own.
- **API:** `update(nowMs, character: {x, y, vx, vy}, color)` once per frame; `ripple(strength)`; `setEnabled(on)`;
  `setOpacity(v)` (CSS opacity of the canvas). Off = hidden and not computed.
- Reduced motion: blobs drawn once, frozen; ripples ignored.

## Wiring
- The app (and preview) create a `SoftBody` and a `Backdrop`; the frame loop becomes engine → soft body → draw
  character → backdrop update.
- A syllable bump and ripple ride on the voice: the app wraps the `Voice` it gives `BlipSpeech` so each syllable also
  calls `softBody.bump()` and `backdrop.ripple(0.35)` (this works with the voice switched off, since the mouth still
  talks). A poke calls `backdrop.ripple(1)`.

## Config and Customization
- `body: Partial<Record<CharacterId, Partial<BodyTuning>>>` — only overrides are saved; missing values use the
  character's defaults; out-of-range values are clamped (firmness 1–15, the others 0–1).
- `ui.backdrop: { enabled: boolean; opacity: number }`, default `{ enabled: true, opacity: 0.5 }`.
- Customization tab:
  - **Body** (for the current character): sliders Firmness, Settle, Sway, Bump, and "Reset" back to the defaults.
  - **Background**: on/off and an Opacity slider.

## Testing
- `softbody`: at rest it stays at rest; a kick overshoots and settles within ~1 s for the defaults; a stiff tuning
  stays within a small offset; offsets never exceed 0.3 R; a 5 s gap resets instead of exploding; a point-count change
  resets; sway pushes the top more than the bottom; bump moves points outwards.
- Engine: wander only in idle and within range; returns home after leaving idle; look-around starts only after 2 s of
  a still mouse and a mouse move cancels it; reduced motion has no wander.
- `backdrop` (pure parts): field/threshold maths, blob bounce inside the banner, ripple decays to near zero, push only
  affects nearby blobs.
- Renderer: draws `pose.body.outline` when present and shifts the face by `pose.body.face`; grid still draws no
  circles.
- Config: defaults, clamping, partial overrides. Customization: the Body sliders report per-character changes.
- Visual check in the preview: wander, wobble on a poke, blobs and ripples, for all four characters.

## Not in this piece
- Wander, look-around and wobble-driven motion for states other than idle (next round, once idle feels right).
- WebGL backgrounds, real fluid simulation, the 2.5D and 3D renderers (they will consume `pose.body`).
