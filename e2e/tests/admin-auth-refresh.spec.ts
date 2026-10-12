import { expect, test } from "@playwright/test";
import type { AdminProfile } from "@tsz/types";

const profile = {
  id: "a1",
  phone: "13800138000",
  display_name: "管理员",
  role: "super_admin",
  can_publish_lexicon: true,
  permission_version: 1,
  catalog_version: "permission-e2e-v1",
  permissions: [],
  preferences: { dialect: "uk" }
} satisfies AdminProfile;

test("旧 profile 缺少权限版本时失败关闭，不请求业务数据", async ({ page }) => {
  const legacyProfile: Partial<AdminProfile> = { ...profile };
  delete legacyProfile.permission_version;
  delete legacyProfile.catalog_version;
  let businessRequests = 0;
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh"))
      return route.fulfill({
        json: { access_token: "legacy-token", expires_in: 900 }
      });
    if (path.endsWith("/profile"))
      return route.fulfill({ json: legacyProfile });
    businessRequests++;
    return route.fulfill({ status: 501 });
  });
  await page.goto("/words");
  await expect(
    page.getByText("当前后台版本不支持权限设置，请升级后台服务后再登录")
  ).toBeVisible();
  await expect(page.getByText("后台服务暂不可用")).toBeVisible();
  expect(businessRequests).toBe(0);
});

test("初始恢复 503 后手动登录可进入后台，不永久停在加载态", async ({
  page
}) => {
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh")) return route.fulfill({ status: 503 });
    if (path.endsWith("/auth/login"))
      return route.fulfill({
        json: {
          access_token: "login",
          expires_in: 900,
          must_change_password: false
        }
      });
    if (path.endsWith("/profile")) return route.fulfill({ json: profile });
    return route.fulfill({ json: {} });
  });
  await page.goto("/login?redirect=/settings/profile");
  await expect(page.getByText("正在恢复连接，联网后将自动继续")).toBeVisible();
  await page.getByLabel("手机号", { exact: true }).fill("13800138000");
  await page
    .getByLabel("登录密码", { exact: true })
    .fill("Correct!Password731");
  await page.getByLabel("验证码", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "登 录", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByText("加载中...", { exact: true })).toHaveCount(0);
  await expect(page.getByText("正在恢复连接，联网后将自动继续")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "个人设置" })).toBeVisible();
});

for (const forced of [false, true]) {
  for (const code of ["invalid_credentials", "invalid_token"]) {
    test(`${forced ? "强制" : "自助"}改密 ${code} 的请求次数与恢复`, async ({
      page
    }) => {
      let refreshes = 0;
      let changes = 0;
      let changed = false;
      await page.route("**/api/v1/admin/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path.endsWith("/auth/refresh")) {
          refreshes++;
          if (changed)
            return route.fulfill({
              status: 401,
              json: { code: "invalid_refresh_token", detail: "session revoked" }
            });
          return route.fulfill({
            json: { access_token: `token-${refreshes}`, expires_in: 900 }
          });
        }
        if (path.endsWith("/profile")) {
          return forced && !changed
            ? route.fulfill({
                status: 403,
                json: {
                  code: "must_change_password",
                  detail: "password change required"
                }
              })
            : route.fulfill({ json: profile });
        }
        if (path.endsWith("/auth/change-password")) {
          changes++;
          if (changes === 1)
            return route.fulfill({
              status: 401,
              json: { code, detail: "credentials rejected" }
            });
          changed = true;
          return route.fulfill({ status: 204 });
        }
        return route.fulfill({ json: {} });
      });
      await page.goto("/change-password");
      await expect(
        page.getByRole("heading", {
          name: forced ? "请先修改初始密码" : "修改密码"
        })
      ).toBeVisible();
      await expect(page.getByText("暂时无法恢复会话，请重试")).toHaveCount(0);
      const baseline = refreshes;
      await page
        .getByLabel(forced ? "临时密码" : "当前密码", { exact: true })
        .fill("WrongCurrent!731");
      await page
        .getByLabel("新密码", { exact: true })
        .fill("Cobalt!7492Quartz");
      await page
        .getByLabel("确认新密码", { exact: true })
        .fill("Cobalt!7492Quartz");
      await page.getByRole("button", { name: "确认修改" }).click();
      if (code === "invalid_credentials") {
        await expect(
          page.getByText(forced ? "临时密码不正确" : "当前密码不正确", {
            exact: true
          })
        ).toBeVisible();
        expect(changes).toBe(1);
        expect(refreshes).toBe(baseline);
        await expect(page).toHaveURL(/\/change-password$/);
        await page
          .getByLabel(forced ? "临时密码" : "当前密码", { exact: true })
          .fill("CorrectCurrent!731");
        await page.getByRole("button", { name: "确认修改" }).click();
      }
      await expect(page).toHaveURL(/\/login\?reset=success$/);
      expect(changes).toBe(2);
      await expect
        .poll(() => refreshes)
        .toBe(baseline + (code === "invalid_token" ? 1 : 0) + 1);
      await expect(page.getByText("加载中...", { exact: true })).toHaveCount(0);
      await expect(page.getByLabel("登录密码", { exact: true })).toBeVisible();
    });
  }
}

test("主动刷新 503 自动恢复会话并保留未提交表单", async ({ page }) => {
  await page.clock.install();
  let refreshes = 0;
  let available = false;
  const keys: (string | undefined)[] = [];
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh")) {
      if (route.request().method() === "HEAD")
        return route.fulfill({
          status: 204,
          headers: { "x-refresh-recovery": "v1" }
        });
      refreshes++;
      keys.push(route.request().headers()["x-refresh-request-id"]);
      if (refreshes > 1 && !available) return route.fulfill({ status: 503 });
      return route.fulfill({
        headers: { "x-refresh-recovery": "v1" },
        json: { access_token: "token", expires_in: 60 }
      });
    }
    if (path.endsWith("/profile")) return route.fulfill({ json: profile });
    return route.fulfill({ json: {} });
  });
  await page.goto("/change-password");
  await expect(page.getByLabel("当前密码", { exact: true })).toBeVisible();
  await page.getByLabel("当前密码", { exact: true }).fill("Unsubmitted!731");
  await page.clock.fastForward(30_000);
  const message = "连接暂时中断，联网后将自动恢复；当前内容已保留";
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByLabel("当前密码", { exact: true })).toHaveValue(
    "Unsubmitted!731"
  );
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText(message)).toHaveCount(0);
  expect(refreshes).toBe(3);
  expect(keys[2]).toBe(keys[1]);
  await expect(page).toHaveURL(/\/change-password$/);
  await expect(page.getByLabel("当前密码", { exact: true })).toHaveValue(
    "Unsubmitted!731"
  );
  await expect(page.getByRole("button", { name: "重新登录" })).toHaveCount(0);
});

for (const failure of ["429", "503", "offline"] as const) {
  test(`恢复 ${failure} 保留原 URL 且不放行后台`, async ({ page }) => {
    let available = false;
    let refreshes = 0;
    await page.route("**/api/v1/admin/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith("/auth/refresh")) {
        if (route.request().method() === "HEAD")
          return route.fulfill({
            status: 204,
            headers: { "x-refresh-recovery": "v1" }
          });
        refreshes++;
        if (available)
          return route.fulfill({
            json: { access_token: "token", expires_in: 900 }
          });
        return failure === "offline"
          ? route.abort("internetdisconnected")
          : route.fulfill({ status: Number(failure) });
      }
      if (path.endsWith("/auth/login"))
        return route.fulfill({
          json: {
            access_token: "login",
            expires_in: 900,
            must_change_password: false
          }
        });
      if (path.endsWith("/profile")) return route.fulfill({ json: profile });
      return route.fulfill({ json: {} });
    });
    await page.goto("/settings/profile");
    const message = "正在恢复连接，联网后将自动继续";
    await expect(page.getByText(message)).toBeVisible();
    await expect(page).toHaveURL(/\/settings\/profile$/);
    await expect(page.getByRole("heading", { name: "个人设置" })).toHaveCount(
      0
    );
    expect(refreshes).toBe(1);
    available = true;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await expect(page.getByText(message)).toHaveCount(0);
    await expect(page.getByText("加载中...", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "个人设置" })).toBeVisible();
    expect(refreshes).toBe(2);
    await expect(page).toHaveURL(/\/settings\/profile$/);
  });
}
