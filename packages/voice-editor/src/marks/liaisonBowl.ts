import type { LiaisonBowl } from "@tsz/types";
import type { LiaisonAnchorGeometry } from "./liaisonPath";

export type BowlTarget = keyof LiaisonBowl;
export interface BowlTip {
  x: number;
  y: number;
  delta: number;
  down: number;
  up: number;
  touchesInk: boolean;
  touching: boolean;
}
export interface BowlView {
  left: BowlTip;
  right: BowlTip;
  blocked: boolean;
}
export interface InkZone {
  left: number;
  right: number;
  maxY: number;
}
interface Anchor extends LiaisonAnchorGeometry {
  contactY?: number;
}

const CROWN = 0.64,
  SIDE = 0.58,
  MAX_SIDE = 0.78;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// Invert the quarter oval's x(t) so each ink box is tested at its real x.
function weights(u: number) {
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 20; i++) {
    const t = (lo + hi) / 2;
    if (t * t * (3 * (1 - t) * (1 - CROWN) + t) < u) lo = t;
    else hi = t;
  }
  const t = u === 0 ? 0 : u === 1 ? 1 : hi;
  return { s: 3 * (1 - t) ** 2 * t, p: t * t * (3 - 2 * t) };
}

/** Precompute the fixed ink and row limits; a slider gesture only changes the pose. */
export function prepareBowl(
  left: Anchor,
  right: Anchor,
  em: number,
  cap: number,
  zones: InkZone[],
  gap: number,
  stroke: number
) {
  const span = right.x - left.x,
    center = (left.x + right.x) / 2;
  const base = (x: number) =>
    left.tipY + ((right.tipY - left.tipY) * (x - left.x)) / span;
  const points = [left, right].map((_, side) =>
    zones.flatMap((zone) => {
      const lo = Math.max(zone.left, side ? center : left.x),
        hi = Math.min(zone.right, side ? right.x : center);
      if (hi <= lo) return [];
      const u = ((side ? right.x - hi : lo - left.x) * 2) / span;
      return [
        {
          ...weights(clamp(u, 0, 1)),
          rise: Math.max(base(lo), base(hi)) - zone.maxY
        }
      ];
    })
  );
  const bounds = [left, right].map((tip, i) => {
    const contact = Math.max(
      0,
      tip.contactY === undefined ? gap - stroke / 2 : tip.contactY - tip.tipY
    );
    let down = contact;
    for (const o of points[i]!) {
      const w = o.p + MAX_SIDE * o.s;
      if (w < 1)
        down = Math.min(down, Math.max(0, (cap * w - o.rise) / (1 - w)));
    }
    return {
      down,
      up: Math.min(em * 0.4, span * 0.45, cap * 0.5),
      touchesInk: tip.contactY !== undefined && down === contact
    };
  });
  return (bowl: LiaisonBowl): { d: string; view: BowlView } => {
    const tips = [left, right].map((point, i) => {
      const value = (i ? bowl.right_tip_pct : bowl.left_tip_pct) ?? 0;
      const range = bounds[i]!;
      const delta = (value / 100) * (value < 0 ? range.down : range.up);
      return {
        ...range,
        x: point.x,
        y: point.tipY - delta,
        delta,
        touching: value === -100 && range.touchesInk
      };
    });
    let floor =
      Math.max(0, ...tips.map((t) => t.delta)) +
      clamp(span * 0.075, em * 0.11, em * 0.36);
    for (const [side, pts] of points.entries())
      for (const o of pts) {
        const w = o.p + MAX_SIDE * o.s,
          shift = tips[side]!.delta;
        if (w > 0) floor = Math.max(floor, (o.rise - shift * (1 - w)) / w);
        else if (o.rise > shift) floor = Infinity;
      }
    const flat = Math.min(cap, floor),
      high = Math.min(cap, Math.max(flat + em * 0.34, em * 0.24 + span * 0.62)),
      room = high - flat;
    const recommended = clamp(
        em * 0.13 + span * 0.24,
        flat + room * 0.24,
        flat + room * 0.74
      ),
      amount = (bowl.curve_pct ?? 0) / 100;
    const peak =
      recommended +
      amount * (amount < 0 ? recommended - flat : high - recommended);
    const shoulders = tips.map(({ delta }, i) => {
      let height = SIDE * (flat - delta);
      for (const o of points[i]!)
        if (o.s > 0)
          height = Math.max(
            height,
            (o.rise - delta * (1 - o.p) - flat * o.p) / o.s
          );
      return (
        delta +
        Math.min(height, MAX_SIDE * (flat - delta)) +
        SIDE * (peak - flat)
      );
    });
    const round = (n: number) => Math.round(n * 100) / 100;
    const at = (x: number, rise: number) =>
      `${round(x)} ${round(base(x) - rise)}`;
    const d = `M ${at(left.x, tips[0]!.delta)} C ${at(left.x, shoulders[0]!)}, ${at(center - (CROWN * span) / 2, peak)}, ${at(center, peak)} C ${at(center + (CROWN * span) / 2, peak)}, ${at(right.x, shoulders[1]!)}, ${at(right.x, tips[1]!.delta)}`;
    return {
      d,
      view: {
        left: tips[0]!,
        right: tips[1]!,
        blocked: floor > cap + 0.01 || room < 0.35
      }
    };
  };
}

/** First contact between the round stroke cap and actual ink at the fixed x. */
export function contactOffset(
  canvas: CanvasRenderingContext2D,
  font: string,
  text: string,
  offsetX: number,
  ascent: number,
  descent: number,
  radius: number
) {
  const scale = 8,
    cx = Math.ceil((radius + 1) * scale) / scale,
    baseline = Math.ceil(ascent + 2);
  canvas.canvas.width = Math.ceil(2 * cx * scale);
  canvas.canvas.height = Math.max(
    1,
    Math.ceil((baseline + Math.max(0, descent) + 2) * scale)
  );
  canvas.scale(scale, scale);
  canvas.font = font;
  canvas.fillText(text, cx - offsetX, baseline);
  const { width, height, data } = canvas.getImageData(
    0,
    0,
    canvas.canvas.width,
    canvas.canvas.height
  );
  let contact = Infinity;
  for (let x = 0; x < width; x++) {
    const dx = (x + 0.5) / scale - cx;
    if (Math.abs(dx) > radius) continue;
    for (let y = 0; y < height; y++)
      if (data[(y * width + x) * 4 + 3]! >= 128) {
        contact = Math.min(
          contact,
          y / scale - baseline - Math.sqrt(radius * radius - dx * dx)
        );
        break;
      }
  }
  return Number.isFinite(contact) ? contact : undefined;
}
