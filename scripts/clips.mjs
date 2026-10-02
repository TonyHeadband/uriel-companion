// Records the README's animated WebP clips and the window shot from the live preview, frame by frame on a fake clock,
// so the character's frames are the same on every run (the chat's CSS fades still run on real time). Needs ffmpeg.
import { execFileSync } from "node:child_process";
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { PREVIEW, seedRandom, withPreviewServer } from "./preview-server.mjs";

const OUT = "docs/screenshots";
// A whole number of ms per frame (about 15 fps): fractional steps drift by a millisecond between runs.
const FRAME_MS = 67;
// [debug panel button, name, skip, length] in ms: skip past the fixtures rising and the walk to the spot.
const SCENES = [
  ["football", "football", 1000, 7000],
  ["jumprope", "rope", 1500, 6000],
  ["coffee", "coffee", 7000, 6000],
  ["sleeping", "bed", 13000, 6000],
];

// The window is shorter than the app's default, so the clips aren't mostly an empty log.
async function open(browser) {
  const page = await browser.newPage({ viewport: { width: 420, height: 420 }, deviceScaleFactor: 2 });
  await page.addInitScript(seedRandom);
  // Paused, or the fake clock runs on in real time while the page loads.
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await page.goto(`${PREVIEW}?character=grid&renderer=2.5d&seed=1`);
  // No debug panel, and no focus ring on the input it refocuses after each reply.
  await page.addStyleTag({ content: ".panel.side { display: none; } .chat-input:focus-visible { outline: none; }" });
  await page.waitForSelector(".stage canvas");
  return page;
}

// Pressed once the greeting is over: its closing handsDown would otherwise drop the jump rope.
async function press(page, label) {
  await advance(page, 2000);
  await page.evaluate((l) => [...document.querySelectorAll(".panel.side button")].find((b) => b.textContent === l).click(), label);
}

// In frame-sized steps, so skipped time runs the render loop exactly as recorded time does.
async function advance(page, ms) {
  for (let t = 0; t < ms; t += FRAME_MS) await page.clock.runFor(FRAME_MS);
}

/**
 * Records a clip at 2x and encodes it at 1x, to keep the files small; `still` keeps the frame at `still.atMs` as a 2x PNG.
 * Lossless, because lossy WebP leaves blocky trails behind the moving backdrop blobs.
 */
async function record(page, selector, name, { skipMs = 0, lengthMs, still }) {
  await advance(page, skipMs);
  const dir = await mkdtemp(join(tmpdir(), "uriel-clip-"));
  try {
    const target = page.locator(selector);
    const frames = Math.round(lengthMs / FRAME_MS);
    for (let i = 0; i < frames; i++) {
      const frame = await target.screenshot();
      await writeFile(join(dir, `${String(i).padStart(4, "0")}.png`), frame);
      if (still && i === Math.round(still.atMs / FRAME_MS)) await writeFile(still.path, frame);
      await page.clock.runFor(FRAME_MS);
    }
    const out = join(OUT, `clip-${name}.webp`);
    execFileSync("ffmpeg", [
      "-y", "-loglevel", "error", "-framerate", `1000/${FRAME_MS}`, "-i", join(dir, "%04d.png"),
      "-vf", "scale=iw/2:-1:flags=lanczos",
      "-c:v", "libwebp_anim", "-loop", "0", "-lossless", "1", "-compression_level", "6", out,
    ]);
    console.log(`${out}  ${((await stat(out)).size / 1e6).toFixed(1)} MB`);
  } finally {
    await rm(dir, { recursive: true });
  }
}

await withPreviewServer(async () => {
  const browser = await chromium.launch();
  try {
    let page = await open(browser);
    await record(page, ".stage", "idle", { skipMs: 2000, lengthMs: 6000 });
    await page.close();

    for (const [button, name, skipMs, lengthMs] of SCENES) {
      page = await open(browser);
      await press(page, button);
      await record(page, ".stage", `scene-${name}`, { skipMs, lengthMs });
      await page.close();
    }

    // The debug panel's "turn" plays the scripted passport renewal through the real chat controller.
    page = await open(browser);
    await press(page, "turn");
    // The README's still of the window is the frame where it talks over its reply.
    await record(page, "#app", "turn", { lengthMs: 20000, still: { atMs: 18300, path: join(OUT, "window.png") } });
    await page.close();
  } finally {
    await browser.close();
  }
});
