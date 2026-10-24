import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

for (const width of [375, 1280]) {
  test(`登录态落地页通过齿轮设置主题并在刷新后保留（${width}px）`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, { authenticated: true });
    await page.goto("/");
    await page.getByRole("button", { name: "偏好设置", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "偏好设置" });
    await expect(settings).toBeVisible();
    expect(
      await settings.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      })
    ).toBe(true);
    await settings.getByRole("button", { name: "深色", exact: true }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "偏好设置", exact: true }).click();
    await expect(
      settings.getByRole("button", { name: "深色", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "偏好设置", exact: true })
    ).toBeFocused();
    await page.getByRole("button", { name: "账户菜单" }).click();
    await expect(
      page.getByRole("menuitem", { name: /浅色模式|深色模式/ })
    ).toHaveCount(0);
  });
}
