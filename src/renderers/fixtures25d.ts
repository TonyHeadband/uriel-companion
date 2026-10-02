import { clamp } from "../engine/anim";
import { rgba } from "../engine/color";
import { FLOOR_Y, toScreen, type View } from "./layout";
import { trace, type Ctx, type Pt } from "./parts";
import type { Placed } from "../scene/types";
import { boxColor, boxesInOrder, boxFaces, meshFace, OUTLINE, type DrawFixture } from "./scenery";
import { toneOf } from "./tone";

// The light comes from the upper left, as on the body: tops lit, fronts mid, sides facing right in shade.
const TOP = 2;
const FRONT = 1;
const SIDE = { left: 0.6, right: 0 };

function face(x: Ctx, pts: Pt[], fill: string): void {
  trace(x, pts);
  x.fillStyle = fill;
  x.fill();
  x.stroke();
}

/** A soft dark patch on the floor under a fixture, a little past its footprint toward the viewer. */
function contactShadow(x: Ctx, v: View, at: Placed, fp: { w: number; d: number; z?: number }): void {
  const cz = at.z + (fp.z ?? 0);
  const floor = (fx: number, fz: number): Pt => {
    const p = toScreen(v, at.x + fx, FLOOR_Y, cz + fz);
    return [p.X, p.Y] as const;
  };
  const [hw, hd] = [fp.w / 2 + 0.15, fp.d / 2];
  trace(x, [floor(-hw, -hd), floor(hw, -hd), floor(hw, hd + 0.15), floor(-hw, hd + 0.15)]);
  x.fillStyle = "rgba(0,0,0,0.25)";
  x.fill();
}

/** Fixtures as toon-shaded boxes in the same light as the body, standing on a soft contact shadow. */
export function fixture25d(x: Ctx, v: View): DrawFixture {
  return (def, at, show) => {
    const alpha = clamp(show * 1.5, 0, 1);
    if (alpha <= 0.01) return;
    x.save();
    x.globalAlpha = alpha;
    if (def.footprint) contactShadow(x, v, at, def.footprint);
    x.lineJoin = "round";
    x.lineWidth = v.R * 0.025;
    x.strokeStyle = OUTLINE;
    for (const b of boxesInOrder(def)) {
      const f = boxFaces(v, at, b, show);
      const base = boxColor(b);
      if (b.role === "net") {
        x.save();
        x.strokeStyle = rgba(base, 0.55);
        x.lineWidth = v.R * 0.015;
        meshFace(x, f.front, 6, 10);
        meshFace(x, f.side, 6, 4);
        x.restore();
        continue;
      }
      face(x, f.side, toneOf(base, f.sideX === 1 ? SIDE.right : SIDE.left));
      face(x, f.top, toneOf(base, TOP));
      face(x, f.front, b.role === "lamp" ? rgba(base, 1) : toneOf(base, FRONT));
    }
    x.restore();
  };
}
