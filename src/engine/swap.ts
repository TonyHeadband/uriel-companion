/**
 * Something shown that changes by putting the old one away first, then bringing the next out. A newer change made
 * while the old one is still going away takes over: only the latest is brought out.
 */
export class Swap<T> {
  shown: T | null = null;
  private wanted: T | null = null;
  private token = 0;

  constructor(
    private readonly putAway: (done: () => void) => void,
    private readonly bringOut: (next: T | null) => void,
  ) {}

  set(next: T | null): void {
    if (next === this.wanted) return;
    this.wanted = next;
    const token = ++this.token;
    const out = () => {
      if (token !== this.token) return;
      this.shown = next;
      this.bringOut(next);
    };
    if (this.shown === null) out();
    else this.putAway(out);
  }
}
