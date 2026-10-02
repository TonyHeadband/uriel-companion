import { clamp } from "../engine/anim";
import type { SoundName } from "./names";
import { RECIPES, type Noise, type Recipe, type Tone } from "./recipes";

export const MAX_VOLUME = 0.5;
export const DEFAULT_VOLUME = 0.12;
// A running AudioContext keeps an audio thread busy even in silence.
const IDLE_SUSPEND_MS = 1500;

type Timer = ReturnType<typeof setTimeout>;

function defaultContext(): AudioContext | null {
  return typeof AudioContext === "undefined" ? null : new AudioContext();
}

export class Synth {
  enabled = true;
  private vol = DEFAULT_VOLUME;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private bus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private idle: Timer | null = null;

  constructor(
    private readonly makeContext: () => AudioContext | null = defaultContext,
    private readonly timers = {
      set: (fn: () => void, ms: number): Timer => setTimeout(fn, ms),
      clear: (id: Timer) => clearTimeout(id),
    },
  ) {}

  get volume(): number {
    return this.vol;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
  }

  setVolume(v: number): void {
    this.vol = clamp(v, 0, MAX_VOLUME);
    if (this.master) this.master.gain.value = this.vol;
  }

  play(name: SoundName): void {
    this.playRecipe(RECIPES[name]);
  }

  /** Any recipe on the same bus, so voice blips share the volume, room and idle suspend. */
  playRecipe(recipe: Recipe): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    let end = 0;
    for (const part of recipe) {
      end = Math.max(end, (part.delay ?? 0) + part.d);
      if (part.kind === "tone") this.tone(ctx, part);
      else this.noise(ctx, part);
    }
    if (this.idle !== null) this.timers.clear(this.idle);
    this.idle = this.timers.set(() => {
      this.idle = null;
      void this.ctx?.suspend();
    }, end * 1000 + IDLE_SUSPEND_MS);
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const ctx = this.makeContext();
    if (!ctx) return null;
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    master.connect(comp);
    comp.connect(ctx.destination);
    // A short synthetic room: decaying noise as an impulse response, about 20% wet.
    const len = Math.floor(ctx.sampleRate * 1.2);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.4;
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    const wet = ctx.createGain();
    wet.gain.value = 0.2;
    reverb.connect(wet);
    wet.connect(master);
    const bus = ctx.createGain();
    bus.connect(master);
    bus.connect(reverb);
    const nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.master = master;
    this.bus = bus;
    this.noiseBuf = nb;
    return ctx;
  }

  private tone(ctx: AudioContext, p: Tone): void {
    const t = ctx.currentTime + (p.delay ?? 0);
    const a = p.a ?? 0.006;
    const osc = ctx.createOscillator();
    osc.type = p.type ?? "sine";
    osc.frequency.setValueAtTime(p.f, t);
    if (p.to) osc.frequency.exponentialRampToValueAtTime(p.to, t + p.d * 0.9);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(p.g, t + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p.d);
    if (p.vib) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = p.vibf ?? 6;
      depth.gain.value = p.vib;
      lfo.connect(depth);
      depth.connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + p.d + 0.05);
    }
    osc.connect(gain);
    gain.connect(this.bus!);
    osc.start(t);
    osc.stop(t + p.d + 0.05);
    if (p.h) {
      const o2 = ctx.createOscillator();
      o2.frequency.setValueAtTime(p.f * p.h, t);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(p.g * 0.3, t + a);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + p.d * 0.35);
      o2.connect(g2);
      g2.connect(this.bus!);
      o2.start(t);
      o2.stop(t + p.d);
    }
  }

  private noise(ctx: AudioContext, p: Noise): void {
    const t = ctx.currentTime + (p.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = p.q ?? 0.9;
    filter.frequency.setValueAtTime(p.f, t);
    if (p.to) filter.frequency.exponentialRampToValueAtTime(p.to, t + p.d);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(p.g, t + p.d * 0.35);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + p.d);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus!);
    src.start(t);
    src.stop(t + p.d + 0.05);
  }
}
