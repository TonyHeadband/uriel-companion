// Shared by the screenshot and clip scripts: serves preview.html with vite, and seeds the page's Math.random.
import { spawn } from "node:child_process";

export const PREVIEW = "http://localhost:1421/preview.html";

// Math.random seeds the pastime scheduler, the backdrop blobs and the voice; the engine itself takes ?seed=.
export const seedRandom = () => {
  let a = 1;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export async function withPreviewServer(run) {
  const server = spawn("npx", ["vite", "--port", "1421", "--strictPort"], { stdio: "ignore" });
  try {
    for (let tries = 0; ; tries++) {
      try {
        if ((await fetch(PREVIEW)).ok) break;
      } catch {}
      if (tries > 100) throw new Error("vite didn't start on port 1421");
      await new Promise((r) => setTimeout(r, 100));
    }
    return await run();
  } finally {
    server.kill();
  }
}
