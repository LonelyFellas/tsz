import type { BowlTarget } from "./liaisonBowl";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { LiaisonArc } from "./liaisonGeometry";

export interface LiaisonArcLayerProps {
  arcs: LiaisonArc[];
  strokeWidth: number;
  selectedIndex?: number;
  editTarget?: BowlTarget;
  /** 给出后弧线可点：加粗的透明副本接点击，「点弧线删除」不必瞄准 1px 的线。 */
  onArcMouseDown?: (
    index: number,
    event: ReactMouseEvent,
    target?: BowlTarget
  ) => void;
}

/** 连读弧独立一层压在文字上：要跨越任意距离，CSS 伪元素画不出这种形状。 */
export function LiaisonArcLayer({
  arcs,
  strokeWidth,
  selectedIndex,
  editTarget,
  onArcMouseDown
}: LiaisonArcLayerProps) {
  const selected = editTarget && arcs.find((a) => a.index === selectedIndex);
  return (
    <svg className="tsz-ve-arc-layer" aria-hidden focusable="false">
      {arcs.map((arc) => (
        <g key={arc.key}>
          {onArcMouseDown && (
            <path
              className={
                editTarget ? "tsz-ve-arc-hit is-adjustable" : "tsz-ve-arc-hit"
              }
              d={arc.d}
              strokeWidth={Math.max(strokeWidth * 3, 12)}
              onMouseDown={(event) => onArcMouseDown(arc.index, event)}
            />
          )}
          <path
            className={
              arc.index === selectedIndex
                ? "tsz-ve-arc is-selected"
                : "tsz-ve-arc"
            }
            data-arc-key={arc.key}
            d={arc.d}
            strokeWidth={strokeWidth}
          />
        </g>
      ))}
      {selected?.tips &&
        onArcMouseDown &&
        (["left", "right"] as const).map((side) => {
          const tip = selected.tips![side],
            target = side === "left" ? "left_tip_pct" : "right_tip_pct";
          const mid = (selected.tips!.left.x + selected.tips!.right.x) / 2;
          const x = side === "left" ? tip.x - 12 : Math.max(mid, tip.x - 12);
          const right =
            side === "right" ? tip.x + 12 : Math.min(mid, tip.x + 12);
          return (
            <g key={side}>
              {!tip.touching && (
                <circle
                  cx={tip.x}
                  cy={tip.y}
                  r={Math.min(
                    3.5,
                    (selected.tips!.right.x - selected.tips!.left.x) / 5
                  )}
                  className={
                    editTarget === target
                      ? "tsz-ve-tip is-active"
                      : "tsz-ve-tip"
                  }
                />
              )}
              <rect
                x={x}
                y={tip.y - 7}
                width={right - x}
                height={17}
                className="tsz-ve-tip-hit"
                data-arc-end={side}
                onMouseDown={(event) =>
                  onArcMouseDown(selected.index, event, target)
                }
              />
            </g>
          );
        })}
    </svg>
  );
}
