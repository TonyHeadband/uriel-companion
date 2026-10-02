# State motion: give every state its own way of moving

Status: design (2026-10-01). Builds on the [liquid body](2026-10-01-liquid-body-design.md), whose idle wander it extends to every state.

## Why
Only `idle` moves around today: it wanders and looks about, through `idleLife()` in `src/engine/character-engine.ts:278`. Every other state parks the character at the centre, with only a gesture (hop, shake, roll) and gaze tweaks.

Every state should to feel alive:
- active states (working, searching) more eclectic: darting, bouncing, faster;
- calm states (finished, question, approval) moving less.

The soft body and the backdrop already react to any movement of `wx`/`wy`. So this work only has to make the engine move differently per state; the wobble, the backdrop push and the ripples come for free.

## Decisions
- **Placement.** Talking, question, approval and error come back to the centre when they start, so you notice them. Every other state carries on from wherever the character is.
- **Active feel: searching darts, working moves between desks.**
  - Searching makes short quick dashes, with a small hop as each starts.
  - Working doesn't dart: it slides smoothly between three desks and stays a few seconds at each, so it reads differently from searching.
  - Searching roams the whole banner and keeps its scanning eyes when it stops; during a dash its gaze leads the way it's going.
- **Tuning: one Liveliness slider** (0–1, default 0.5) in Customization. It scales range and speed for every state; the per-state values stay in code.
- Reduced motion: no wander in any state, as today.

## Design
### Motion profile per state
`StateCfg` gains `motion` (in `src/engine/states.ts`):
```ts
interface Motion {
  range: { x: number; y: number }; // wander box around centre, units of R (banner limit x 2, y 0.2)
  every: readonly [number, number]; // ms between moves (min, max)
  pace: number;                     // ease time constant in s: lower is quicker
  desks?: number;                   // only move between this many evenly spaced spots (working)
  hop?: number;                     // hop height (R) as a dash starts
  lead?: boolean;                   // gaze looks where it's going during a dash
  glance?: boolean;                 // look-around while the mouse is still (idle today)
  centre?: boolean;                 // go to the centre on entry (attention states)
}
```

| State | range x/y | every (ms) | pace (s) | extras | feel |
|---|---|---|---|---|---|
| idle | 2 / 0.2 | 3000–6000 | 1.5 | glance (glance-led wander as today) | pottering about (unchanged) |
| thinking | 0.6 / 0.1 | 4000–7000 | 2.5 | — | slow pondering drift |
| talking | 0.4 / 0.05 | 2500–4000 | 1.2 | centre | comes to the centre to speak, then sways gently |
| working | 1.2 / 0 | 3000–5000 | 0.6 | desks 3 | slides between three desks (−1.2, 0, 1.2), stays a while at each, no hop |
| searching | 2 / 0.2 | 800–1800 | 0.3 | hop 0.06, lead | darting around the banner |
| question | 0.3 / 0.05 | 3000–5000 | 2 | centre | calm, head tilted |
| approval | 0 / 0 | — | 0.4 | centre | keeps its bounce, holds still |
| error | 0 / 0 | — | 0.4 | centre | shake, then holds |
| finished | 0.5 / 0.08 | 3000–5000 | 2 | little jump on entry | a happy hop, then content, slow drift |
| sleeping | 0 / 0 | — | — | — | stays where it fell asleep |
| dizzy | 0.6 / 0.1 | 400–900 | 0.35 | error's wiggle on entry | wiggles, then a wobbly stagger |

- Targets are always picked inside the state's box around the centre. When a calm state follows a busy one, the character drifts back towards the middle at that state's slow pace.
- `centre` states snap their target to (0, 0) on entry and ease there at their own pace (0.4 s).

### Engine (`src/engine/character-engine.ts`)
- Generalise `idleLife()` into `stateLife(n)`, driven by `STATES[current].motion`:
  - schedule the next move;
  - pick the target (`wanderTo` clamps to the state's box);
  - on a dash start, play a hop tween on `oy` (`[[-hop, 120, Ease.out], [0, 220, Ease.back]]`) via the existing `animate()`;
  - `lead`: add `sign(target.wx − v.wx) × 0.4` to the yaw target while the gap is large.
- Make the wander smoothing constant per state (`Math.exp(-1/pace)`) instead of the fixed `K_WANDER`.
- On `setState`, re-arm `nextWander` with the new state's `every`. `centre` states call `wanderTo(0, 0)`.
- The idle glance logic stays idle-only, now read from `motion.glance`.
- New `setLiveliness(l)`. Factor `f = 2l`:
  - range × f, clamped to the banner limits;
  - `every` and `pace` × (1.5 − l);
  - `hop` × f;
  - l = 0 means no wander in any state, though glances stay.
- Reduced motion: no wander and no hops (`animate()` already jumps hops to their end).

### Config, UI and wiring
- `src/config.ts`: `ui.liveliness: number`, default 0.5, clamped 0–1.
- Customization: a "Liveliness" slider, using the existing `slider` helper in `src/debug/panel.ts` next to the Body/Background sections. It calls `engine.setLiveliness` and saves to config.
- `src/app.ts` and `src/preview.ts`: apply the saved value at start. The preview gets a `?live=` query value for checks.


## Testing
- **Engine tests (vitest, fake clock and seeded random)**, in `character-engine.test.ts`:
  - each state's targets stay inside its box;
  - working and searching move more often than finished;
  - question, approval and error head to (0, 0) on entry;
  - other states keep their current position on entry;
  - a hop plays on a dash only for searching; working stops only at its three desks;
  - `lead` biases yaw towards the direction of travel;
  - liveliness 0 means no wander, and 1 means wider and quicker moves, still clamped to the banner;
  - reduced motion means no wander in any state;
  - the idle behaviour is unchanged, so the existing idle tests still pass.
- **Config tests:** default value and clamping. **Panel test:** the slider reports changes.
- Run `npx vitest run` and `npx tsc --noEmit`. Both must be green.
- **Visual check** in the preview (Playwright, port 1422): cycle through every state through the debug state buttons, sampling the canvas over time to confirm movement per state. Then a manual try in the app.

## Not in this piece
- Per-state tuning in the UI (one Liveliness slider only).
- New gestures per state beyond the dash hop; the 2.5D/3D renderers.
