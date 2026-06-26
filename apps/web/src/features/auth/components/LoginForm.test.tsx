import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LoginForm } from "./LoginForm";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => ({ get: () => null })
}));

describe("LoginForm — 账号密码 tab", () => {
  beforeEach(() => {
    renderWithProviders(<LoginForm />);
  });

  it("初始状态下立即登录按钮禁用", () => {
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  it("填入合法手机号但无密码 → 按钮仍禁用", async () => {
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "13800138000"
    );
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  it("填入合法账号和密码 → 按钮可用", async () => {
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "13800138000"
    );
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "abc123");
    expect(screen.getByRole("button", { name: "立即登录" })).toBeEnabled();
  });

  it("填入非法账号 + 密码 → 按钮禁用", async () => {
    const user = userEvent.setup();
    await user.type(
      screen.getByPlaceholderText("请输入手机号/邮箱号码"),
      "notvalid"
    );
    await user.type(screen.getByPlaceholderText("请输入登录密码"), "abc123");
    expect(screen.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });
});
