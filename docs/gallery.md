# Gallery

Every image here is rendered from `preview.html`, the same engine and renderers the app runs, at a fixed seed:

- `npm run screenshots` renders the stills.
- `npm run clips` records the animated WebP clips and the window shot on a fake clock, frame by frame.

The character comes out the same on every run.

## The window

The character sits in a strip at the top. Under it, a ticker line says what it's doing, and the conversation follows.

<img src="screenshots/window.png" width="420" alt="The chat window: the character talking above its reply">

## A turn

"Renew my passport", played from a script through the real chat controller. It thinks, then searches the shelves
for the scan, fills in the form at the desk, does a happy roll when the reply starts, and talks it through before
settling back to idle.

<img src="screenshots/clip-turn.webp" width="420" alt="A full turn: thinking, searching, working, the reply, talking">

## Idle

With nothing to do, it drifts around its square, blinks, and glances about or at the cursor.

<img src="screenshots/clip-idle.webp" width="400" alt="Idle: drifting, blinking and glancing">

## Pastimes and scenes

Left idle long enough, it finds something to do. Each scene's props rise into the strip and the camera pulls back.
Going to sleep works the same way: the bedroom rises and it jumps into bed.

| Football | Jump rope |
| --- | --- |
| <img src="screenshots/clip-scene-football.webp" width="400" alt="Kicking a football at a goal"> | <img src="screenshots/clip-scene-rope.webp" width="400" alt="Skipping rope"> |
| **Coffee** | **Sleeping** |
| <img src="screenshots/clip-scene-coffee.webp" width="400" alt="Drinking coffee at a table"> | <img src="screenshots/clip-scene-bed.webp" width="400" alt="Asleep in bed"> |

Work has scenes too: it searches at a bookshelf and works at a desk. There's also reading and watering a plant.

| Shelf (searching) | Desk (working) | Reading | Watering |
| --- | --- | --- | --- |
| ![shelf](screenshots/grid-2.5d-scene-shelf.png) | ![desk](screenshots/grid-2.5d-scene-desk.png) | ![reading](screenshots/grid-2.5d-scene-reading.png) | ![watering](screenshots/grid-2.5d-scene-watering.png) |

## States

Each state has its own colour, face, badge and motion.

| Idle | Thinking | Searching | Working | Finished |
| --- | --- | --- | --- | --- |
| ![idle](screenshots/grid-2.5d-idle.png) | ![thinking](screenshots/grid-2.5d-thinking.png) | ![searching](screenshots/grid-2.5d-searching.png) | ![working](screenshots/grid-2.5d-working.png) | ![finished](screenshots/grid-2.5d-finished.png) |
| **Question** | **Approval** | **Error** | **Sleeping** | **Dizzy** |
| ![question](screenshots/grid-2.5d-question.png) | ![approval](screenshots/grid-2.5d-approval.png) | ![error](screenshots/grid-2.5d-error.png) | ![sleeping](screenshots/grid-2.5d-sleeping.png) | ![dizzy](screenshots/grid-2.5d-dizzy.png) |

- **Question:** the reply ended on a question for you.
- **Approval:** a draft is waiting for your yes.
- **Error:** it couldn't reach home, or the turn failed.
- **Dizzy:** you poked it three times fast.

## Turning

The 2.5D renderer draws the body as a box with depth, so it can turn and walk to the props in a scene.

| Front | Quarter | Side | Back |
| --- | --- | --- | --- |
| ![front](screenshots/grid-2.5d-turn-front.png) | ![quarter](screenshots/grid-2.5d-turn-quarter.png) | ![side](screenshots/grid-2.5d-turn-side.png) | ![back](screenshots/grid-2.5d-turn-back.png) |

## 2D and 2.5D

There are two renderers, and you switch between them in the settings. 2D is the flat neon outline. 2.5D, the default,
adds depth and shading.

| | Idle | Working | Error | Desk |
| --- | --- | --- | --- | --- |
| **2D** | ![2d idle](screenshots/grid-2d-idle.png) | ![2d working](screenshots/grid-2d-working.png) | ![2d error](screenshots/grid-2d-error.png) | ![2d desk](screenshots/grid-2d-scene-desk.png) |
| **2.5D** | ![2.5d idle](screenshots/grid-2.5d-idle.png) | ![2.5d working](screenshots/grid-2.5d-working.png) | ![2.5d error](screenshots/grid-2.5d-error.png) | ![2.5d desk](screenshots/grid-2.5d-scene-desk.png) |
