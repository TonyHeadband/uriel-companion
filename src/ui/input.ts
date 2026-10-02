import { S } from "../strings";
import { h } from "./dom";

export class InputBar {
  readonly el: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly send: HTMLButtonElement;

  constructor(onSubmit: (text: string) => void) {
    this.input = h("input", { class: "chat-input", type: "text", placeholder: S.placeholderEmpty, spellcheck: "false" });
    this.send = h("button", { class: "send-btn", type: "button", "aria-label": S.send, text: "↑" });
    this.el = h("div", { class: "chat-bar" }, this.input, this.send);
    const submit = () => {
      const text = this.input.value.trim();
      if (!text || this.input.disabled) return;
      this.input.value = "";
      onSubmit(text);
    };
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        submit();
      }
    });
    this.send.addEventListener("click", submit);
  }

  setBusy(busy: boolean): void {
    this.input.disabled = busy;
    this.send.disabled = busy;
    if (!busy) this.input.focus();
  }

  setPlaceholder(text: string): void {
    this.input.placeholder = text;
  }

  focus(): void {
    this.input.focus();
  }
}
