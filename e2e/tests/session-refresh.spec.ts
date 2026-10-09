import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

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
  await page.getByRole("button", { name: "账户菜单" }).click();
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
      refreshes++;
      if (available) return route.fallback();
      return failure === "offline"
        ? route.abort("internetdisconnected")
        : route.fulfill({ status: Number(failure) });
    });
    await page.goto("/student/practice");
    const message =
      failure === "429"
        ? "暂时无法恢复会话，请重试"
        : "会话刷新结果尚未确认，请重新登录；当前操作请先查看结果";
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
    if (failure === "429") {
      await page.getByRole("button", { name: "重试连接" }).click();
    } else {
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.reload();
      await expect(page.getByText(message)).toBeVisible();
      expect(refreshes).toBe(1);
      await page.getByRole("button", { name: "重新登录" }).click();
      await expect(page).toHaveURL(/\/login$/);
      await expect(
        page.getByRole("button", { name: "立即登录" })
      ).toBeVisible();
      expect(refreshes).toBe(1);
      await page.getByLabel("手机号或邮箱").fill("student@example.com");
      await page.getByLabel("密码", { exact: true }).fill("RawCase!234");
      await page.getByRole("button", { name: "立即登录" }).click();
      await expect(
        page.getByRole("button", { name: "账户菜单" })
      ).toBeVisible();
      expect(
        await page.evaluate(() =>
          sessionStorage.getItem("tsz:refresh-unconfirmed:/api/v1")
        )
      ).toBeNull();
      expect(refreshes).toBe(1);
      await page.goto("/student/practice");
    }
    await expect(page.getByText(message)).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "我的学习任务" })
    ).toBeVisible();
    expect(refreshes).toBe(2);
    await expect(page).toHaveURL(/\/student\/practice$/);
  });
}

test("主动刷新结果未确认时，成功回读资料也保留重新登录提示", async ({
  page
}) => {
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
