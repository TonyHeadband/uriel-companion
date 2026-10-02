import type { CharacterDef } from "../characters";
import { mixRGB, rgba } from "../engine/color";
import { ACTIONS } from "../engine/actions";
import type { Pose } from "../engine/pose";
import type { EyeShape } from "../engine/states";
import type { Viseme } from "../speech/timeline";

export type Ctx = CanvasRenderingContext2D;
export type Pt = readonly [number, number];

const TAU = Math.PI * 2;
// The strongest tint any state uses; mood opacity applies in full there and proportionally below it.
const MAX_TINT = Math.max(...Object.values(ACTIONS).map((a) => a.tint));

export function trace(x: Ctx, pts: ReadonlyArray<Pt>): void {
  x.beginPath();
  pts.forEach(([px, py], i) => (i ? x.lineTo(px, py) : x.moveTo(px, py)));
  x.closePath();
}

export function roundRect(x: Ctx, X: number, Y: number, W: number, H: number, R: number): void {
  const r = Math.max(0, Math.min(R, W / 2, H / 2));
  x.beginPath();
  x.moveTo(X + r, Y);
  x.arcTo(X + W, Y, X + W, Y + H, r);
  x.arcTo(X + W, Y + H, X, Y + H, r);
  x.arcTo(X, Y + H, X, Y, r);
  x.arcTo(X, Y, X + W, Y, r);
  x.closePath();
}

/** A centred bitmap: "X" cells are filled, anything else is empty. */
function pixels(x: Ctx, rows: readonly string[], cell: number): void {
  const ox = (-rows[0].length * cell) / 2;
  const oy = (-rows.length * cell) / 2;
  x.beginPath();
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) if (row[i] === "X") x.rect(ox + i * cell, oy + j * cell, cell, cell);
  });
  x.fill();
}

const PIXEL_HEART = [".XX.XX.", "XXXXXXX", "XXXXXXX", ".XXXXX.", "..XXX..", "...X..."];
const PIXEL_STAR = ["..X..", "..X..", "XXXXX", "..X..", "..X.."];

/** A rounded square of half-size r: grid's dot. */
export function block(x: Ctx, X: number, Y: number, r: number): void {
  roundRect(x, X - r, Y - r, 2 * r, 2 * r, r * 0.3);
}

/** Straight chevron through three points, square-capped. */
function chevron(x: Ctx, w: number, y0: number, y1: number): void {
  x.lineCap = "square";
  x.lineJoin = "miter";
  x.beginPath();
  x.moveTo(-w, y0);
  x.lineTo(0, y1);
  x.lineTo(w, y0);
  x.stroke();
}

/** A point on the head sphere, or null when it has turned out of sight. Roll sends it over the top and back in from below. */
export function onHead(yaw: number, pitch: number, R: number): Pt | null {
  const p = ((((pitch + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
  if (Math.cos(yaw) * Math.cos(p) < 0.04) return null;
  return [Math.sin(yaw) * Math.cos(p) * R, -Math.sin(p) * R * 0.9];
}

// Mouth width and height as fractions of the character's mouth size, for an open amount 0–1.
const MOUTH_SIZE: Record<Viseme, (o: number) => readonly [number, number]> = {
  rest: () => [0.5, 0.12],
  MBP: () => [0.6, 0.1],
  A: (o) => [0.8, 0.15 + 0.85 * o],
  E: (o) => [1, 0.15 + 0.45 * o],
  O: (o) => [0.55, 0.25 + 0.7 * o],
  U: (o) => [0.4, 0.2 + 0.4 * o],
  FV: (o) => [0.7, 0.15 + 0.3 * o],
  C: (o) => [0.6, 0.12 + 0.4 * o],
};

/** Where the face is drawn: 2d keeps it on the head sphere, 2.5d moves it onto the slab's front. */
export interface FaceFrame {
  /** Head-sphere yaw and pitch for the features (pitch up-positive, like the gaze's). */
  yaw: number;
  pitch: number;
  /** Moves a feature from its place on the face-on head (pixels from the body centre) to where it's drawn. */
  place(px: number, py: number): Pt;
  /** Horizontal squeeze of each feature. */
  sx: number;
  alpha: number;
}

/** 2d has no body to turn: the turn and tip sweep the face over the head sphere like a gaze turn. */
export function flatFace(pose: Pose): FaceFrame {
  return { yaw: pose.yaw + pose.turn, pitch: pose.pitch - pose.tip, place: (px, py) => [px, py], sx: 1, alpha: 1 };
}

/** The character's ink, lit in the mood colour when it has a neon edge. */
export function neonInk(ch: CharacterDef, pose: Pose): string {
  return ch.neon ? rgba(mixRGB(ch.neon, pose.color, pose.tint), 1) : ch.ink;
}

/**
 * The mood rises from the bottom and fades out about two thirds of the way up, so it reads as a glow filling the body
 * rather than a painted band. The caller clips to the body.
 */
export function moodFill(x: Ctx, pts: ReadonlyArray<Pt>, R: number, pose: Pose, moodOpacity: number): void {
  if (pose.tint <= 0.01) return;
  const ys = pts.map(([, py]) => py);
  const bottom = Math.max(...ys);
  const top = bottom - (bottom - Math.min(...ys)) * 0.65;
  const fill = x.createLinearGradient(0, bottom, 0, top);
  fill.addColorStop(0, rgba(pose.color, moodOpacity * Math.min(1, pose.tint / MAX_TINT)));
  fill.addColorStop(1, rgba(pose.color, 0));
  x.fillStyle = fill;
  x.fillRect(-2 * R, -2 * R, 4 * R, 4 * R);
}

export function neonEdge(x: Ctx, pts: ReadonlyArray<Pt>, R: number, pose: Pose, ch: CharacterDef): void {
  if (!ch.neon) return;
  const neon = neonInk(ch, pose);
  trace(x, pts);
  x.lineWidth = R * 0.07;
  x.strokeStyle = neon;
  x.stroke();
}

export function blush(x: Ctx, R: number, pose: Pose, ch: CharacterDef, f: FaceFrame): void {
  const b = Math.max(pose.blush, ch.minBlush);
  if (b <= 0.01) return;
  x.fillStyle = `rgba(255,120,150,${0.5 * b * f.alpha})`;
  for (const sd of [-1, 1]) {
    const [bx, by] = f.place(sd * R * 0.62 + Math.sin(f.yaw) * R * 0.5, R * 0.22);
    const w = R * 0.34 * f.sx;
    roundRect(x, bx - w / 2, by - R * 0.04, w, R * 0.08, R * 0.02);
    x.fill();
  }
}

export function eyes(x: Ctx, R: number, pose: Pose, ch: CharacterDef, f: FaceFrame): void {
  const ink = neonInk(ch, pose);
  x.save();
  x.globalAlpha = f.alpha;
  x.fillStyle = ink;
  x.strokeStyle = ink;
  for (const sd of [-1, 1]) {
    const at = onHead(sd * ch.eye.spread + f.yaw, ch.eye.y + f.pitch + pose.roll, R);
    if (!at) continue;
    const [px, py] = f.place(at[0], at[1]);
    x.save();
    x.translate(px, py);
    x.scale(f.sx, 1);
    squareEye(x, pose.eyeShape, R * ch.eye.w * pose.eyeScale, R * ch.eye.h * pose.eyeScale, pose.eyeOpen, sd, pose.t);
    x.restore();
    x.fillStyle = ink;
    x.strokeStyle = ink;
  }
  x.restore();
}

export function mouth(x: Ctx, R: number, pose: Pose, ch: CharacterDef, f: FaceFrame): void {
  const m = pose.mouth;
  if (!m) return;
  const at = onHead(f.yaw, ch.mouth.y + f.pitch + pose.roll, R);
  if (!at) return;
  const ink = neonInk(ch, pose);
  const [fw, fh] = MOUTH_SIZE[m.viseme](Math.max(0, Math.min(1, m.open)));
  const W = R * ch.mouth.w * fw;
  const H = Math.max(R * ch.mouth.h * fh, R * 0.03);
  const [px, py] = f.place(at[0], at[1]);
  x.save();
  x.translate(px, py);
  x.scale(f.sx, 1);
  x.globalAlpha = m.alpha * f.alpha;
  x.fillStyle = ink;
  roundRect(x, -W / 2, -H / 2, W, H, Math.min(W, H) * 0.25);
  x.fill();
  if (m.viseme === "FV" && m.open > 0.2) {
    x.fillStyle = "rgba(255,255,255,0.85)";
    x.fillRect(-W * 0.3, -H / 2, W * 0.6, H * 0.3);
  }
  x.restore();
}

/** Every expression, built only from rounded squares, bars and straight strokes. */
function squareEye(x: Ctx, shape: EyeShape, w: number, h: number, open: number, sd: number, t: number): void {
  const k = w * 0.14;
  switch (shape) {
    case "wide":
    case "pill": {
      const ww = shape === "wide" ? w * 1.16 : w;
      const hh = Math.max((shape === "wide" ? h * 1.12 : h) * open, ww * 0.3);
      roundRect(x, -ww / 2, -hh / 2, ww, hh, k);
      x.fill();
      break;
    }
    case "dot":
      roundRect(x, -w * 0.4, -w * 0.4, w * 0.8, w * 0.8, k);
      x.fill();
      break;
    case "line":
      x.rotate(-sd * 0.2);
      roundRect(x, -w * 0.78, -w * 0.18, w * 1.56, w * 0.36, k * 0.5);
      x.fill();
      break;
    case "flat":
      roundRect(x, -w * 0.72, -w * 0.18, w * 1.44, w * 0.36, k * 0.5);
      x.fill();
      break;
    case "happy":
      x.lineWidth = w * 0.34;
      chevron(x, w * 0.6, h * 0.16, -h * 0.2);
      break;
    case "closed":
      x.lineWidth = w * 0.28;
      chevron(x, w * 0.65, -h * 0.02, h * 0.14);
      break;
    case "spiral": {
      // A square spiral: each leg a quarter turn on from the last and a little longer.
      x.rotate(t * 9 * sd);
      x.lineWidth = w * 0.16;
      x.lineCap = "square";
      x.lineJoin = "miter";
      x.beginPath();
      let px = 0;
      let py = 0;
      x.moveTo(px, py);
      for (let i = 0; i < 8; i++) {
        const len = w * 0.13 * (i + 1);
        const dir = i % 4;
        px += dir === 0 ? len : dir === 2 ? -len : 0;
        py += dir === 1 ? len : dir === 3 ? -len : 0;
        x.lineTo(px, py);
      }
      x.stroke();
      break;
    }
    case "heart":
      x.fillStyle = "#FF4D6D";
      pixels(x, PIXEL_HEART, (w * 1.9) / PIXEL_HEART[0].length);
      break;
    case "star":
      x.fillStyle = "#F7B32B";
      x.rotate(t * 1.5 * sd);
      pixels(x, PIXEL_STAR, (w * 1.6) / PIXEL_STAR[0].length);
      break;
    case "tired":
      roundRect(x, -w / 2, -h * 0.02, w, h * 0.38, k);
      x.fill();
      roundRect(x, -w * 0.62, -h * 0.1, w * 1.24, w * 0.2, k * 0.5);
      x.fill();
      break;
    case "wink":
      if (sd < 0) {
        roundRect(x, -w / 2, -h / 2, w, h, k);
        x.fill();
      } else {
        x.lineWidth = w * 0.34;
        chevron(x, w * 0.6, h * 0.16, -h * 0.2);
      }
      break;
  }
}

/** One hand: a body-coloured block with the neon edge. r is its half-size; R sets the edge width. */
export function hand(x: Ctx, X: number, Y: number, r: number, R: number, pose: Pose, ch: CharacterDef): void {
  x.fillStyle = rgba(ch.base[0], 1);
  block(x, X, Y, r);
  x.fill();
  if (!ch.neon) return;
  x.strokeStyle = neonInk(ch, pose);
  x.lineWidth = R * 0.05;
  x.stroke();
}

export function badge(x: Ctx, cx: number, cy: number, R: number, pose: Pose): void {
  x.save();
  x.translate(cx - R * 0.8 * pose.sx, cy - R * 0.72 * pose.sy);
  x.scale(pose.badgeScale, pose.badgeScale);
  const col = rgba(pose.badgeColor, 1);
  if (pose.badge === "dots") {
    const w = R * 0.74;
    const h = R * 0.42;
    x.fillStyle = "#000";
    roundRect(x, -w / 2 - R * 0.07, -h / 2 - R * 0.07, w + R * 0.14, h + R * 0.14, (h + R * 0.14) * 0.25);
    x.fill();
    x.fillStyle = col;
    roundRect(x, -w / 2, -h / 2, w, h, h * 0.25);
    x.fill();
    for (let i = 0; i < 3; i++) {
      const ph = (((pose.t * 2.4 - i * 0.22) % 1) + 1) % 1;
      const r = R * 0.06 * (1 + 0.4 * Math.max(0, Math.sin(ph * TAU)));
      x.fillStyle = "rgba(255,255,255,0.95)";
      block(x, (i - 1) * R * 0.19, 0, r);
      x.fill();
    }
  } else if (pose.badge === "bang" || pose.badge === "question") {
    x.fillStyle = "#000";
    block(x, 0, 0, R * 0.3);
    x.fill();
    x.fillStyle = col;
    block(x, 0, 0, R * 0.23);
    x.fill();
    x.fillStyle = "#fff";
    x.font = `800 ${R * 0.32}px system-ui, sans-serif`;
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillText(pose.badge === "bang" ? "!" : "?", 0, R * 0.02);
  } else {
    x.fillStyle = "#000";
    block(x, 0, 0, R * 0.2);
    x.fill();
    x.fillStyle = col;
    block(x, 0, 0, R * 0.135);
    x.fill();
  }
  x.restore();
}

export function particles(x: Ctx, cx: number, cy: number, R: number, pose: Pose): void {
  for (const p of pose.particles) {
    if (p.age < 0) continue;
    const k = p.age / p.life;
    const alpha = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
    const size = R * p.size * (1 + k * 0.4);
    x.save();
    x.translate(cx + (p.x + p.vx * p.age) * R * 1.3, cy + (p.y + p.vy * p.age) * R * 1.3);
    x.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (p.kind === "heart") {
      x.fillStyle = "#FF4D6D";
      pixels(x, PIXEL_HEART, (size * 2) / PIXEL_HEART[0].length);
    } else if (p.kind === "star") {
      x.fillStyle = "#F7B32B";
      x.rotate(p.rot + p.age * 2);
      pixels(x, PIXEL_STAR, (size * 2) / PIXEL_STAR[0].length);
    } else if (p.kind === "spark") {
      x.fillStyle = "#fff";
      x.rotate(p.rot);
      pixels(x, PIXEL_STAR, (size * 1.6) / PIXEL_STAR[0].length);
    } else {
      x.fillStyle = "rgb(210,220,235)";
      x.font = `700 ${size * 1.9}px system-ui, sans-serif`;
      x.fillText("z", 0, 0);
    }
    x.restore();
  }
}
