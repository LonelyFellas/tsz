import { expect, test, type Page } from "@playwright/test";
import { mockApi, TEST_USER } from "./support/mockApi";

async function securityApi(
  page: Page,
  options: { email?: string; phone?: string; failBindOnce?: boolean } = {}
) {
  await mockApi(page, { authenticated: true });
  const requests: { path: string; body: Record<string, unknown> }[] = [];
  let revoked = false;
  let failBind = options.failBindOnce ?? false;
  const user = { ...TEST_USER, ...options };
  delete user.failBindOnce;
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^.*\/api\/v1/,
      ""
    );
    if (path === "/auth/refresh" && revoked) {
      return route.fulfill({
        status: 401,
        contentType: "application/problem+json",
        body: JSON.stringify({
          type: "urn:tsz:problem:invalid_refresh_token",
          title: "Invalid refresh token",
          status: 401,
          detail: "expired",
          code: "invalid_refresh_token"
        })
      });
    }
    if (path === "/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user,
          active_role: user.active_role,
          learning_settings: { cefr_level: "A1", english_variant: "BrE" },
          onboarded: true
        })
      });
    }
    if (path.startsWith("/me/contact/") || path === "/auth/password/change") {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      requests.push({ path, body });
      if (path === "/me/contact/bind" && failBind) {
        failBind = false;
        return route.fulfill({
          status: 401,
          contentType: "application/problem+json",
          body: JSON.stringify({
            type: "urn:tsz:problem:invalid_otp_code",
            title: "Invalid code",
            status: 401,
            detail: "invalid code",
            code: "invalid_otp_code"
          })
        });
      }
      if (
        [
          "/me/contact/bind",
          "/me/contact/unbind",
          "/auth/password/change"
        ].includes(path)
      )
        revoked = true;
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
  return requests;
}

test("macOS Cmd+Enter 在新标签打开菜单链接并保留原页", async ({
  page,
  context
}) => {
  test.skip(
    await page.evaluate(() => !navigator.platform.includes("Mac")),
    "此回归限定macOS原生Cmd+Enter行为"
  );
  await mockApi(context, { authenticated: true });
  await page.goto("/account/profile");
  await page.getByRole("button", { name: "账户菜单" }).click();
  await page.getByRole("menuitem", { name: "个人中心" }).focus();
  const [popup] = await Promise.all([
    context.waitForEvent("page"),
    page.keyboard.press("Meta+Enter")
  ]);
  await expect(popup).toHaveURL(/\/account$/);
  await expect(page).toHaveURL(/\/account\/profile$/);
  await popup.close();
});

async function fillBind(page: Page, oldCode = "123456", newCode = "654321") {
  await page.getByLabel("手机号验证码").fill(oldCode);
  await page.getByLabel("新邮箱验证码").fill(newCode);
}

for (const width of [375, 1280]) {
  for (const shift of [false, true]) {
    test(`账户菜单${shift ? "Shift+Tab" : "Tab"}离开后不抢回焦点（${width}px）`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockApi(page, { authenticated: true });
      await page.goto("/account/profile");
      const trigger = page.getByRole("button", { name: "账户菜单" });
      await trigger.focus();
      await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
      const expected = await page.locator(":focus").elementHandle();
      expect(expected).not.toBeNull();
      await trigger.focus();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("menuitem", { name: "进入学生工作台" })
      ).toBeFocused();
      await page.keyboard.press(shift ? "Shift+Tab" : "Tab");
      await expect(page.getByRole("menu")).toHaveCount(0);
      await expect
        .poll(() =>
          expected!.evaluate((element) => element === document.activeElement)
        )
        .toBe(true);
      await expect(page).toHaveURL(/\/account\/profile$/);
    });
  }

  test(`编辑资料页与账号安全使用一致页头（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, { authenticated: true });
    await page.goto("/account/profile");
    const title = page.getByRole("heading", { name: "编辑资料", level: 1 });
    await expect(title).toBeVisible();
    await expect(page.getByText("修改头像、昵称和英美偏好。")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "← 返回个人中心" })
    ).toHaveAttribute("href", "/account");
    await expect(
      page.getByRole("button", { name: "保存", exact: true })
    ).toBeDisabled();
    const editLayout = await title.evaluate((element) => {
      const style = getComputedStyle(element);
      const back = element.parentElement!.querySelector("a")!;
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        textAlign: style.textAlign,
        marginTop: style.marginTop,
        left: element.getBoundingClientRect().left,
        maxWidth: getComputedStyle(element.parentElement!).maxWidth,
        backAbove:
          back.getBoundingClientRect().bottom <
          element.getBoundingClientRect().top
      };
    });
    expect(editLayout.backAbove).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    await expect(
      page.getByRole("link", { name: "账号与密码设置" })
    ).toHaveCount(0);
    await page.getByRole("link", { name: "← 返回个人中心" }).click();
    await page.getByRole("link", { name: "账号安全", exact: true }).click();
    const reference = page.getByRole("heading", { name: "账号安全", level: 1 });
    await expect(reference).toBeVisible();
    const securityLayout = await reference.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        textAlign: style.textAlign,
        marginTop: style.marginTop,
        left: element.getBoundingClientRect().left,
        maxWidth: getComputedStyle(element.parentElement!).maxWidth
      };
    });
    expect(editLayout).toMatchObject(securityLayout);
  });
}

test.describe("昵称修复浏览器复核", () => {
  test("保存等待不允许改名，后续编辑清除成功提示", async ({ page }) => {
    await mockApi(page, { authenticated: true });
    let release!: () => void;
    const pending = new Promise<void>((done) => (release = done));
    await page.route("**/api/v1/me", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const name = route.request().postDataJSON().display_name as string;
      await pending;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { ...TEST_USER, display_name: name } })
      });
    });
    await page.goto("/account/profile");
    const input = page.getByPlaceholder("请输入昵称");
    await input.fill("Bob");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(input).toBeDisabled();
    release();
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();
    await expect(input).toBeEnabled();
    await input.fill("Carol");
    await expect(page.getByText("已保存", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "保存", exact: true })
    ).toBeEnabled();
  });

  test("emoji昵称保存后的资料头像不是孤立代理项", async ({ page }) => {
    await mockApi(page, { authenticated: true });
    await page.route("**/api/v1/me", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.fallback();
        return;
      }
      const name = route.request().postDataJSON().display_name as string;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ user: { ...TEST_USER, display_name: name } })
      });
    });
    await page.goto("/account/profile");
    await page.getByPlaceholder("请输入昵称").fill("😀😃");
    await page.getByRole("button", { name: "保存", exact: true }).click();
    await expect(page.getByText("已保存", { exact: true })).toBeVisible();
    const avatar = page.getByRole("button", { name: "更换头像" });
    await expect(avatar).toContainText("😀");
    await expect(avatar).not.toContainText("�");
  });

  test("长内部空白粘贴不截断且迅速显示超限", async ({ page }) => {
    await mockApi(page, { authenticated: true });
    await page.goto("/account/profile");
    const name = `a${" ".repeat(80_000)}b`;
    const input = page.getByPlaceholder("请输入昵称");
    await input.fill(name);
    await expect(input).toHaveValue(name);
    await expect(page.getByText("昵称不能超过 50 个字符")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "保存", exact: true })
    ).toBeDisabled();
  });
});

test.describe("账号安全", () => {
  test("游客直达安全页跳转登录并保留回跳目标", async ({ page }) => {
    await mockApi(page, { authenticated: false });
    await page.goto("/account/security");
    await expect(page).toHaveURL(/\/login\?redirect=%2Faccount%2Fsecurity$/);
    await expect(page.getByRole("heading", { name: "账号安全" })).toHaveCount(
      0
    );
  });

  test("硬刷新等待会话恢复后才加载账号安全资料", async ({ page }) => {
    await mockApi(page, { authenticated: true });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let meRequests = 0;
    await page.route("**/api/v1/auth/refresh", async (route) => {
      await pending;
      await route.fallback();
    });
    await page.route("**/api/v1/me", async (route) => {
      meRequests += 1;
      expect(route.request().headers().authorization).toBe(
        "Bearer test-access-token"
      );
      await route.fallback();
    });
    await page.goto("/account/security");
    try {
      await expect(page.getByText("加载中...", { exact: true })).toBeVisible();
      expect(meRequests).toBe(0);
    } finally {
      release();
    }
    await expect(
      page.getByRole("button", { name: "换绑邮箱", exact: true })
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("button", { name: "换绑邮箱", exact: true })
    ).toBeVisible();
  });

  test("个人中心进入安全页，手机账号绑定邮箱后整页退出", async ({ page }) => {
    const requests = await securityApi(page, { email: undefined });
    await page.goto("/account");
    await page.getByRole("link", { name: /账号安全/ }).click();
    await expect(page).toHaveURL(/\/account\/security$/);
    await expect(page.getByRole("button", { name: "解绑手机号" })).toHaveCount(
      0
    );
    await page.getByRole("button", { name: "绑定邮箱", exact: true }).click();
    await page.getByLabel("新邮箱", { exact: true }).fill(" New@EXAMPLE.com ");
    await page
      .getByRole("button", { name: "向已绑定手机号发送验证码" })
      .click();
    await expect(page.getByLabel("新邮箱", { exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "向新邮箱发送验证码" }).click();
    await expect(page.getByLabel("新邮箱验证码")).toBeEnabled();
    await fillBind(page);
    await page.getByRole("button", { name: "确认绑定邮箱" }).click();
    await expect(page).toHaveURL(/\/login\?security=success$/);
    expect(requests).toEqual([
      {
        path: "/me/contact/verification-code",
        body: {
          operation: "bind",
          contact: "new@example.com",
          verification_channel: "phone"
        }
      },
      { path: "/me/contact/bind-code", body: { contact: "new@example.com" } },
      {
        path: "/me/contact/bind",
        body: {
          contact: "new@example.com",
          verification_channel: "phone",
          verification_code: "123456",
          code: "654321"
        }
      }
    ]);
  });

  test("双渠道可用邮箱验证解绑邮箱，手机号只允许换绑，窄屏无横向溢出", async ({
    page
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const requests = await securityApi(page);
    await page.goto("/account/security");
    await page.getByRole("button", { name: "解绑邮箱", exact: true }).click();
    await page.getByRole("combobox", { name: "当前账号的验证方式" }).click();
    await page.getByRole("option", { name: /邮箱：/ }).click();
    await expect(
      page.getByRole("combobox", { name: "当前账号的验证方式" })
    ).toContainText(TEST_USER.email);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.getByRole("button", { name: "向已绑定邮箱发送验证码" }).click();
    await expect(page.getByLabel("邮箱验证码")).toBeEnabled();
    await page.getByLabel("邮箱验证码").fill("123456");
    await expect(page.getByLabel("新手机号验证码")).toHaveCount(0);
    await page.getByRole("button", { name: "确认解绑邮箱" }).click();
    await expect(page).toHaveURL(/\/login\?security=success$/);
    expect(requests).toEqual([
      {
        path: "/me/contact/verification-code",
        body: {
          operation: "unbind",
          contact: TEST_USER.email,
          verification_channel: "email"
        }
      },
      {
        path: "/me/contact/unbind",
        body: {
          channel: "email",
          verification_channel: "email",
          verification_code: "123456"
        }
      }
    ]);
  });

  test("验证码错误留在当前页且不刷新重放，清码后能重新操作", async ({
    page
  }) => {
    const requests = await securityApi(page, { failBindOnce: true });
    await page.goto("/account/security");
    await page.getByRole("button", { name: "换绑邮箱", exact: true }).click();
    await page.getByLabel("新邮箱", { exact: true }).fill("new@example.com");
    await fillBind(page);
    const refreshRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().endsWith("/auth/refresh"))
        refreshRequests.push(request.url());
    });
    await page.getByRole("button", { name: "确认换绑邮箱" }).click();
    await expect(page.locator("form").getByRole("alert")).toContainText(
      "验证码错误或已失效"
    );
    expect(refreshRequests).toEqual([]);
    await expect(page).toHaveURL(/\/account\/security$/);
    expect(requests.filter((r) => r.path === "/me/contact/bind")).toHaveLength(
      1
    );
    await expect(page.getByLabel("手机号验证码")).toHaveValue("");
    await expect(page.getByLabel("新邮箱验证码")).toHaveValue("");
    await page
      .getByRole("button", { name: "向已绑定手机号发送验证码" })
      .click();
    await expect(page.getByLabel("新邮箱", { exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "向新邮箱发送验证码" }).click();
    await expect(page.getByLabel("新邮箱验证码")).toBeEnabled();
    await fillBind(page);
    await page.getByRole("button", { name: "确认换绑邮箱" }).click();
    await expect(page).toHaveURL(/\/login\?security=success$/);
    expect(requests.filter((r) => r.path === "/me/contact/bind")).toHaveLength(
      2
    );
  });

  test("修改密码保留旧密码原串，确认一致后提交并退出", async ({ page }) => {
    const requests = await securityApi(page);
    await page.goto("/account/security");
    await page.getByRole("button", { name: "修改密码", exact: true }).click();
    await page.getByLabel("当前密码", { exact: true }).fill("RawCase!234");
    await page
      .getByLabel("新密码", { exact: true })
      .fill("New!密码🙂 river cloud");
    await page
      .getByLabel("确认新密码", { exact: true })
      .fill("WrongPassword123");
    await expect(
      page.getByRole("button", { name: "确认修改密码" })
    ).toBeDisabled();
    await page
      .getByLabel("确认新密码", { exact: true })
      .fill("New!密码🙂 river cloud");
    await page.getByRole("button", { name: "确认修改密码" }).click();
    await expect(page).toHaveURL(/\/login\?security=success$/);
    expect(requests).toEqual([
      {
        path: "/auth/password/change",
        body: {
          current_password: "RawCase!234",
          new_password: "New!密码🙂 river cloud"
        }
      }
    ]);
  });
});
