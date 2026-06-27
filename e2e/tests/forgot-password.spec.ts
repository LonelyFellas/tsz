import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

test.describe("找回密码端到端流程", () => {
  test("登录页 → 忘记密码 → 重置成功 → 跳回登录并提示", async ({ page }) => {
    await mockApi(page, { authenticated: false, onboarded: true });

    await page.goto("/login");

    // 从登录页进入找回密码。
    await page.getByRole("button", { name: "忘记密码" }).click();
    await expect(page).toHaveURL(/\/forgot-password/);
    await expect(page.getByRole("heading", { name: "找回密码" })).toBeVisible();

    // 填手机号 → 获取验证码 → 填验证码 → 填新密码 → 重置。
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByRole("button", { name: "获取验证码" }).click();
    await expect(page.getByText(/后重发/)).toBeVisible();

    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.getByPlaceholder("请输入新密码").fill("abc12345678");
    await page.getByRole("button", { name: "重置密码" }).click();

    // 重置成功后跳回登录页并展示成功提示。
    await expect(page).toHaveURL(/\/login\?reset=success/);
    await expect(
      page.getByText("密码重置成功，请用新密码登录。")
    ).toBeVisible();
  });

  test("重置成功后可用新密码登录进入主页", async ({ page }) => {
    await mockApi(page, { authenticated: false, onboarded: true });

    await page.goto("/forgot-password");

    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByRole("button", { name: "获取验证码" }).click();
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.getByPlaceholder("请输入新密码").fill("abc12345678");
    await page.getByRole("button", { name: "重置密码" }).click();

    await expect(page).toHaveURL(/\/login\?reset=success/);

    // 用新密码登录。
    await page.getByPlaceholder("请输入手机号/邮箱号码").fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc12345678");
    await page.getByRole("button", { name: "立即登录" }).click();

    await expect(page.getByText("你好，Alice")).toBeVisible();
  });
});
