import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

test.describe("鉴权与引导端到端流程", () => {
  test("新用户注册 → 链式自动登录进入主页", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/register");

    // 填写注册表单（手机 + 密码;验证码栏已撤,后端注册不校验 OTP）。
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc12345678");
    await page.getByRole("button", { name: "立即注册" }).click();

    // 注册(201 无 token)后前端链式登录;onboarding 后端未实现
    // (me() 适配器恒 onboarded:true),注册后直接进主页。
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  });

  test("显式访问引导页 → 选择难度与口音 → 保存后进入主页", async ({ page }) => {
    await mockApi(page, { authenticated: true });

    // 引导页不再对已 onboarded 用户自动弹回:定级测试 CTA / 直接访问一律放行。
    await page.goto("/onboarding");
    await expect(
      page.getByRole("heading", { name: "1. 选择难度级别" })
    ).toBeVisible();

    // 选难度等级 + 英式，提交。
    await page.getByText("B1", { exact: true }).click();
    await page.getByRole("button", { name: /英式英语/ }).click();
    await page.getByRole("button", { name: "完成，开始学习" }).click();

    // 完成后进入主页，顶栏出现账户菜单（已登录态）。
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  });

  test("登录 → 主页 → 退出登录回到登录页", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/login");
    // 默认即「账号密码」tab，直接填账号密码登录。
    await page.getByPlaceholder("请输入手机号/邮箱号码").fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc123");
    await page.getByRole("button", { name: "立即登录" }).click();

    // 老用户（已引导）直接进主页：打开顶栏头像菜单后退出登录。
    await page.getByRole("button", { name: "账户菜单" }).click();
    await page.getByText("退出登录").click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "立即登录" })).toBeVisible();
  });

  test("手机验证码登录 → 主页", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/login");
    // 切到「手机验证」tab：手机号 → 获取验证码 → 填验证码 → 登录。
    await page.getByRole("button", { name: "手机验证" }).click();
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByRole("button", { name: "获取验证码" }).click();
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.getByRole("button", { name: "立即登录" }).click();

    // 老用户（已引导）直接进主页：顶栏出现账户菜单。
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  });

  test("已登录用户访问 /login 被自动跳走", async ({ page }) => {
    await mockApi(page, { authenticated: true });

    await page.goto("/login");

    // GuestGuard：已登录 → 跳回首页。
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
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
