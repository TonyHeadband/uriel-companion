export type Prop =
  | "yaw" | "pitch" | "roll" | "tilt" | "open" | "sx" | "sy" | "ox" | "oy" | "tint" | "blush" | "es" | "badgeS" | "hands" | "mouth" | "talk" | "wx" | "wy" | "wz" | "ax" | "turn" | "tip" | "reach" | "zoom" | "show" | "scribble" | "use";

export const REST: Record<Prop, number> = {
  yaw: 0, pitch: 0, roll: 0, tilt: 0, open: 1, sx: 1, sy: 1, ox: 0, oy: 0, tint: 0, blush: 0, es: 1, badgeS: 0, hands: 0, mouth: 0, talk: 0, wx: 0, wy: 0, wz: 0, ax: 0, turn: 0, tip: 0, reach: 0, zoom: 1, show: 0, scribble: 0, use: 0,
};
export const PROPS = Object.keys(REST) as Prop[];
