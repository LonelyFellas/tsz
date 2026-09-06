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

/**
 * 生成连读弧的三次贝塞尔路径。两个控制点共用同一个 Y，使曲线左右对称。
 *
 * controlY 由目标顶点反解而来：三次贝塞尔在 t=0.5 处的值是
 * (P0 + 3·P1 + 3·P2 + P3) / 8，两控制点同 Y 时即
 * apexY = (tipY0 + tipY3) / 8 + 6·controlY / 8，解出 controlY。
 */
export function liaisonPath(
  left: LiaisonAnchorGeometry,
  right: LiaisonAnchorGeometry,
  fontSize: number
): string {
  const spanEm = (right.x - left.x) / fontSize;
  const apexY = (left.tipY + right.tipY) / 2 - liaisonRiseEm(spanEm) * fontSize;
  const controlY = (apexY - 0.125 * (left.tipY + right.tipY)) / 0.75;
  return [
    `M ${round(left.x)} ${round(left.tipY)}`,
    `C ${round(left.x)} ${round(controlY)}, ${round(right.x)} ${round(controlY)}, ${round(right.x)} ${round(right.tipY)}`
  ].join(" ");
}

/** 线宽随字号走，保证不同字号下弧线的视觉粗细一致。 */
export function liaisonStrokeWidth(fontSize: number): number {
  return fontSize * 0.07;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
