import { CharacterEngine } from "../engine/character-engine";
import { OK_TURN, scriptedGateway } from "../debug/scripted";
import { ChatController, type ChatView } from "./controller";

const speech = { speaking: false, push() {}, end() {}, stop() {}, drained: () => Promise.resolve(true) };

/** Runs one scripted turn and returns each action change as "ms:action", plus what the chat view was shown. */
async function turn(asleep: boolean): Promise<{ seen: string[]; reply: string[]; activity: string[] }> {
  const reply: string[] = [];
  const activity: string[] = [];
  const view: ChatView = {
    addUser() {}, startReply() {}, appendReply: (x) => void reply.push(x), addNotice() {}, showError() {}, setBusy() {},
    addActivity: (x) => void activity.push(x), clearActivity() {},
  };
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5 });
  const seen: string[] = [];
  // The controller's timers (the finished beat) run on the same frames as the engine.
  let timers: Array<{ at: number; fn: () => void }> = [];
  const frame = () => {
    const due = timers.filter((x) => x.at <= t);
    timers = timers.filter((x) => x.at > t);
    for (const x of due) x.fn();
    e.update();
    if (seen.at(-1)?.split(":")[1] !== e.state) seen.push(`${t}:${e.state}`);
  };
  if (asleep) {
    e.claim("rest", "sleeping");
    e.setBaseline("yawn");
  }
  frame();
  const wait = async (ms: number) => {
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      frame();
    }
  };
  const c = new ChatController({
    gateway: scriptedGateway(OK_TURN, wait), engine: e, view, sound() {}, signIn() {}, speech, onInterrupt() {},
    later: (ms, fn) => void timers.push({ at: t + ms, fn }),
  });
  await c.send("hi");
  frame();
  return { seen, reply, activity };
}

test("asleep and in a mood, a turn shows the same actions at the same times", async () => {
  const drop = (xs: string[], s: string) => xs.filter((x) => x.split(":")[1] !== s);
  const { seen: awake, reply, activity } = await turn(false);
  const { seen: sleepy, reply: sleepyReply, activity: sleepyActivity } = await turn(true);
  expect(drop(awake, "idle").map((x) => x.split(":")[1])).toEqual(["thinking", "searching", "working", "finished", "talking"]);
  expect(drop(sleepy, "sleeping")).toEqual(drop(awake, "idle"));
  expect(reply.join("")).not.toBe("");
  expect(sleepyReply).toEqual(reply);
  expect(sleepyActivity).toEqual(activity);
});
