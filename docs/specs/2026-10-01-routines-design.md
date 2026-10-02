# Routines: scripted scenes, a football and a jump rope

Status: built (2026-10-01). Builds on [Pastimes](2026-10-01-pastimes-design.md), whose phase 2 it replaces, and on [Environment](2026-10-01-environment-design.md).

## Why
- **Two new pastimes:** football and jump rope. They need objects that move on their own: a ball rolling in depth, and a rope turning round the body.
- **One structure for scripted scenes.** Each new scene shouldn't grow its own controller, so this adds a general way to script what happens in a scene, plus the moving objects in it. Football and rope are the first scripts.
- **Existing pastimes move too:** reading, coffee and watering are ported onto it, so every pastime runs the same way.

## Decisions
- **Routines:**
  - A routine is a generator script run by one `Routine` class, through a shared set of verbs.
  - `ActionDef.routine` names the script. While that action shows, the routine replaces the default wander.
- **Things:**
  - Things are moving scene objects, separate from fixed fixtures.
  - The pose carries them as `things`. One shared simulation in the engine moves the free ones.
  - Renderers draw each kind, in the depth list.
- **Football:**
  - The goal stands at the back of the `pitch` scene.
  - Grid lines up behind the ball and off to its outer side, and shoots away from the camera, turned to face the goal. Straight behind the ball, its body hid both the goal and the shot.
  - Shots aim at the goal mouth with random error, so about 6 in 10 score. A goal billows the net, and Grid turns to the camera and does a happy hop.
  - A miss rolls off. Grid chases it down and lines up again.
- **Jump rope:**
  - It happens on the open `yard` floor, facing the camera.
  - The skip is steady, with a hop timed to each pass of the rope.
  - Once or twice per session the rope catches Grid's feet: a stumble and a wobble, then it restarts slowly.
- **Migration:**
  - Reading, coffee and watering become routines, and `ActionDef.beat` is deleted.
  - Searching, working and sleeping keep their current spot-and-dwell path. Porting them is a follow-up issue.
- **Unchanged pastime rules:**
  - Timing, what ends a pastime, the Scenes switch, and calm modes playing in place all stay as before.
  - The debug "Idle activities" section and the scheduler pick up the new pastimes on their own.

## Design

### 1. Things: `src/engine/things.ts`
- **The pose type:**
  ```ts
  type ThingKind = "ball" | "rope";
  interface Thing { id: string; kind: ThingKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: number; phase: number; rate: number; held: boolean; show: number }
  ```
- **Units and coordinates:**
  - Lengths are in R, in world coordinates, so `y` is down.
  - A thing on the floor has `y = 0`; a ball in the air has `y < 0`.
  - `spin` is the roll angle in radians. `phase` is 0–1 for things that cycle, like the rope's turn, and `rate` is how many turns per second it advances.
  - `held` things ignore `x/y/z`: renderers draw them from the hands.
- **The pose field:** `Pose.things: readonly Thing[]` (renderers read only `kind`, `x`, `y`, `z`, `spin`, `phase`, `held` and `show`). `restPose` has `things: []`.
- **`stepThings(things, dt, world): Thing[]`** is pure, and moves the free things one step:
  - **Gravity on `y`,** with a damped bounce off the floor. Bounces below a small speed settle to 0.
  - **Rolling friction** on `vx/vz` while on the floor.
  - **`spin`** advances with the distance rolled divided by the ball's radius.
  - **Colliders:**
    - `world.posts`: circles in x/z, taken from the scene's fixtures. The ball bounces off them.
    - `world.bounds`: the play area's rectangle. The ball bounces off its edges.
  - **Nets,** `world.nets`: rectangles in x/z, open toward the viewer.
    - A ball coming in through the open side is slowed hard while it's going in, so it dies in the net. It can roll back out freely.
    - The back of the net is elastic: the ball sinks into it a little and springs back. The renderers draw that sinking as the net billowing.
    - The sides and back are walls to a ball outside.
  - **`resting(thing)`:** true when it's on the floor and its speed is below a threshold.
- **The world comes from the scene.**
  - `SceneDef.world?` declares `bounds`. Fixture boxes with role `post` add posts, and role `net` adds a net zone.
  - Each fixture defines its own colliders as data, like its footprint.

### 2. Routines: `src/engine/routine.ts`
- **`Routine`** runs one script.
  - The engine creates it when an action with a `routine` starts, ticks it every frame, and cancels it when the action ends.
  - Cancelling calls the generator's `return()`, so a routine cut short mid-walk stops cleanly.
- **A script** is a `RoutineScript = (r: RoutineCtx) => Generator<Wait, void>`.
  - It yields `Wait` values, meaning "resume me when this holds".
  - The runner checks the current wait each tick and resumes the generator once it's met.
- **Verbs on `RoutineCtx`.** Each is a thin wrapper over what the engine already does.
  - **`walkTo(pt | spot)`**
    - Plans with `planWalk` and walks with the existing mover, including lift, leap, turn and via. It finishes on arrival.
    - In calm mode it doesn't walk; it just turns where the character stands.
  - **`face(turn)`:** eases `turn`, and finishes when it's settled.
  - **`wait(ms | [min, max])`**
  - **`play(gesture)`:** runs one of `GESTURES`, and finishes when its keys end.
  - **`use(keys, opts?: { mouth?: Viseme; blink?: boolean })`**
    - Tweens the `use` channel.
    - `mouth` shapes the mouth while `use` is up, unless speech has it.
    - `blink` blinks after the tween.
  - **`express(name, ms)`:** shows one of the existing emotes, silently, for a while: its eyes and its mouth.
  - **`until(cond)`:** finishes when `cond()` returns a value other than `false`, and returns that value.
  - **Things:**
    - `spawn(thing)` and `thing(id)`;
    - `kick(id, v)`, which sets a free thing's velocity;
    - `place(id, pt)`;
    - `set(id, patch)`, which sets anything else, such as the rope's `rate` or its `phase`;
    - `rollTo(id, pt)`, a kick just hard enough that friction stops the ball at `pt`.
  - **`calm`:** true at liveliness 0 or with reduced motion.
  - **`random`:** the engine's injected random.
- **The engine owns the routine's things.**
  - It steps them with `stepThings` every frame, emits them on the pose, and fades their `show` with the scene's.
  - When the action ends, its things sink out with the scene and are dropped.
- **Routines live in `src/engine/routines/`,** one file per script, in a `ROUTINES` registry keyed by `RoutineName`.

### 3. Football: `routines/football.ts`, scene `pitch`
- **The scene:**
  - `pitch`: zoomed out, with the `goal` fixture at the back centre (z about −1.6).
  - `world.bounds` spans the visible floor. Its back edge lines up with the back of the goal, so a ball never ends up behind the goal.
  - The ball spawns on a penalty spot off to one side, at (1.4, 0), so Grid never stands between the camera and the goal.
- **The `goal` fixture:**
  - Two `post` boxes and a crossbar `frame` box.
  - Net boxes (`net` role) for the back and sides.
  - Its footprint covers the net, so walks route round it.
- **The script loops:**
  1. **Line up:** `walkTo` a point 0.6 R past the ball along the line from the goal mouth, and 0.8 R out to the side away from the goal's middle, turned to face the goal.
  2. **Set:** `face(π)`, then `play("windUp")`, a new gesture that leans back and squashes.
  3. **Kick:**
     - `play("kick")`, a new gesture: a tip forward and a small hop.
     - At its peak, `kick("ball", …)` toward a target in the goal mouth.
     - The target's x error is drawn so that about 60 % land between the posts.
     - The shot has a small loft (`vy < 0`).
  4. **Watch:** `until` the ball is in the net, or rolling slower than 0.4 R/s. Friction takes seconds over the last crawl to a dead stop, so Grid goes for it before then.
  5. **Outcome:**
     - **Goal:**
       - `face(0)`, `play("hop")` and `express("happy", 900)`.
       - After a beat the ball trickles out of the net, with a gentle `kick` forward.
     - **Miss:** a short `wait`, and the loop goes back to line up wherever the ball stopped.
- **Calm mode:**
  - No walking: Grid shoots from its spot.
  - Once the ball rests or lands in the net, it is `kick`ed gently back to Grid's feet.

### 4. Jump rope: `routines/rope.ts`, scene `yard`
- **The scene:** `yard` is the zoomed-out open floor, with no fixtures. One spot in the middle faces the camera.
- **The rope** is a `held` thing.
  - `phase` 0 is overhead, 0.25 in front of the body, 0.5 under the feet, 0.75 behind.
  - It turns about the axis through the two hands, which are drawn out at the sides holding the handles.
- **The script:**
  - It turns the rope at about 1.6 turns/s.
  - Each turn it plays `skipHop`, a new low, quick hop, timed so the hop peaks as `phase` passes 0.5.
- **Trips:**
  - One or two per session, at random turns.
  - The rope's phase holds at 0.5 (under the feet) while Grid lands on it.
  - Then `play("stumble")`, a new gesture: a shake and a tilt, with `express("annoyed", 700)` for the line eyes and the pursed mouth.
  - After a pause, the rope restarts at half speed and builds back to tempo over a few turns.
- **Reduced motion:** a slower tempo, a smaller hop, and no trips.

### 5. Ported pastimes
- **Reading, coffee and watering** each become a script: `walkTo` the scene's spot, then loop on `wait(every)` and `use(keys, …)`, with the same `every`, keys, blink and mouth values as their beats today.
- **Deleted engine code:**
  - `ActionDef.beat`, `nextBeat`, `beatMouth` and the beat block in `stateLife`.
  - The mouth now comes from the routine's `use` verb.
- **Searching, working and sleeping are unchanged** and still use spots, dwell and `writes`.

### 6. Renderers
- **`src/renderers/things.ts`** holds the shared geometry for both renderers:
  - **`ballPatches(spin)`:** the football's dark patches in the refined square style (a round ball, squared patches) rotated by `spin`.
  - **`ropePoints(phase, hands)`:** points along the rope's arc between the two handles, each with a depth sign, so the part behind the body and the part in front can be drawn apart.
- **The ball** joins `paintInDepth` as an entry at its own `z`.
  - It gets a floor shadow that shrinks and fades as `y` lifts.
  - It is drawn at its projected size.
- **The rope** splits around the body the same way the hands already do: back points before the body, front points after.
- **The goal:**
  - `post` boxes are drawn as solid frames.
  - `net` boxes are drawn as a see-through grid of lines, so the ball shows through.
  - The back net panel bulges toward the back by however far the ball has sunk into it. This is computed from the pose alone.
- **Both renderers.** `toon25d` shades the ball as a sphere. `flat2d` draws it flat, with the same depth order.

### 7. Wiring
- **Types:**
  - `ActionName` gains `football` and `jumprope`, both with `pastime: true`, a scene and a routine.
  - `SceneName` gains `pitch` and `yard`.
  - `FixtureKind` gains `goal`.
  - `BoxRole` gains `post` and `net`.
- **Gestures:** `windUp`, `kick`, `skipHop` and `stumble` are added to `GESTURES`.
- **Preview:** `preview.html?state=football` and `?state=jumprope` work through the existing path, claiming on `life`.
- **Follow-up:** port searching, working and sleeping onto routines, filed as a Forgejo issue.

## Testing
- **`things.test.ts`:**
  - A rolling ball comes to rest.
  - A ball thrown up lands and settles on the floor.
  - It bounces back off a post.
  - Entering a net zone kills its speed.
  - It never leaves `bounds`, and never goes below the floor.
- **`routine.test.ts`** (with a fake clock):
  - Each verb finishes when it should.
  - `until` returns its value.
  - A routine cancelled mid-walk stops, and its generator's `finally` runs.
  - In calm mode `walkTo` doesn't move.
- **Football:**
  - A shot aimed in ends in the net, followed by `face(0)` and a happy hop.
  - A shot aimed wide comes to rest, then a new line-up starts at the ball.
  - In calm mode the ball returns to the feet and Grid never walks.
- **Rope:**
  - The hop's peak falls within ±0.08 of phase 0.5.
  - A trip holds the phase at 0.5, then the rope restarts below tempo.
  - With reduced motion it never trips.
- **Ported pastimes:**
  - The `pastimes.test.ts` and engine tests stay green.
  - `use` beats within each pastime's `every` window, once settled.
- **Engine:** the routine's things appear on the pose while the action shows and are gone after it ends.
- **Conformance:** in both renderers, rows for the ball (resting, spinning, in the air, inside the net) and the rope (phase 0, 0.25, 0.5 and 0.75).
- **Scenes:** the existing plan and fit tests cover `pitch` and `yard`.
- **Screenshots:** `scene-football` and `scene-rope`, in both renderers.
- **Manual checks:**
  - A goal and a miss each read clearly from behind.
  - The rope passes convincingly in front of and behind Grid.
  - A trip reads as funny, not as an error.
