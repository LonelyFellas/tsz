import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card } from "./Card";

describe("Card", () => {
  it("渲染子节点", () => {
    render(<Card>内容</Card>);
    expect(screen.getByText("内容")).toBeInTheDocument();
  });

  it("包含默认样式", () => {
    render(<Card data-testid="c">x</Card>);
    const cls = screen.getByTestId("c").className;
    expect(cls).toContain("rounded-lg");
    expect(cls).toContain("border");
    expect(cls).toContain("bg-surface");
  });

  it("追加自定义 className", () => {
    render(
      <Card data-testid="c" className="extra-y">
        x
      </Card>
    );
    expect(screen.getByTestId("c").className).toContain("extra-y");
  });

  it("透传原生属性", () => {
    render(
      <Card data-testid="c" role="region" aria-label="卡片">
        x
      </Card>
    );
    const el = screen.getByTestId("c");
    expect(el).toHaveAttribute("role", "region");
    expect(el).toHaveAttribute("aria-label", "卡片");
  });
});
