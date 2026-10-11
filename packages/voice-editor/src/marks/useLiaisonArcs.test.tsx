import { useRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { liaisonPath } from "./liaisonPath";
import { useLiaisonArcs } from "./useLiaisonArcs";

it("弹窗动画结束后按最终坐标重画弧线，忽略无关元素的动画", () => {
  let scale = 0.5;
  const rect = (left: number, top: number, width: number, height: number) =>
    ({
      left: left * scale,
      top: top * scale,
      right: (left + width) * scale,
      bottom: (top + height) * scale,
      width: width * scale,
      height: height * scale
    }) as DOMRect;
  const glyph = (left: number) => {
    const element = document.createElement("span");
    return {
      glyphs: [
        {
          source: { getBoundingClientRect: () => rect(left, 50, 10, 20) },
          element,
          text: "a"
        }
      ]
    };
  };
  const collect = () => [{ start: glyph(20), end: glyph(120) }];
  function Preview() {
    const ref = useRef<HTMLDivElement>(null);
    const { arcs } = useLiaisonArcs(ref, collect);
    return (
      <>
        <div data-testid="unrelated" />
        <div data-testid="dialog">
          <div
            style={{ fontSize: 20 }}
            ref={(node) => {
              ref.current = node;
              if (node) node.getBoundingClientRect = () => rect(0, 0, 400, 100);
            }}
          >
            <output data-testid="path">{arcs[0]?.d}</output>
          </div>
        </div>
      </>
    );
  }
  render(<Preview />);
  const path = screen.getByTestId("path");
  const duringAnimation = path.textContent;
  expect(duringAnimation).toContain("M 12.5 25");
  scale = 1;
  fireEvent.animationEnd(screen.getByTestId("unrelated"));
  expect(path.textContent).toBe(duringAnimation);
  fireEvent.animationEnd(screen.getByTestId("dialog"));
  expect(path.textContent).toBe(
    liaisonPath({ x: 25, tipY: 50 }, { x: 125, tipY: 50 }, 20)
  );
});
