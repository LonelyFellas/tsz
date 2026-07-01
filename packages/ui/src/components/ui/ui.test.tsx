import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label
} from "./index";

describe("shadcn Button", () => {
  it("默认渲染为 <button> 并带默认变体样式", () => {
    render(<Button>点我</Button>);
    const btn = screen.getByRole("button", { name: "点我" });
    expect(btn.tagName).toBe("BUTTON");
    expect(btn.className).toContain("bg-primary");
  });

  it("asChild：以子元素为渲染根，复用按钮样式", () => {
    render(
      <Button asChild variant="outline" size="sm">
        <a href="/go">链接按钮</a>
      </Button>
    );
    const link = screen.getByRole("link", { name: "链接按钮" });
    expect(link).toHaveAttribute("href", "/go");
    expect(link.className).toContain("border");
  });
});

describe("shadcn Card 家族", () => {
  it("渲染 Card 及各子部件", () => {
    render(
      <Card data-testid="card" className="extra">
        <CardHeader>
          <CardTitle>标题</CardTitle>
          <CardDescription>描述</CardDescription>
        </CardHeader>
        <CardContent>正文</CardContent>
        <CardFooter>页脚</CardFooter>
      </Card>
    );
    const card = screen.getByTestId("card");
    expect(card.className).toContain("bg-card");
    expect(card.className).toContain("extra");
    for (const text of ["标题", "描述", "正文", "页脚"]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });
});

describe("shadcn Input / Label", () => {
  it("Label 关联 Input，透传属性", () => {
    render(
      <div>
        <Label htmlFor="f">名称</Label>
        <Input id="f" placeholder="请输入" />
      </div>
    );
    expect(screen.getByText("名称")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("请输入")).toHaveAttribute("id", "f");
  });
});
