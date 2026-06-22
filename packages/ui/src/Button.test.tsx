import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./Button";

describe("Button", () => {
  it("渲染文本", () => {
    render(<Button>提交</Button>);
    expect(screen.getByRole("button", { name: "提交" })).toBeInTheDocument();
  });

  it("点击触发 onClick", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>点我</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("disabled 时不触发", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        禁用
      </Button>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });
});
