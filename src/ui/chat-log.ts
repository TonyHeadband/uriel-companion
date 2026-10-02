import type { HistoryMessage } from "../api/gateway";
import type { ErrorAction } from "../chat/controller";
import { h } from "./dom";

export class ChatLog {
  readonly el = h("div", { class: "chat-log", role: "log", "aria-live": "polite" });
  private reply: HTMLElement | null = null;
  private typing: HTMLElement | null = null;

  clear(): void {
    this.el.replaceChildren();
    this.reply = null;
    this.typing = null;
  }

  addUser(text: string): void {
    this.reply = null;
    this.el.append(h("div", { class: "row user" }, h("div", { class: "bubble", text })));
    this.scroll();
  }

  startReply(): void {
    this.reply = null;
    this.typing = h("div", { class: "row typing", "aria-label": "Uriel is typing" }, h("i"), h("i"), h("i"));
    this.el.append(this.typing);
    this.scroll();
  }

  appendReply(text: string): void {
    this.dropTyping();
    if (!this.reply) {
      this.reply = h("div", { class: "reply" });
      this.el.append(this.reply);
    }
    this.reply.append(text);
    this.scroll();
  }

  addAssistant(text: string): void {
    this.el.append(h("div", { class: "reply", text }));
  }

  addNotice(text: string): void {
    this.el.append(h("div", { class: "notice", text }));
    this.scroll();
  }

  showError(message: string, action: ErrorAction | null): void {
    this.dropTyping();
    const row = h("div", { class: "error-note" }, h("span", { text: message }));
    if (action) {
      const btn = h("button", { class: "btn", type: "button", text: action.label });
      btn.addEventListener("click", () => {
        row.remove();
        action.run();
      });
      row.append(btn);
    }
    this.el.append(row);
    this.scroll();
  }

  showHistory(messages: HistoryMessage[]): void {
    this.clear();
    for (const m of messages) {
      if (m.role === "user") this.addUser(m.content);
      else if (m.role === "assistant") this.addAssistant(m.content);
    }
    this.reply = null;
    this.scroll();
  }

  private dropTyping(): void {
    this.typing?.remove();
    this.typing = null;
  }

  private scroll(): void {
    this.el.scrollTop = this.el.scrollHeight;
  }
}
