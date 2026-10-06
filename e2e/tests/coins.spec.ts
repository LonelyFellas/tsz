import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";
const id = "00000000-0000-4000-8000-000000000001";
for (const width of [375, 1280]) {
  test(`未完成引导的旧钱包链接显示真实查询状态（${width}px）`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, { authenticated: true, onboarded: false });
    let failed = false;
    await page.route("**/api/v1/me/coins/**", async (route) => {
      if (failed)
        return route.fulfill({ status: 503, json: { code: "internal_error" } });
      if (new URL(route.request().url()).pathname.endsWith("wallet"))
        return route.fulfill({
          json: {
            owner_type: "user",
            owner_id: id,
            balance: "9007199254740993",
            status: "deletion_pending"
          }
        });
      return route.fulfill({
        json: {
          items: [],
          snapshot: "0",
          pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
        }
      });
    });
    await page.goto("/student/coins");
    await expect(page).toHaveURL(/\/account\/coins$/);
    await expect(page.getByText("9,007,199,254,740,993 天生币")).toBeVisible();
    await expect(page.getByText(/钱包已暂停全部/)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth
      )
    ).toBe(true);
    failed = true;
    await page.getByRole("button", { name: "刷新" }).click();
    await expect(page.getByText(/余额加载失败/)).toBeVisible({
      timeout: 15000
    });
    await expect(page.getByText("0 天生币", { exact: true })).toHaveCount(0);
  });
}
