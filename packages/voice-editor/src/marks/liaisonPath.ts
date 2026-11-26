import type { LiaisonAdjustment } from "../core/liaison";

/** 连读弧的一个端点：x 取选区中心，tipY 是字形顶端稍上的位置。 */
export interface LiaisonAnchorGeometry {
  x: number;
  tipY: number;
}

/**
 * 连读弧的抬升高度（单位 em）。
 *
 * 短跨度按跨度线性抬升，保证相邻字母之间也有一道看得出的弧；跨度超过 1.5em
 * 后改走平方根曲线并封顶 1em——否则跨半句话的连线会拱成一个夸张的半圆。
 * 系数沿用参考实现，勿随手改动：它决定了长短连线摆在一起时的观感一致性。
 */
export function liaisonRiseEm(spanEm: number): number {
  const local = Math.max(0.18, spanEm * 0.3225);
  if (spanEm <= 1.5) return local;
  return Math.min(1, 0.484 + 0.16 * Math.sqrt(spanEm - 1.5));
}

/** 两端和弧顶固定，仅上下移动各半弧靠近端点的控制点。 */
export function liaisonPath(
  left: LiaisonAnchorGeometry,
  right: LiaisonAnchorGeometry,
  fontSize: number,
  maxControlRise: number,
  clearancePoints: { x: number; maxY: number }[],
  { left_offset_pct = 0, right_offset_pct = 0 }: LiaisonAdjustment = {}
): string {
  const span = right.x - left.x;
  const baseline = (fraction: number) =>
    left.tipY + fraction * (right.tipY - left.tipY);
  const obstacles = clearancePoints.map(({ x, maxY }) => {
    const fraction = (x - left.x) / span;
    // 反解 x(t) = 3t² - 2t³，按实际字形所在位置计算留白。
    const t = 0.5 - Math.sin(Math.asin(1 - 2 * fraction) / 3);
    return { t, requiredRise: baseline(fraction) - maxY };
  });
  let rise = (liaisonRiseEm(span / fontSize) * fontSize) / 0.75;
  for (const { t, requiredRise } of obstacles) {
    rise = Math.max(rise, requiredRise / (3 * t * (1 - t)));
  }
  rise = Math.min(rise, fontSize / 0.75, Math.max(0, maxControlRise));
  const start = `M ${round(left.x)} ${round(left.tipY)}`;
  const end = `${round(right.x)} ${round(right.tipY)}`;
  if (!left_offset_pct && !right_offset_pct) {
    return `${start} C ${round(left.x)} ${round(left.tipY - rise)}, ${round(right.x)} ${round(right.tipY - rise)}, ${end}`;
  }

  const controlRise = (offset: number, side: "left" | "right") => {
    const automatic = rise / 2;
    if (offset >= 0) return automatic + (rise / 4) * (offset / 100);
    let lowerRoom = automatic;
    for (const { t, requiredRise } of obstacles) {
      // 两段各以端点为 0、弧顶为 1。只限制下调，不牵动另一半。
      const u = 2 * (side === "left" ? t : 1 - t);
      if (u <= 0 || u >= 1) continue;
      const weight = 3 * u * (1 - u) ** 2;
      const spare = 3 * t * (1 - t) * rise - requiredRise;
      lowerRoom = Math.min(lowerRoom, Math.max(0, spare / weight));
    }
    return automatic + lowerRoom * (offset / 100);
  };
  const point = (x: number, height: number) =>
    `${round(left.x + x * span)} ${round(baseline(x) - height)}`;
  const apexRise = rise * 0.75;
  return `${start} C ${point(0, controlRise(left_offset_pct, "left"))}, ${point(0.25, apexRise)}, ${point(0.5, apexRise)} C ${point(0.75, apexRise)}, ${point(1, controlRise(right_offset_pct, "right"))}, ${end}`;
}

/**
 * 跨行：将同一条对称三次贝塞尔弧在 t=0.5 精确二分。
 * 左半弧从上一行字母升到弧顶，右半弧从下一行弧顶落到字母。
 * 不用两条独立的完整弧，避免行末变大拱、行首退化成小钩。
 */
export function liaisonHalfPaths(
  left: LiaisonAnchorGeometry,
  right: LiaisonAnchorGeometry,
  fontSize: number,
  halfSpan: number,
  maxRise = Infinity
): { head: string; tail: string } {
  const controlRise = Math.min(
    (liaisonRiseEm((halfSpan * 2) / fontSize) * fontSize) / 0.75,
    Math.max(0, maxRise) / 0.75
  );
  const rise = controlRise * 0.75;
  return {
    head: `M ${round(left.x)} ${round(left.tipY)} C ${round(left.x)} ${round(left.tipY - controlRise / 2)}, ${round(left.x + halfSpan / 2)} ${round(left.tipY - rise)}, ${round(left.x + halfSpan)} ${round(left.tipY - rise)}`,
    tail: `M ${round(right.x - halfSpan)} ${round(right.tipY - rise)} C ${round(right.x - halfSpan / 2)} ${round(right.tipY - rise)}, ${round(right.x)} ${round(right.tipY - controlRise / 2)}, ${round(right.x)} ${round(right.tipY)}`
  };
}

/** 线宽随字号走，保证不同字号下弧线的视觉粗细一致。 */
export function liaisonStrokeWidth(fontSize: number): number {
  return fontSize * 0.07;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
