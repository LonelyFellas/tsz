import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

for (const width of [375, 1280]) {
  test(`个人中心账户菜单不被资料卡遮挡（${width}px）`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, { authenticated: true });
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: "个人中心" })).toBeVisible();
    await page.getByRole("button", { name: "账户菜单" }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    const expectedItems = [
      "进入学生工作台",
      "个人中心",
      "站内通知",
      "申请教师认证",
      "深色模式",
      "退出登录"
    ];
    await expect(menu.getByRole("menuitem")).toHaveText(expectedItems);
    const measurement = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        outsidePage: !element.closest("header, main"),
        zIndex: getComputedStyle(element).zIndex,
        fitsViewport: rect.left >= 0 && rect.right <= innerWidth,
        hits: Array.from(
          element.querySelectorAll<HTMLElement>("[role='menuitem']")
        ).map((item) => {
          const r = item.getBoundingClientRect();
          return [r.left + 16, r.left + r.width / 2].every((x) => {
            const hit = document.elementFromPoint(x, r.top + r.height / 2);
            return hit !== null && item.contains(hit);
          });
        })
      };
    });
    expect(measurement.outsidePage).toBe(true);
    expect(measurement.zIndex).toBe("50");
    expect(measurement.fitsViewport).toBe(true);
    expect(measurement.hits).toHaveLength(expectedItems.length);
    expect(measurement.hits.every(Boolean)).toBe(true);
    await page.getByRole("menuitem", { name: "站内通知" }).click();
    await expect(page).toHaveURL(/\/account\/notifications$/);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(
      page.getByText("暂无站内通知，认证结果会显示在这里。")
    ).toBeVisible();
  });
}

test.describe("注销账号端到端流程", () => {
  test("首页 → 个人中心 → 账号安全 → 注销 → 跳回登录并提示", async ({
    page
  }) => {
    await mockApi(page, { authenticated: true });

    await page.goto("/");

    // 注销入口收在个人中心的账号安全页，头像菜单不直接暴露。
    await page.getByRole("button", { name: "账户菜单" }).click();
    await expect(page.getByRole("menuitem", { name: "注销账号" })).toHaveCount(
      0
    );
    await page.getByRole("menuitem", { name: "个人中心" }).click();
    await page.getByRole("link", { name: /账号安全/ }).click();
    await page.getByRole("link", { name: "了解注销流程" }).click();
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
