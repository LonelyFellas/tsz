import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { RichText } from "@tsz/types";
import { RichTextView } from "./RichTextView";

const plain = (text: string): RichText => ({
  version: 1,
  text,
  spans: [],
  liaisons: []
});

describe("RichTextView", () => {
  it("纯文本原样渲染", () => {
    render(<RichTextView value={plain("位于中央; 将其置于中央.")} />);
    expect(screen.getByText("位于中央; 将其置于中央.")).toBeInTheDocument();
  });

  it("按区间边界切段:蓝色段染 primary,前后保持普通文本", () => {
    const value: RichText = {
      version: 1,
      text: "something centers; more",
      spans: [{ start: 10, end: 17, type: "blue" }],
      liaisons: []
    };
    const { container } = render(<RichTextView value={value} />);
    const blue = screen.getByText("centers");
    expect(blue.className).toContain("text-primary");
    expect(container.textContent).toBe("something centers; more");
  });

  it("加粗与蓝色可叠加", () => {
    const value: RichText = {
      version: 1,
      text: "abcd",
      spans: [
        { start: 1, end: 3, type: "bold" },
        { start: 1, end: 3, type: "blue" }
      ],
      liaisons: []
    };
    render(<RichTextView value={value} />);
    const seg = screen.getByText("bc");
    expect(seg.className).toContain("font-semibold");
    expect(seg.className).toContain("text-primary");
  });

  it("每个连读点渲染一条弧线标记", () => {
    const value: RichText = {
      version: 1,
      text: "dresses up as",
      spans: [],
      liaisons: [6, 9]
    };
    const { container } = render(<RichTextView value={value} />);
    expect(container.querySelectorAll("[data-liaison]")).toHaveLength(2);
    // 弧线不改变文本内容
    expect(container.textContent).toBe("dresses up as");
  });

  it("连读点落在样式段内部时正确断段", () => {
    const value: RichText = {
      version: 1,
      text: "dress up",
      spans: [{ start: 0, end: 8, type: "blue" }],
      liaisons: [4]
    };
    const { container } = render(<RichTextView value={value} />);
    expect(container.querySelectorAll("[data-liaison]")).toHaveLength(1);
    expect(container.textContent).toBe("dress up");
  });
});
