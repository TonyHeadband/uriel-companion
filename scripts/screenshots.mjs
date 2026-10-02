// Renders every character × state from preview.html at a fixed time and seed, for reviewing the character by eye.
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { PREVIEW, seedRandom, withPreviewServer } from "./preview-server.mjs";

const CHARACTERS = ["grid"];
const STATES = ["idle", "thinking", "working", "searching", "question", "approval", "error", "finished", "sleeping", "dizzy"];
const T = 1200;
// Scenes take a while: the fixtures rise, the camera pulls back and the character walks to a spot (seed 1's timings).
const SCENE_SHOTS = [
  ["searching", "shelf", 3000],
  ["working", "desk", 5000],
  ["sleeping", "bed", 15000],
  ["reading", "reading", 6000],
  ["coffee", "coffee", 9700],
  ["watering", "watering", 7700],
  ["football", "football", 2600],
  ["jumprope", "rope", 2800],
];

await mkdir("docs/screenshots", { recursive: true });
await withPreviewServer(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 640 }, deviceScaleFactor: 2 });
  await page.addInitScript(seedRandom);
  try {
    for (const renderer of ["2d", "2.5d"]) {
      for (const character of CHARACTERS) {
        for (const state of STATES) {
          await page.goto(`${PREVIEW}?character=${character}&renderer=${renderer}&state=${state}&t=${T}&seed=1`);
          await page.waitForSelector("body[data-ready='1']");
          await page.locator(".stage").screenshot({ path: `docs/screenshots/${character}-${renderer}-${state}.png` });
        }
        for (const [state, name, t] of SCENE_SHOTS) {
          await page.goto(`${PREVIEW}?character=${character}&renderer=${renderer}&state=${state}&t=${t}&seed=1`);
          await page.waitForSelector("body[data-ready='1']");
          await page.locator(".stage").screenshot({ path: `docs/screenshots/${character}-${renderer}-scene-${name}.png` });
        }
        if (renderer === "2.5d") {
          for (const [name, turn] of [["front", 0], ["quarter", Math.PI / 4], ["side", Math.PI / 2], ["back", Math.PI]]) {
            await page.goto(`${PREVIEW}?character=${character}&renderer=2.5d&state=idle&t=${T}&seed=1&turn=${turn}`);
            await page.waitForSelector("body[data-ready='1']");
            await page.locator(".stage").screenshot({ path: `docs/screenshots/${character}-2.5d-turn-${name}.png` });
          }
        }
      }
    }
  } finally {
    await browser.close();
  }
});
