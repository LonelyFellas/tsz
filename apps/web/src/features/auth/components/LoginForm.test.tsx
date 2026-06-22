import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "@/test/render";
import { LoginForm } from "./LoginForm";

describe("LoginForm", () => {
  it("非法账号 → 按钮禁用且显示错误提示", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    const button = screen.getByRole("button", { name: "获取验证码" });
    expect(button).toBeDisabled();

    await user.type(screen.getByPlaceholderText("手机号 / 邮箱"), "bad");
    expect(button).toBeDisabled();
    expect(screen.getByText("请输入有效的手机号或邮箱")).toBeInTheDocument();
  });

  it("合法手机号 → 按钮可用且无错误提示", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(
      screen.getByPlaceholderText("手机号 / 邮箱"),
      "13800138000"
    );

    expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
    expect(
      screen.queryByText("请输入有效的手机号或邮箱")
    ).not.toBeInTheDocument();
  });

  it("合法邮箱 → 按钮可用", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm />);

    await user.type(screen.getByPlaceholderText("手机号 / 邮箱"), "a@b.com");

    expect(screen.getByRole("button", { name: "获取验证码" })).toBeEnabled();
  });
});
