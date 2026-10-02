import { customizationTab, type CustomizationTab } from "../debug/panel";
import type { BodyTuning } from "../engine/softbody";
import { S } from "../strings";
import { h } from "../ui/dom";
import { settingsPanel } from "../ui/panel";
import { settingsTab, type SettingsTab } from "../ui/settings";
import type { Bus } from "./bus";
import { EVENTS, type Command, type Snapshot } from "./protocol";
import { remoteDeps } from "./remote";

export interface FocusSource {
  focused(): boolean;
  /** Calls `changed` whenever the page may have gained or lost focus. */
  watch(changed: () => void): void;
}

// Visibility is watched too: hiding the window on close doesn't reliably fire a blur.
const pageFocus: FocusSource = {
  focused: () => document.hasFocus() && !document.hidden,
  watch: (changed) => {
    window.addEventListener("focus", changed);
    window.addEventListener("blur", changed);
    document.addEventListener("visibilitychange", changed);
  },
};

/**
 * The first snapshot builds the pages; later ones only update what the main window can change under us
 * (the header speaker, the character's body feel), so open sections, focus and slider drags survive.
 */
export async function startSettingsWindow(root: HTMLElement, bus: Bus, focus: FocusSource = pageFocus): Promise<void> {
  root.replaceChildren(h("p", { class: "empty", text: S.settingsWaiting }));
  const send = (c: Command) => bus.emit(EVENTS.command, c);
  let reported = false;
  focus.watch(() => {
    const now = focus.focused();
    if (now === reported) return;
    reported = now;
    bus.emit(EVENTS.focus, now);
  });
  let built: { custom: CustomizationTab; settings: SettingsTab } | null = null;
  let body: BodyTuning;
  await bus.listen<Snapshot>(EVENTS.snapshot, (snap) => {
    body = snap.body;
    if (built) {
      built.settings.syncSound(snap.config.sound.enabled);
      built.custom.syncBody();
      return;
    }
    const deps = remoteDeps(snap, send, () => body);
    built = { custom: customizationTab(deps.debug), settings: settingsTab(deps.settings) };
    root.replaceChildren(settingsPanel(built.custom.el, built.settings.el));
  });
  bus.emit(EVENTS.ready);
}
