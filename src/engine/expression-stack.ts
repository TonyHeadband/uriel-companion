import { EXPRESSIONS, type ExpressionDef } from "./expressions";
import type { Scheduler } from "./scheduler";
import type { ActionFace, ExpressionName, EyeShape, Face } from "./states";

export interface ExpressionHandle {
  readonly name: ExpressionName;
}

interface Entry extends ExpressionHandle {
  def: ExpressionDef;
  seq: number;
  until: number;
  eye: EyeShape | undefined;
}

export interface Resolved {
  face: Face;
  /** Product of every shown expression's pace modifier: > 1 is slower. */
  pace: number;
  range: number;
}

/** How the character feels, laid over what it's doing: a baseline mood plus short expressions that come and go. */
export class ExpressionStack {
  private entries: Entry[] = [];
  private baseline: Entry | null = null;
  private seq = 0;

  constructor(
    private readonly sched: Scheduler,
    private readonly now: () => number,
    private readonly defs: Record<ExpressionName, ExpressionDef> = EXPRESSIONS,
  ) {}

  push(name: ExpressionName, ms: number): ExpressionHandle {
    const e = this.entry(name, this.now() + ms);
    this.entries.push(e);
    return e;
  }

  /** Ends an expression early; its pending steps (and anything else the handle owns) are dropped. */
  cancel(h: ExpressionHandle): void {
    const i = this.entries.indexOf(h as Entry);
    if (i < 0) return;
    this.entries.splice(i, 1);
    this.sched.cancel(h);
  }

  setBaseline(name: ExpressionName | null): void {
    if (this.baseline) this.sched.cancel(this.baseline);
    this.baseline = name ? this.entry(name, Infinity) : null;
  }

  /** Drops the short expressions the new action doesn't allow. The baseline stays; resolve() skips it there. */
  prune(allowed: (n: ExpressionName) => boolean): void {
    for (const e of [...this.entries]) if (!allowed(e.name)) this.cancel(e);
  }

  update(): void {
    const n = this.now();
    for (const e of [...this.entries]) if (n >= e.until) this.cancel(e);
  }

  resolve(base: ActionFace, allowed: (n: ExpressionName) => boolean): Resolved {
    const face: Face = { eye: base.eye, mouth: null, gaze: base.gaze ?? "cursor", tilt: base.tilt ?? 0, blink: base.blink ?? true, blush: 0 };
    let pace = 1;
    let range = 1;
    const shown = [...this.entries].sort((a, b) => a.def.priority - b.def.priority || a.seq - b.seq);
    if (this.baseline) shown.unshift(this.baseline);
    for (const e of shown) {
      if (!allowed(e.name)) continue;
      const d = e.def;
      if (e.eye) face.eye = e.eye;
      if (d.mouth) face.mouth = d.mouth;
      if (d.gaze) face.gaze = d.gaze;
      if (d.tilt !== undefined) face.tilt = d.tilt;
      if (d.blush !== undefined) face.blush = d.blush;
      pace *= d.modifiers?.pace ?? 1;
      range *= d.modifiers?.range ?? 1;
    }
    return { face, pace, range };
  }

  private entry(name: ExpressionName, until: number): Entry {
    const def = this.defs[name];
    const e: Entry = { name, def, seq: ++this.seq, until, eye: def.eye };
    const then = def.then;
    if (then) this.sched.after(then.at, () => (e.eye = then.eye), e);
    return e;
  }
}
