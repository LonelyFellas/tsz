import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CopyableText } from "./CopyableText";

describe("CopyableText", () => {
  it("有值：展示文本并挂上复制按钮", () => {
    render(<CopyableText value="13800138000" />);
    expect(screen.getByText("13800138000")).toBeInTheDocument();
    // antd 复制按钮 aria-label 为「复制」（取自 tooltips[0]）。
    expect(screen.getByRole("button", { name: "复制" })).toBeInTheDocument();
  });

  it("空值：渲染占位「-」、不出现复制按钮", () => {
    render(<CopyableText value={undefined} />);
    expect(screen.getByText("-")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "复制" })).toBeNull();
  });

  it("空字符串走占位分支（视作无值）", () => {
    render(<CopyableText value="" />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("自定义占位", () => {
    render(<CopyableText value={null} placeholder="—无—" />);
    expect(screen.getByText("—无—")).toBeInTheDocument();
  });

  it("ellipsis 传 number：限制最大宽度并开启截断", () => {
    const { container } = render(
      <CopyableText value="a-very-long-uuid-value" ellipsis={96} />
    );
    // Typography.Text 以 style.max-width 承载限宽。
    const node = container.querySelector<HTMLElement>(".ant-typography");
    expect(node?.style.maxWidth).toBe("96px");
  });

  it("ellipsis 传 true：开启截断但不限宽", () => {
    const { container } = render(
      <CopyableText value="another-long-value" ellipsis />
    );
    const node = container.querySelector<HTMLElement>(".ant-typography");
    expect(node?.style.maxWidth).toBe("");
  });
});
