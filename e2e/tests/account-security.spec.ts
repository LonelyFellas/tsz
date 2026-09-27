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
    if (path === "/auth/me") {
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(user)
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

async function fillBind(page: Page, oldCode = "123456", newCode = "654321") {
  await page.getByLabel("原联系方式验证码").fill(oldCode);
  await page.getByLabel("新联系方式验证码").fill(newCode);
}

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
    await page.route("**/api/v1/auth/me", async (route) => {
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
    await expect(
      page.getByRole("button", { name: "解绑手机号" })
    ).toBeDisabled();
    await page.getByRole("button", { name: "绑定邮箱", exact: true }).click();
    await page.getByLabel("新邮箱", { exact: true }).fill(" New@EXAMPLE.com ");
    await page.getByRole("button", { name: "验证原渠道" }).click();
    await expect(page.getByLabel("新邮箱", { exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "验证新渠道" }).click();
    await expect(page.getByLabel("新联系方式验证码")).toBeEnabled();
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

  test("双渠道可用邮箱验证解绑手机，窄屏无横向溢出", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const requests = await securityApi(page);
    await page.goto("/account/security");
    await page.getByRole("button", { name: "解绑手机号", exact: true }).click();
    await page.getByLabel("身份验证渠道").selectOption("email");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);
    await page.getByRole("button", { name: "验证原渠道" }).click();
    await expect(page.getByLabel("原联系方式验证码")).toBeEnabled();
    await page.getByLabel("原联系方式验证码").fill("123456");
    await expect(page.getByLabel("新联系方式验证码")).toHaveCount(0);
    await page.getByRole("button", { name: "确认解绑手机号" }).click();
    await expect(page).toHaveURL(/\/login\?security=success$/);
    expect(requests).toEqual([
      {
        path: "/me/contact/verification-code",
        body: {
          operation: "unbind",
          contact: TEST_USER.phone,
          verification_channel: "email"
        }
      },
      {
        path: "/me/contact/unbind",
        body: {
          channel: "phone",
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
    await expect(page.getByLabel("原联系方式验证码")).toHaveValue("");
    await expect(page.getByLabel("新联系方式验证码")).toHaveValue("");
    await page.getByRole("button", { name: "验证原渠道" }).click();
    await expect(page.getByLabel("新邮箱", { exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "验证新渠道" }).click();
    await expect(page.getByLabel("新联系方式验证码")).toBeEnabled();
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
    await page.getByLabel("新密码", { exact: true }).fill("NewPassword123");
    await page
      .getByLabel("确认新密码", { exact: true })
      .fill("WrongPassword123");
    await expect(
      page.getByRole("button", { name: "确认修改密码" })
    ).toBeDisabled();
    await page.getByLabel("确认新密码", { exact: true }).fill("NewPassword123");
    await page.getByRole("button", { name: "确认修改密码" }).click();
    await expect(page).toHaveURL(/\/login\?security=success$/);
    expect(requests).toEqual([
      {
        path: "/auth/password/change",
        body: {
          current_password: "RawCase!234",
          new_password: "NewPassword123"
        }
      }
    ]);
  });
});
