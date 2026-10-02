# Settings window: settings and customization in their own window

Status: design (2026-10-01). Refined 2026-10-01 after reading the code: one typed command event instead of two, and
snapshots only when the main window changes something the controls show.

## Why
The settings panel is a strip under the character that replaces the chat while open. Customization and Settings are two
flat tabs of ungrouped controls, and the panel is getting cluttered. Settings move to an independent window, with
collapsible sections to separate each category.

## Decisions
- **Everything moves.** Both tabs (Customization and Settings) leave the main window. The in-window panel, the
  `panel-open` root class and the `grow-up` animation are removed. The gear button and Ctrl+Shift+D open the settings
  window: show it if hidden, focus it if already open. Closing it with the window's own close button hides it.
- **Main window owns the state.** `AppConfig`, the engine and the debounced `saveSoon()` stay in the main window. The
  settings window holds a copy and never writes `config.json`.
- **The controls keep their shape.** `customizationTab` and `settingsTab` keep their callback-style deps. In the settings
  window the deps send commands instead of touching an engine; in the main window one `Handlers` object (the callbacks
  that today live inside `togglePanel`) applies them.
- **Events, not shared storage.** The windows talk over three Tauri events:
  - `settings:ready` (settings to main): the window has started listening and wants the current state.
  - `settings:snapshot` (main to settings): `{ config, body }`, the full `AppConfig` plus the current character's
    resolved body tuning. Sent when the main window starts, on `settings:ready`, and after changes made in the main
    window or that change what the controls show: header mute, character switch, body reset. It is not sent after
    every command, because a stale snapshot landing mid-drag would fight the slider under the person's hand.
  - `settings:command` (settings to main): one typed `Command` for every control change or live action (state, emote,
    gesture, character, renderer, simulate, speak, body, backdrop, liveliness, volume, font size and so on). The main
    window applies it through `Handlers`, which also calls `saveSoon()`.
- **First snapshot builds, later ones sync.** The first snapshot builds the pages. Later snapshots only update the
  sound toggle and the body sliders, so open sections, focus and drags survive.
- **Pre-created hidden window.** The `settings` window is declared in `tauri.conf.json` with `visible: false` and loads
  `settings.html`, a second Vite entry. It loads at startup, so opening it never waits for a webview. A Rust command
  `open_settings` shows and focuses it. Closing it hides it; closing the main window destroys it so the app exits.
- **Collapsible sections.** One shared `section(title, open, ...children)` helper builds `<details>`/`<summary>`
  blocks. Open state is held in memory only.
- **Pages and sections.** The window keeps the two tabs as pages. Customization: Behavior (open: State, State opacity,
  Liveliness, Emote, Gesture), Appearance (Character, Renderer, Body, Background), Testing (Simulate, Speak). Settings:
  Audio (open: Sound, Volume), Speech (Voice, Long replies), Display (Text size, Show FPS).

## Components
| Unit | Does | Depends on |
|---|---|---|
| `src/ui/section.ts` | `section()` collapsible helper | `h()` |
| `src/ui/settings.ts`, `src/debug/panel.ts` | Existing tab builders, grouped into sections; `customizationTab` also returns `syncBody` | `section()` |
| `src/settings/protocol.ts` | Event names, `Snapshot`, `Command` | config and engine types |
| `src/settings/commands.ts` | `Handlers` type and `applyCommand()` | protocol |
| `src/settings/remote.ts` | `remoteDeps()`: builds the tab deps that send commands | protocol |
| `src/settings/bus.ts` | `Bus` interface and the Tauri implementation | `@tauri-apps/api/event` |
| `src/settings/window.ts`, `main.ts`, `settings.html` | The settings window page | bus, remote, the tab builders |
| `src/settings/bridge.ts` | Main-window side: listens, applies commands, publishes snapshots | bus, commands |
| `src-tauri/src/windows.rs`, `tauri.conf.json`, `capabilities/default.json` | Hidden window, `open_settings`, close handling, permissions | |

## Latency
Tauri events are local IPC, so a command to the main window should take a few milliseconds. This is unmeasured and
gets measured during implementation. Creating a webview is the slow part (likely hundreds of milliseconds on
WebKitGTK), which is why the window is declared hidden at startup and only shown on demand.

## Error handling
- If the settings window is open before the main window has published (setup or sign-in screen showing), it shows a
  waiting line until the first snapshot.
- Each side announces itself after its listeners are registered (settings: `ready`; main: a snapshot), so neither
  start-up order loses the first snapshot.
- Control values come from the window's own bounded controls, as they did from the in-window panel; main does not
  validate them again.
- If `open_settings` fails, the gear logs a warning and nothing else happens.

## Testing
- Unit tests for `section()`, the section grouping, `applyCommand`, `remoteDeps` (including a round trip into
  `applyCommand`), the window page and the bridge, using a fake bus, in the existing vitest + happy-dom setup.
- Existing `settings.test.ts` and `panel.test.ts` are updated for the new shapes.
- The Rust close decisions and `open_settings` are unit-tested with Tauri's mock runtime (`cargo test windows`). The
  mock reports constant window visibility and the event wiring is three lines, so the real shown/hidden state and
  exit-with-main are checked by hand; `docs/manual-checks.md` gets rows.

## Out of scope
- Persisting which sections are open.
- Window position and size memory for the settings window.
- Any change to the Rust config commands.
- Text scale (`--fs`) in the settings window.
