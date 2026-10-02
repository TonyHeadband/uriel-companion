import { clamp, Ease, lerp, smooth } from "./anim";
import { mixRGB, type RGB } from "./color";
import type { ItemKind, Particle, ParticleKind, Pose, PoseMouth } from "./pose";
import { ACTIONS, allows } from "./actions";
import { EXPRESSIONS } from "./expressions";
import { ExpressionStack, type ExpressionHandle, type Resolved } from "./expression-stack";
import type { ActionName, BadgeKind, ExpressionName, Face, Motion } from "./states";
import { GESTURES, REACH_KEYS, SCENE_RISE, SCENE_SINK, STOW_BEHIND, STOW_SIDE, gestureMs, lookAround, turnJolt, type Gesture, type GestureName } from "./gestures";
import { PROPS, REST, type Prop } from "./props";
import { Arbiter, type ClaimOpts, type ClaimToken, type Layer } from "./arbiter";
import { Scheduler } from "./scheduler";
import { Tweens, type Key } from "./tweens";
import type { SoundName } from "../sound/names";
import type { Mouth } from "../speech/backend";
import type { Viseme } from "../speech/timeline";
import { FLOOR_RISE } from "../renderers/layout";
import { planWalk } from "../scene/plan";
import { SCENES } from "../scene/scenes";
import type { FloorPt, SceneName, Spot } from "../scene/types";
import { Swap } from "./swap";
import { Routine, type RoutineHost } from "./routine";
import { ROUTINES } from "./routines";
import { stepThings, type Thing } from "./things";
import { worldOf } from "../scene/world";

// Fraction of the gap left after one second: the eyes are snappier than the body.
const K_GAZE = 0.0025;
const K_BODY = 0.0008;
const K_COLOR = 0.002;
// The mouth follows syllables (~70 ms) closely; its fade in/out is a little softer.
const K_MOUTH = Math.exp(-1 / 0.03);
const K_TALK = Math.exp(-1 / 0.06);
// The banner is ~3.9 R either side of centre; this leaves room for a poke squash (x1.16), the soft body's
// overshoot and the hands. Vertically the halo above and the body below leave little room.
const LIMIT = { x: 2, y: 0.2 };
const STILL_MOUSE_MS = 2000;
// Idle looks over its shoulder this often (ms) while the mouse is still.
const LOOK_EVERY = [20000, 40000] as const;
// A dash is any trip with more than this left to go (R): it starts with a hop.
const DASH = 0.15;
// Attention states come home this quickly (s), however slowly they drift once there.
const HOME_PACE = 0.4;
// Off-stage offset (R): past the banner's ~3.9 R edge with room for the halo and the soft body's overshoot.
export const OFFSTAGE = 6;
// Leaving and arriving take a couple of seconds: the gap shrinks by e every 0.6 s.
const K_AWAY = Math.exp(-1 / 0.6);
// Eyes, body and travel share one heading, in gaze units (yaw right, pitch up). Standing still it's what the character
// attends to; the more it still has to go (full at HEAD_FULL R), the more it points where it's going instead.
const TRAVEL_YAW = 0.6;
const TRAVEL_PITCH = 0.45;
const HEAD_FULL = 0.3;
// The body follows the heading by these shares, so it never points a different way from the eyes.
const BODY_TURN = 0.7;
const BODY_TIP = 0.5;
// Saccades: the eyes hop a little every SACCADE_S, from the clock rather than the random source.
const SACCADE = { yaw: 0.04, pitch: 0.03 };
const SACCADE_S = 0.45;
// The camera eases between the close-up and a scene's zoom: the gap shrinks by e every 0.5 s.
const K_ZOOM = Math.exp(-1 / 0.5);
// Within this (R) of a waypoint the character heads for the next one.
const ARRIVE = 0.15;
// A leap covers its step this quickly (s), arcing this high (R) over whatever's in the way.
const LEAP_PACE = 0.12;
const LEAP_WINDUP = 260;
const LEAP_KEYS: Key[] = [[-1.1, 220, Ease.out], [0, 300, Ease.back]];

export interface EngineOptions {
  /** Milliseconds; injected so tests and previews control time. */
  now: () => number;
  random?: () => number;
  onSound?: (name: SoundName) => void;
  /** prefers-reduced-motion: gestures jump to their end and particles are skipped; blinks and colour stay. */
  reducedMotion?: boolean;
  /** Called every frame for the mouth to show; null when nothing is speaking. */
  mouth?: (nowMs: number) => Mouth | null;
}

// The only props that still animate under reduced motion.
// A routine's use of its item (a page turned, a sip) isn't travel: it plays under reduced motion too.
const CALM_PROPS: ReadonlySet<Prop> = new Set(["open", "badgeS", "blush", "use"]);

export class CharacterEngine {
  private readonly v: Record<Prop, number> = { ...REST };
  private readonly target: Record<Prop, number> = { ...REST };
  private readonly tweens = new Tweens<Prop>(this.v);
  private readonly now: () => number;
  private readonly sched: Scheduler;
  private readonly arbiter: Arbiter;
  private readonly random: () => number;
  private readonly onSound: (name: SoundName) => void;
  private readonly reduced: boolean;
  private readonly mouthSource: (nowMs: number) => Mouth | null;
  private viseme: Viseme = "rest";
  private readonly expressions: ExpressionStack;
  private entryOwner: object = {};
  private resolved: Resolved;
  private current: ActionName = "idle";
  private color: RGB = ACTIONS.idle.color;
  private badge: BadgeKind | null = null;
  private badgeColor: RGB = ACTIONS.idle.color;
  private badgeToken = 0;
  private particles: Particle[] = [];
  private nextBlink: number;
  private lastAmbient = 0;
  private waveUntil = 0;
  private hovering = false;
  private look = { x: 0, y: 0 };
  private glance: { x: number; y: number } | null = null;
  private lastMouse: number;
  private nextGlance: number;
  // The item in the hand changes behind its back; the scene sinks before the next one rises.
  private readonly item = new Swap<ItemKind>(
    (done) => this.animate("reach", STOW_BEHIND, done),
    (next) => this.animate("reach", next ? REACH_KEYS : STOW_SIDE),
  );
  private readonly scene = new Swap<SceneName>(
    (done) => this.animate("show", SCENE_SINK, done),
    (next) => this.sceneUp(next),
  );
  // The waypoints still to walk in the scene, the spot they end at, and whether it's crouching to leap.
  private route: FloorPt[] = [];
  private spot = -1;
  private arrival: Spot | null = null;
  private facing = 0;
  private waiting = false;
  // The scripted part of an action that has one, and the things it moves; the mouth shape its item's use opens.
  private routine: Routine | null = null;
  private things: Thing[] = [];
  private useMouth: Viseme | null = null;
  private readonly host: RoutineHost = this.makeHost();
  private scenesOn = true;
  private leaping = false;
  private nextLook: number;
  private nextWander: number;
  private live = 0.5;
  // Updates so far, and the one in which a routine last asked to face somewhere.
  private frame = 0;
  private facedAt = -1;
  private homing = false;
  private last: number;
  private readonly start: number;

  constructor(opts: EngineOptions) {
    this.now = opts.now;
    this.sched = new Scheduler(this.now);
    this.arbiter = new Arbiter(this.sched, (c) => this.enter(c.action, c.how));
    this.random = opts.random ?? Math.random;
    this.onSound = opts.onSound ?? (() => {});
    this.reduced = opts.reducedMotion ?? false;
    this.mouthSource = opts.mouth ?? (() => null);
    this.expressions = new ExpressionStack(this.sched, this.now);
    this.resolved = this.expressions.resolve(ACTIONS.idle.face, () => true);
    this.start = this.last = this.now();
    this.nextBlink = this.start + 1500 + this.random() * 2000;
    this.lastMouse = this.start;
    this.nextGlance = this.start + STILL_MOUSE_MS;
    this.nextLook = this.start + LOOK_EVERY[0];
    this.nextWander = this.start + 3000 + this.random() * 3000;
  }

  get state(): ActionName {
    return this.current;
  }

  claim(layer: Layer, action: ActionName, opts?: ClaimOpts): ClaimToken {
    return this.arbiter.claim(layer, action, opts);
  }

  release(layer: Layer, token?: ClaimToken): void {
    this.arbiter.release(layer, token);
  }

  isClaimed(layer: Layer): boolean {
    return this.arbiter.isClaimed(layer);
  }

  /** Starts off the stage, as if already gone: launching is an arrival, not a departure. */
  startAway(): void {
    this.claim("link", "away");
    this.v.ax = this.target.ax = OFFSTAGE;
  }

  /** Shows an action: "enter" plays its sound and entry gestures; "resume" (back from under a higher layer) doesn't. */
  private enter(name: ActionName, how: "enter" | "resume"): void {
    const prev = this.current;
    this.routine?.cancel();
    this.routine = null;
    this.useMouth = null;
    this.sched.cancel(this.entryOwner);
    this.entryOwner = {};
    this.current = name;
    const a = ACTIONS[name];
    this.target.tint = a.tint;
    this.expressions.prune((e) => allows(a, e));
    const m = this.motion();
    this.homing = how === "enter" && !!m.centre;
    if (this.homing) this.wanderTo(0, 0);
    if (m.every) this.nextWander = this.now() + this.pick(m.every);
    // The look-around clock only runs while idle; restart it so a return to idle isn't greeted by an overdue look.
    if (name === "idle") this.nextLook = this.now() + this.pick(LOOK_EVERY);
    this.setBadge(a.badge, a.color);
    this.item.set(a.item ?? null);
    this.scene.set(this.scenesOn ? a.scene ?? null : null);
    // Resumed (or re-entered) with its scene still up, nothing swaps, so the routine starts here instead.
    if (this.inScene()) this.startRoutine();
    // Coming back on stage is an arrival: it spins in waving.
    if (ACTIONS[prev].offstage && !a.offstage) {
      this.play(GESTURES.pirouette);
      this.greet();
    }
    if (how === "resume") return;
    if (a.sound) this.onSound(a.sound);
    if (!a.enter) {
      if (name !== prev) this.blink();
      return;
    }
    const owner = this.entryOwner;
    for (const step of a.enter) {
      if (typeof step === "string") this.play(GESTURES[step]);
      else this.sched.after(step.at, () => this.emit(step.particles, step.count), owner);
    }
  }

  /** Shows a feeling over whatever the character is doing; null when the current action doesn't allow it. */
  express(name: ExpressionName, ms = 1800, silent = false): ExpressionHandle | null {
    if (!allows(ACTIONS[this.current], name)) return null;
    const h = this.expressions.push(name, ms);
    const d = EXPRESSIONS[name];
    for (const g of d.gestures ?? []) this.play(GESTURES[g], ms);
    const p = d.particles;
    if (p?.at) this.sched.after(p.at, () => this.emit(p.kind, p.count), h);
    else if (p) this.emit(p.kind, p.count);
    if (!silent && d.sound) this.onSound(d.sound);
    return h;
  }

  cancelExpression(h: ExpressionHandle): void {
    this.expressions.cancel(h);
  }

  setBaseline(name: ExpressionName | null): void {
    this.expressions.setBaseline(name);
  }

  blink(): void {
    if (this.tweens.isLocked("open")) return;
    this.play(GESTURES.blink);
  }

  squash(): void {
    this.play(GESTURES.squash);
  }

  /** A poke knocks the body round a little; never over a turn already playing. */
  jolt(): void {
    if (this.tweens.isLocked("turn")) return;
    this.play(turnJolt(this.random() < 0.5 ? -1 : 1));
  }

  /** The camera pulls back and the scene rises, then it walks to the first spot; no scene zooms back in, on stage. */
  private sceneUp(next: SceneName | null): void {
    // A new scene (or none) ends whatever was scripted in the last one, and its things go with it.
    this.routine?.cancel();
    this.routine = null;
    this.things = [];
    this.route = [];
    this.facing = 0;
    this.spot = -1;
    this.arrival = null;
    this.waiting = false;
    this.leaping = false;
    if (!next) {
      this.target.zoom = 1;
      this.target.wz = 0;
      this.wanderTo(this.target.wx, 0);
      return;
    }
    const scene = SCENES[next];
    this.target.zoom = scene.zoom;
    this.animate("show", SCENE_RISE);
    if (!this.startRoutine()) this.walkTo(0);
  }

  /** Starts the current action's routine, if it has one and isn't running it yet; true when one runs. */
  private startRoutine(): boolean {
    const r = ACTIONS[this.current].routine;
    if (!r || !this.inScene()) return false;
    this.routine ??= new Routine(ROUTINES[r], this.host);
    return true;
  }

  /** What a routine may ask of the engine: its own walking, turning, gestures and things, done the usual way. */
  private makeHost(): RoutineHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const eng = this;
    return {
      now: () => eng.now(),
      random: () => eng.random(),
      get calm() {
        return eng.reduced || eng.live === 0;
      },
      get reduced() {
        return eng.reduced;
      },
      spots: () => {
        const s = eng.inScene();
        return s ? SCENES[s].spots : [];
      },
      at: () => ({ x: eng.v.wx, z: eng.v.wz }),
      go: (to) => void eng.goTo(to),
      arrived: () => eng.settled(),
      face: (turn) => {
        eng.facing = turn;
        eng.facedAt = eng.frame;
      },
      // The target takes a new facing up on the next update; it also leans toward the pointer, so the facing alone
      // can be out of reach.
      turned: () => eng.frame > eng.facedAt && Math.abs(eng.v.turn - eng.target.turn) < 0.1,
      play: (name: GestureName) => {
        eng.play(GESTURES[name]);
        return gestureMs(GESTURES[name]);
      },
      use: (keys, mouth) => {
        eng.useMouth = mouth ?? null;
        eng.animate("use", [...keys]);
        return keys.reduce((s, [, ms]) => s + ms, 0);
      },
      blink: () => eng.blink(),
      express: (name, ms) => void eng.express(name, ms, true),
      things: () => eng.things,
      world: () => (eng.scene.shown ? worldOf(SCENES[eng.scene.shown]) : null),
    };
  }

  /** The scene the character is in: shown, and the one the current action wants. */
  private inScene(): SceneName | null {
    const s = this.scene.shown;
    return s && s === ACTIONS[this.current].scene ? s : null;
  }

  /** Sets off for one of the scene's spots. */
  private walkTo(i: number): void {
    const name = this.inScene();
    if (!name || i < 0) return;
    if (this.goTo(SCENES[name].spots[i])) this.spot = i;
  }

  /** Sets off for a spot in the current scene, round any fixture in the way; false when it stays put. */
  private goTo(to: Spot): boolean {
    const name = this.inScene();
    // Liveliness 0 and reduced motion stay put, wherever the scene finds it.
    if (!name || this.reduced || this.live === 0) return false;
    const scene = SCENES[name];
    this.facing = 0;
    this.arrival = to;
    this.route = planWalk(scene, { x: this.v.wx, z: this.v.wz }, to);
    // The dwell starts once it's there.
    this.nextWander = Infinity;
    this.nextLeg();
    const hop = this.motion().hop ?? 0;
    if (hop > 0) this.animate("oy", [[-hop, 120, Ease.out], [0, 220, Ease.back]]);
    return true;
  }

  /** At its spot: the last leg walked, no leap winding up. */
  private settled(): boolean {
    const there = Math.hypot(this.target.wx - this.v.wx, this.target.wz - this.v.wz) < ARRIVE;
    return there && !this.route.length && !this.waiting;
  }

  private nextLeg(): void {
    const leg = this.route.shift();
    if (!leg) return;
    const spot = this.arrival;
    if (this.route.length > 0 || !spot) return this.stepTo(leg, 0);
    if (!spot.leap) {
      this.facing = spot.turn ?? 0;
      this.stepTo(leg, -(spot.lift ?? 0));
      if (spot.lift) this.animate("oy", [[-0.3, 200, Ease.out], [0, 280, Ease.back]]);
      return;
    }
    // A leap winds up first: a crouch, then the jump.
    this.waiting = true;
    this.squash();
    this.sched.after(LEAP_WINDUP, () => {
      if (this.arrival !== spot) return;
      this.waiting = false;
      this.leaping = true;
      this.facing = spot.turn ?? 0;
      this.stepTo(leg, -(spot.lift ?? 0));
      this.animate("oy", LEAP_KEYS);
    });
  }

  private stepTo(p: FloorPt, wy: number): void {
    this.target.wx = p.x;
    this.target.wz = p.z;
    this.target.wy = wy;
  }


  /** Any spot but the one it's at or heading to; −1 when there's no other. */
  private nextSpot(count: number): number {
    if (count < 2) return this.spot < 0 ? 0 : -1;
    return (Math.max(0, this.spot) + 1 + Math.floor(this.random() * (count - 1))) % count;
  }

  /** Speech was cut off: a squash, wide eyes for a moment, and the mouth snaps shut. */
  interrupted(): void {
    this.squash();
    this.express("surprised", 600, true);
    this.v.mouth = this.target.mouth = 0;
  }

  greet(): void {
    this.play(GESTURES.handsUp);
    this.waveUntil = this.now() + 1500;
    this.express("happy", 1500, true);
    this.onSound("greet");
    this.sched.after(1550, () => this.play(GESTURES.handsDown));
  }

  setHover(on: boolean): void {
    this.hovering = on;
  }

  /** Pointer offset from the character's centre in CSS pixels; tanh keeps far-away pointers from cranking the head. */
  setLook(dx: number, dy: number): void {
    this.look = { x: Math.tanh(dx / 260), y: Math.tanh(-dy / 200) };
    this.lastMouse = this.now();
    this.glance = null;
  }

  /** Off, no action brings its scene, and one showing sinks: the plain close-up, for slower machines. */
  setScenes(on: boolean): void {
    this.scenesOn = on;
    this.scene.set(on ? ACTIONS[this.current].scene ?? null : null);
  }

  /** 0–1: scales how far and how quickly every state moves; 0.5 is the designed feel, 0 stays put. */
  setLiveliness(l: number): void {
    this.live = Math.max(0, Math.min(1, l));
  }

  update(): Pose {
    const n = this.now();
    const dt = Math.min(0.05, Math.max(0, (n - this.last) / 1000));
    this.last = n;
    this.frame++;
    const t = (n - this.start) / 1000;
    this.sched.run();
    this.tweens.update(n);
    this.expressions.update();

    const a = ACTIONS[this.current];
    this.resolved = this.expressions.resolve(a.face, (e) => allows(a, e));
    const face = this.resolved.face;
    const motion = this.motion();
    this.stateLife(n, motion);
    const shown = this.scene.shown;
    this.things = stepThings(this.things, dt, shown ? worldOf(SCENES[shown]) : null);
    this.routine?.tick();
    const look = this.glance ?? this.look;
    let headYaw = look.x * 0.62;
    let headPitch = look.y * 0.5;
    const g = face.gaze;
    if (g === "down") {
      headYaw = 0;
      headPitch = -0.14;
    } else if (typeof g === "object") {
      headYaw = headYaw * 0.35 + g.fixed[0] * 0.55;
      headPitch = headPitch * 0.3 + g.fixed[1] * 0.5;
    }
    const goX = this.target.wx - this.v.wx;
    // Walking back reads as going up the screen, the way the floor recedes.
    const goY = this.target.wy - this.v.wy + (this.target.wz - this.v.wz) * FLOOR_RISE;
    const go = Math.hypot(goX, goY);
    const travel = clamp(go / HEAD_FULL, 0, 1);
    if (go > 1e-6) {
      headYaw = lerp(headYaw, (goX / go) * TRAVEL_YAW, travel);
      // Screen y is down; the gaze's pitch is up.
      headPitch = lerp(headPitch, (-goY / go) * TRAVEL_PITCH, travel);
    }
    // Searching's scan and dizzy's sway are the eyes' own; the body keeps to the heading, and a scan gives way to it
    // as the character sets off.
    let yaw = headYaw;
    let pitch = headPitch;
    if (g === "scan") {
      yaw = lerp(Math.sin(t * 2.6) * 0.6, headYaw, travel);
      pitch = lerp(-0.06, headPitch, travel);
    } else if (g === "sway") yaw = Math.sin(t * 9) * 0.25;
    else {
      const [jy, jp] = this.saccade(t);
      yaw += jy;
      pitch += jp;
    }

    const tg = this.target;
    tg.yaw = yaw;
    tg.pitch = pitch;
    tg.turn = headYaw * BODY_TURN + this.facing * (1 - travel);
    // Gaze pitch is up-positive; tip is forward-positive, the way the head goes looking down.
    tg.tip = -headPitch * BODY_TIP;
    tg.tilt = face.tilt;
    tg.blush = face.blush;
    tg.oy = a.rhythm === "bounce" ? -Math.abs(Math.sin(t * 5.2)) * 0.07 : 0;
    tg.sy = a.rhythm === "breathe" ? 1 + Math.sin(t * 1.8) * 0.035 : 1;
    tg.sx = a.rhythm === "breathe" ? 1 - Math.sin(t * 1.8) * 0.02 : 1;
    tg.ax = a.offstage ? OFFSTAGE : 0;
    tg.es = this.hovering ? 1.08 : 1;
    const m = this.mouthSource(n);
    tg.talk = m ? 1 : 0;
    tg.mouth = m ? m.open : 0;
    if (m && m.viseme !== "rest") this.viseme = m.viseme;
    const scene = this.inScene();
    const kWander = Math.exp(-1 / (this.leaping ? LEAP_PACE : (scene && SCENES[scene].pace) || motion.pace));
    for (const p of PROPS) {
      if (this.tweens.isLocked(p)) continue;
      const k =
        p === "ax" ? K_AWAY : p === "mouth" ? K_MOUTH : p === "talk" ? K_TALK : p === "wx" || p === "wy" || p === "wz" ? kWander : p === "zoom" ? K_ZOOM
          : p === "yaw" || p === "pitch" ? K_GAZE : K_BODY;
      this.v[p] = smooth(this.v[p], tg[p], k, dt);
    }
    if (this.reduced) {
      this.v.ax = tg.ax;
      this.v.zoom = tg.zoom;
    }
    this.color = mixRGB(this.color, a.color, 1 - K_COLOR ** dt);

    if (n >= this.nextBlink) {
      if (face.blink) {
        this.blink();
        if (this.random() < 0.22) this.sched.after(230, () => this.blink());
      }
      this.nextBlink = n + 2200 + this.random() * 3200;
    }
    if (a.ambient && n - this.lastAmbient > a.ambient.every) {
      this.lastAmbient = n;
      this.emit(a.ambient.particles, 1);
    }
    for (const p of this.particles) p.age += dt;
    this.particles = this.particles.filter((p) => p.age < p.life);

    const v = this.v;
    return {
      t, yaw: v.yaw, pitch: v.pitch, roll: v.roll, tilt: v.tilt, sx: v.sx, sy: v.sy, ox: v.ox + v.wx + v.ax, oy: v.oy + v.wy, oz: v.wz, ground: this.scene.shown ? v.wy : 0, zoom: v.zoom,
      color: this.color, tint: v.tint, blush: v.blush,
      eyeShape: face.eye, eyeOpen: v.open, eyeScale: v.es,
      badge: this.badge, badgeColor: this.badgeColor, badgeScale: v.badgeS,
      hands: v.hands, waving: n < this.waveUntil, turn: v.turn, tip: v.tip, reach: v.reach, item: this.item.shown, scribble: v.scribble, use: v.use, particles: this.particles,
      mouth: v.talk > 0.02 ? { viseme: this.viseme, open: v.mouth, alpha: Math.min(1, v.talk) } : this.usingMouth() ?? this.feelingMouth(face),
      body: null,
      scene: this.scene.shown ? { id: this.scene.shown, show: v.show } : null,
      things: this.things.map((th) => ({ ...th, show: v.show })),
    };
  }

  /** The mouth shape the item's use opens (a sip), when nothing is speaking. */
  private usingMouth(): PoseMouth | null {
    const use = this.v.use;
    return this.useMouth && use > 0.02 ? { viseme: this.useMouth, open: use, alpha: Math.min(1, use * 2) } : null;
  }

  /** A feeling's mouth, when nothing else has it: speech first, then an item's use. */
  private feelingMouth(face: Face): PoseMouth | null {
    return face.mouth ? { viseme: face.mouth.viseme, open: face.mouth.open, alpha: 1 } : null;
  }

  /** A small hop of the eyes that holds for SACCADE_S; seeded by the clock so it draws nothing from the random source. */
  private saccade(t: number): readonly [number, number] {
    if (this.reduced) return [0, 0];
    const k = Math.floor(t / SACCADE_S);
    const noise = (salt: number) => {
      const x = Math.sin(k * 12.9898 + salt * 78.233) * 43758.5453;
      return (x - Math.floor(x)) * 2 - 1;
    };
    return [noise(1) * SACCADE.yaw, noise(2) * SACCADE.pitch];
  }

  /** The current state's motion, scaled by liveliness and clamped to the banner. */
  private motion(): Motion {
    const m = ACTIONS[this.current].motion;
    const { pace, range } = this.resolved;
    const f = this.live * 2;
    const slow = 1.5 - this.live;
    // A hop never grows past its designed height, and the box shrinks to fit it under the halo's limit.
    const hop = (m.hop ?? 0) * Math.min(1, f);
    return {
      ...m,
      range: { x: Math.min(LIMIT.x, m.range.x * f * range), y: Math.min(LIMIT.y - hop, m.range.y * f * range) },
      every: m.every && [m.every[0] * slow * pace, m.every[1] * slow * pace],
      pace: (this.homing ? HOME_PACE : m.pace * pace) * slow,
      hop,
    };
  }

  private pick([min, max]: readonly [number, number]): number {
    return min + this.random() * (max - min);
  }

  /** Every few moments, move to a new spot in the state's box; idle also glances around while the mouse is still. */
  private stateLife(n: number, m: Motion): void {
    const r = this.random;
    if (this.homing && Math.hypot(this.v.wx, this.v.wy) < 0.05) this.homing = false;
    if (!m.glance) this.glance = null;
    const scene = this.inScene();
    const there = Math.hypot(this.target.wx - this.v.wx, this.target.wz - this.v.wz) < ARRIVE;
    if (there && !this.route.length) this.leaping = false;
    if (there && this.route.length && !this.waiting) this.nextLeg();
    else if (there && scene && !this.route.length && !this.waiting && this.nextWander === Infinity) this.nextWander = n + this.pick(SCENES[scene].dwell);
    const settled = this.settled();
    this.target.scribble = settled && scene && this.arrival?.writes ? 1 : 0;
    if (scene && n >= this.nextWander && !this.routine) {
      this.walkTo(this.nextSpot(SCENES[scene].spots.length));
      // Staying put (liveliness 0, reduced motion): look again after a dwell, in case that changes.
      if (this.nextWander !== Infinity) this.nextWander = n + this.pick(SCENES[scene].dwell);
    } else if (!scene && m.every && n >= this.nextWander) {
      if (!this.reduced && m.desks) this.dash(this.nextDesk(m.desks, m.range.x), 0);
      else if (!this.reduced) this.dash((r() * 2 - 1) * m.range.x, (r() * 2 - 1) * m.range.y);
      this.nextWander = n + this.pick(m.every);
    }
    if (this.current === "idle" && m.glance && n - this.lastMouse >= STILL_MOUSE_MS && n >= this.nextLook) {
      this.nextLook = n + this.pick(LOOK_EVERY);
      if (!this.tweens.isLocked("turn")) this.play(lookAround(r() < 0.5 ? -1 : 1));
    }
    if (!m.glance || n - this.lastMouse < STILL_MOUSE_MS || n < this.nextGlance) return;
    const g = { x: (r() * 2 - 1) * 0.8, y: r() * 0.9 - 0.4 };
    this.glance = g;
    this.nextGlance = n + 1500 + r() * 2500;
    if (!this.reduced && r() < 0.4) {
      // Look first, then go: it reads as "going over there". Gaze up (y > 0) means moving up (negative oy).
      this.sched.after(400, () => this.dash((g.x / 0.8) * m.range.x, -(g.y / 0.5) * m.range.y), this.entryOwner);
      this.nextWander = n + 400 + this.pick(m.every ?? [3000, 6000]);
    }
  }

  /** Any desk but the one it's heading to now. */
  private nextDesk(count: number, half: number): number {
    if (half === 0) return 0;
    const gap = (2 * half) / (count - 1);
    const at = Math.max(0, Math.min(count - 1, Math.round((this.target.wx + half) / gap)));
    const i = (at + 1 + Math.floor(this.random() * (count - 1))) % count;
    return -half + i * gap;
  }

  private dash(x: number, y: number): void {
    this.wanderTo(x, y);
    const hop = this.motion().hop ?? 0;
    if (hop > 0 && Math.abs(this.target.wx - this.v.wx) > DASH) {
      this.animate("oy", [[-hop, 120, Ease.out], [0, 220, Ease.back]]);
    }
  }

  private wanderTo(x: number, y: number): void {
    const { range } = this.motion();
    this.target.wx = Math.max(-range.x, Math.min(range.x, x));
    this.target.wy = Math.max(-range.y, Math.min(range.y, y));
  }

  private animate(prop: Prop, keys: Key[], done?: () => void): void {
    if (this.reduced && !CALM_PROPS.has(prop)) {
      this.v[prop] = this.target[prop] = keys[keys.length - 1][0];
      done?.();
      return;
    }
    this.tweens.run(prop, keys, this.now(), () => {
      this.target[prop] = keys[keys.length - 1][0];
      done?.();
    });
  }

  /** Plays every track of a gesture; `ms` stretches the holds of expression gestures. */
  private play(g: Gesture, ms = 0): void {
    for (const tr of g) {
      if (tr.from !== undefined) this.v[tr.prop] = tr.from;
      const settle = tr.settle;
      this.animate(tr.prop, tr.keys(ms), settle === undefined ? undefined : () => {
        this.v[tr.prop] = settle;
        this.target[tr.prop] = settle;
      });
    }
  }

  private setBadge(kind: BadgeKind | null, color: RGB): void {
    if (kind === this.badge && color === this.badgeColor) return;
    const token = ++this.badgeToken;
    this.animate("badgeS", [[0, 90, Ease.inOut]]);
    this.sched.after(100, () => {
      if (token !== this.badgeToken) return;
      this.badge = kind;
      this.badgeColor = color;
      if (kind) this.animate("badgeS", [[1, 280, Ease.back]]);
    });
  }

  private emit(kind: ParticleKind, count: number): void {
    if (this.reduced) return;
    const r = this.random;
    for (let i = 0; i < count; i++) {
      this.particles.push({
        kind,
        x: (r() - 0.5) * 0.9 + (kind === "z" ? 0.55 : 0),
        y: -0.7 - r() * 0.2,
        vx: (r() - 0.5) * 0.35 + (kind === "z" ? 0.18 : 0),
        vy: -(0.45 + r() * 0.35),
        age: -i * 0.14,
        life: 1.3 + r() * 0.5,
        rot: r() * 6,
        size: 0.15 + r() * 0.08,
      });
    }
  }
}
