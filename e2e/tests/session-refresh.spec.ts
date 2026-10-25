import { expect, test } from "@playwright/test";
import { mockApi, TEST_USER } from "./support/mockApi";

test("另一标签页切换账号后旧页面退出，刷新也不恢复另一账号", async ({
  page,
  context
}) => {
  await mockApi(context, { authenticated: true });
  const other = {
    ...TEST_USER,
    id: "00000000-0000-4000-8000-000000000002",
    display_name: "Bob"
  };
  let current = TEST_USER as typeof other;
  const jwt = () =>
    `header.${Buffer.from(JSON.stringify({ sub: current.id, aud: "web" })).toString("base64")}.signature`;
  await context.route("**/api/v1/auth/refresh", (route) =>
    route.fulfill({ json: { access_token: jwt(), expires_in: 900 } })
  );
  await context.route("**/api/v1/auth/login", (route) => {
    current = other;
    return route.fulfill({
      json: { user: current, access_token: jwt(), expires_in: 900 }
    });
  });
  await context.route("**/api/v1/me", (route) =>
    route.fulfill({
      json: {
        user: current,
        active_role: "student",
        onboarded: true,
        learning_settings: { cefr_level: "A1", english_variant: "BrE" }
      }
    })
  );
  await page.goto("/student/practice");
  await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  const second = await context.newPage();
  await second.goto("/student/practice");
  await second.getByRole("button", { name: "账户菜单" }).hover();
  await second.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(second).toHaveURL(/\/login(?:\?|$)/);
  await second.getByLabel("手机号或邮箱").fill("bob@example.com");
  await second.getByLabel("密码", { exact: true }).fill("RawCase!234");
  await second.getByRole("button", { name: "立即登录" }).click();
  await expect(second.getByRole("button", { name: "账户菜单" })).toBeVisible();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("button", { name: "账户菜单" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "立即登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "账户菜单" })).toHaveCount(0);
  await second.getByRole("button", { name: "账户菜单" }).hover();
  await expect(second.getByText("Bob", { exact: true })).toBeVisible();
  await second.close();
});

test("旧页面错过账号切换通知，重建后仍保持退出", async ({ page, context }) => {
  await mockApi(context, { authenticated: true });
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  await page.goto("about:blank"); // 卸载旧文档，保留这个 tab 的 sessionStorage。
  const second = await context.newPage();
  await second.goto("/student/practice");
  await second.getByRole("button", { name: "账户菜单" }).hover();
  await second.getByRole("menuitem", { name: "退出登录" }).click();
  await second.getByLabel("手机号或邮箱").fill("bob@example.com");
  await second.getByLabel("密码", { exact: true }).fill("RawCase!234");
  await second.getByRole("button", { name: "立即登录" }).click();
  await expect(second.getByRole("button", { name: "账户菜单" })).toBeVisible();
  await page.goto("/student/practice");
  await expect(page.getByRole("button", { name: "立即登录" })).toBeVisible();
  await expect(page.getByRole("button", { name: "账户菜单" })).toHaveCount(0);
  await second.close();
});

test("首页恢复会话后再预取导航页面", async ({ page }) => {
  await mockApi(page, { authenticated: true });
  const profileGate = Promise.withResolvers<void>();
  const profileStarted = Promise.withResolvers<void>();
  await page.route("**/api/v1/me", async (route) => {
    profileStarted.resolve();
    await profileGate.promise;
    await route.fallback();
  });
  const prefetched: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      url.searchParams.has("_rsc") &&
      ["/", "/wordlists", "/dictionary"].includes(url.pathname)
    )
      prefetched.push(url.pathname);
  });
  await page.addInitScript(() => {
    window.addEventListener("tsz:app-ready", () => {
      document.documentElement.dataset.sessionTestReady = "true";
    });
  });
  try {
    await page.goto("/");
    await profileStarted.promise;
    await expect(page.locator("html")).toHaveAttribute(
      "data-session-test-ready",
      "true"
    );
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestIdleCallback(() =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
          );
        })
    );
    expect(prefetched).toEqual([]);
  } finally {
    profileGate.resolve();
  }
  await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  await expect.poll(() => prefetched.includes("/dictionary")).toBe(true);
});

test("离线登出后 online 不会用残留 cookie 重新登录", async ({ page }) => {
  await mockApi(page, { authenticated: true });
  let refreshes = 0;
  await page.route("**/api/v1/auth/refresh", async (route) => {
    refreshes++;
    return route.fallback();
  });
  await page.route("**/api/v1/auth/logout", (route) =>
    route.abort("internetdisconnected")
  );
  await page.goto("/student/practice");
  await expect(
    page.getByRole("heading", { name: "我的学习任务" })
  ).toBeVisible();
  await page.getByRole("button", { name: "账户菜单" }).hover();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("button", { name: "立即登录" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  expect(refreshes).toBe(1);
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await expect(page.getByRole("button", { name: "立即登录" })).toBeVisible();
  await page.getByLabel("手机号或邮箱").fill("student@example.com");
  await page.getByLabel("密码", { exact: true }).fill("RawCase!234");
  await page.getByRole("button", { name: "立即登录" }).click();
  await expect(page.getByRole("button", { name: "账户菜单" })).toBeVisible();
  await page.goto("/student/practice");
  await expect(
    page.getByRole("heading", { name: "我的学习任务" })
  ).toBeVisible();
  expect(refreshes).toBe(2);
});

for (const failure of ["429", "503", "offline"] as const) {
  test(`恢复 ${failure} 保留原页面，按确定性恢复会话`, async ({ page }) => {
    await mockApi(page, { authenticated: true });
    let available = false;
    let refreshes = 0;
    await page.route("**/api/v1/auth/refresh", async (route) => {
      if (route.request().method() === "HEAD")
        return route.fulfill({
          status: 204,
          headers: { "x-refresh-recovery": "v1" }
        });
      refreshes++;
      if (available) return route.fallback();
      return failure === "offline"
        ? route.abort("internetdisconnected")
        : route.fulfill({ status: Number(failure) });
    });
    await page.goto("/student/practice");
    const message = "正在恢复连接，联网后将自动继续";
    await expect(page.getByText(message)).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("restore-error.png")
    });
    await expect(page).toHaveURL(/\/student\/practice$/);
    await expect(
      page.getByRole("heading", { name: "我的学习任务" })
    ).toHaveCount(0);
    expect(refreshes).toBe(1);
    available = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText(message)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "我的学习任务" })
    ).toBeVisible();
    expect(refreshes).toBe(2);
    await expect(page).toHaveURL(/\/student\/practice$/);
  });
}

test("旧后端不支持恢复时，回读资料不能解除未知轮换保护", async ({ page }) => {
  await page.clock.install();
  await mockApi(page, { authenticated: true });
  let refreshes = 0;
  await page.route("**/api/v1/auth/refresh", (route) => {
    refreshes++;
    return refreshes === 1
      ? route.fulfill({ json: { access_token: "old", expires_in: 60 } })
      : route.fulfill({ status: 503 });
  });
  await page.goto("/student/practice");
  await expect(
    page.getByRole("heading", { name: "我的学习任务" })
  ).toBeVisible();
  await page.clock.fastForward(30_000);
  const message = "会话刷新结果尚未确认，请重新登录；当前操作请先查看结果";
  await expect(page.getByText(message)).toBeVisible();
  const reread = page.waitForResponse(
    (response) => new URL(response.url()).pathname === "/api/v1/me"
  );
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await reread;
  await expect(page.getByText(message)).toBeVisible();
  expect(refreshes).toBe(2);
  await expect(
    page.getByRole("heading", { name: "我的学习任务" })
  ).toBeVisible();
});
