import { expect, test } from "@playwright/test";

test.describe("登录页", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
  });

  test("登录页正常渲染三个 tab", async ({ page }) => {
    await expect(page.getByRole("button", { name: "账号密码" })).toBeVisible();
    await expect(page.getByRole("button", { name: "手机验证" })).toBeVisible();
    await expect(page.getByRole("button", { name: "邮箱验证" })).toBeVisible();
  });

  test("默认展示账号密码 tab：账号 + 密码输入框", async ({ page }) => {
    await expect(page.getByPlaceholder("请输入手机号/邮箱号码")).toBeVisible();
    await expect(page.getByPlaceholder("请输入登录密码")).toBeVisible();
  });

  test("切换到手机验证 tab：手机号 + 验证码输入框与获取验证码按钮", async ({
    page
  }) => {
    await page.getByRole("button", { name: "手机验证" }).click();
    await expect(page.getByPlaceholder("请输入手机号")).toBeVisible();
    await expect(page.getByPlaceholder("请输入验证码")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "获取验证码" })
    ).toBeVisible();
  });

  test("初始状态立即登录按钮禁用", async ({ page }) => {
    await expect(page.getByRole("button", { name: "立即登录" })).toBeDisabled();
  });

  test("手机验证：填入合法手机号和验证码后按钮可用", async ({ page }) => {
    await page.getByRole("button", { name: "手机验证" }).click();
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await expect(page.getByRole("button", { name: "立即登录" })).toBeEnabled();
  });

  test("切换到账号密码 tab：填入合法账号和密码后按钮可用", async ({ page }) => {
    await page.getByRole("button", { name: "账号密码" }).click();
    await page.getByPlaceholder("请输入手机号/邮箱号码").fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc123");
    await expect(page.getByRole("button", { name: "立即登录" })).toBeEnabled();
  });

  test("切换到邮箱验证 tab 显示邮箱输入框", async ({ page }) => {
    await page.getByRole("button", { name: "邮箱验证" }).click();
    await expect(page.getByPlaceholder("请输入邮箱")).toBeVisible();
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
