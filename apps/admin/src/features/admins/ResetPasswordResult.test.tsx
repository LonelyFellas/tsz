import { fireEvent, render, screen } from "@testing-library/react";
import { App as AntApp } from "antd";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 复制逻辑单测在 lib/clipboard.test.ts；这里 mock 掉，只验证「成败→提示文案」的接线。
vi.mock("@/lib/clipboard", () => ({ copyText: vi.fn() }));

import { copyText } from "@/lib/clipboard";
import { ResetPasswordResult } from "./ResetPasswordResult";

const mockCopy = vi.mocked(copyText);

// message 门户依赖 <App> 上下文，统一包一层。
function renderModal(props: Parameters<typeof ResetPasswordResult>[0]) {
  return render(
    <AntApp>
      <ResetPasswordResult {...props} />
    </AntApp>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ResetPasswordResult", () => {
  it("password 为 null 时不渲染弹窗", () => {
    renderModal({ password: null, onClose: vi.fn() });
    expect(screen.queryByText("临时密码已生成")).toBeNull();
  });

  it("展示临时密码与一次性提示，含目标昵称", () => {
    renderModal({
      password: "Kd7mNpQ2rXt9",
      adminName: "小王",
      onClose: vi.fn()
    });
    expect(screen.getByText("临时密码已生成")).toBeInTheDocument();
    expect(screen.getByText("Kd7mNpQ2rXt9")).toBeInTheDocument();
    expect(screen.getByText(/仅显示一次/)).toBeInTheDocument();
    expect(screen.getByText(/小王/)).toBeInTheDocument();
  });

  it("无 adminName 时用「该管理员」兜底", () => {
    renderModal({ password: "abc123456789", onClose: vi.fn() });
    expect(screen.getByText(/该管理员/)).toBeInTheDocument();
  });

  it("点「我已复制」触发 onClose", () => {
    const onClose = vi.fn();
    renderModal({ password: "abc123456789", onClose });
    fireEvent.click(screen.getByRole("button", { name: "我已复制" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("复制成功给出成功提示", async () => {
    mockCopy.mockResolvedValue(true);
    renderModal({ password: "Kd7mNpQ2rXt9", onClose: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /复制密码/ }));
    expect(await screen.findByText("已复制临时密码")).toBeInTheDocument();
    expect(mockCopy).toHaveBeenCalledWith("Kd7mNpQ2rXt9");
  });

  it("复制失败时提示手动复制，而非谎报「已复制」", async () => {
    // 模拟非安全上下文 / execCommand 失败：copyText 返回 false。
    mockCopy.mockResolvedValue(false);
    renderModal({ password: "Kd7mNpQ2rXt9", onClose: vi.fn() });
    fireEvent.click(screen.getByRole("button", { name: /复制密码/ }));
    expect(
      await screen.findByText("复制失败，请手动选中下方密码复制")
    ).toBeInTheDocument();
    // 关键断言：绝不出现成功文案。
    expect(screen.queryByText("已复制临时密码")).toBeNull();
    // 缓解仍在：密码明文可手动取回。
    expect(screen.getByText("Kd7mNpQ2rXt9")).toBeInTheDocument();
  });
});
