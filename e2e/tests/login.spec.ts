import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

test.describe("登录页", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, { authenticated: false });
    await page.goto("/login");
  });

  test("登录页只展示手机号或邮箱与密码，不提供验证码登录", async ({ page }) => {
    await expect(
      page.getByRole("textbox", { name: "手机号或邮箱" })
    ).toBeVisible();
    await expect(page.getByLabel("密码", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "手机验证" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "邮箱验证" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "获取验证码" })).toHaveCount(
      0
    );
  });

  test("初始状态立即登录按钮禁用", async ({ page }) => {
    await expect(page.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  for (const account of ["13800138000", "student@example.com"]) {
    test(`${account} 与密码填写完整后可以登录`, async ({ page }) => {
      await page.getByRole("textbox", { name: "手机号或邮箱" }).fill(account);
      await expect(
        page.getByRole("button", { name: "立即登录" })
      ).toBeDisabled();
      await page.getByLabel("密码", { exact: true }).fill("abc123");
      await expect(
        page.getByRole("button", { name: "立即登录" })
      ).toBeEnabled();
    });
  }

  test("无效账号不能提交", async ({ page }) => {
    await page
      .getByRole("textbox", { name: "手机号或邮箱" })
      .fill("not-an-account");
    await page.getByLabel("密码", { exact: true }).fill("abc123");
    await expect(page.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  test("点击立即注册跳转注册页", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: "没有账号，立即注册" })
    ).toBeVisible();
    await page.getByRole("button", { name: "没有账号，立即注册" }).click();
    await expect(page).toHaveURL(/\/register/);
  });

  test("未登录访问受保护页面重定向到登录页", async ({ page }) => {
    await page.goto("/student/practice");
    await expect(page).toHaveURL(/\/login\?redirect=/);
  });
});
