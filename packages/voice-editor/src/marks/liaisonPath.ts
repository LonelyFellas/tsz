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

/** 两个控制点各自从端点向上抬升；等高时对称，不等高时沿端点连线自然倾斜。 */
export function liaisonPath(
  left: LiaisonAnchorGeometry,
  right: LiaisonAnchorGeometry,
  fontSize: number,
  maxControlRise = Infinity
): string {
  const spanEm = (right.x - left.x) / fontSize;
  // 贝塞尔中点的抬升是控制点抬升的 3/4，保持原来的弧高规则。
  const rise = Math.min(
    (liaisonRiseEm(spanEm) * fontSize) / 0.75,
    Math.max(0, maxControlRise)
  );
  return [
    `M ${round(left.x)} ${round(left.tipY)}`,
    `C ${round(left.x)} ${round(left.tipY - rise)}, ${round(right.x)} ${round(right.tipY - rise)}, ${round(right.x)} ${round(right.tipY)}`
  ].join(" ");
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
