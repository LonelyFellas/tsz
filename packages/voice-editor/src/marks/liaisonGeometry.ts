import { liaisonPath, liaisonStrokeWidth } from "./liaisonPath";
import type { LiaisonAnchorGeometry } from "./liaisonPath";

/** 能量出位置的东西：元素，或只含文本内容的 Range（不带伪元素）。 */
export interface RectSource {
  getBoundingClientRect(): DOMRect;
}

/** 一个锚点落在屏幕上的位置：首尾两个字母，以及锚点文字（量字形高度用）。 */
export interface LiaisonAnchorElements {
  first: RectSource;
  last: RectSource;
  text: string;
}

export interface LiaisonLinkElements {
  start: LiaisonAnchorElements;
  end: LiaisonAnchorElements;
}

export interface LiaisonArc {
  /** 跨行的连读会拆成两截，故 key 与 index 分开：两截指向同一条连读。 */
  key: string;
  index: number;
  d: string;
}

export interface LiaisonLayout {
  arcs: LiaisonArc[];
  strokeWidth: number;
}

/**
 * 一段文字的字形高度（px）：
 * - fontAscent：字体上伸高度，即行内盒内容区顶到基线的距离；
 * - inkAscent：这段文字实际墨迹的最高点到基线的距离。
 */
export interface GlyphMetrics {
  fontAscent: number;
  inkAscent: number;
}

export type GlyphMeasurer = (text: string) => GlyphMetrics | undefined;

/** 端点比墨迹顶端再抬高一点，弧线不压在字上；沿用参考实现的 0.06em。 */
const TIP_GAP_EM = 0.06;

/** 两端内容盒顶端相差不到半个字号就算同一行：粗体等变体的上伸高度会差个把像素。 */
const SAME_LINE_TOLERANCE_EM = 0.5;

export const EMPTY_LIAISON_LAYOUT: LiaisonLayout = { arcs: [], strokeWidth: 0 };

/**
 * 用 canvas 量出容器字体下一段文字的字形高度。
 *
 * 拿不到 canvas（jsdom）或浏览器不给 actualBoundingBoxAscent 时返回 undefined，
 * 调用方退回按字盒顶端起笔——弧线会飘高一截，但不至于画不出来。
 */
export function createGlyphMeasurer(container: Element): GlyphMeasurer {
  // canvas 与字体样式都到第一次真要量字形时才建：多数句子没有连读，白建是浪费。
  let context: CanvasRenderingContext2D | null | undefined;
  const acquire = () => {
    if (context !== undefined) return context;
    context =
      "CanvasRenderingContext2D" in globalThis
        ? document.createElement("canvas").getContext("2d")
        : null;
    if (context) {
      const style = getComputedStyle(container);
      context.font = [
        style.fontStyle,
        style.fontWeight,
        style.fontSize,
        style.fontFamily
      ].join(" ");
    }
    return context;
  };
  return (text) => {
    const ready = acquire();
    if (!ready) return undefined;
    const metrics = ready.measureText(text);
    const { fontBoundingBoxAscent, actualBoundingBoxAscent } = metrics;
    if (
      !Number.isFinite(fontBoundingBoxAscent) ||
      !Number.isFinite(actualBoundingBoxAscent)
    ) {
      return undefined;
    }
    return {
      fontAscent: fontBoundingBoxAscent,
      inkAscent: actualBoundingBoxAscent
    };
  };
}

export interface AnchorBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * 锚点盒 → 弧线端点。
 *
 * 落点取选区中心；起笔高度不取字盒顶端而取**墨迹顶端**：字盒顶端是字体上伸
 * 高度，比 x 高度字母（w、o、u）的墨迹高出半个字号，弧线会整体飘在字上方。
 * 按墨迹起笔，弧线两端才贴着字，与参考件一致。
 */
export function anchorTip(
  box: AnchorBox,
  fontSize: number,
  metrics: GlyphMetrics | undefined
): LiaisonAnchorGeometry {
  const x = (box.left + box.right) / 2;
  if (!metrics) return { x, tipY: box.top };
  return {
    x,
    tipY:
      box.top + metrics.fontAscent - metrics.inkAscent - TIP_GAP_EM * fontSize
  };
}

/**
 * 量出每条连读两端字母的位置，换算成容器坐标系里的弧线路径。
 *
 * 两端落在不同行时像乐谱里跨行的连音线那样断成两截，各自延到行边缘。
 * 换行纯粹是排版结果（同样两个词换个宽度就同行了），标注本身合法，
 * 不能因为画不出一条完整弧就整条不画——那会留下「统计里有、屏幕上没有」
 * 的隐形状态，既看不见也点不掉。
 */
export function buildLiaisonArcs(
  container: Element,
  /** 按连读序号对位；量不到两端元素的位置留空，序号不能因此错位。 */
  links: Array<LiaisonLinkElements | undefined>,
  measure: GlyphMeasurer
): LiaisonLayout {
  // 没有任何连读就别碰布局：返回同一个空对象，调用方据此跳过重渲染。
  if (!links.some(Boolean)) return EMPTY_LIAISON_LAYOUT;
  const base = container.getBoundingClientRect();
  const style = getComputedStyle(container);
  const fontSize = Number.parseFloat(style.fontSize);
  // 没有排版信息（jsdom）时什么都画不出来，也别把 NaN 写进 path。
  if (!Number.isFinite(fontSize) || fontSize <= 0) return EMPTY_LIAISON_LAYOUT;
  const innerLeft = Number.parseFloat(style.paddingLeft) || 0;
  const innerRight = base.width - (Number.parseFloat(style.paddingRight) || 0);

  const geometryOf = (anchor: LiaisonAnchorElements) => {
    const head = anchor.first.getBoundingClientRect();
    const tail = anchor.last.getBoundingClientRect();
    const box: AnchorBox = {
      left: head.left - base.left,
      right: tail.right - base.left,
      top: Math.min(head.top, tail.top) - base.top,
      bottom: Math.max(head.bottom, tail.bottom) - base.top
    };
    return {
      ...anchorTip(box, fontSize, measure(anchor.text)),
      lineTop: box.top
    };
  };

  const arcs: LiaisonArc[] = [];
  links.forEach((link, index) => {
    if (!link) return;
    const left = geometryOf(link.start);
    const right = geometryOf(link.end);
    const sameLine =
      Math.abs(left.lineTop - right.lineTop) <
      fontSize * SAME_LINE_TOLERANCE_EM;
    if (sameLine && right.x > left.x) {
      arcs.push({
        key: `${index}`,
        index,
        d: liaisonPath(left, right, fontSize)
      });
      return;
    }
    arcs.push({
      key: `${index}-head`,
      index,
      d: liaisonPath(left, { x: innerRight, tipY: left.tipY }, fontSize)
    });
    arcs.push({
      key: `${index}-tail`,
      index,
      d: liaisonPath({ x: innerLeft, tipY: right.tipY }, right, fontSize)
    });
  });
  return { arcs, strokeWidth: liaisonStrokeWidth(fontSize) };
}

/** 两次量出的布局是否一样：一样就沿用旧对象，让 React 跳过一次重渲染。 */
export function isSameLiaisonLayout(
  left: LiaisonLayout,
  right: LiaisonLayout
): boolean {
  if (left === right) return true;
  if (left.strokeWidth !== right.strokeWidth) return false;
  if (left.arcs.length !== right.arcs.length) return false;
  return left.arcs.every((arc, index) => {
    const other = right.arcs[index]!;
    return (
      arc.key === other.key && arc.index === other.index && arc.d === other.d
    );
  });
}
