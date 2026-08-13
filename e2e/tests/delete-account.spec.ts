import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

test.describe("注销账号端到端流程", () => {
  test("首页 → 注销账号 → 验证码 → 确认注销 → 跳回登录并提示", async ({
    page
  }) => {
    await mockApi(page, { authenticated: true });

    await page.goto("/");

    // 登录态下首页顶栏头像菜单内出现「注销账号」入口。
    await page.getByRole("button", { name: "账户菜单" }).click();
    await page.getByRole("link", { name: "注销账号" }).click();
    await expect(page).toHaveURL(/\/account\/delete/);
    await expect(page.getByRole("heading", { name: "注销账号" })).toBeVisible();

    // 默认手机渠道：获取验证码 → 填验证码 → 确认注销。
    await page.getByRole("button", { name: "获取验证码" }).click();
    await expect(page.getByRole("status")).toContainText("验证码申请已受理");
    await page.getByPlaceholder("6 位数字验证码").fill("000000");
    await page.getByRole("button", { name: "继续注销" }).click();
    const dialog = page.getByRole("dialog", { name: /最后确认/ });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "确认永久注销" }).click();

    // 注销成功后跳回登录页并展示成功提示。
    await expect(page).toHaveURL(/\/login\?deleted=success/);
    await expect(page.getByText("账号已注销成功。")).toBeVisible();
  });

  test("同时绑定手机/邮箱时可切换渠道注销", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockApi(page, { authenticated: true });

    await page.goto("/account/delete");
    await expect(page.getByRole("heading", { name: "注销账号" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true);

    // 切到邮箱渠道，展示在档邮箱并完成注销。
    await page.getByLabel(/邮箱验证/).check();
    await expect(page.getByText("alice@example.com")).toBeVisible();

    await page.getByRole("button", { name: "获取验证码" }).click();
    await page.getByPlaceholder("6 位数字验证码").fill("000000");
    await page.getByRole("button", { name: "继续注销" }).click();
    await page.getByRole("button", { name: "确认永久注销" }).click();

    await expect(page).toHaveURL(/\/login\?deleted=success/);
  });
});
