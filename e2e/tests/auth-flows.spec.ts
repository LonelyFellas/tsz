import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

test.describe("鉴权与引导端到端流程", () => {
  for (const [path, title] of [
    ["/register", "注册账号"],
    ["/forgot-password", "找回密码"]
  ] as const) {
    test(`${path} 在 JavaScript 尚未执行时仍显示服务端表单`, async ({
      browser,
      baseURL
    }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        baseURL
      });
      try {
        const page = await context.newPage();
        await page.goto(path);
        await expect(page.getByRole("heading", { name: title })).toBeVisible();
        await expect(page.getByPlaceholder("请输入手机号")).toBeVisible();
      } finally {
        await context.close();
      }
    });
  }
  test("新用户验证码注册 → 直接建立会话进入主页", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/register");

    // 注册验证码与手机号绑定；获取验证码后填写完整注册表单。
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByRole("button", { name: "获取验证码" }).click();
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.getByPlaceholder("请输入登录密码").fill("abc12345678");
    await page.getByRole("button", { name: "立即注册" }).click();

    // /auth/register 直接返回会话；me() 适配器恒 onboarded:true，进入主页。
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  });

  test("注册成功后的资料失败可重试，不再次提交注册", async ({ page }) => {
    await mockApi(page, { authenticated: false });
    let registerCount = 0;
    let meCount = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).pathname === "/api/v1/auth/register") {
        registerCount++;
      }
    });
    await page.route("**/api/v1/auth/me", async (route) => {
      meCount++;
      if (meCount === 1) {
        await route.fulfill({ status: 503, body: "unavailable" });
      } else {
        await route.fallback();
      }
    });
    await page.goto("/register");
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.getByPlaceholder("请输入登录密码").fill("abc12345678");
    await page.getByRole("button", { name: "立即注册" }).click();
    await expect(
      page.getByText("注册成功，但加载账号信息失败，请重试")
    ).toBeVisible();
    await expect(page.getByPlaceholder("请输入手机号")).toBeDisabled();
    await page.getByRole("button", { name: "重试加载" }).click();
    await expect(page).toHaveURL(/\/$/);
    expect(registerCount).toBe(1);
    expect(meCount).toBe(2);
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

  test("登录等待资料完成后只回到原受保护页面，不绕经首页", async ({ page }) => {
    await mockApi(page, { authenticated: false });
    let releaseMe!: () => void;
    const holdMe = new Promise<void>((resolve) => {
      releaseMe = resolve;
    });
    await page.route("**/api/v1/auth/me", async (route) => {
      await holdMe;
      await route.fallback();
    });

    await page.goto("/student/practice");
    await expect(page).toHaveURL(/\/login\?redirect=%2Fstudent%2Fpractice/);
    const navigations: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        navigations.push(new URL(frame.url()).pathname);
      }
    });
    await page.getByPlaceholder("请输入手机号/邮箱号码").fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc123");
    const requestedMe = page.waitForRequest("**/api/v1/auth/me");
    await page.getByRole("button", { name: "立即登录" }).click();
    await requestedMe;
    try {
      await expect(
        page.getByRole("button", { name: "登录中..." })
      ).toBeVisible();
      await expect(page).toHaveURL(/\/login\?redirect=/);
      expect(navigations).toEqual([]);
    } finally {
      releaseMe();
    }
    await expect(page).toHaveURL(/\/student\/practice$/);
    expect(navigations).toEqual(["/student/practice"]);
  });

  for (const redirect of [
    "https://outside.example/",
    "//outside.example/",
    "/login?redirect=/login"
  ]) {
    test(`登录后拒绝危险或循环回跳 ${redirect}`, async ({ page }) => {
      await mockApi(page, { authenticated: false });
      await page.goto(`/login?redirect=${encodeURIComponent(redirect)}`);
      await page.getByPlaceholder("请输入手机号/邮箱号码").fill("13800138000");
      await page.getByPlaceholder("请输入登录密码").fill("abc123");
      await page.getByRole("button", { name: "立即登录" }).click();
      await expect(page).toHaveURL(/\/$/);
      await expect(
        page.getByRole("button", { name: "账户菜单" })
      ).toBeVisible();
      expect(new URL(page.url()).hostname).toBe("127.0.0.1");
    });
  }

  test("已有会话的回跳保留 query 与 hash", async ({ page }) => {
    await mockApi(page, { authenticated: true });
    const target = "/student/practice?unit=2#words";
    await page.goto(`/login?redirect=${encodeURIComponent(target)}`);
    await expect(page).toHaveURL(/\/student\/practice\?unit=2#words$/);
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
