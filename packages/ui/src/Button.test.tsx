import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("渲染文本,默认 type 由原生决定(submit)", () => {
    render(<Button>提交</Button>);
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
  });

  it("默认 variant 为 primary", () => {
    render(<Button>主</Button>);
    expect(screen.getByRole("button").className).toContain("bg-primary");
  });

  it.each([
    ["primary", "bg-primary"],
    ["secondary", "bg-muted"],
    ["ghost", "bg-transparent"]
  ] as const)("variant=%s 应用对应样式", (variant, cls) => {
    render(<Button variant={variant}>x</Button>);
    expect(screen.getByRole("button").className).toContain(cls);
  });

  it("基础样式始终存在", () => {
    render(<Button>x</Button>);
    const cls = screen.getByRole("button").className;
    expect(cls).toContain("rounded-md");
    expect(cls).toContain("disabled:opacity-50");
  });

  it("追加自定义 className", () => {
    render(<Button className="custom-x">x</Button>);
    expect(screen.getByRole("button").className).toContain("custom-x");
  });

  it("透传原生属性(type)", () => {
    render(<Button type="button">x</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("点击触发 onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点我</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled 时不触发 onClick", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        禁用
      </Button>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
