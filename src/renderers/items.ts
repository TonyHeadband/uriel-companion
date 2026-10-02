import { mixRGB, rgba, type RGB } from "../engine/color";
import type { ItemKind } from "../engine/pose";
import { roundRect, type Ctx } from "./parts";

/** Held items as a share of R, so they read at a glance next to the body. */
export const ITEM_SIZE = 1;

interface Tones {
  ink: string;
  base: string;
  shade: string;
  light: string;
}

/** Draws an item on its grid; `use` (0–1) is how far it's in use, `time` (s) animates steam and drops. */
type Part = (x: Ctx, u: number, t: Tones, use: number, time: number) => void;

interface ItemDef {
  /** Where the hand holds it, on the item's 10-unit grid; the hand drawn over it covers this end. */
  grip: readonly [number, number];
  /** Leans the whole item about its grip, in radians. */
  lean?: number;
  /** Drawn this much smaller than ITEM_SIZE: a cup is small next to a face. */
  scale?: number;
  draw: Part;
}

function box(x: Ctx, u: number, X: number, Y: number, W: number, H: number, r: number, fill: string, ink?: string): void {
  roundRect(x, X * u, Y * u, W * u, H * u, r * u);
  x.fillStyle = fill;
  x.fill();
  if (!ink) return;
  x.strokeStyle = ink;
  x.stroke();
}

// Each item is drawn on a 10-unit grid in two tones of the accent, outlined in ink: square shapes, rounded corners.
// They lean away from the body, so nothing held ever covers the face.
const ITEMS: Record<ItemKind, ItemDef> = {
  // A magnifier: a thick rim round tinted glass with a glint, on a handle running down-left into the hand.
  lens: {
    grip: [-5, 5],
    draw(x, u, t) {
      x.save();
      x.translate(-1.2 * u, 1.2 * u);
      x.rotate(Math.PI / 4);
      box(x, u, -0.9, 0, 1.8, 6.2, 0.5, t.shade, t.ink);
      box(x, u, -1.2, 1, 2.4, 1.1, 0.3, t.light, t.ink);
      x.restore();
      box(x, u, -1.5, -5.5, 7, 7, 2, t.base, t.ink);
      box(x, u, -0.2, -4.2, 4.4, 4.4, 1.2, "rgba(10,14,24,0.55)");
      x.fillStyle = "rgba(255,255,255,0.85)";
      x.fillRect(0.6 * u, -3.4 * u, 1.1 * u, 1.1 * u);
      x.fillRect(2 * u, -3.4 * u, 0.6 * u, 0.6 * u);
      x.fillStyle = "rgba(255,255,255,0.12)";
      x.fillRect(0.6 * u, -1.9 * u, 3 * u, 0.9 * u);
    },
  },
  // A pen: cap band and clip up top, a grip section where the hand is, a square nib below.
  pen: {
    grip: [0, 1.8],
    lean: 0.5,
    draw(x, u, t) {
      box(x, u, -1.2, -5.5, 2.4, 8, 0.6, t.base, t.ink);
      box(x, u, -1.2, -5.5, 2.4, 2.4, 0.6, t.shade, t.ink);
      box(x, u, 1.2, -4.8, 0.6, 3.4, 0.3, t.light, t.ink);
      box(x, u, -1.2, 0.8, 2.4, 1.7, 0.3, t.shade, t.ink);
      x.beginPath();
      x.moveTo(-0.9 * u, 2.5 * u);
      x.lineTo(0, 5.5 * u);
      x.lineTo(0.9 * u, 2.5 * u);
      x.closePath();
      x.fillStyle = t.ink;
      x.fill();
    },
  },
  // A rubber stamp held round its neck, the knob showing above the hand: a neck, a block in the accent and an inked strip underneath.
  stamp: {
    grip: [0, -2],
    draw(x, u, t) {
      box(x, u, -0.9, -2.6, 1.8, 2.2, 0.3, t.shade, t.ink);
      box(x, u, -1.9, -5, 3.8, 2.8, 1.3, t.light, t.ink);
      box(x, u, -4, -0.6, 8, 2.8, 0.6, t.base, t.ink);
      box(x, u, -4, -0.6, 8, 0.8, 0.3, t.light);
      box(x, u, -4.4, 2.2, 8.8, 1.1, 0.3, t.ink);
    },
  },
  // An open book held at its spine; using it sweeps the right page over to the left.
  book: {
    grip: [0, 2.5],
    draw(x, u, t, use) {
      box(x, u, -5, -2.5, 10, 5, 0.6, t.shade, t.ink);
      box(x, u, -4.6, -2.9, 4.4, 5, 0.4, "#EEF1F6", t.ink);
      box(x, u, 0.2, -2.9, 4.4, 5, 0.4, "#EEF1F6", t.ink);
      x.fillStyle = "rgba(20,24,34,0.35)";
      for (const row of [-1.6, -0.6, 0.4, 1.4]) {
        x.fillRect(-4 * u, row * u, 3.2 * u, 0.35 * u);
        x.fillRect(0.8 * u, row * u, 3.2 * u, 0.35 * u);
      }
      // The turning page: its width follows cos, so it narrows to the spine and opens out on the left.
      const w = 4.4 * Math.cos(use * Math.PI);
      if (use > 0.02 && use < 0.98) box(x, u, Math.min(0, w) + 0.1, -3.1, Math.abs(w), 5, 0.4, "#FFFFFF", t.ink);
    },
  },
  // A mug held by its body, handle out to the left; steam curls up while it rests, less as it's sipped.
  mug: {
    grip: [0, 1],
    scale: 0.7,
    draw(x, u, t, use, time) {
      x.save();
      x.rotate(-0.35 * use);
      box(x, u, -5.2, -1.8, 2.4, 3.4, 1, "rgba(0,0,0,0)", t.ink);
      box(x, u, -3, -3, 6, 6.5, 1, t.base, t.ink);
      box(x, u, -3, -3, 6, 1.4, 0.6, t.light);
      x.restore();
      const steam = 1 - use;
      if (steam < 0.05) return;
      x.strokeStyle = `rgba(230,236,245,${0.5 * steam})`;
      x.lineWidth = 0.6 * u;
      for (const [i, sx] of [[0, -1.2], [1, 1.2]] as const) {
        const k = (time * 0.6 + i * 0.5) % 1;
        x.beginPath();
        x.moveTo(sx * u, -4 * u);
        x.quadraticCurveTo((sx + Math.sin(time * 3 + i) * 1.4) * u, (-6 - k * 2) * u, sx * u, (-8 - k * 3) * u);
        x.stroke();
      }
    },
  },
  // A watering can, spout to the right; using it tips it spout-down, and drops fall from the spout once it pours.
  can: {
    grip: [-2.5, -1],
    draw(x, u, t, use, time) {
      const tilt = 0.75 * use;
      x.save();
      x.rotate(tilt);
      box(x, u, -4, -2, 6, 5, 0.8, t.base, t.ink);
      box(x, u, -4.8, -3.2, 3, 1, 0.4, t.shade, t.ink);
      x.beginPath();
      x.moveTo(2 * u, 1 * u);
      x.lineTo(6 * u, -2.5 * u);
      x.lineTo(6.6 * u, -1.8 * u);
      x.lineTo(2 * u, 2.4 * u);
      x.closePath();
      x.fillStyle = t.shade;
      x.fill();
      x.stroke();
      x.restore();
      if (use < 0.6) return;
      // Where the spout's tip is once tipped. The drops fall only a short way, to the soil in the pot below it.
      const [sx, sy] = [6.3 * Math.cos(tilt) + 2.1 * Math.sin(tilt), 6.3 * Math.sin(tilt) - 2.1 * Math.cos(tilt)];
      x.fillStyle = "rgba(140,200,255,0.9)";
      for (let i = 0; i < 4; i++) {
        const k = (time * 2.2 + i / 4) % 1;
        x.fillRect((sx + 0.3 * i - 0.6) * u, (sy + k * 2.5) * u, 0.7 * u, 1 * u);
      }
    },
  },
};

// Where the hand holds an item, from its usual spot (R): a book in front and low so it never hides the eyes, the can
// up and out over whatever it waters.
const HOLD: Partial<Record<ItemKind, readonly [number, number]>> = { book: [-0.5, 0.4], can: [0.15, -0.75] };

/** How far (R) the hand holding an item has moved from rest: held where it's used, lifted to sip, or writing. */
export function handShift(item: ItemKind | null, use: number, scribble: number, t: number): readonly [number, number] {
  const [hx, hy] = (item && HOLD[item]) ?? [0, 0];
  // A sip brings the mug in to the mouth, which is level with the resting hand, so it never rises over the eyes.
  const lift: readonly [number, number] = item === "mug" ? [-0.65 * use, 0.15 * use] : [hx, hy];
  if (scribble <= 0.01) return lift;
  return [
    lift[0] + scribble * (Math.sin(t * 11) * 0.05 + Math.sin(t * 2.3) * 0.07),
    lift[1] - scribble * Math.abs(Math.sin(t * 17)) * 0.04,
  ];
}

/** A held item with its grip at (X, Y), the hand's centre; size is its height in pixels. */
export function drawItem(x: Ctx, kind: ItemKind, X: number, Y: number, size: number, ink: string, accent: RGB, use = 0, t = 0): void {
  if (size <= 0) return;
  const def = ITEMS[kind];
  const u = (size * (def.scale ?? 1)) / 10;
  x.save();
  x.translate(X, Y);
  if (def.lean) x.rotate(def.lean);
  x.translate(-def.grip[0] * u, -def.grip[1] * u);
  x.lineJoin = "round";
  x.lineWidth = 0.7 * u;
  const tones: Tones = {
    ink,
    base: rgba(accent, 1),
    shade: rgba(mixRGB(accent, [0, 0, 0], 0.4), 1),
    light: rgba(mixRGB(accent, [255, 255, 255], 0.35), 1),
  };
  def.draw(x, u, tones, use, t);
  x.restore();
}
