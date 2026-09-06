import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useLiaisonColor } from "./liaisonColor";
import type { LiaisonArc } from "./liaisonGeometry";

export interface LiaisonArcLayerProps {
  arcs: LiaisonArc[];
  strokeWidth: number;
  /** 给出后弧线可点：加粗的透明副本接点击，「点弧线删除」不必瞄准 1px 的线。 */
  onArcMouseDown?: (index: number, event: ReactMouseEvent) => void;
}

/** 连读弧独立一层压在文字上：要跨越任意距离，CSS 伪元素画不出这种形状。 */
export function LiaisonArcLayer({
  arcs,
  strokeWidth,
  onArcMouseDown
}: LiaisonArcLayerProps) {
  // 颜色是本机偏好：写成 CSS 变量，弧线与悬停色都从这里取。
  const color = useLiaisonColor();
  return (
    <svg
      className="tsz-ve-arc-layer"
      aria-hidden
      focusable="false"
      style={{ "--tsz-ve-liaison": color } as CSSProperties}
    >
      {arcs.map((arc) => (
        <g key={arc.key}>
          {onArcMouseDown && (
            <path
              className="tsz-ve-arc-hit"
              d={arc.d}
              strokeWidth={Math.max(strokeWidth * 3, 12)}
              onMouseDown={(event) => onArcMouseDown(arc.index, event)}
            />
          )}
          <path className="tsz-ve-arc" d={arc.d} strokeWidth={strokeWidth} />
        </g>
      ))}
    </svg>
  );
}
