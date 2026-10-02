export type LinkState = "connecting" | "online" | "away";

export interface LinkDeps {
  /** Gateway.health: true when the agent answers. */
  health: () => Promise<boolean>;
  later: (ms: number, fn: () => void) => void;
  onChange: (state: LinkState) => void;
}

export const ONLINE_EVERY_MS = 30_000;
export const AWAY_EVERY_MS = 5_000;

/**
 * Whether the agent can be reached, checked in the background so the character can leave before a message fails.
 * Online needs two failed checks in a row to go away (one blip isn't an outage); connecting needs one, so launching
 * against a down agent doesn't wait. A chat stream's own result counts at once.
 */
export class Link {
  private s: LinkState = "connecting";
  private fails = 0;
  private checking = false;
  private started = false;
  // Bumped by each schedule, so a timer set at the old pace doesn't start a second chain of checks.
  private gen = 0;

  constructor(private readonly d: LinkDeps) {}

  get state(): LinkState {
    return this.s;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    void this.check();
  }

  reportDown(): void {
    this.fails = 0;
    this.set("away");
  }

  reportUp(): void {
    this.fails = 0;
    this.set("online");
  }

  private async check(): Promise<void> {
    this.checking = true;
    let ok: boolean;
    try {
      ok = await this.d.health();
    } catch {
      ok = false;
    }
    try {
      if (ok) {
        this.fails = 0;
        this.set("online");
      } else if (++this.fails >= (this.s === "online" ? 2 : 1)) {
        this.set("away");
      }
    } catch (e) {
      // A failing listener must not stop the watcher.
      console.error("link: onChange failed", e);
    } finally {
      // Cleared only now, so a change made by this check doesn't schedule a second timer next to the one below.
      this.checking = false;
      this.schedule();
    }
  }

  private set(state: LinkState): void {
    if (state === this.s) return;
    this.s = state;
    this.d.onChange(state);
    // The pace changed; a check in flight reschedules itself when it finishes.
    if (this.started && !this.checking) this.schedule();
  }

  private schedule(): void {
    const gen = ++this.gen;
    this.d.later(this.s === "online" ? ONLINE_EVERY_MS : AWAY_EVERY_MS, () => {
      if (gen === this.gen) void this.check();
    });
  }
}
