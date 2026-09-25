import { expect, test } from "@playwright/test";

const profile = {
  id: "a1",
  phone: "13800138000",
  display_name: "管理员",
  role: "super_admin",
  can_publish_lexicon: true,
  permissions: [],
  preferences: { dialect: "uk" }
};

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
  await expect(page.getByText("暂时无法恢复会话，请重试")).toBeVisible();
  await page.getByLabel("手机号", { exact: true }).fill("13800138000");
  await page
    .getByLabel("登录密码", { exact: true })
    .fill("Correct!Password731");
  await page.getByLabel("验证码", { exact: true }).fill("000000");
  await page.getByRole("button", { name: "登 录", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByText("加载中...", { exact: true })).toHaveCount(0);
  await expect(page.getByText("暂时无法恢复会话，请重试")).toHaveCount(0);
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
      await expect(page).toHaveURL(/\/$/);
      expect(changes).toBe(2);
      await expect
        .poll(() => refreshes)
        .toBe(baseline + (code === "invalid_token" ? 1 : 0) + (forced ? 1 : 0));
      await expect(page.getByText("加载中...", { exact: true })).toHaveCount(0);
    });
  }
}

test("主动刷新 503 不丢表单，联网恢复后继续会话", async ({ page }) => {
  await page.clock.install();
  let refreshes = 0;
  let available = false;
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh")) {
      refreshes++;
      if (refreshes > 1 && !available) return route.fulfill({ status: 503 });
      return route.fulfill({ json: { access_token: "token", expires_in: 60 } });
    }
    if (path.endsWith("/profile")) return route.fulfill({ json: profile });
    return route.fulfill({ json: {} });
  });
  await page.goto("/change-password");
  await expect(page.getByLabel("当前密码", { exact: true })).toBeVisible();
  await page.getByLabel("当前密码", { exact: true }).fill("Unsubmitted!731");
  await page.clock.fastForward(30_000);
  await expect(page.getByText("连接暂时中断，当前内容已保留")).toBeVisible();
  await expect(page.getByLabel("当前密码", { exact: true })).toHaveValue(
    "Unsubmitted!731"
  );
  await page.screenshot({
    path: test.info().outputPath("refresh-offline.png")
  });
  await expect(page).toHaveURL(/\/change-password$/);
  available = true;
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await expect(page.getByText("连接暂时中断，当前内容已保留")).toHaveCount(0);
  await expect.poll(() => refreshes).toBe(3);
  await expect(page.getByLabel("当前密码", { exact: true })).toHaveValue(
    "Unsubmitted!731"
  );
  expect(errors).toEqual([]);
});

test("恢复 503 保留原 URL 且不放行后台，重试后恢复", async ({ page }) => {
  let available = false;
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/auth/refresh"))
      return available
        ? route.fulfill({ json: { access_token: "token", expires_in: 900 } })
        : route.fulfill({ status: 503 });
    if (path.endsWith("/profile")) return route.fulfill({ json: profile });
    return route.fulfill({ json: {} });
  });
  await page.goto("/settings/profile");
  await expect(page.getByText("暂时无法恢复会话，请重试")).toBeVisible();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await expect(page.getByRole("button", { name: "重试连接" })).toBeEnabled();
  available = true;
  await page.getByRole("button", { name: "重试连接" }).click();
  await expect(page.getByText("暂时无法恢复会话，请重试")).toHaveCount(0);
  await expect(page.getByText("加载中...", { exact: true })).toHaveCount(0);
  await expect(page).toHaveURL(/\/settings\/profile$/);
});
