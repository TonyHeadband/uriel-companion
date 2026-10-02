import { h } from "./dom";

// One status at a time: the greeting, or what Uriel is doing right now.
const MAX_LINES = 1;
// Matches the CSS fade-out, so a pushed-out line is removed once it's invisible.
const FADE_MS = 260;

/** The status strip's line: a new status slides in and pushes the old one up and out as it fades. */
export class Ticker {
  readonly el = h("div", { class: "ticker" });
  private lines: HTMLElement[] = [];

  constructor(
    private idleText: string,
    private readonly later: (ms: number, fn: () => void) => void = (ms, fn) => void setTimeout(fn, ms),
  ) {
    this.showIdle();
  }

  add(line: string): void {
    if (this.lines.at(-1)?.textContent === line) return;
    if (this.lines.length === 1 && this.lines[0].classList.contains("idle")) this.retire(this.lines.pop()!);
    this.lines.at(-1)?.classList.remove("cur");
    const el = h("div", { class: "ln cur", text: line });
    this.el.append(el);
    this.lines.push(el);
    while (this.lines.length > MAX_LINES) this.retire(this.lines.shift()!);
  }

  clear(): void {
    for (const el of this.lines) this.retire(el);
    this.lines = [];
    this.showIdle();
  }

  /** Changes the resting line; shown at once if the strip is resting, otherwise after the current status clears. */
  setIdle(text: string): void {
    this.idleText = text;
    if (this.lines.length !== 1 || !this.lines[0].classList.contains("idle")) return;
    this.retire(this.lines.pop()!);
    this.showIdle();
  }

  private showIdle(): void {
    const el = h("div", { class: "ln cur idle", text: this.idleText });
    this.el.append(el);
    this.lines = [el];
  }

  private retire(el: HTMLElement): void {
    el.classList.remove("cur");
    el.classList.add("out");
    this.later(FADE_MS, () => el.remove());
  }
}
