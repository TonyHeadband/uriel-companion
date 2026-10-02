import { DEFAULT_CONFIG } from "../config";
import { startBridge } from "./bridge";
import { fakeBus } from "./fake-bus";
import { EVENTS, type Command, type Snapshot } from "./protocol";

const snap: Snapshot = { config: DEFAULT_CONFIG, body: { firmness: 5, settle: 0.35, sway: 0.5, bump: 0.4 } };

async function rig() {
  const { bus, emitted, deliver } = fakeBus();
  const applied: Command[] = [];
  const peerFocus: boolean[] = [];
  // firmness counts the commands applied so far, so a test can tell when a snapshot was taken.
  const bridge = await startBridge(
    bus,
    (c) => applied.push(c),
    () => ({ ...snap, body: { ...snap.body, firmness: applied.length } }),
    (focused) => peerFocus.push(focused),
  );
  const sent = () => emitted.filter(([event]) => event === EVENTS.snapshot).map(([, payload]) => payload as Snapshot);
  const snapshots = () => sent().length;
  return { bridge, applied, deliver, snapshots, sent, peerFocus };
}

test("it announces itself with a snapshot once it is listening", async () => {
  const { snapshots } = await rig();
  expect(snapshots()).toBe(1);
});

test("a ready from the settings window gets a snapshot back", async () => {
  const { deliver, snapshots } = await rig();
  deliver(EVENTS.ready);
  expect(snapshots()).toBe(2);
});

test("an ordinary command is applied and not answered, so a drag is never fought", async () => {
  const { applied, deliver, snapshots } = await rig();
  deliver(EVENTS.command, { type: "volume", value: 0.2 });
  deliver(EVENTS.command, { type: "liveliness", value: 0.8 });
  expect(applied).toEqual([{ type: "volume", value: 0.2 }, { type: "liveliness", value: 0.8 }]);
  expect(snapshots()).toBe(1);
});

test("a character switch or body reset is answered, so the body sliders follow", async () => {
  const { deliver, snapshots, sent } = await rig();
  deliver(EVENTS.command, { type: "character", id: "grid" });
  expect(snapshots()).toBe(2);
  deliver(EVENTS.command, { type: "resetBody" });
  expect(snapshots()).toBe(3);
  expect(sent().map((s) => s.body.firmness)).toEqual([0, 1, 2]);
});

test("the settings window's focus is passed on, so the main window can keep its full frame rate", async () => {
  const { deliver, peerFocus, snapshots } = await rig();
  deliver(EVENTS.focus, true);
  deliver(EVENTS.focus, false);
  expect(peerFocus).toEqual([true, false]);
  expect(snapshots()).toBe(1);
});

test("publish sends a snapshot on demand, for changes made in the main window", async () => {
  const { bridge, snapshots } = await rig();
  bridge.publish();
  expect(snapshots()).toBe(2);
});
