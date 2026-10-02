# Environment: shelves to search, a desk to write at, a bed to sleep in, and tools worth holding

Status: built (2026-10-01). Builds on [Toon 2.5D](2026-10-01-toon-25d-design.md).

## Why
- The held tools (`src/renderers/items.ts`) were small square glyphs above the hand. They read as noise rather than as a magnifier, a pen or a stamp.
- The character floated on the metaball backdrop with no sense of place. Searching documents is easier to read when it happens at a bookshelf, and work is easier to read at a desk.
- More objects should be easy to add over time, so that the place can grow livelier.

## Decisions
- **The scene is data, and every renderer draws it.** This follows the pose rule from Toon 2.5D: the engine never knows which renderer is drawing.
  - Fixtures are lists of boxes (`src/scene/fixtures.ts`).
  - Scenes place fixtures and name the spots where the character stands (`src/scene/scenes.ts`).
  - 2.5d draws the boxes shaded, and 2d draws their flat fronts.
- **Scenes belong to actions:**
  - `searching` → `library`: two pairs of bookshelves. It browses each one with its back to us.
  - `working` → `study`: a desk with papers, a lamp and a front panel, and a stool behind it. It sits behind the desk facing us and writes.
  - `sleeping` → `bedroom`: a bed and a nightstand with a lamp.

  Scenes They rise out of the floor when the action starts and sink away when it ends. Swapping scenes uses the same token-guarded pattern as the held item, `Swap` in `src/engine/swap.ts`.
- **The camera pulls back only while a scene shows.** Each scene sets a zoom (0.55–0.6). Close-ups stay big for expressions.
- **The floor has real depth.** The character walks in x and in depth (`oz`). Points further back sit higher on screen and are drawn slightly smaller.
- **Fixtures are sorted by depth.** Each fixture is drawn as a whole, either in front of the character or behind it. Spots, and routes around footprints, keep the character out of the fixtures, so it never stands inside one. When a fixture and the character are at the same depth, the character is drawn in front.
- **Tools keep the square language but look like real objects.** Each one has parts in two tones of the accent and an ink outline. It is held by its grip and drawn at 1 R. It leans away from the face.

## Design
### Pose
- `oz`: depth on the floor in R. Negative is further back.
- `zoom`: the camera. 1 is the close-up.
- `scene: { id, show } | null`: which scene is showing, and how far it has risen (0–1, with a slight overshoot).
- `scribble`: 0–1, how busily the hand holding the item writes. Both renderers wiggle that hand by `scribbleAt`.
- `ground`: what the character sits on, as a y offset from the floor. It is the mattress in bed, and the floor shadow is drawn there.

### Camera (`src/renderers/layout.ts`)
- `viewOf(w, h, zoom)` places the world origin and sets R. Zooming out lowers the view, which leaves headroom for tall fixtures.
- `toScreen(view, x, y, z)` scales a point by `1 + 0.12·z` and raises it by `0.35·z` R.
- `bodyFrame` is built on these two. Renderers, hit-testing (`Stage`) and the backdrop all use it, so pointing and poking still land on the character when the camera is zoomed out.

### Engine (`src/engine/character-engine.ts`)
- **Channels:** `wz`, `zoom` and `show`. `zoom` eases with a 0.5 s time constant, and `show` is tweened with `SCENE_RISE`/`SCENE_SINK`.
- **Channels:** `scribble` rises to 1 while the character is settled at a spot that `writes`.
- **When a scene rises,** the character walks to the scene's first spot. After a dwell at each spot (`SceneDef.dwell`) it goes to a different spot. A scene with only one spot (the bed) has nowhere else to go, so it stays there.
- **Walks are planned in `planWalk` (`src/scene/plan.ts`):** waypoints routed round footprints by `routeAround` (`src/scene/route.ts`). The engine only walks them.
  - **A spot with a `via`:** the character walks to the via point first. Its last step may cross a footprint.
  - **A spot with a `leap`:** that last step starts with a crouch, then a quick, high jump. This is how it jumps backwards into bed from the foot. The bedroom also sets a brisk `pace`, so getting to bed doesn't take as long as the drowsy sleeping pace would.
  - **Caught inside a footprint** when a fixture rose: it steps out toward the viewer first.
- **On arrival,** the body settles into the spot's `turn`. That is its back to us at a shelf, with the hand and lens hidden in front of it. If the spot has a `lift` (the stool, the mattress), the character hops up onto it. The stool is tall (`SEAT_TOP`) so that the writing hand clears the desk in front.
- **The bed is two fixtures:** headboard, mattress and pillow behind the character, blanket and footboard in front. In the depth order the character sits between them, with its lower half under the blanket.
- **When the scene ends,** the zoom returns to 1, the depth to 0, and x is clamped back to the action's range.
- **Liveliness 0 and reduced motion:** the scene still shows, but the character stays where it is.

### Renderers
- `paintInDepth` (`src/renderers/scenery.ts`) paints the fixtures and the character from back to front.
- `boxFaces` projects a box's front, top and inward side.
- `fixture25d` shades the faces with the body's cel bands (`toneOf`, now in `tone.ts`) and draws a contact shadow. `fixture2d` draws flat fronts.
- `floorShadow` grounds the character while a scene shows.

## Adding an object
1. Add a `FixtureKind` and its box list to `FIXTURES`. Boxes are in R, relative to the fixture's floor origin. The `role` picks the tone.
2. Place it in a scene, and add or adjust spots so they lie outside the footprint (grown by the body's margin). 
3. `src/scene/plan.test.ts` and `src/renderers/scenery.test.ts` check four things: every spot is on open floor, walks never cross a fixture, every spot fits the zoomed banner, and every fixture fits it.

## Not done
- The character is not darkened as it goes further back. `ctx.filter` support in WebKitGTK is uncertain, and tinting every fill was not worth it yet.
- Only search, work and sleep have scenes, plus the idle pastimes ([Pastimes](2026-10-01-pastimes-design.md)). Approval, errors and the rest keep the close-up. Everything can be switched off with Customization → Scenes.
- Waking up isn't a walk out of bed. The bedroom sinks and the character drops back to the floor as the next state begins.
