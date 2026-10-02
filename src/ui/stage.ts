import type { RGB } from "../engine/color";
import { bodyFrame, onCharacter, type Placement } from "../renderers/layout";
import { h } from "./dom";
import { Ticker } from "./ticker";

/** The banner is the character's space; the status strip sits under it in a solid colour, so it's always readable. */
export class Stage {
  readonly canvas = h("canvas", { class: "char" });
  readonly ticker: Ticker;
  readonly banner: HTMLElement;
  readonly el: HTMLElement;
  private mood = "";

  constructor(idleText: string, background?: HTMLElement) {
    this.ticker = new Ticker(idleText);
    const card = h("div", { class: "card wash" }, ...(background ? [background] : []));
    this.banner = h("section", { class: "stage" }, card, this.canvas);
    this.el = h("div", { class: "stage-wrap" }, this.banner, h("div", { class: "strip" }, this.ticker.el));
  }

  /** Whether a pointer at client (x, y) is on the character, wherever it has wandered to. */
  touches(clientX: number, clientY: number, at: Placement): boolean {
    const r = this.canvas.getBoundingClientRect();
    return onCharacter(clientX - r.left, clientY - r.top, r.width, r.height, at);
  }

  /** The pointer's offset from the character's centre in CSS pixels, for its gaze. */
  offsetFrom(clientX: number, clientY: number, at: Placement): readonly [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const { cx, cy } = bodyFrame(r.width, r.height, at);
    return [clientX - (r.left + cx), clientY - (r.top + cy)];
  }

  setMood(color: RGB): void {
    const value = color.map((c) => Math.round(c)).join(",");
    if (value === this.mood) return;
    this.mood = value;
    this.el.style.setProperty("--mood", value);
  }
}
