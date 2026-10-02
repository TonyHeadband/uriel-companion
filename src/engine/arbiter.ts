import type { Scheduler } from "./scheduler";
import type { ActionName } from "./states";

export type Layer = "link" | "task" | "interaction" | "rest" | "life";
/**
 * Highest first. While the agent can't be reached the character is off the stage, whatever else is going on. A poke
 * from the person beats even a chat turn, for the few seconds it lasts; the turn carries on underneath and shows again.
 * Rest is above life so falling asleep interrupts idle activities.
 */
export const LAYERS: readonly Layer[] = ["link", "interaction", "task", "rest", "life"];

export interface ClaimToken {
  readonly layer: Layer;
  readonly action: ActionName;
}

export interface ClaimOpts {
  /** Releases itself after this long, even while hidden under a higher layer. */
  ms?: number;
  /** Enter again even if the layer already shows this action (debug replays). */
  restart?: boolean;
  /** Gone for good the moment a higher layer shows, rather than resumed when it lets go: a pastime. */
  endsWhenCovered?: boolean;
}

export interface ActionChange {
  action: ActionName;
  /** "enter" the first time a claim shows; "resume" when it shows again after a higher layer let go. */
  how: "enter" | "resume";
}

interface Claim {
  token: ClaimToken;
  entered: boolean;
  endsWhenCovered: boolean;
}

/** Who owns the character: each writer claims a layer, and the highest claimed layer is what it does. */
export class Arbiter {
  private readonly claims = new Map<Layer, Claim>();
  private shown: Claim | null = null;

  constructor(
    private readonly sched: Scheduler,
    private readonly onChange: (c: ActionChange) => void,
  ) {}

  get current(): ActionName {
    return this.shown?.token.action ?? "idle";
  }

  isClaimed(layer: Layer): boolean {
    return this.claims.has(layer);
  }

  claim(layer: Layer, action: ActionName, opts: ClaimOpts = {}): ClaimToken {
    const held = this.claims.get(layer);
    if (held && held.token.action === action && !opts.restart) return held.token;
    if (held) this.sched.cancel(held.token);
    const token: ClaimToken = { layer, action };
    this.claims.set(layer, { token, entered: false, endsWhenCovered: !!opts.endsWhenCovered });
    if (opts.ms !== undefined) this.sched.after(opts.ms, () => this.release(layer, token), token);
    this.settle();
    return token;
  }

  /** With a token, only releases if that claim still holds the layer, so a stale owner can't release a newer one. */
  release(layer: Layer, token?: ClaimToken): void {
    const held = this.claims.get(layer);
    if (!held || (token && held.token !== token)) return;
    this.sched.cancel(held.token);
    this.claims.delete(layer);
    this.settle();
  }

  private settle(): void {
    const top = LAYERS.map((l) => this.claims.get(l)).find((c) => c !== undefined) ?? null;
    // Dropped here, not by whoever made it, so it holds even when nothing else runs in between (a hidden window).
    for (const [layer, c] of this.claims) {
      if (c === top || !c.endsWhenCovered) continue;
      this.sched.cancel(c.token);
      this.claims.delete(layer);
    }
    if (top === this.shown) return;
    this.shown = top;
    if (!top) {
      this.onChange({ action: "idle", how: "enter" });
      return;
    }
    const how = top.entered ? "resume" : "enter";
    top.entered = true;
    this.onChange({ action: top.token.action, how });
  }
}
