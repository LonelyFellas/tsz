import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent
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

  it("非提交按钮不提交表单，禁用按钮不触发点击", async () => {
    const onSubmit = vi.fn((event: { preventDefault(): void }) =>
      event.preventDefault()
    );
    const onClick = vi.fn();
    render(
      <form onSubmit={onSubmit}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="显示密码"
          onClick={onClick}
        >
          显示
        </Button>
        <Button type="button" variant="outline" disabled onClick={onClick}>
          获取验证码
        </Button>
      </form>
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "显示密码" }));
    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
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

  it("Input 透传 ref、自动填充、无效和禁用属性", () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <Input
        ref={ref}
        aria-label="验证码"
        autoComplete="one-time-code"
        inputMode="numeric"
        aria-invalid
        disabled
      />
    );
    const input = screen.getByRole("textbox", { name: "验证码" });
    expect(ref.current).toBe(input);
    expect(input).toHaveAttribute("autocomplete", "one-time-code");
    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toBeDisabled();
  });
});

describe("FormField", () => {
  it("Label 关联控件，错误替换帮助文字，恢复后重新展示帮助文字", () => {
    const field = (error?: string) => (
      <FormField
        htmlFor="password"
        label="密码"
        hint="密码至少 15 位"
        error={error}
      >
        <Input
          id="password"
          aria-describedby="password-message"
          aria-invalid={Boolean(error)}
        />
      </FormField>
    );
    const { rerender } = render(field());
    const input = screen.getByLabelText("密码");
    expect(input).toHaveAccessibleDescription("密码至少 15 位");
    rerender(field("密码太短"));
    expect(input).toHaveAccessibleDescription("密码太短");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByText("密码至少 15 位")).not.toBeInTheDocument();
    rerender(field());
    expect(input).toHaveAccessibleDescription("密码至少 15 位");
    expect(input).toHaveAttribute("aria-invalid", "false");
  });
});

describe("shadcn Tabs", () => {
  it.each(["manual", "automatic"] as const)(
    "%s模式按下并取消不选择，click-only才确认一次",
    (activationMode) => {
      const onValueChange = vi.fn();
      render(
        <Tabs
          defaultValue="phone"
          activationMode={activationMode}
          onValueChange={onValueChange}
        >
          <TabsList>
            <TabsTrigger value="phone">手机</TabsTrigger>
            <TabsTrigger value="email">邮箱</TabsTrigger>
          </TabsList>
          <TabsContent value="phone">手机内容</TabsContent>
          <TabsContent value="email">邮箱内容</TabsContent>
        </Tabs>
      );
      const phone = screen.getByRole("tab", { name: "手机" });
      const email = screen.getByRole("tab", { name: "邮箱" });
      fireEvent.mouseDown(email, { button: 0 });
      fireEvent.mouseUp(document.body);
      expect(email).toHaveFocus();
      expect(phone).toHaveAttribute("aria-selected", "true");
      expect(onValueChange).not.toHaveBeenCalled();
      fireEvent.click(email, { detail: 0 });
      expect(email).toHaveAttribute("aria-selected", "true");
      expect(onValueChange).toHaveBeenCalledExactlyOnceWith("email");
      fireEvent.click(email, { detail: 0 });
      expect(onValueChange).toHaveBeenCalledTimes(1);
    }
  );

  it("受控值由父级更新，调用者取消点击时不提交切换", () => {
    const onValueChange = vi.fn();
    const onClick = vi.fn((event: { preventDefault(): void }) =>
      event.preventDefault()
    );
    const tree = (value: string, cancel = false) => (
      <Tabs value={value} onValueChange={onValueChange} activationMode="manual">
        <TabsList>
          <TabsTrigger value="phone">手机</TabsTrigger>
          <TabsTrigger value="email" onClick={cancel ? onClick : undefined}>
            邮箱
          </TabsTrigger>
        </TabsList>
        <TabsContent value="phone">手机内容</TabsContent>
        <TabsContent value="email">邮箱内容</TabsContent>
      </Tabs>
    );
    const { rerender } = render(tree("phone", true));
    const email = screen.getByRole("tab", { name: "邮箱" });
    fireEvent.click(email, { detail: 0 });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onValueChange).not.toHaveBeenCalled();
    rerender(tree("phone"));
    fireEvent.click(email, { detail: 0 });
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith("email");
    expect(email).toHaveAttribute("aria-selected", "false");
    rerender(tree("email"));
    expect(email).toHaveAttribute("aria-selected", "true");
  });

  it("手动激活支持焦点移动、面板关联和禁用标签", async () => {
    const onValueChange = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(
      <Tabs
        defaultValue="phone"
        activationMode="manual"
        onValueChange={onValueChange}
      >
        <TabsList aria-label="注册方式">
          <TabsTrigger ref={ref} value="phone">
            手机
          </TabsTrigger>
          <TabsTrigger value="email">邮箱</TabsTrigger>
          <TabsTrigger value="disabled" disabled>
            不可用
          </TabsTrigger>
        </TabsList>
        <TabsContent value="phone">手机内容</TabsContent>
        <TabsContent value="email">邮箱内容</TabsContent>
        <TabsContent value="disabled">不可用内容</TabsContent>
      </Tabs>
    );
    const user = userEvent.setup();
    const phone = screen.getByRole("tab", { name: "手机" });
    const email = screen.getByRole("tab", { name: "邮箱" });
    const disabled = screen.getByRole("tab", { name: "不可用" });
    expect(ref.current).toBe(phone);
    expect(
      screen.getByRole("tablist", { name: "注册方式" })
    ).toBeInTheDocument();
    for (const tab of [phone, email, disabled]) {
      const panel = document.getElementById(tab.getAttribute("aria-controls")!);
      expect(panel).toHaveAttribute("aria-labelledby", tab.id);
    }
    await user.click(phone);
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(email).toHaveFocus());
    expect(phone).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("手机");
    expect(onValueChange).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(email).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveAccessibleName("邮箱");
    expect(onValueChange).toHaveBeenLastCalledWith("email");
    await user.click(disabled);
    expect(onValueChange).toHaveBeenCalledTimes(1);
    await user.click(email);
    await user.keyboard("{ArrowRight}");
    await waitFor(() => expect(phone).toHaveFocus());
    expect(email).toHaveAttribute("aria-selected", "true");
    await user.keyboard(" ");
    expect(phone).toHaveAttribute("aria-selected", "true");
    expect(onValueChange).toHaveBeenLastCalledWith("phone");
  });
});
