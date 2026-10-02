import { clamp } from "../engine/anim";
import { rgba } from "../engine/color";
import type { View } from "./layout";
import { trace, type Ctx } from "./parts";
import { boxColor, boxesInOrder, boxFaces, meshFace, OUTLINE, type DrawFixture } from "./scenery";

/** Fixtures as flat fronts: no tops or sides, no shading, but the same place and depth as in 2.5d. */
export function fixture2d(x: Ctx, v: View): DrawFixture {
  return (def, at, show) => {
    const alpha = clamp(show * 1.5, 0, 1);
    if (alpha <= 0.01) return;
    x.save();
    x.globalAlpha = alpha;
    x.lineJoin = "round";
    x.lineWidth = v.R * 0.025;
    x.strokeStyle = OUTLINE;
    for (const b of boxesInOrder(def)) {
      if (b.role === "net") {
        x.save();
        x.strokeStyle = rgba(boxColor(b), 0.55);
        x.lineWidth = v.R * 0.015;
        meshFace(x, boxFaces(v, at, b, show).front, 6, 10);
        x.restore();
        continue;
      }
      trace(x, boxFaces(v, at, b, show).front);
      x.fillStyle = rgba(boxColor(b), 1);
      x.fill();
      x.stroke();
    }
    x.restore();
  };
}
