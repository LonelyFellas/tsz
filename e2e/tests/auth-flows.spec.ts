import { expect, test } from "@playwright/test";
import { mockApi, TEST_USER } from "./support/mockApi";

test.describe("鉴权与引导端到端流程", () => {
  for (const path of ["/register", "/forgot-password"]) {
    test(`${path} 取消渠道点击保留输入，click-only确认才清空`, async ({
      page
    }) => {
      await mockApi(page);
      await page.goto(path);
      const phone = page.getByPlaceholder("请输入手机号");
      const code = page.getByPlaceholder("请输入验证码");
      await phone.fill("13800138000");
      await code.fill("123456");
      const email = page.getByRole("tab", { name: "邮箱" });
      const box = await email.boundingBox();
      expect(box).not.toBeNull();
      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.mouse.down();
      await page.mouse.move(0, 0);
      await page.mouse.up();
      await expect(page.getByRole("tab", { name: "手机" })).toHaveAttribute(
        "aria-selected",
        "true"
      );
      await expect(phone).toHaveValue("13800138000");
      await expect(code).toHaveValue("123456");
      await email.evaluate((element) => (element as HTMLElement).click());
      await expect(email).toHaveAttribute("aria-selected", "true");
      await expect(page.getByPlaceholder("请输入邮箱")).toHaveValue("");
      await expect(code).toHaveValue("");
    });
  }

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
  test("新用户验证码注册 → 直接建立会话进入首次引导", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/register");

    // 注册验证码与手机号绑定；获取验证码后填写完整注册表单。
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByRole("button", { name: "获取验证码" }).click();
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page
      .getByPlaceholder("请输入登录密码")
      .fill(" Mixed!密码🙂 river cloud ");
    await page.getByRole("button", { name: "立即注册" }).click();

    await expect(page).toHaveURL(/\/onboarding$/);
    await expect(
      page.getByRole("heading", { name: "1. 选择难度级别" })
    ).toBeVisible();
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
    await page.route("**/api/v1/me", async (route) => {
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
    await page
      .getByPlaceholder("请输入登录密码")
      .fill(" Mixed!密码🙂 river cloud ");
    await page.getByRole("button", { name: "立即注册" }).click();
    await expect(
      page.getByText("注册成功，但加载账号信息失败，请重试")
    ).toBeVisible();
    await expect(page.getByPlaceholder("请输入手机号")).toBeDisabled();
    await page.getByRole("button", { name: "重试加载" }).click();
    await expect(page).toHaveURL(/\/onboarding$/);
    expect(registerCount).toBe(1);
    expect(meCount).toBe(2);
  });

  test("邮箱登录失败 → 对应注册入口 → email-only 会话，资料失败不重复注册", async ({
    page
  }, testInfo) => {
    await mockApi(page, { authenticated: false });
    const user = {
      ...TEST_USER,
      phone: undefined,
      email: "student@example.com"
    };
    let registrations = 0;
    let profiles = 0;
    await page.route("**/api/v1/auth/login", (route) =>
      route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "urn:tsz:problem:invalid_credentials",
          title: "Unauthorized",
          status: 401,
          code: "invalid_credentials",
          detail: "invalid credentials"
        })
      })
    );
    await page.route("**/api/v1/auth/register", async (route) => {
      registrations++;
      expect(route.request().postDataJSON()).toEqual({
        email: "student@example.com",
        password: " Mixed!密码🙂 river cloud ",
        code: "123456"
      });
      await route.fulfill({
        status: 201,
        json: {
          user,
          access_token: "test-access-token",
          expires_in: 900,
          refresh_token_expires_at: 9999999999
        }
      });
    });
    await page.route("**/api/v1/me", async (route) => {
      profiles++;
      await route.fulfill(
        profiles === 1
          ? { status: 503, body: "unavailable" }
          : {
              json: {
                user,
                active_role: user.active_role,
                learning_settings: null,
                onboarded: false
              }
            }
      );
    });
    await page.goto("/login?redirect=%2Fstudent%2Fpractice");
    await page
      .getByRole("textbox", { name: "手机号或邮箱" })
      .fill("Student@EXAMPLE.com");
    await page
      .getByPlaceholder("请输入登录密码")
      .fill(" Mixed!密码🙂 river cloud ");
    await page.getByRole("button", { name: "立即登录" }).click();
    await expect(page.getByText("账号或密码错误，请重新输入")).toBeVisible();
    expect(registrations).toBe(0);
    await page.getByRole("button", { name: "没有账号，立即注册" }).click();
    await expect(page).toHaveURL(/\/register\?method=email&redirect=/);
    await page.getByPlaceholder("请输入邮箱").fill("　Student@EXAMPLE.com ");
    const sent = page.waitForRequest("**/api/v1/otp/send");
    await page.getByRole("button", { name: "获取验证码" }).click();
    expect((await sent).postDataJSON()).toEqual({
      email: "student@example.com",
      purpose: "register"
    });
    await page
      .getByPlaceholder("请输入登录密码")
      .fill(" Mixed!密码🙂 river cloud ");
    await page.getByPlaceholder("请输入验证码").fill("1234");
    await expect(page.getByRole("button", { name: "立即注册" })).toBeDisabled();
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.screenshot({
      path: testInfo.outputPath("email-registration.png")
    });
    await page.getByRole("button", { name: "立即注册" }).click();
    await expect(
      page.getByText("注册成功，但加载账号信息失败，请重试")
    ).toBeVisible();
    await expect(
      page.getByRole("tab", { name: "手机", exact: true })
    ).toBeDisabled();
    await page.getByRole("button", { name: "重试加载" }).click();
    await expect(page).toHaveURL(
      /\/bind-phone\?redirect=%2Fstudent%2Fpractice$/
    );
    expect(registrations).toBe(1);
    expect(profiles).toBe(2);
  });

  test("窄屏邮箱注册切换与重复账号提示", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockApi(page, { authenticated: false });
    await page.route("**/api/v1/auth/register", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "urn:tsz:problem:user_already_exists",
          title: "Conflict",
          status: 409,
          code: "user_already_exists",
          field: "email",
          detail: "user already exists"
        })
      })
    );
    await page.goto("/register");
    await page.getByPlaceholder("请输入手机号").fill("13800138000");
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page.getByRole("tab", { name: "邮箱", exact: true }).click();
    await expect(page.getByPlaceholder("请输入验证码")).toHaveValue("");
    await page.getByPlaceholder("请输入邮箱").fill("user@example.com");
    await page.getByPlaceholder("请输入验证码").fill("123456");
    await page
      .getByPlaceholder("请输入登录密码")
      .fill(" Mixed!密码🙂 river cloud ");
    await page.getByRole("button", { name: "立即注册" }).click();
    await expect(page.getByText("该邮箱已注册，请直接登录")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("email-registration-mobile.png")
    });
    await page.getByRole("button", { name: "已有账号,去登录" }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("邮箱密码原串登录成功", async ({ page }) => {
    await mockApi(page, { authenticated: false });
    await page.goto("/login");
    await page
      .getByRole("textbox", { name: "手机号或邮箱" })
      .fill("Student@EXAMPLE.com");
    await page.getByPlaceholder("请输入登录密码").fill("OldPass!");
    const login = page.waitForRequest("**/api/v1/auth/login");
    await page.getByRole("button", { name: "立即登录" }).click();
    expect((await login).postDataJSON()).toEqual({
      identifier: "student@example.com",
      password: "OldPass!"
    });
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  });

  test("未配置账号 → 确认难度与口音 → 保存后进入主页", async ({ page }) => {
    await mockApi(page, { authenticated: true, onboarded: false });
    await page.goto("/onboarding");
    await expect(
      page.getByRole("heading", { name: "1. 选择难度级别" })
    ).toBeVisible();
    await page.getByText("B1", { exact: true }).click();
    await page.getByText("英式英语", { exact: true }).click();
    await page.getByRole("button", { name: "完成，开始学习" }).click();
    await expect(
      page.getByText("难度确认后不可修改；英美偏好之后仍可调整。")
    ).toBeVisible();
    const saved = page.waitForRequest("**/api/v1/me/learning-settings");
    await page.getByRole("button", { name: "确认并开始学习" }).click();
    expect((await saved).postDataJSON()).toEqual({
      cefr_level: "B1",
      english_variant: "BrE"
    });
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
    await page.goto("/onboarding?level=C2");
    await expect(page).toHaveURL(/\/account\/profile$/);
    await expect(page.getByText("B1", { exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: /C2/ })).toHaveCount(0);
  });

  test("首次确认保留学生专区回跳，英美偏好修改后刷新仍持久化", async ({
    page
  }) => {
    await mockApi(page, { authenticated: true, onboarded: false });
    await page.goto("/student/practice");
    await expect(page).toHaveURL(
      /\/onboarding\?redirect=%2Fstudent%2Fpractice$/
    );
    await page.getByText("A2", { exact: true }).click();
    await page.getByText("英式英语", { exact: true }).click();
    await page.getByRole("button", { name: "完成，开始学习" }).click();
    await page.getByRole("button", { name: "确认并开始学习" }).click();
    await expect(page).toHaveURL(/\/student\/practice$/);
    await page.goto("/account/profile");
    await page.getByRole("radio", { name: "美式英语（AmE）" }).check();
    const saved = page.waitForRequest("**/api/v1/me/learning-settings");
    await page.getByRole("button", { name: "保存偏好" }).click();
    expect((await saved).postDataJSON()).toEqual({
      cefr_level: "A2",
      english_variant: "AmE"
    });
    await expect(page.getByText("偏好已保存")).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("radio", { name: "美式英语（AmE）" })
    ).toBeChecked();
    await expect(page.getByText("A2", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "难度级别说明" }).click();
    await expect(page.getByRole("tooltip")).toHaveText(
      "如需修改，请联系官方客服"
    );
    await page.keyboard.press("Escape");
    await expect(page.getByRole("tooltip")).toHaveCount(0);
  });

  test("进入测评后跳过，首次确认仍返回原学生页", async ({ page }) => {
    await mockApi(page, { authenticated: true, onboarded: false });
    await page.goto("/student/practice");
    await page.getByRole("link", { name: /1 分钟测一测/ }).click();
    await expect(page).toHaveURL(
      /\/placement\?redirect=%2Fstudent%2Fpractice$/
    );
    await page.getByRole("button", { name: "跳过，手动选择等级" }).click();
    await expect(page).toHaveURL(
      /\/onboarding\?redirect=%2Fstudent%2Fpractice$/
    );
    await page.getByText("B1", { exact: true }).click();
    await page.getByText("英式英语", { exact: true }).click();
    await page.getByRole("button", { name: "完成，开始学习" }).click();
    await page.getByRole("button", { name: "确认并开始学习" }).click();
    await expect(page).toHaveURL(/\/student\/practice$/);
  });

  test("登录 → 主页 → 退出登录回到登录页", async ({ page }) => {
    await mockApi(page, { authenticated: false });

    await page.goto("/login");
    // 登录页仅提供手机号或邮箱 + 密码。
    await page
      .getByRole("textbox", { name: "手机号或邮箱" })
      .fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc123");
    await page.getByRole("button", { name: "立即登录" }).click();

    // 老用户（已引导）直接进主页：打开顶栏头像菜单后退出登录。
    await page.getByRole("button", { name: "账户菜单" }).click();
    await page.getByText("退出登录").click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: "立即登录" })).toBeVisible();
  });

  test("手机号密码登录不会请求登录验证码", async ({ page }) => {
    await mockApi(page, { authenticated: false });
    const otpRequests: string[] = [];
    page.on("request", (request) => {
      if (/\/otp\/send|\/auth\/login-otp/.test(new URL(request.url()).pathname))
        otpRequests.push(request.url());
    });

    await page.goto("/login");
    await page
      .getByRole("textbox", { name: "手机号或邮箱" })
      .fill("13800138000");
    await page.getByLabel("密码", { exact: true }).fill("abc123");
    await page.getByRole("button", { name: "立即登录" }).click();

    await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
    expect(otpRequests).toEqual([]);
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
    await page.route("**/api/v1/me", async (route) => {
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
    await page
      .getByRole("textbox", { name: "手机号或邮箱" })
      .fill("13800138000");
    await page.getByPlaceholder("请输入登录密码").fill("abc123");
    const requestedMe = page.waitForRequest("**/api/v1/me");
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
      await page
        .getByRole("textbox", { name: "手机号或邮箱" })
        .fill("13800138000");
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
