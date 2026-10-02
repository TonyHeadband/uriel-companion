interface Timer {
  at: number;
  fn: () => void;
  owner: object | null;
  dead: boolean;
}

/** Delayed steps on the engine's clock. A step can belong to an owner, so everything something scheduled is dropped at once when it ends. */
export class Scheduler {
  private timers: Timer[] = [];
  private running: Timer[] = [];

  constructor(private readonly now: () => number) {}

  after(ms: number, fn: () => void, owner: object | null = null): void {
    this.timers.push({ at: this.now() + ms, fn, owner, dead: false });
  }

  cancel(owner: object): void {
    for (const x of this.timers) if (x.owner === owner) x.dead = true;
    for (const x of this.running) if (x.owner === owner) x.dead = true;
    this.timers = this.timers.filter((x) => !x.dead);
  }

  run(): void {
    const n = this.now();
    const due = this.timers.filter((x) => x.at <= n);
    if (!due.length) return;
    this.timers = this.timers.filter((x) => x.at > n);
    // An earlier step may have cancelled a later one that was due in the same frame.
    this.running = due;
    for (const x of due) if (!x.dead) x.fn();
    this.running = [];
  }
}
