import type { CharacterDef } from "../characters";
import { clamp } from "../engine/anim";
import { rgba } from "../engine/color";
import type { Pose } from "../engine/pose";
import { drawItem, handShift, ITEM_SIZE } from "./items";
import { fixture2d } from "./fixtures2d";
import { bodyFrame, viewOf } from "./layout";
import { badge, blush, eyes, flatFace, hand, moodFill, mouth, neonEdge, neonInk, particles, trace, type Ctx, type Pt } from "./parts";
import type { Renderer } from "./renderer";
import { floorShadow, paintInDepth } from "./scenery";
import { drawBall, drawRope, rope, ropeAlpha } from "./things";

/** 2d has no behind: the right hand shrinks away on its way back, and grows in front holding the item. */
export function flatReach(reach: number): { side: number; front: number } {
  return { side: 1 - clamp((reach - 0.2) / 0.2, 0, 1), front: clamp((reach - 0.6) / 0.4, 0, 1) };
}

// A hint of turning: the body narrows a little side-on.
const narrowing = (turn: number) => 0.85 + 0.15 * Math.abs(Math.cos(turn));

/** Flat fills: no gradients on the body, mood as a glow from below. */
export class Flat2D implements Renderer {
  readonly id = "2d" as const;
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
    return ch.outline(1, pose);
  }

  draw(pose: Pose, ch: CharacterDef): void {
    const x = this.ctx;
    if (!x) return;
    x.clearRect(0, 0, this.w, this.h);
    const view = viewOf(this.w, this.h, pose.zoom);
    paintInDepth(
      pose,
      fixture2d(x, view),
      () => {
        floorShadow(x, view, pose);
        this.character(x, pose, ch);
      },
      (t) => drawBall(x, view, t, false),
    );
  }

  private character(x: Ctx, pose: Pose, ch: CharacterDef): void {
    const { cx, cy, R } = bodyFrame(this.w, this.h, pose);
    const held = pose.things.find((t) => t.held && t.kind === "rope");
    const line = held && rope(held.phase);
    const ropeOnScreen = line && line.pts.map(([px, py]): Pt => [cx + px * R * pose.sx * narrowing(pose.turn), cy + py * R] as const);
    if (line?.behind) drawRope(x, ropeOnScreen!, R, neonInk(ch, pose), ropeAlpha(held!, pose.hands));

    x.save();
    x.translate(cx, cy);
    x.rotate(pose.tilt);
    x.scale(pose.sx * narrowing(pose.turn), pose.sy);
    const pts = pose.body ? pose.body.outline.map(([px, py]) => [px * R, py * R] as const) : ch.outline(R, pose);
    trace(x, pts);
    x.fillStyle = rgba(ch.base[0], 1);
    x.fill();

    x.save();
    trace(x, pts);
    x.clip();
    moodFill(x, pts, R, pose, this.moodOpacity);
    // The face rides the soft body's wobble instead of floating over it.
    x.save();
    if (pose.body) x.translate(pose.body.face[0] * R, pose.body.face[1] * R);
    const f = flatFace(pose);
    blush(x, R, pose, ch, f);
    eyes(x, R, pose, ch, f);
    mouth(x, R, pose, ch, f);
    x.restore();
    x.restore();
    neonEdge(x, pts, R, pose, ch);
    x.restore();

    if (line && !line.behind) drawRope(x, ropeOnScreen!, R, neonInk(ch, pose), ropeAlpha(held!, pose.hands));
    this.hands(x, cx, cy, R, pose, ch);
    if (pose.badge && pose.badgeScale > 0.01) badge(x, cx, cy, R, pose);
    particles(x, cx, cy, R, pose);
  }

  private hands(x: Ctx, cx: number, cy: number, R: number, pose: Pose, ch: CharacterDef): void {
    const { side, front } = flatReach(pose.reach);
    const sx = pose.sx * narrowing(pose.turn);
    for (const sd of [-1, 1]) {
      const shown = sd === 1 ? pose.hands * side : pose.hands;
      if (shown <= 0.01) continue;
      let hx = cx + sd * R * 1.15 * sx;
      let hy = cy + R * 0.42;
      if (sd === 1 && pose.waving) {
        hy -= R * 0.38 + Math.sin(pose.t * 13) * R * 0.16;
        hx += Math.cos(pose.t * 13) * R * 0.06;
      }
      hand(x, hx, hy, R * 0.2 * shown, R, pose, ch);
    }
    if (front <= 0) return;
    const [dx, dy] = handShift(pose.item, pose.use, pose.scribble, pose.t);
    const hx = cx + R * (0.95 * sx + dx);
    const hy = cy + R * (0.4 + dy);
    if (pose.item) drawItem(x, pose.item, hx, hy, R * ITEM_SIZE * front, neonInk(ch, pose), pose.color, pose.use, pose.t);
    hand(x, hx, hy, R * 0.2 * front, R, pose, ch);
  }
}
