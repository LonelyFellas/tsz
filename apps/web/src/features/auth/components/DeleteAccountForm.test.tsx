import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@tsz/types";
import { DeleteAccountForm } from "./DeleteAccountForm";
import { useUserStore } from "@/stores/user";

const mockBack = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mockBack })
}));

// 注销成功用整页跳转（window.location.replace）回登录页，这里替身掉以便断言。
const originalLocation = window.location;
const mockLocationReplace = vi.fn();

vi.mock("@/lib/request", () => ({
  setAccessToken: vi.fn(),
  api: {
    auth: {
      requestDeletionCode: vi.fn(),
      deleteAccount: vi.fn()
    }
  }
}));

import { api, setAccessToken } from "@/lib/request";
const mockRequestCode = vi.mocked(api.auth.requestDeletionCode);
const mockDelete = vi.mocked(api.auth.deleteAccount);

const PHONE = "13899997777";
const EMAIL = "fcot520@qq.com";
const VALID_CODE = "123456";

function userWith({ phone, email }: { phone?: string; email?: string }): User {
  return {
    id: "u1",
    phone,
    email,
    display_name: "Alice",
    roles: ["student"],
    avatar_url: "",
    status: "active",
    created_at: "",
    updated_at: ""
  };
}

function seed(u: { phone?: string; email?: string }) {
  useUserStore.setState({ user: userWith(u) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBack.mockReset();
  mockLocationReplace.mockReset();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { replace: mockLocationReplace, href: "http://localhost/" }
  });
  useUserStore.setState({ user: null });
});

afterEach(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: originalLocation
  });
});

// ── 渠道展示 ──────────────────────────────────────────
describe("DeleteAccountForm — 渠道展示", () => {
  it("仅绑定手机 → 不显示渠道切换，展示在档手机号(只读)", () => {
    seed({ phone: PHONE });
    render(<DeleteAccountForm />);

    expect(
      screen.queryByRole("button", { name: "邮箱" })
    ).not.toBeInTheDocument();
    expect(screen.getByText("手机号码")).toBeInTheDocument();
    const input = screen.getByDisplayValue(PHONE);
    expect(input).toHaveAttribute("readonly");
  });

  it("仅绑定邮箱 → 默认选中邮箱渠道并展示邮箱", async () => {
    seed({ email: EMAIL });
    render(<DeleteAccountForm />);

    await waitFor(() => {
      expect(screen.getByText("邮箱号码")).toBeInTheDocument();
      expect(screen.getByDisplayValue(EMAIL)).toBeInTheDocument();
    });
  });

  it("同时绑定手机+邮箱 → 显示两个渠道 tab，可切换", async () => {
    seed({ phone: PHONE, email: EMAIL });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    expect(screen.getByRole("button", { name: "手机" })).toBeInTheDocument();
    expect(screen.getByDisplayValue(PHONE)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "邮箱" }));
    expect(screen.getByText("邮箱号码")).toBeInTheDocument();
    expect(screen.getByDisplayValue(EMAIL)).toBeInTheDocument();
  });

  it("未绑定任何渠道 → 显示无法注销兜底文案", () => {
    seed({});
    render(<DeleteAccountForm />);
    expect(
      screen.getByText("当前账号未绑定可用于验证的手机号或邮箱，无法注销。")
    ).toBeInTheDocument();
  });
});

// ── 按钮状态 ──────────────────────────────────────────
describe("DeleteAccountForm — 按钮状态", () => {
  beforeEach(() => seed({ phone: PHONE }));

  it("初始 → 确认注销禁用", () => {
    render(<DeleteAccountForm />);
    expect(screen.getByRole("button", { name: "确认注销" })).toBeDisabled();
  });

  it("填入合法验证码 → 确认注销可用", async () => {
    render(<DeleteAccountForm />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    expect(screen.getByRole("button", { name: "确认注销" })).toBeEnabled();
  });

  it("验证码非数字/长度不符 → 确认注销禁用", async () => {
    render(<DeleteAccountForm />);
    const user = userEvent.setup();
    await user.type(screen.getByPlaceholderText("请输入验证码"), "ab");
    expect(screen.getByRole("button", { name: "确认注销" })).toBeDisabled();
  });
});

// ── 获取验证码 ────────────────────────────────────────
describe("DeleteAccountForm — 获取验证码", () => {
  beforeEach(() => seed({ phone: PHONE, email: EMAIL }));

  it("点击获取验证码 → 用当前渠道请求并进入倒计时", async () => {
    mockRequestCode.mockResolvedValueOnce({ status: "sent" });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockRequestCode).toHaveBeenCalledWith("phone");
      expect(screen.getByRole("button", { name: /后重发/ })).toBeDisabled();
    });
  });

  it("切到邮箱后获取验证码 → 用 email 渠道请求", async () => {
    mockRequestCode.mockResolvedValueOnce({ status: "sent" });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "邮箱" }));
    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(mockRequestCode).toHaveBeenCalledWith("email");
    });
  });

  it("发送过于频繁(429) → 显示中文文案", async () => {
    mockRequestCode.mockRejectedValueOnce(
      new Error("too many code requests, try again later")
    );
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "获取验证码" }));

    await waitFor(() => {
      expect(
        screen.getByText("验证码发送过于频繁，请稍后再试")
      ).toBeInTheDocument();
    });
  });
});

// ── 注销流程 ──────────────────────────────────────────
describe("DeleteAccountForm — 注销流程", () => {
  beforeEach(() => seed({ phone: PHONE }));

  it("注销成功 → 调用 deleteAccount、清 token 并整页跳转 /login?deleted=success", async () => {
    mockDelete.mockResolvedValueOnce(undefined);
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确认注销" }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith("phone", VALID_CODE);
      expect(setAccessToken).toHaveBeenCalledWith(null);
      expect(mockLocationReplace).toHaveBeenCalledWith(
        "/login?deleted=success"
      );
    });
  });

  it("验证码错误/失效 → 显示中文提示且不跳转", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("invalid or expired deletion code")
    );
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确认注销" }));

    await waitFor(() => {
      expect(
        screen.getByText("验证码错误或已失效，请重新获取")
      ).toBeInTheDocument();
    });
    expect(mockLocationReplace).not.toHaveBeenCalled();
  });

  it("渠道不可用 → 显示中文提示", async () => {
    mockDelete.mockRejectedValueOnce(
      new Error("verification channel unavailable for this account")
    );
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确认注销" }));

    await waitFor(() => {
      expect(
        screen.getByText("该账号未绑定此渠道，无法用此方式注销")
      ).toBeInTheDocument();
    });
  });

  it("非 Error 类型异常 → 显示兜底文案", async () => {
    mockDelete.mockRejectedValueOnce("boom");
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确认注销" }));

    await waitFor(() => {
      expect(screen.getByText("操作失败，请稍后重试")).toBeInTheDocument();
    });
  });
});

// ── 交互细节 ──────────────────────────────────────────
describe("DeleteAccountForm — 交互细节", () => {
  it("点击「← 返回」→ 调用 router.back()", async () => {
    seed({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "← 返回" }));
    expect(mockBack).toHaveBeenCalled();
  });

  it("切换渠道 → 清空已填验证码", async () => {
    seed({ phone: PHONE, email: EMAIL });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    const codeInput = screen.getByPlaceholderText("请输入验证码");
    await user.type(codeInput, VALID_CODE);
    expect(codeInput).toHaveValue(VALID_CODE);

    await user.click(screen.getByRole("button", { name: "邮箱" }));
    expect(screen.getByPlaceholderText("请输入验证码")).toHaveValue("");
  });

  it("点击已选中的渠道 → 无副作用（不清空已填验证码）", async () => {
    seed({ phone: PHONE, email: EMAIL });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    const codeInput = screen.getByPlaceholderText("请输入验证码");
    await user.type(codeInput, VALID_CODE);

    // 当前渠道为「手机」，再次点「手机」应被 switchChannel 早退拦下，不清空。
    await user.click(screen.getByRole("button", { name: "手机" }));
    expect(screen.getByPlaceholderText("请输入验证码")).toHaveValue(VALID_CODE);
  });

  it("信息不全时提交表单 → 被 canSubmit 拦下，不发起注销请求", () => {
    seed({ phone: PHONE });
    const { container } = render(<DeleteAccountForm />);

    // 未填验证码直接提交：handleDelete 应 preventDefault 并在 canSubmit 为 false 时拦下。
    fireEvent.submit(container.querySelector("form")!);
    expect(mockDelete).not.toHaveBeenCalled();
  });
});

// ── 中间态与倒计时 ────────────────────────────────────
describe("DeleteAccountForm — 中间态与倒计时", () => {
  it("发送验证码过程中按钮显示「发送中...」", async () => {
    // 用挂起的 promise 留住中间态。
    let release!: (v: { status: string }) => void;
    mockRequestCode.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      })
    );
    seed({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "获取验证码" }));
    expect(
      await screen.findByRole("button", { name: "发送中..." })
    ).toBeDisabled();
    release({ status: "sent" });
  });

  it("注销过程中按钮显示「注销中...」", async () => {
    let release!: () => void;
    mockDelete.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        release = resolve;
      })
    );
    seed({ phone: PHONE });
    render(<DeleteAccountForm />);
    const user = userEvent.setup();

    await user.type(screen.getByPlaceholderText("请输入验证码"), VALID_CODE);
    await user.click(screen.getByRole("button", { name: "确认注销" }));

    expect(
      await screen.findByRole("button", { name: "注销中..." })
    ).toBeDisabled();
    release();
  });

  it("获取验证码后倒计时逐秒递减", async () => {
    vi.useFakeTimers();
    try {
      mockRequestCode.mockResolvedValueOnce({ status: "sent" });
      seed({ phone: PHONE });
      render(<DeleteAccountForm />);

      // 用 fireEvent 触发，避免 userEvent 与假定时器耦合；act 刷新已 resolve 的发码 promise。
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
      });
      expect(
        screen.getByRole("button", { name: "60s 后重发" })
      ).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(
        screen.getByRole("button", { name: "59s 后重发" })
      ).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});
