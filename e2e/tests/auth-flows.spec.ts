import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

test.describe("鉴权与引导端到端流程", () => {
  test("新用户注册 → 进入引导页 → 选择后进入主页", async ({ page }) => {
    await mockApi(page, { authenticated: false, onboarded: false });

    await page.goto("/register");

    // 填写注册表单（手机 + 验证码 + 密码）。
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByRole("button", { name: "获取验证码" }).click();
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.getByPlaceholder("请输入登录密码").fill("abc12345678");
    await page.getByRole("button", { name: "立即注册" }).click();

    // 新用户被引导到 onboarding。
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(
      page.getByRole("heading", { name: "1. 选择难度级别" })
    ).toBeVisible();

    // 选难度等级 + 英式，提交。
    await page.getByText("B1", { exact: true }).click();
    await page.getByRole("button", { name: /英式英语/ }).click();
    await page.getByRole("button", { name: "完成，开始学习" }).click();

    // 完成后进入主页，显示已登录态。
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("你好，Alice")).toBeVisible();
    await expect(page.getByText("退出登录")).toBeVisible();
  });

  test("登录 → 主页 → 退出登录回到登录页", async ({ page }) => {
    await mockApi(page, { authenticated: false, onboarded: true });

    await page.goto("/login");
    await page.getByPlaceholder("请输入手机号/邮箱号码").fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc123");
    await page.getByRole("button", { name: "立即登录" }).click();

    // 老用户（已引导）直接进主页。
    await expect(page.getByText("你好，Alice")).toBeVisible();

    await page.getByText("退出登录").click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "立即登录" })).toBeVisible();
  });

  test("已登录用户访问 /login 被自动跳走", async ({ page }) => {
    await mockApi(page, { authenticated: true, onboarded: true });

    await page.goto("/login");

    // GuestGuard：已登录 → 跳回首页。
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("你好，Alice")).toBeVisible();
  });

  test("未登录访问学生专区 → 重定向登录页并带 redirect", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/student/practice");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fstudent%2Fpractice/);
  });

  test("未登录访问教师专区 → 重定向登录页", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/teacher/tasks");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fteacher%2Ftasks/);
  });

  test("游客仍可浏览公开词表（不被守卫拦截）", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/wordlists");
    await expect(page).toHaveURL(/\/wordlists/);
    await expect(page.getByRole("heading", { name: "词表" })).toBeVisible();
  });
});
