interface Listens<T extends string> {
  addEventListener(type: T, listener: () => void): void;
  removeEventListener(type: T, listener: () => void): void;
}

export interface LoopDeps {
  raf: (cb: (t: number) => void) => number;
  caf: (id: number) => void;
  doc: Listens<"visibilitychange"> & { readonly hidden: boolean; hasFocus(): boolean };
  win: Listens<"focus" | "blur">;
}

const UNFOCUSED_FRAME_MS = 33;

/**
 * Runs `frame` on animation frames: full rate while the window, or another window of the app, has focus; ~30 fps
 * otherwise; nothing while hidden.
 */
export class RenderLoop {
  private id: number | null = null;
  private focused: boolean;
  private peerFocused = false;
  private lastDraw = -Infinity;

  constructor(
    private readonly frame: (nowMs: number) => void,
    private readonly deps: LoopDeps = {
      raf: (cb) => requestAnimationFrame(cb),
      caf: (id) => cancelAnimationFrame(id),
      doc: document,
      win: window,
    },
  ) {
    this.focused = deps.doc.hasFocus();
  }

  start(): void {
    this.deps.doc.addEventListener("visibilitychange", this.onVisibility);
    this.deps.win.addEventListener("focus", this.onFocus);
    this.deps.win.addEventListener("blur", this.onBlur);
    if (!this.deps.doc.hidden) this.schedule();
  }

  stop(): void {
    this.deps.doc.removeEventListener("visibilitychange", this.onVisibility);
    this.deps.win.removeEventListener("focus", this.onFocus);
    this.deps.win.removeEventListener("blur", this.onBlur);
    if (this.id !== null) this.deps.caf(this.id);
    this.id = null;
  }

  /** The settings window takes focus away from this one while the person is still tuning what it shows. */
  setPeerFocused(on: boolean): void {
    this.peerFocused = on;
  }

  private readonly onFocus = (): void => {
    this.focused = true;
  };

  private readonly onBlur = (): void => {
    this.focused = false;
  };

  private readonly onVisibility = (): void => {
    if (this.deps.doc.hidden) {
      if (this.id !== null) this.deps.caf(this.id);
      this.id = null;
    } else if (this.id === null) {
      this.schedule();
    }
  };

  private readonly tick = (t: number): void => {
    this.id = null;
    if (this.deps.doc.hidden) return;
    if (this.focused || this.peerFocused || t - this.lastDraw >= UNFOCUSED_FRAME_MS) {
      this.frame(t);
      this.lastDraw = t;
    }
    this.schedule();
  };

  private schedule(): void {
    this.id = this.deps.raf(this.tick);
  }
}
