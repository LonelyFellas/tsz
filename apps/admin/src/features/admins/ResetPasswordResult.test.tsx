import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResetPasswordResult } from "./ResetPasswordResult";

describe("ResetPasswordResult", () => {
  it("password 为 null 时不渲染弹窗", () => {
    render(<ResetPasswordResult password={null} onClose={vi.fn()} />);
    expect(screen.queryByText("临时密码已生成")).toBeNull();
  });

  it("展示临时密码与一次性提示，含目标昵称", () => {
    render(
      <ResetPasswordResult
        password="Kd7mNpQ2rXt9"
        adminName="小王"
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText("临时密码已生成")).toBeInTheDocument();
    expect(screen.getByText("Kd7mNpQ2rXt9")).toBeInTheDocument();
    expect(screen.getByText(/仅显示一次/)).toBeInTheDocument();
    expect(screen.getByText(/小王/)).toBeInTheDocument();
  });

  it("无 adminName 时用「该管理员」兜底", () => {
    render(<ResetPasswordResult password="abc123456789" onClose={vi.fn()} />);
    expect(screen.getByText(/该管理员/)).toBeInTheDocument();
  });

  it("点「我已复制」触发 onClose", () => {
    const onClose = vi.fn();
    render(<ResetPasswordResult password="abc123456789" onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "我已复制" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
