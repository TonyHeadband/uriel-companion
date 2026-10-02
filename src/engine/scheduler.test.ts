import { Scheduler } from "./scheduler";

function rig() {
  let t = 0;
  const s = new Scheduler(() => t);
  return { s, at: (ms: number) => { t = ms; s.run(); } };
}

test("runs a step once it's due, in the order they were added", () => {
  const { s, at } = rig();
  const ran: string[] = [];
  s.after(100, () => ran.push("b"));
  s.after(50, () => ran.push("a"));
  at(60);
  expect(ran).toEqual(["a"]);
  at(100);
  at(500);
  expect(ran).toEqual(["a", "b"]);
});

test("cancelling an owner drops all of its steps and nobody else's", () => {
  const { s, at } = rig();
  const owner = {};
  const ran: string[] = [];
  s.after(10, () => ran.push("mine"), owner);
  s.after(20, () => ran.push("mine too"), owner);
  s.after(30, () => ran.push("other"));
  s.cancel(owner);
  at(100);
  expect(ran).toEqual(["other"]);
});

test("a step cancelled by another step due in the same frame doesn't run", () => {
  const { s, at } = rig();
  const owner = {};
  const ran: string[] = [];
  s.after(10, () => s.cancel(owner));
  s.after(20, () => ran.push("spark"), owner);
  at(100);
  expect(ran).toEqual([]);
});

test("a step may schedule another; it runs on a later frame", () => {
  const { s, at } = rig();
  const ran: string[] = [];
  s.after(10, () => s.after(10, () => ran.push("next")));
  at(10);
  expect(ran).toEqual([]);
  at(20);
  expect(ran).toEqual(["next"]);
});
