import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { User } from "@tsz/types";
import { useUserStore } from "@/stores/user";
import { DeleteAccountForm } from "./DeleteAccountForm";

const mockBack = vi.fn();
const mockReplace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack })
}));

vi.mock("@/lib/request", () => ({
  clearSession: vi.fn(),
  api: {
    auth: {
      requestDeletionCode: vi.fn(),
      deleteAccount: vi.fn()
    }
  }
}));

import { api, clearSession } from "@/lib/request";

const requestDeletionCode = vi.mocked(api.auth.requestDeletionCode);
const deleteAccount = vi.mocked(api.auth.deleteAccount);
const PHONE = "13899997777";
const EMAIL = "alice@example.com";

function seedUser(input: { phone?: string; email?: string }) {
  const user: User = {
    id: "u1",
    display_name: "Alice",
    avatar_url: "",
    roles: ["student"],
    active_role: "student",
    ...input
  };
  useUserStore.setState({ user });
}

function problem(status: number, code: string) {
  return new HttpError(status, "variable detail", [], code);
}

async function requestCodeAndFill(code = "000000") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "获取验证码" }));
  await user.type(screen.getByPlaceholderText("6 位数字验证码"), code);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  requestDeletionCode.mockResolvedValue(undefined);
  deleteAccount.mockResolvedValue(undefined);
  useUserStore.setState({ user: null });
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: mockReplace }
  });
});

describe("DeleteAccountForm", () => {
  it("只展示账号真实拥有的渠道，无渠道时阻止注销", () => {
    seedUser({ email: EMAIL });
    const { unmount } = render(<DeleteAccountForm />);
    expect(screen.getByText("邮箱验证")).toBeInTheDocument();
    expect(screen.queryByText("手机验证")).not.toBeInTheDocument();
    unmount();

    seedUser({});
    render(<DeleteAccountForm />);
    expect(
      screen.getByRole("heading", { name: "无法注销账号" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "获取验证码" })
    ).not.toBeInTheDocument();
  });

  it("双渠道可切换，切换时清除旧验证码和已申请状态", async () => {
    seedUser({ phone: PHONE, email: EMAIL });
    render(<DeleteAccountForm />);
    const user = await requestCodeAndFill();

    expect(requestDeletionCode).toHaveBeenCalledWith({ channel: "phone" });
    await user.click(screen.getByLabelText(/邮箱验证/));

    expect(screen.getByPlaceholderText("6 位数字验证码")).toHaveValue("");
    expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "继续注销" })).toBeDisabled();
  });

  it("申请期间阻止重复请求，202 后展示成功态和倒计时", async () => {
    let resolveRequest!: () => void;
    requestDeletionCode.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveRequest = resolve;
      })
    );
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    const button = screen.getByRole("button", { name: "获取验证码" });

    fireEvent.click(button);
    fireEvent.click(button);
    expect(requestDeletionCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "申请中…" })).toBeDisabled();

    resolveRequest();
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("验证码申请已受理");
      expect(screen.getByRole("button", { name: /60s 后重试/ })).toBeDisabled();
    });
  });

  it("验证码必须先申请且为六位数字，输入过滤非数字", async () => {
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();
    const input = screen.getByPlaceholderText("6 位数字验证码");

    await user.type(input, "12ab3456");
    expect(input).toHaveValue("123456");
    expect(screen.getByRole("button", { name: "继续注销" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    expect(screen.getByRole("button", { name: "继续注销" })).toBeEnabled();
    expect(screen.getByText(/当前测试环境验证码为 000000/)).toBeInTheDocument();
  });

  it("继续注销只打开可访问确认层，取消和 Escape 均不发 DELETE", async () => {
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = await requestCodeAndFill();
    await user.click(screen.getByRole("button", { name: "继续注销" }));

    const dialog = screen.getByRole("dialog", { name: /最后确认/ });
    expect(dialog).toHaveFocus();
    expect(screen.getByTestId("account-deletion-content")).toHaveAttribute(
      "inert"
    );
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "确认永久注销" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "取消" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "取消" }));
    expect(deleteAccount).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "继续注销" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "继续注销" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("最终确认只提交 channel/code，阻止重复 DELETE", async () => {
    let resolveDelete!: () => void;
    deleteAccount.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveDelete = resolve;
      })
    );
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = await requestCodeAndFill();
    await user.click(screen.getByRole("button", { name: "继续注销" }));
    const confirm = screen.getByRole("button", { name: "确认永久注销" });

    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(deleteAccount).toHaveBeenCalledTimes(1);
    expect(deleteAccount).toHaveBeenCalledWith({
      channel: "phone",
      code: "000000"
    });
    expect(screen.getByRole("button", { name: "正在注销…" })).toBeDisabled();
    resolveDelete();
  });

  it("注销成功清理完整会话并整页跳转登录页", async () => {
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = await requestCodeAndFill();
    await user.click(screen.getByRole("button", { name: "继续注销" }));
    await user.click(screen.getByRole("button", { name: "确认永久注销" }));

    await waitFor(() => {
      expect(clearSession).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/login?deleted=success");
    });
  });

  it.each([
    ["invalid_account_deletion_code", 401, "验证码错误、已失效或已使用"],
    [
      "account_deletion_channel_unavailable",
      409,
      "当前账号没有可用于验证的该渠道"
    ],
    ["otp_rate_limited", 429, "验证码申请过于频繁"],
    ["otp_unavailable", 503, "验证码服务暂时不可用"],
    ["invalid_request_body", 422, "提交内容不完整"],
    ["internal_error", 500, "服务暂时异常"]
  ])(
    "按 RFC 9457 code %s 显示稳定错误并恢复操作",
    async (code, status, text) => {
      requestDeletionCode.mockRejectedValueOnce(
        problem(status as number, code as string)
      );
      seedUser({ phone: PHONE });
      render(<DeleteAccountForm />);
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "获取验证码" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(
        text as string
      );
      expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
    }
  );

  it("invalid_token 清会话并整页跳转，不显示普通错误", async () => {
    requestDeletionCode.mockRejectedValueOnce(problem(401, "invalid_token"));
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(clearSession).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith("/login?session=expired");
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("DELETE 失败保留确认层并恢复按钮，可再次确认", async () => {
    deleteAccount.mockRejectedValueOnce(
      problem(401, "invalid_account_deletion_code")
    );
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = await requestCodeAndFill();
    await user.click(screen.getByRole("button", { name: "继续注销" }));
    await user.click(screen.getByRole("button", { name: "确认永久注销" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("验证码错误");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "确认永久注销" })).toBeEnabled();
  });

  it("非 HttpError 使用网络异常兜底，返回按钮调用 router.back", async () => {
    requestDeletionCode.mockRejectedValueOnce(new Error("boom"));
    seedUser({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("网络异常");
    await user.click(screen.getByRole("button", { name: "← 返回" }));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
