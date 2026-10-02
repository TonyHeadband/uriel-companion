import type { ConversationSummary } from "../api/gateway";
import { S } from "../strings";
import { h } from "./dom";

export interface HeaderCallbacks {
  onSelect: (conversationId: string | null) => void;
  onMute: (muted: boolean) => void;
  onSettings: () => void;
}

export class Header {
  readonly el: HTMLElement;
  private readonly select: HTMLSelectElement;
  private readonly mute: HTMLButtonElement;
  private readonly fps: HTMLElement;
  private muted: boolean;

  constructor(cb: HeaderCallbacks, muted: boolean) {
    this.muted = muted;
    this.select = h("select", { class: "convo", "aria-label": "Conversation" });
    this.mute = h("button", { class: "icon-btn", type: "button", "aria-label": S.mute });
    this.renderMute();
    this.fps = h("span", { class: "fps" });
    this.fps.hidden = true;
    const gear = h("button", { class: "icon-btn", type: "button", "aria-label": S.settings, text: "⚙️" });
    gear.addEventListener("click", () => cb.onSettings());
    this.el = h("header", { class: "hdr" }, this.select, h("div", { class: "hdr-r" }, this.fps, this.mute, gear));
    this.select.addEventListener("change", () => cb.onSelect(this.select.value || null));
    this.mute.addEventListener("click", () => {
      this.muted = !this.muted;
      this.renderMute();
      cb.onMute(this.muted);
    });
    this.setConversations([], null);
  }

  setConversations(items: ConversationSummary[], selectedId: string | null): void {
    this.select.replaceChildren(
      h("option", { value: "", text: S.newChat }),
      ...items.map((c) => h("option", { value: c.id, text: c.title || S.untitled })),
    );
    this.select.value = selectedId ?? "";
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.renderMute();
  }

  showFps(on: boolean): void {
    this.fps.hidden = !on;
  }

  setFps(fps: number): void {
    this.fps.textContent = `${fps} fps`;
  }

  private renderMute(): void {
    this.mute.textContent = this.muted ? "🔇" : "🔊";
    this.mute.setAttribute("aria-pressed", String(this.muted));
  }
}
