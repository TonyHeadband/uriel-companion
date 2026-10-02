import { RenderLoop } from "./loop";

function rig(focused = true) {
  let cb: ((t: number) => void) | null = null;
  const docListeners: Record<string, () => void> = {};
  const winListeners: Record<string, () => void> = {};
  const doc = {
    hidden: false,
    hasFocus: () => focused,
    addEventListener: (k: string, f: () => void) => { docListeners[k] = f; },
    removeEventListener: (k: string) => { delete docListeners[k]; },
  };
  const win = {
    addEventListener: (k: string, f: () => void) => { winListeners[k] = f; },
    removeEventListener: (k: string) => { delete winListeners[k]; },
  };
  const frames: number[] = [];
  const loop = new RenderLoop((t) => { frames.push(t); }, {
    raf: (f) => { cb = f; return 1; },
    caf: () => { cb = null; },
    doc,
    win,
  });
  const fire = (t: number) => { const f = cb; cb = null; f?.(t); };
  const run = (from: number, to: number) => { for (let t = from; t <= to; t += 16) fire(t); };
  const setFocus = (on: boolean) => { focused = on; winListeners[on ? "focus" : "blur"](); };
  return { loop, frames, fire, run, doc, docListeners, winListeners, setFocus, pending: () => cb !== null };
}

test("draws every frame while the window has focus, even when nothing moves", () => {
  const { loop, frames, run } = rig(true);
  loop.start();
  run(16, 160);
  expect(frames).toHaveLength(10);
});

test("drops to about 30 fps while another window has focus", () => {
  const { loop, frames, run } = rig(false);
  loop.start();
  run(16, 160);
  expect(frames.length).toBeLessThanOrEqual(5);
  expect(frames.length).toBeGreaterThanOrEqual(4);
});

test("keeps full rate while another window of the app has focus", () => {
  const { loop, frames, run } = rig(false);
  loop.start();
  loop.setPeerFocused(true);
  run(16, 160);
  expect(frames).toHaveLength(10);
});

test("drops back to about 30 fps once that window loses focus too", () => {
  const { loop, frames, run } = rig(false);
  loop.start();
  loop.setPeerFocused(true);
  loop.setPeerFocused(false);
  run(16, 160);
  expect(frames.length).toBeLessThanOrEqual(5);
});

test("switches rate as focus comes and goes", () => {
  const { loop, frames, run, setFocus } = rig(true);
  loop.start();
  run(16, 160);
  setFocus(false);
  run(176, 320);
  const unfocused = frames.filter((t) => t >= 176).length;
  setFocus(true);
  run(336, 480);
  expect(frames.filter((t) => t <= 160)).toHaveLength(10);
  expect(unfocused).toBeLessThanOrEqual(5);
  expect(frames.filter((t) => t >= 336)).toHaveLength(10);
});

test("stops while hidden and resumes when visible", () => {
  const { loop, frames, fire, doc, docListeners, pending } = rig(true);
  loop.start();
  fire(16);
  doc.hidden = true;
  docListeners.visibilitychange();
  expect(pending()).toBe(false);
  doc.hidden = false;
  docListeners.visibilitychange();
  fire(500);
  expect(frames).toEqual([16, 500]);
});

test("stop cancels the next frame and every listener", () => {
  const { loop, fire, frames, docListeners, winListeners } = rig(true);
  loop.start();
  loop.stop();
  fire(16);
  expect(frames).toHaveLength(0);
  expect(docListeners.visibilitychange).toBeUndefined();
  expect(winListeners.focus).toBeUndefined();
  expect(winListeners.blur).toBeUndefined();
});
