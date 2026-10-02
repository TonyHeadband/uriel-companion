import type { FloorPt, Spot } from "../scene/types";
import type { Viseme } from "../speech/timeline";
import type { GestureName } from "./gestures";
import type { ExpressionName } from "./states";
import { inNet, resting, rollSpeed, type Thing, type World } from "./things";
import type { Key } from "./tweens";

/** What a routine is waiting on: it carries on once this returns true. */
export type Wait = () => boolean;
export type Step<T = void> = Generator<Wait, T, void>;
export type RoutineScript = (r: RoutineCtx) => Step;

/** What the engine lends a routine: the things it already does, done its usual way. */
export interface RoutineHost {
  now(): number;
  random(): number;
  /** Liveliness 0 or reduced motion: it doesn't walk. */
  readonly calm: boolean;
  readonly reduced: boolean;
  /** The current scene's spots. */
  spots(): readonly Spot[];
  /** Where it stands on the floor now. */
  at(): FloorPt;
  /** Sets off for a spot, round fixtures; staying put when calm. */
  go(to: Spot): void;
  arrived(): boolean;
  face(turn: number): void;
  turned(): boolean;
  /** Plays a gesture and says how long it runs (ms). */
  play(name: GestureName): number;
  /** Tweens the held item's use, the mouth opening in that shape with it; says how long it runs (ms). */
  use(keys: readonly Key[], mouth?: Viseme): number;
  blink(): void;
  express(name: ExpressionName, ms: number): void;
  /** The routine's things, owned and stepped by the engine. */
  things(): Thing[];
  world(): World | null;
}

/** The verbs a script is written in. The ones that take time are generators: `yield*` them. */
export class RoutineCtx {
  constructor(private readonly h: RoutineHost) {}

  get calm(): boolean {
    return this.h.calm;
  }

  get reduced(): boolean {
    return this.h.reduced;
  }

  get spots(): readonly Spot[] {
    return this.h.spots();
  }

  at(): FloorPt {
    return this.h.at();
  }

  random(): number {
    return this.h.random();
  }

  *wait(ms: number | readonly [number, number]): Step {
    const d = typeof ms === "number" ? ms : ms[0] + this.h.random() * (ms[1] - ms[0]);
    const end = this.h.now() + d;
    yield () => this.h.now() >= end;
  }

  *walkTo(to: Spot): Step {
    this.h.go(to);
    yield () => this.h.arrived();
  }

  *face(turn: number): Step {
    this.h.face(turn);
    yield () => this.h.turned();
  }

  /** Starts a gesture without waiting for it: to act at a moment inside it, a kick's lunge. */
  start(name: GestureName): number {
    return this.h.play(name);
  }

  *play(name: GestureName): Step {
    yield* this.wait(this.h.play(name));
  }

  *use(keys: readonly Key[], opts: { mouth?: Viseme; blink?: boolean } = {}): Step {
    yield* this.wait(this.h.use(keys, opts.mouth));
    if (opts.blink) this.h.blink();
  }

  express(name: ExpressionName, ms: number): void {
    this.h.express(name, ms);
  }

  /** Waits until `cond` gives something other than false, and hands that back. */
  *until<T>(cond: () => T | false): Step<T> {
    let got: T | false = false;
    yield () => (got = cond()) !== false;
    return got as T;
  }

  spawn(t: Thing): void {
    const list = this.h.things();
    const i = list.findIndex((o) => o.id === t.id);
    if (i >= 0) list[i] = t;
    else list.push(t);
  }

  thing(id: string): Thing {
    const t = this.h.things().find((o) => o.id === id);
    if (!t) throw new Error(`no thing ${id}`);
    return t;
  }

  set(id: string, patch: Partial<Thing>): void {
    Object.assign(this.thing(id), patch);
  }

  kick(id: string, vx: number, vz: number, vy = 0): void {
    this.set(id, { vx, vz, vy });
  }

  /** A kick just hard enough that friction stops it at `to`. */
  rollTo(id: string, to: FloorPt): void {
    const t = this.thing(id);
    const [dx, dz] = [to.x - t.x, to.z - t.z];
    const d = Math.hypot(dx, dz);
    if (d < 1e-6) return;
    const v = rollSpeed(d);
    this.kick(id, (dx / d) * v, (dz / d) * v);
  }

  resting(id: string): boolean {
    return resting(this.thing(id));
  }

  inNet(id: string): boolean {
    return inNet(this.thing(id), this.h.world());
  }
}

// However many waits are already met, a frame resumes a script at most this often, so one can't hang the loop.
const MAX_STEPS = 64;

/** Runs one script: the engine ticks it every frame while its action shows, and cancels it when the action goes. */
export class Routine {
  private readonly gen: Step;
  private waiting: Wait | null = null;
  private over = false;

  constructor(script: RoutineScript, host: RoutineHost) {
    this.gen = script(new RoutineCtx(host));
  }

  get done(): boolean {
    return this.over;
  }

  tick(): void {
    for (let i = 0; i < MAX_STEPS && !this.over; i++) {
      if (this.waiting && !this.waiting()) return;
      const s = this.gen.next();
      if (s.done) this.over = true;
      else this.waiting = s.value;
    }
  }

  cancel(): void {
    if (this.over) return;
    this.over = true;
    this.gen.return();
  }
}
