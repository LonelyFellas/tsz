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
  await expect(page.getByRole("heading", { name: "今日练习" })).toBeVisible();
  await page.getByRole("button", { name: "退出登录" }).click();
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
});

for (const failure of ["503", "offline"] as const) {
  test(`恢复 ${failure} 不跳登录，重试后才进入受保护页面`, async ({ page }) => {
    await mockApi(page, { authenticated: true });
    let available = false;
    let refreshes = 0;
    await page.route("**/api/v1/auth/refresh", async (route) => {
      refreshes++;
      if (available) return route.fallback();
      return failure === "503"
        ? route.fulfill({ status: 503 })
        : route.abort("internetdisconnected");
    });
    await page.goto("/student/practice");
    await expect(page.getByText("暂时无法恢复会话，请重试")).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("restore-error.png")
    });
    await expect(page).toHaveURL(/\/student\/practice$/);
    await expect(page.getByRole("heading", { name: "今日练习" })).toHaveCount(
      0
    );
    expect(refreshes).toBe(1);
    available = true;
    await page.getByRole("button", { name: "重试连接" }).click();
    await expect(page.getByText("暂时无法恢复会话，请重试")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "今日练习" })).toBeVisible();
    expect(refreshes).toBe(2);
    await expect(page).toHaveURL(/\/student\/practice$/);
  });
}
