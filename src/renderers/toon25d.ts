import type { CharacterDef } from "../characters";
import { clamp } from "../engine/anim";
import type { Pose } from "../engine/pose";
import { drawItem, handShift, ITEM_SIZE } from "./items";
import { fixture25d } from "./fixtures25d";
import { bodyFrame, viewOf } from "./layout";
import {
  badge, blush, eyes, hand, moodFill, mouth, neonEdge, neonInk, particles, roundRect, trace,
  type Ctx, type FaceFrame, type Pt,
} from "./parts";
import type { Renderer } from "./renderer";
import { floorShadow, paintInDepth } from "./scenery";
import { drawBall, drawRope, rope, ropeAlpha } from "./things";
import { toneOf } from "./tone";
import { bandLevel, capNormal, FACE_MIN, faceNormal, faceX, faceY, project, reachPoint, sideNormal, silhouette } from "./slab";

// The highlight strip's alpha per band level: none in shade, 0.05 mid, 0.1 lit.
const HIGHLIGHT = 0.05;
const BACK_DOTS = [-0.35, 0, 0.35];
// The face fades in over this much cos(turn) above FACE_MIN.
const FADE = 0.2;
// Dead-on the slab reads as a flat card: it always stands about 5° toward the light, showing a sliver of shaded side.
const REST_TURN = -0.087;

const atRest = (pose: Pose): Pose => ({ ...pose, turn: pose.turn + REST_TURN });

interface HandAt {
  x: number;
  y: number;
  z: number;
  size: number;
  right: boolean;
}

/** A rounded slab that turns: toon bands from a fixed light, a face on the front, a panel on the back. */
export class Toon25D implements Renderer {
  readonly id = "2.5d" as const;
  moodOpacity = 1;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: Ctx | null = null;
  private w = 0;
  private h = 0;

  mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    if (!this.canvas) return;
    this.w = this.canvas.width = Math.round(cssWidth * dpr);
    this.h = this.canvas.height = Math.round(cssHeight * dpr);
  }

  dispose(): void {
    this.ctx = null;
    this.canvas = null;
  }

  restOutline(ch: CharacterDef, pose: Pose): Array<readonly [number, number]> {
    return this.outlineAt(ch, atRest(pose));
  }

  private outlineAt(ch: CharacterDef, shown: Pose): Array<readonly [number, number]> {
    return silhouette(ch.outline(1, shown), shown.turn, ch.depth ?? 0, shown.tip);
  }

  draw(raw: Pose, ch: CharacterDef): void {
    const x = this.ctx;
    if (!x) return;
    const pose = atRest(raw);
    x.clearRect(0, 0, this.w, this.h);
    const view = viewOf(this.w, this.h, pose.zoom);
    paintInDepth(
      pose,
      fixture25d(x, view),
      () => {
        floorShadow(x, view, pose);
        this.character(x, pose, ch);
      },
      (t) => drawBall(x, view, t, true),
    );
  }

  private character(x: Ctx, pose: Pose, ch: CharacterDef): void {
    const { cx, cy, R } = bodyFrame(this.w, this.h, pose);
    const D = (ch.depth ?? 0) * R;
    const c = Math.cos(pose.turn);
    const s: 1 | -1 = c >= 0 ? 1 : -1;
    const hands = this.handsAt(pose);
    const held = pose.things.find((t) => t.held && t.kind === "rope");
    const line = held && rope(held.phase);
    const ropeOnScreen = line && line.pts.map(([px, py, pz]): Pt => {
      const p = project(px, py, pz, pose.turn, pose.tip);
      return [cx + p.x * R * pose.sx, cy + p.y * R] as const;
    });
    if (line?.behind) drawRope(x, ropeOnScreen!, R, neonInk(ch, pose), ropeAlpha(held!, pose.hands));
    for (const hd of hands) if (hd.z < 0) this.hand(x, cx, cy, R, pose, ch, hd);

    x.save();
    x.translate(cx, cy);
    x.rotate(pose.tilt);
    x.scale(pose.sx, pose.sy);
    const rest = this.outlineAt(ch, pose);
    const body = pose.body?.outline;
    const sil: Pt[] = (body ?? rest).map(([px, py]) => [px * R, py * R] as const);
    // Each face point takes its matching outline point's soft-body offset, so the face never pulls away from the wall.
    const face: Pt[] = ch.outline(1, pose).map(([px, py], i) => {
      const dx = body ? body[i][0] - rest[i][0] : 0;
      const dy = body ? body[i][1] - rest[i][1] : 0;
      return [faceX(s * px * R, pose.turn, D, s) + dx * R, faceY(py * R, pose.turn, pose.tip, D, s) + dy * R] as const;
    });
    const faceLevel = bandLevel(faceNormal(pose.turn, s, pose.tip));
    // The silhouette is the side wall; the big face covers all of it but the visible side.
    trace(x, sil);
    x.fillStyle = toneOf(ch.base[0], bandLevel(sideNormal(pose.turn, pose.tip)));
    x.fill();

    x.save();
    trace(x, sil);
    x.clip();
    // Tipped, the top or bottom wall shows above or below the face: the face's outline slid back to where the far
    // face is, then covered by the face itself.
    const capShift = -D * Math.abs(c) * Math.sin(pose.tip);
    if (Math.abs(capShift) > 0.5) {
      trace(x, face.map(([px, py]) => [px, py + capShift] as const));
      x.fillStyle = toneOf(ch.base[0], bandLevel(capNormal(pose.tip)));
      x.fill();
    }
    trace(x, face);
    x.fillStyle = toneOf(ch.base[0], faceLevel);
    x.fill();
    if (Math.abs(c) > FACE_MIN && faceLevel > 0) {
      const top = Math.min(...face.map(([, py]) => py));
      x.save();
      trace(x, face);
      x.clip();
      x.fillStyle = `rgba(255,255,255,${HIGHLIGHT * faceLevel})`;
      x.fillRect(-2 * R, top, 4 * R, R * 0.12);
      x.restore();
    }
    moodFill(x, sil, R, pose, this.moodOpacity);
    x.save();
    if (pose.body) x.translate(pose.body.face[0] * R, pose.body.face[1] * R);
    if (c > FACE_MIN) this.face(x, R, D, pose, ch);
    else if (c < -FACE_MIN) this.backPanel(x, R, D, pose, ch);
    x.restore();
    x.restore();
    neonEdge(x, sil, R, pose, ch);
    x.restore();

    if (line && !line.behind) drawRope(x, ropeOnScreen!, R, neonInk(ch, pose), ropeAlpha(held!, pose.hands));
    for (const hd of hands) if (hd.z >= 0) this.hand(x, cx, cy, R, pose, ch, hd);
    if (pose.badge && pose.badgeScale > 0.01) badge(x, cx, cy, R, pose);
    particles(x, cx, cy, R, pose);
  }

  private face(x: Ctx, R: number, D: number, pose: Pose, ch: CharacterDef): void {
    const c = Math.cos(pose.turn);
    const f: FaceFrame = {
      yaw: pose.yaw,
      pitch: pose.pitch,
      place: (px, py) => [faceX(px, pose.turn, D), faceY(py, pose.turn, pose.tip, D)],
      sx: c,
      alpha: clamp((c - FACE_MIN) / FADE, 0, 1),
    };
    blush(x, R, pose, ch, f);
    eyes(x, R, pose, ch, f);
    mouth(x, R, pose, ch, f);
  }

  /** A grid of dots on the back, so from behind it reads as its back, not a blank. */
  private backPanel(x: Ctx, R: number, D: number, pose: Pose, ch: CharacterDef): void {
    const c = Math.cos(pose.turn);
    const size = R * 0.14;
    const w = size * Math.abs(c);
    x.save();
    x.globalAlpha = 0.35 * clamp((-c - FACE_MIN) / FADE, 0, 1);
    x.fillStyle = ch.ink;
    for (const gy of BACK_DOTS) {
      for (const gx of BACK_DOTS) {
        const X = faceX(gx * R, pose.turn, D, -1);
        const Y = faceY(gy * R, pose.turn, pose.tip, D, -1);
        roundRect(x, X - w / 2, Y - size / 2, w, size, size * 0.25);
        x.fill();
      }
    }
    x.restore();
  }

  private handsAt(pose: Pose): HandAt[] {
    const [rx, ry, rz] = reachPoint(pose.reach);
    return [
      { ...project(-1.15, 0.42, 0, pose.turn, pose.tip), size: pose.hands, right: false },
      { ...project(rx, ry, rz, pose.turn, pose.tip), size: Math.max(pose.hands, Math.min(1, pose.reach / 0.4)), right: true },
    ];
  }

  private hand(x: Ctx, cx: number, cy: number, R: number, pose: Pose, ch: CharacterDef, h: HandAt): void {
    const holds = h.right && pose.item !== null && pose.reach > 0.4;
    if (h.size <= 0.01 && !holds) return;
    // A hint of perspective: nearer is a little bigger.
    const persp = 1 + 0.15 * h.z;
    let X = cx + h.x * R * pose.sx;
    let Y = cy + h.y * R;
    if (h.right && pose.waving && pose.reach < 0.05) {
      Y -= R * 0.38 + Math.sin(pose.t * 13) * R * 0.16;
      X += Math.cos(pose.t * 13) * R * 0.06;
    }
    if (holds) {
      const [dx, dy] = handShift(pose.item, pose.use, pose.scribble, pose.t);
      X += dx * R;
      Y += dy * R;
      drawItem(x, pose.item!, X, Y, R * ITEM_SIZE * persp, neonInk(ch, pose), pose.color, pose.use, pose.t);
    }
    if (h.size > 0.01) hand(x, X, Y, R * 0.2 * h.size * persp, R, pose, ch);
  }
}
