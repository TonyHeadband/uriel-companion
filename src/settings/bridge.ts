import type { Bus } from "./bus";
import { EVENTS, type Command, type Snapshot } from "./protocol";

export interface Bridge {
  /** Tells the settings window about a change made in the main window (the header speaker). */
  publish(): void;
}

/**
 * Commands that change what the settings window shows are answered with a snapshot; the rest are not, because a
 * snapshot landing mid-drag would pull the slider back under the person's hand.
 */
export async function startBridge(
  bus: Bus,
  apply: (c: Command) => void,
  snapshot: () => Snapshot,
  onPeerFocus: (focused: boolean) => void,
): Promise<Bridge> {
  const publish = () => bus.emit(EVENTS.snapshot, snapshot());
  await Promise.all([
    bus.listen<boolean>(EVENTS.focus, onPeerFocus),
    bus.listen<Command>(EVENTS.command, (c) => {
      apply(c);
      if (c.type === "character" || c.type === "resetBody") publish();
    }),
    bus.listen(EVENTS.ready, publish),
  ]);
  publish();
  return { publish };
}
