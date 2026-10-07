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
      "天生币：0",
      "学习工作台",
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
    expect(measurement.zIndex).toBe("40");
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

test.describe("注销申请与撤销", () => {
  for (const width of [375, 1280]) {
    test(`主动确认72小时规则，刷新恢复申请并撤销（${width}px）`, async ({
      page
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockApi(page, { authenticated: true });
      await page.goto("/account/delete");
      await page.getByRole("button", { name: "获取验证码" }).click();
      await page.getByPlaceholder("6 位数字验证码").fill("000000");
      await page.getByRole("button", { name: "下一步" }).click();
      const dialog = page.getByRole("dialog", { name: "确认提交注销申请？" });
      await expect(dialog.getByRole("checkbox")).not.toBeChecked();
      await expect(
        dialog.getByRole("button", { name: "提交注销申请" })
      ).toBeDisabled();
      await dialog.getByRole("checkbox").check();
      await dialog.getByRole("button", { name: "提交注销申请" }).click();
      await expect(
        page.getByRole("heading", { name: "注销申请等待生效" })
      ).toBeVisible();
      await expect(page).toHaveURL(/\/account\/delete$/);
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "注销申请等待生效" })
      ).toBeVisible();
      await page.getByRole("button", { name: "撤销注销申请" }).click();
      await expect(
        page.getByRole("heading", { name: "注销账号" })
      ).toBeVisible();
      await expect(page.getByRole("status")).toContainText("余额保持不变");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth
        )
      ).toBe(true);
    });
  }
});
