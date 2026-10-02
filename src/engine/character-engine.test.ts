import { CharacterEngine, OFFSTAGE } from "./character-engine";
import { seeded } from "./random";
import type { Pose } from "./pose";
import type { ActionName } from "./states";
import type { Mouth } from "../speech/backend";
import { footprints } from "../scene/plan";
import { inside } from "../scene/route";
import { SCENES } from "../scene/scenes";

function rig(random: () => number = () => 0.5) {
  let t = 0;
  const sounds: string[] = [];
  const e = new CharacterEngine({ now: () => t, random, onSound: (s) => sounds.push(s) });
  const run = (ms: number): Pose => {
    let pose = e.update();
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      pose = e.update();
    }
    return pose;
  };
  return { e, sounds, run };
}

test("starts idle with neutral eyes and no badge", () => {
  const { run } = rig();
  const pose = run(0);
  expect(pose.eyeShape).toBe("pill");
  expect(pose.badge).toBeNull();
});

test("entering a state plays its sound once", () => {
  const { e, sounds } = rig();
  e.claim("task", "working");
  e.claim("task", "working");
  expect(sounds).toEqual(["work"]);
});

test("the badge swaps after the old one shrinks, then pops in", () => {
  const { e, run } = rig();
  e.claim("task", "working");
  expect(run(48).badge).toBeNull();
  expect(run(80).badge).toBe("dots");
  expect(run(400).badgeScale).toBeGreaterThan(0.95);
});

test("the colour moves toward the state colour", () => {
  const { e, run } = rig();
  e.claim("task", "error");
  const c = run(3000).color;
  expect(Math.abs(c[0] - 244)).toBeLessThan(5);
  expect(Math.abs(c[1] - 80)).toBeLessThan(5);
});

test("finished pirouettes once, sparks, and ends facing front", () => {
  const { e, run } = rig();
  e.setLiveliness(0); // standing still, so nothing leans it after the spin
  e.claim("task", "finished");
  expect(run(400).turn).toBeGreaterThan(0);
  expect(run(200).particles.some((p) => p.kind === "spark")).toBe(true);
  expect(run(500).turn).toBe(0);
});

test("error shakes and settles", () => {
  const { e, run } = rig();
  e.claim("task", "error");
  expect(Math.abs(run(48).ox)).toBeGreaterThan(0.05);
  expect(Math.abs(run(400).ox)).toBeLessThan(0.001);
});

test("dizzy wiggles like error as it starts", () => {
  const { e, run } = rig();
  e.claim("task", "dizzy");
  expect(Math.abs(run(48).ox)).toBeGreaterThan(0.05);
});

test("an emote overrides the eyes, then hands back to the state", () => {
  const { e, sounds, run } = rig();
  e.claim("task", "working");
  e.express("love", 1000);
  expect(run(16).eyeShape).toBe("heart");
  expect(run(1100).eyeShape).toBe("pill");
  expect(sounds).toContain("love");
});

test("blinks on schedule while awake and never while asleep", () => {
  const { e, run } = rig(() => 0.5); // first blink at 2.5 s, then every 3.8 s, never a double blink
  let blinks = 0;
  let closed = false;
  const watch = (ms: number) => {
    for (let x = 0; x < ms; x += 16) {
      const shut = run(16).eyeOpen < 0.5;
      if (shut && !closed) blinks++;
      closed = shut;
    }
  };
  watch(20_000);
  expect(blinks).toBe(5); // 2.5, 6.3, 10.1, 13.9, 17.7 s
  e.claim("rest", "sleeping");
  run(500);
  blinks = 0;
  watch(20_000);
  expect(blinks).toBe(0);
  expect(run(16).eyeShape).toBe("closed");
});

test("hover grows the eyes a little", () => {
  const { e, run } = rig();
  e.setHover(true);
  expect(run(3000).eyeScale).toBeGreaterThan(1.07);
});

test("greet waves for 1.5 s and plays its sound", () => {
  const { e, sounds, run } = rig();
  e.greet();
  expect(run(400).hands).toBeGreaterThan(0.5);
  expect(run(16).waving).toBe(true);
  expect(run(1300).waving).toBe(false);
  expect(sounds).toEqual(["greet"]);
});

test("reduced motion keeps blinks and colour but drops turns, shakes and particles", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5, reducedMotion: true });
  const step = (ms: number) => {
    let pose = e.update();
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      pose = e.update();
    }
    return pose;
  };
  e.claim("task", "finished");
  const mid = step(400);
  expect(mid.turn).toBe(0);
  expect(step(400).particles).toHaveLength(0);
  e.claim("task", "error");
  expect(step(48).ox).toBe(0);
  let shut = false;
  for (let i = 0; i < 400 && !shut; i++) shut = step(16).eyeOpen < 0.5;
  expect(shut).toBe(true);
});

test("a seeded engine is deterministic", () => {
  const a = rig(seeded(7));
  const b = rig(seeded(7));
  a.e.claim("task", "finished");
  b.e.claim("task", "finished");
  expect(a.run(700)).toEqual(b.run(700));
});

function mouthRig() {
  let t = 0;
  let mouth: Mouth | null = null;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5, mouth: () => mouth });
  const run = (ms: number): Pose => {
    let pose = e.update();
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      pose = e.update();
    }
    return pose;
  };
  return { e, run, say: (m: Mouth | null) => (mouth = m) };
}

test("talking is a soft state with plain eyes and no badge", () => {
  const { e, run } = rig();
  e.claim("task", "talking");
  const pose = run(400);
  expect(pose.badge).toBeNull();
  expect(pose.eyeShape).toBe("pill");
});

test("no mouth until something speaks", () => {
  expect(mouthRig().run(200).mouth).toBeNull();
});

test("the mouth fades in, follows the speech, and fades out after", () => {
  const { run, say } = mouthRig();
  say({ viseme: "A", open: 1 });
  const talking = run(300).mouth!;
  expect(talking.viseme).toBe("A");
  expect(talking.open).toBeGreaterThan(0.9);
  expect(talking.alpha).toBeGreaterThan(0.9);
  say(null);
  expect(run(600).mouth).toBeNull();
});

test("between syllables the mouth closes but keeps its last shape", () => {
  const { run, say } = mouthRig();
  say({ viseme: "O", open: 1 });
  run(200);
  say({ viseme: "rest", open: 0 });
  const m = run(200).mouth!;
  expect(m.viseme).toBe("O");
  expect(m.open).toBeLessThan(0.05);
});

test("an interrupt snaps the mouth shut and widens the eyes", () => {
  const { e, run, say } = mouthRig();
  say({ viseme: "A", open: 1 });
  run(300);
  say(null);
  e.interrupted();
  const pose = run(16);
  expect(pose.mouth === null || pose.mouth.open < 0.05).toBe(true);
  expect(pose.eyeShape).toBe("dot");
});

function idleRig(opts: { reducedMotion?: boolean; seed?: number } = {}) {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: seeded(opts.seed ?? 7), reducedMotion: opts.reducedMotion });
  const frames = (ms: number, each?: (p: Pose) => void): Pose => {
    let pose = e.update();
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      pose = e.update();
      each?.(pose);
    }
    return pose;
  };
  return { e, frames };
}

test("idle: it wanders the banner, within range", () => {
  const { frames } = idleRig();
  let maxX = 0;
  let maxY = 0;
  frames(20_000, (p) => {
    maxX = Math.max(maxX, Math.abs(p.ox));
    maxY = Math.max(maxY, Math.abs(p.oy));
  });
  expect(maxX).toBeGreaterThan(0.05);
  expect(maxX).toBeLessThanOrEqual(2);
  expect(maxY).toBeLessThanOrEqual(0.2);
});

test("leaving idle for an attention state brings it home", () => {
  const { e, frames } = idleRig();
  frames(8000);
  e.claim("task", "question");
  const p = frames(10_000);
  expect(Math.abs(p.ox)).toBeLessThanOrEqual(0.3);
  expect(Math.abs(p.oy)).toBeLessThanOrEqual(0.05);
});

test("a glance-led wander that comes due after idle ends doesn't fire", () => {
  // A fixed low random makes the first glance (at 2 s) always lead a wander 400 ms later.
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.1 });
  const step = (ms: number) => {
    let p = e.update();
    for (let x = 0; x < ms; x += 16) {
      t += 16;
      p = e.update();
    }
    return p;
  };
  step(2100);
  // thinking's own first move is at least 4 s away, so any move within 1 s is the stale idle one.
  e.claim("task", "thinking");
  expect(Math.abs(step(1000).ox)).toBeLessThan(0.01);
});

test("with a still mouse it looks around on its own", () => {
  const { frames } = idleRig();
  let maxYaw = 0;
  // Saccades move the eyes up to 0.04 on their own; a glance goes well past that.
  frames(1500, (p) => (maxYaw = Math.max(maxYaw, Math.abs(p.yaw))));
  expect(maxYaw).toBeLessThan(0.06);
  frames(8000, (p) => (maxYaw = Math.max(maxYaw, Math.abs(p.yaw))));
  expect(maxYaw).toBeGreaterThan(0.1);
});

test("while the mouse keeps moving it never glances away", () => {
  const { e, frames } = idleRig();
  e.setLiveliness(0); // standing still, so the eyes don't follow any travel either
  let maxYaw = 0;
  for (let i = 0; i < 600; i++) {
    e.setLook(0, 0);
    maxYaw = Math.max(maxYaw, Math.abs(frames(16).yaw));
  }
  expect(maxYaw).toBeLessThan(0.06); // saccades only
});

test("reduced motion: no wander", () => {
  const { frames } = idleRig({ reducedMotion: true });
  let maxX = 0;
  frames(15_000, (p) => (maxX = Math.max(maxX, Math.abs(p.ox))));
  expect(maxX).toBe(0);
});

test("the wander roams most of the banner, leaving room for a squash, the hands and the halo", () => {
  const { frames } = idleRig();
  let maxX = 0;
  let maxY = 0;
  frames(60_000, (p) => {
    maxX = Math.max(maxX, Math.abs(p.ox));
    maxY = Math.max(maxY, Math.abs(p.oy));
  });
  expect(maxX).toBeGreaterThan(0.8);
  expect(maxX).toBeLessThanOrEqual(2);
  expect(maxY).toBeLessThanOrEqual(0.2);
});


function statRun(state: ActionName, ms: number, opts: { reducedMotion?: boolean; live?: number; seed?: number } = {}) {
  const { e, frames } = idleRig(opts);
  if (opts.live !== undefined) e.setLiveliness(opts.live);
  e.claim("task", state);
  let maxX = 0;
  let maxY = 0;
  let path = 0;
  let maxDy = 0;
  let prev = frames(0);
  frames(ms, (p) => {
    maxX = Math.max(maxX, Math.abs(p.ox));
    maxY = Math.max(maxY, Math.abs(p.oy));
    path += Math.abs(p.ox - prev.ox);
    maxDy = Math.max(maxDy, Math.abs(p.oy - prev.oy));
    prev = p;
  });
  return { maxX, maxY, path, maxDy, e, frames };
}

test.each([
  ["thinking", 0.6],
  ["talking", 0.4],
  ["question", 0.3],
  ["finished", 0.5],
  ["dizzy", 0.6],
] as const)("%s wanders, inside its box", (state, x) => {
  const { maxX } = statRun(state, 30_000);
  expect(maxX).toBeGreaterThan(0.02);
  expect(maxX).toBeLessThanOrEqual(x + 1e-9);
});

test.each(["approval", "error"] as const)("%s holds still", (state) => {
  expect(statRun(state, 15_000).maxX).toBeLessThan(0.1);
});

// Working sits at its desk, so searching is the busy one that roams.
test("searching moves much more than calm states", () => {
  expect(statRun("searching", 20_000).path).toBeGreaterThan(statRun("finished", 20_000).path * 3);
});

test.each(["talking", "question", "approval", "error"] as const)("%s comes back to the centre", (state) => {
  const { e, frames } = idleRig();
  let far = 0;
  for (let i = 0; i < 4000 && far < 0.3; i++) far = Math.abs(frames(16).ox);
  e.claim("task", state);
  // Quickly, even for a state that drifts slowly once it's there.
  expect(Math.abs(frames(1500).ox)).toBeLessThan(0.1);
});

test("other states carry on from where the character is", () => {
  const { e, frames } = idleRig();
  let at = 0;
  for (let i = 0; i < 4000 && Math.abs(at) < 0.3; i++) at = frames(16).ox;
  e.claim("task", "thinking");
  expect(Math.abs(frames(100).ox - at)).toBeLessThan(0.05);
});

test("searching hops as each dash starts; thinking doesn't", () => {
  expect(statRun("searching", 10_000).maxDy).toBeGreaterThan(0.006);
  expect(statRun("thinking", 10_000).maxDy).toBeLessThan(0.006);
});

test("searching walks between the library's shelves, browsing each with its back turned, and stays a while at each", () => {
  const { e, frames } = idleRig();
  e.claim("task", "searching");
  const scene = SCENES.library;
  // Easing into each leg cuts corners a little; never more than this into the body's margin.
  const rects = footprints(scene).map((r) => ({ x0: r.x0 + 0.2, x1: r.x1 - 0.2, z0: r.z0 + 0.2, z1: r.z1 - 0.2 }));
  let prev = frames(0);
  const stops: Pose[] = [];
  let still = 0;
  // It may start where a fixture rises; from once it's out, it stays out.
  let out = false;
  frames(60_000, (p) => {
    expect(p.scene?.id).toBe("library");
    const clear = rects.every((r) => !inside(r, { x: p.ox, z: p.oz }));
    if (out) expect(clear).toBe(true);
    out ||= clear;
    still = Math.hypot(p.ox - prev.ox, p.oz - prev.oz) < 2e-3 ? still + 16 : 0;
    // Settled for two seconds: note where, and which way it faces.
    if (still === 2000) stops.push(p);
    prev = p;
  });
  expect(stops.length).toBeGreaterThan(4);
  for (const s of stops) {
    expect(scene.spots.some((d) => Math.hypot(s.ox - d.x, s.oz - d.z) < 0.05)).toBe(true);
    expect(Math.cos(s.turn)).toBeLessThan(-0.9);
  }
  for (let i = 1; i < stops.length; i++) expect(Math.abs(stops[i].ox - stops[i - 1].ox)).toBeGreaterThan(0.5);
});

test("searching raises the library and pulls the camera back; leaving sinks it and comes back in", () => {
  const { e, run } = rig();
  e.claim("task", "searching");
  let p = run(3000);
  expect(p.scene).toEqual({ id: "library", show: 1 });
  expect(p.zoom).toBeCloseTo(SCENES.library.zoom, 2);
  e.release("task");
  p = run(200);
  expect(p.scene?.id).toBe("library");
  expect(p.scene!.show).toBeLessThan(1);
  p = run(6000);
  expect(p.scene).toBeNull();
  expect(p.zoom).toBeCloseTo(1, 2);
  expect(Math.abs(p.oz)).toBeLessThan(0.05);
  expect(Math.abs(p.ox)).toBeLessThanOrEqual(2);
});

test("a quick switch while a scene sinks ends on the newest one", () => {
  const { e, run } = rig();
  e.claim("task", "searching");
  run(1000);
  e.claim("task", "working");
  run(100);
  e.claim("task", "thinking");
  run(100);
  e.claim("task", "working");
  const p = run(2000);
  expect(p.scene).toEqual({ id: "study", show: 1 });
});

test("working, it sits on the stool behind the desk facing us and writes, never walking through the desk", () => {
  const { e, frames } = idleRig();
  e.claim("task", "working");
  const seat = SCENES.study.spots[0];
  const rects = footprints(SCENES.study).map((r) => ({ x0: r.x0 + 0.2, x1: r.x1 - 0.2, z0: r.z0 + 0.2, z1: r.z1 - 0.2 }));
  let out = false;
  let p = frames(9000, (q) => {
    // Once clear of the desk it stays out of it, until the last step slides it onto the stool.
    const clear = rects.every((r) => !inside(r, { x: q.ox, z: q.oz }));
    if (out && Math.hypot(q.ox - seat.x, q.oz - seat.z) > 1) expect(clear).toBe(true);
    out ||= clear;
  });
  expect(p.ox).toBeCloseTo(seat.x, 1);
  expect(p.oz).toBeCloseTo(seat.z, 1);
  expect(p.ground).toBeCloseTo(-seat.lift!, 1);
  expect(Math.cos(p.turn)).toBeGreaterThan(0.9);
  expect(p.item).toBe("pen");
  expect(p.scribble).toBeGreaterThan(0.9);
  e.release("task");
  p = frames(6000);
  expect(p.scribble).toBeLessThan(0.05);
});

test("asleep, it climbs into bed and sits up under the blanket; waking, it gets out", () => {
  const { e, run } = rig();
  e.claim("rest", "sleeping");
  let p = run(20_000);
  const bed = SCENES.bedroom.spots[0];
  expect(p.scene?.id).toBe("bedroom");
  expect(p.ox).toBeCloseTo(bed.x, 1);
  expect(p.oz).toBeCloseTo(bed.z, 1);
  expect(p.ground).toBeCloseTo(-bed.lift!, 1);
  // And stays there, with nowhere else to go.
  expect(run(20_000).oz).toBeCloseTo(bed.z, 1);
  e.release("rest");
  p = run(6000);
  expect(p.scene).toBeNull();
  expect(p.ground).toBe(0);
  expect(Math.abs(p.oy)).toBeLessThan(0.05);
});

test.each(["searching", "working", "idle"] as const)("%s looks where it's going while it moves", (state) => {
  const { e, frames } = idleRig();
  e.claim("task", state);
  let prev = frames(0);
  let dashing = 0;
  let leading = 0;
  frames(30_000, (p) => {
    const vx = (p.ox - prev.ox) / 0.016;
    if (Math.abs(vx) > 1) {
      dashing++;
      if (Math.sign(p.yaw) === Math.sign(vx)) leading++;
    }
    prev = p;
  });
  expect(dashing).toBeGreaterThan(20);
  expect(leading / dashing).toBeGreaterThan(0.7);
});

test("liveliness 0: no wander in any state", () => {
  expect(statRun("working", 10_000, { live: 0 }).maxX).toBe(0);
  expect(statRun("idle", 10_000, { live: 0 }).maxX).toBe(0);
});

test("liveliness 1: wider, still inside the banner", () => {
  expect(statRun("working", 30_000, { live: 1 }).maxX).toBeGreaterThan(1.2);
  const s = statRun("idle", 30_000, { live: 1 });
  expect(s.maxX).toBeLessThanOrEqual(2);
  // The hop's overshoot below rest is the only thing past the limit.
  expect(s.maxY).toBeLessThanOrEqual(0.21);
});

test("reduced motion: no wander in busy states either", () => {
  expect(statRun("working", 10_000, { reducedMotion: true }).maxX).toBe(0);
  expect(statRun("searching", 10_000, { reducedMotion: true }).maxX).toBe(0);
});

test("a new state schedules its first move from its own pace, not idle's", () => {
  const { e, frames } = idleRig();
  frames(16);
  e.claim("task", "dizzy");
  let moved = 0;
  frames(1500, (p) => (moved = Math.max(moved, Math.abs(p.ox))));
  expect(moved).toBeGreaterThan(0.05);
});

test("finished does a little jump", () => {
  const { e, run } = rig();
  run(16);
  e.claim("task", "finished");
  let top = 0;
  for (let i = 0; i < 40; i++) top = Math.min(top, run(16).oy);
  expect(top).toBeLessThan(-0.08);
  expect(top).toBeGreaterThan(-0.2);
  expect(Math.abs(run(1000).oy)).toBeLessThan(0.02);
});

test("an expression shows over a busy action without changing what it does", () => {
  const { e, run } = rig();
  e.claim("task", "working");
  run(400);
  e.express("yawn", 1200);
  const p = run(100);
  expect(p.eyeShape).toBe("tired");
  expect(p.badge).toBe("dots");
  expect(e.state).toBe("working");
});

test("dizzy shows no expressions; one pushed meanwhile is silent and never shows later", () => {
  const { e, sounds, run } = rig();
  e.claim("task", "dizzy");
  sounds.length = 0;
  expect(e.express("love", 3000)).toBeNull();
  expect(sounds).toEqual([]);
  expect(run(100).particles.some((p) => p.kind === "heart")).toBe(false);
  e.release("task");
  expect(run(100).eyeShape).toBe("pill");
});

test("sleeping only lets surprise through", () => {
  const { e, run } = rig();
  e.claim("rest", "sleeping");
  expect(e.express("annoyed", 800)).toBeNull();
  e.express("surprised", 600);
  expect(run(16).eyeShape).toBe("dot");
});

test("entering an action drops expressions it doesn't allow", () => {
  const { e, run } = rig();
  e.express("love", 3000);
  e.claim("task", "dizzy");
  expect(run(16).eyeShape).toBe("spiral");
  e.release("task");
  expect(run(16).eyeShape).toBe("pill");
});

test("finished's sparks don't fire once another action took over", () => {
  const { e, run } = rig();
  e.claim("task", "finished");
  run(200);
  e.claim("task", "thinking");
  expect(run(600).particles.some((p) => p.kind === "spark")).toBe(false);
});

test("a baseline mood shows under an action's own face", () => {
  const { e, run } = rig();
  e.setBaseline("yawn");
  e.claim("task", "thinking");
  expect(run(16).eyeShape).toBe("tired");
});

test("resuming an action after the layer above lets go replays no sound or entry gesture", () => {
  const { e, sounds, run } = rig();
  e.claim("life", "working");
  run(400);
  e.claim("interaction", "dizzy", { ms: 1000 });
  run(1500);
  sounds.length = 0;
  expect(e.state).toBe("working");
  expect(sounds).toEqual([]);
  expect(run(400).badge).toBe("dots");
});

test("a tired mood keeps tired eyes over an action, without closing them", () => {
  const { e, run } = rig();
  e.setBaseline("tired");
  e.claim("task", "working");
  expect(run(400).eyeShape).toBe("tired");
  expect(run(2000).eyeShape).toBe("tired");
  expect(run(16).badge).toBe("dots");
});

test("confused: lime, dot eyes, a question badge, no sound", () => {
  const { e, sounds, run } = rig();
  e.claim("task", "confused");
  const pose = run(500);
  expect(pose.eyeShape).toBe("dot");
  expect(pose.badge).toBe("question");
  expect(sounds).toEqual([]);
});

test("away slides the character past the banner's edge, and back when it ends", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  e.claim("link", "away");
  expect(run(3000).ox).toBeGreaterThan(3.9);
  e.release("link");
  expect(Math.abs(run(3000).ox)).toBeLessThan(0.1);
});

test("coming back from away greets: a wave and the greet sound", () => {
  const { e, sounds, run } = rig();
  e.claim("link", "away");
  run(100);
  expect(sounds).toEqual([]);
  e.release("link");
  expect(sounds).toEqual(["greet"]);
  expect(run(100).waving).toBe(true);
});

test("away shows no expressions", () => {
  const { e } = rig();
  e.claim("link", "away");
  expect(e.express("happy")).toBeNull();
});

test("away is silent and badgeless", () => {
  const { e, sounds, run } = rig();
  e.claim("link", "away");
  const pose = run(500);
  expect(pose.badge).toBeNull();
  expect(sounds).toEqual([]);
});

test("startAway begins off the stage, with no slide-out", () => {
  const { e, run } = rig();
  e.startAway();
  expect(e.state).toBe("away");
  expect(run(0).ox).toBeGreaterThanOrEqual(OFFSTAGE - 0.01);
});

test("reduced motion: away and back jump", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5, reducedMotion: true });
  e.setLiveliness(0);
  e.update();
  e.claim("link", "away");
  t += 16;
  expect(e.update().ox).toBe(OFFSTAGE);
  e.release("link");
  t += 16;
  expect(e.update().ox).toBe(0);
});

test("the pose starts with no turn and an empty hand", () => {
  const { run } = rig();
  const pose = run(0);
  expect(pose.turn).toBe(0);
  expect(pose.tip).toBe(0);
  expect(pose.reach).toBe(0);
  expect(pose.item).toBeNull();
});

test("working takes the pen from behind its back, and idle puts it away", () => {
  const { e, run } = rig();
  e.claim("task", "working");
  expect(run(100).item).toBe("pen");
  const held = run(700);
  expect(held.reach).toBeCloseTo(1, 2);
  e.release("task");
  const behind = run(250);
  expect(behind.reach).toBeLessThanOrEqual(0.45);
  const after = run(400);
  expect(after.item).toBeNull();
  expect(after.reach).toBeCloseTo(0, 2);
});

test("searching after working swaps pen for lens behind its back", () => {
  const { e, run } = rig();
  e.claim("task", "working");
  run(800);
  e.claim("task", "searching");
  expect(run(150).item).toBe("pen"); // still on its way behind
  const swapped = run(150);
  expect(swapped.item).toBe("lens");
  expect(swapped.reach).toBeLessThan(0.6);
  expect(run(700).reach).toBeCloseTo(1, 2);
});

test("a swap cut short by another change ends with the last action's item", () => {
  const { e, run } = rig();
  e.claim("task", "working");
  run(800);
  e.claim("task", "searching");
  run(100);
  e.release("task");
  const end = run(1000);
  expect(end.item).toBeNull();
  expect(end.reach).toBeCloseTo(0, 2);
});

test("dizzy over working stows the pen, and working takes it out again", () => {
  const { e, run } = rig();
  e.claim("task", "working");
  run(800);
  e.claim("interaction", "dizzy", { ms: 1000 });
  expect(run(600).item).toBeNull();
  expect(run(1200).item).toBe("pen");
});

test("approval holds the stamp", () => {
  const { e, run } = rig();
  e.claim("task", "approval");
  expect(run(800).item).toBe("stamp");
});

test("reduced motion still shows the item, without the reach", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5, reducedMotion: true });
  e.claim("task", "working");
  t += 16;
  const pose = e.update();
  expect(pose.item).toBe("pen");
  expect(pose.reach).toBe(1);
});

test("coming back from away pirouettes while it waves", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  e.claim("link", "away");
  run(100);
  e.release("link");
  const mid = run(400);
  expect(mid.turn).toBeGreaterThan(0);
  expect(mid.waving).toBe(true);
  expect(run(700).turn).toBe(0);
});

test("a jolt turns it a little and back", () => {
  const { e, run } = rig();
  e.jolt();
  expect(Math.abs(run(80).turn)).toBeGreaterThan(0.1);
  expect(run(400).turn).toBeCloseTo(0, 3);
});

test("a jolt never interrupts a turn already playing", () => {
  const { e, run } = rig();
  e.claim("task", "finished");
  run(300);
  const before = run(16).turn;
  e.jolt();
  expect(run(16).turn).toBeGreaterThan(before);
});

// Standing still (liveliness 0) so travel doesn't lean it: only a look-around turns it past 0.3.
test("idle looks over its shoulder now and then while the mouse is still", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  let turned = false;
  for (let i = 0; i < 60 && !turned; i++) turned = Math.abs(run(1000).turn) > 0.3;
  expect(turned).toBe(true);
  e.claim("task", "working");
  run(2000);
  for (let i = 0; i < 60; i++) expect(Math.abs(run(1000).turn)).toBeLessThan(0.3);
});

test("coming back to idle waits a full look interval before looking around", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  e.claim("task", "working");
  run(30000);
  e.release("task");
  for (let i = 0; i < 19; i++) expect(Math.abs(run(1000).turn)).toBeLessThan(0.3);
});

test("idle never looks around while the mouse keeps moving", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  for (let i = 0; i < 60; i++) {
    e.setLook(40, 0);
    expect(Math.abs(run(1000).turn)).toBeLessThan(0.3);
  }
});

test("the body leans into its travel", () => {
  const { e, run } = rig(seeded(3));
  e.claim("task", "thinking");
  let prev = run(0);
  let leaned = 0;
  for (let i = 0; i < 900; i++) {
    const p = run(16);
    const dx = p.ox - prev.ox;
    if (Math.abs(p.turn) > 0.15 && Math.abs(dx) > 0.002) {
      expect(Math.sign(p.turn)).toBe(Math.sign(dx));
      leaned++;
    }
    prev = p;
  }
  expect(leaned).toBeGreaterThan(0);
});

test("the body turns a little toward where it looks, less than the eyes", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  let p = run(0);
  for (let i = 0; i < 3; i++) {
    e.setLook(300, 0);
    p = run(1000);
  }
  expect(p.turn).toBeGreaterThan(0.1);
  expect(p.turn).toBeLessThan(p.yaw);
});

test("a pirouette starts from wherever the body is turned", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  for (let i = 0; i < 3; i++) {
    e.setLook(300, 0);
    run(1000);
  }
  const before = run(16).turn;
  e.claim("task", "finished");
  expect(run(16).turn).toBeGreaterThanOrEqual(before);
});

test("the body tips back to look up and forward to look down, less than the eyes", () => {
  const tipFor = (dy: number) => {
    const { e, run } = rig();
    e.setLiveliness(0);
    let p = run(0);
    for (let i = 0; i < 3; i++) {
      e.setLook(0, dy);
      p = run(1000);
    }
    return p;
  };
  const up = tipFor(-300);
  expect(up.tip).toBeLessThan(-0.05);
  expect(Math.abs(up.tip)).toBeLessThan(Math.abs(up.pitch));
  expect(tipFor(300).tip).toBeGreaterThan(0.05);
});

test("the body tips into vertical travel", () => {
  // Idle wanders up and down without hops; a level mouse keeps the gaze's share of the tip at 0.
  const { e, run } = rig(seeded(5));
  let prev = run(0);
  let agree = 0;
  let clear = 0;
  for (let i = 0; i < 3000; i++) {
    if (i % 30 === 0) e.setLook(0, 0);
    const p = run(16);
    const dy = p.oy - prev.oy;
    if (Math.abs(p.tip) > 0.03 && Math.abs(dy) > 0.001) {
      clear++;
      if (Math.sign(p.tip) === Math.sign(dy)) agree++;
    }
    prev = p;
  }
  expect(clear).toBeGreaterThan(20);
  expect(agree / clear).toBeGreaterThan(0.9); // a reversal lags the tip by a frame or two
});

test.each(["idle", "working", "thinking", "question"] as const)("in %s the body never points away from the eyes", (state) => {
  const { e, frames } = idleRig();
  e.claim("task", state);
  let checked = 0;
  let agree = 0;
  frames(30_000, (p) => {
    if (Math.abs(p.yaw) > 0.12 && Math.abs(p.turn) > 0.05) {
      checked++;
      if (Math.sign(p.turn) === Math.sign(p.yaw)) agree++;
    }
    if (Math.abs(p.pitch) > 0.1 && Math.abs(p.tip) > 0.04) {
      checked++;
      if (Math.sign(p.tip) === -Math.sign(p.pitch)) agree++;
    }
  });
  expect(checked).toBeGreaterThan(0);
  expect(agree / checked).toBeGreaterThan(0.95); // the eyes are quicker, so a turn-around lags the body a moment
});

test("the eyes hop a little while it holds a look; the body doesn't", () => {
  const { e, run } = rig();
  e.setLiveliness(0);
  const yaws: number[] = [];
  const turns: number[] = [];
  for (let i = 0; i < 40; i++) {
    e.setLook(100, 0);
    const p = run(100);
    if (i >= 15) {
      yaws.push(p.yaw);
      turns.push(p.turn);
    }
  }
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  expect(spread(yaws)).toBeGreaterThan(0.01);
  expect(spread(yaws)).toBeLessThan(0.12);
  expect(spread(turns)).toBeLessThan(0.01);
});

test("reduced motion: the eyes hold still", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, random: () => 0.5, reducedMotion: true });
  const yaws: number[] = [];
  for (let i = 0; i < 40; i++) {
    e.setLook(100, 0);
    for (let x = 0; x < 100; x += 16) {
      t += 16;
      if (i >= 15) yaws.push(e.update().yaw);
      else e.update();
    }
  }
  expect(Math.max(...yaws) - Math.min(...yaws)).toBeLessThan(0.005);
});

test.each(["reading", "coffee", "watering"] as const)("%s: use rises and falls now and then once it's at its spot", (name) => {
  const { e, frames } = idleRig();
  e.claim("life", name);
  let peaks = 0;
  let up = false;
  frames(20_000, (p) => {
    // A peak is use going over 0.9 after it had come back below 0.1.
    if (!up && p.use > 0.9) {
      peaks++;
      up = true;
    } else if (p.use < 0.1) up = false;
  });
  expect(peaks).toBeGreaterThanOrEqual(2);
});

test("a pastime still uses its item at liveliness 0, where the character doesn't walk", () => {
  const { e, frames } = idleRig();
  e.setLiveliness(0);
  e.claim("life", "coffee");
  let max = 0;
  frames(12_000, (p) => (max = Math.max(max, p.use)));
  expect(max).toBeGreaterThan(0.9);
});

test("use rests at 0 outside a pastime", () => {
  const { e, frames } = idleRig();
  e.claim("task", "working");
  let max = 0;
  frames(10_000, (p) => (max = Math.max(max, p.use)));
  expect(max).toBe(0);
});

test("with scenes off, no action brings one; switching off mid-scene sinks it and the camera comes back", () => {
  const { e, run } = rig();
  e.claim("task", "searching");
  expect(run(2000).scene?.id).toBe("library");
  e.setScenes(false);
  const p = run(4000);
  expect(p.scene).toBeNull();
  expect(p.zoom).toBeCloseTo(1, 2);
  e.claim("task", "working");
  expect(run(2000).scene).toBeNull();
  e.setScenes(true);
  expect(run(2000).scene?.id).toBe("study");
});

test("sipping coffee opens the mouth round to the mug; between sips it's closed", () => {
  const { e, frames } = idleRig();
  e.claim("life", "coffee");
  let sipped = false;
  frames(20_000, (p) => {
    if (p.use < 0.02) expect(p.mouth).toBeNull();
    if (p.use > 0.9) {
      sipped = true;
      expect(p.mouth?.viseme).toBe("O");
      expect(p.mouth!.open).toBeGreaterThan(0.9);
    }
  });
  expect(sipped).toBe(true);
});

test.each([
  ["surprised", "O"], ["yawn", "A"], ["love", "U"], ["happy", "E"], ["proud", "E"], ["wink", "E"], ["annoyed", "MBP"],
] as const)("%s shows on the mouth too (%s), and goes with the emote", (name, shape) => {
  const { e, run } = rig();
  run(100);
  e.express(name, 600);
  expect(run(100).mouth?.viseme).toBe(shape);
  expect(run(1500).mouth).toBeNull();
});

test("a feeling's mouth gives way to speech", () => {
  let t = 0;
  const e = new CharacterEngine({ now: () => t, mouth: () => ({ viseme: "A", open: 0.8 }) });
  e.express("surprised", 2000);
  for (let i = 0; i < 20; i++) {
    t += 16;
    e.update();
  }
  expect(e.update().mouth?.viseme).toBe("A");
});

test("the pose carries no things outside a routine", () => {
  const { run } = rig();
  expect(run(100).things).toEqual([]);
});

test("a pastime resumed from under a higher layer starts its routine again", () => {
  const { e, frames } = idleRig();
  // As the preview claims: no endsWhenCovered, so the claim waits underneath.
  e.claim("life", "coffee");
  frames(3000);
  const t = e.claim("interaction", "dizzy");
  frames(2000);
  e.release("interaction", t);
  let max = 0;
  frames(15_000, (p) => (max = Math.max(max, p.use)));
  expect(max).toBeGreaterThan(0.9);
});

test("a pastime cut short stops its routine: the item is never used after", () => {
  const { e, frames } = idleRig();
  const t = e.claim("life", "reading");
  frames(800);
  e.release("life", t);
  let max = 0;
  frames(12_000, (p) => (max = Math.max(max, p.use)));
  expect(max).toBe(0);
});

test("with scenes off a pastime runs no routine: no item use, no things", () => {
  const { e, frames } = idleRig();
  e.setScenes(false);
  e.claim("life", "coffee");
  let max = 0;
  const p = frames(12_000, (p) => (max = Math.max(max, p.use)));
  expect(max).toBe(0);
  expect(p.things).toEqual([]);
});

test("scenes switched off mid-pastime end its routine; switched back on, it starts again", () => {
  const { e, frames } = idleRig();
  e.claim("life", "coffee");
  frames(3000);
  e.setScenes(false);
  let max = 0;
  expect(() => frames(8000, (p) => (max = Math.max(max, p.use)))).not.toThrow();
  expect(max).toBe(0);
  e.setScenes(true);
  frames(15_000, (p) => (max = Math.max(max, p.use)));
  expect(max).toBeGreaterThan(0.9);
});
