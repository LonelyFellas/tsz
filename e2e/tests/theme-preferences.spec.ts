import { expect, test } from "@playwright/test";
import { mockApi } from "./support/mockApi";

test("偏好子面板悬停展开，X仅关闭偏好，Escape与外部点击关闭两层", async ({
  page
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "账户菜单" });
  const menu = page.getByRole("menu");
  const preferences = menu.getByRole("menuitem", {
    name: "偏好设置",
    exact: true
  });
  const settings = page.getByRole("dialog", { name: "偏好设置" });
  await trigger.hover();
  await preferences.hover();
  await expect(settings).toBeVisible();
  await expect(menu).toBeVisible();
  await settings.getByRole("button", { name: "关闭偏好设置" }).click();
  await expect(settings).toHaveCount(0);
  await expect(menu).toBeVisible();
  await expect(preferences).toBeFocused();
  await preferences.click();
  await expect(settings).toBeVisible();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(settings).toHaveCount(0);
  await trigger.press("ArrowDown");
  await preferences.click();
  await expect(settings).toBeVisible();
  await page.getByRole("heading", { name: "天生会背", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(settings).toHaveCount(0);
});

test("未保存词表时头像导航先确认，冷加载和已展开菜单均受保护", async ({
  page
}) => {
  await mockApi(page, { authenticated: true });
  await page.goto("/account/wordlists?space=owned&mode=new");
  await page
    .getByRole("textbox", { name: "词表名称", exact: true })
    .fill("保留草稿");
  const originalUrl = page.url();
  const trigger = page.getByRole("button", { name: "账户菜单" });
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await trigger.click();
  await expect.poll(() => dialogs.length).toBe(1);
  await expect(page).toHaveURL(originalUrl);
  await expect(
    page.getByRole("textbox", { name: "词表名称", exact: true })
  ).toHaveValue("保留草稿");
  await trigger.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeVisible();
  expect(dialogs).toHaveLength(1);
  await trigger.click();
  await expect.poll(() => dialogs.length).toBe(2);
  await expect(page).toHaveURL(originalUrl);
});

test("偏好打开后缩窄窗口仍留在视口内，斜向移入不关闭", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockApi(page, { authenticated: true });
  await page.goto("/");
  const trigger = page.getByRole("button", { name: "账户菜单" });
  const preferences = page.getByRole("menuitem", {
    name: "偏好设置",
    exact: true
  });
  const settings = page.getByRole("dialog", { name: "偏好设置" });
  await trigger.hover();
  await preferences.hover();
  await expect(settings).toBeVisible();
  const target = settings.getByRole("button", { name: "深色", exact: true });
  const box = await target.boundingBox();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2, {
    steps: 30
  });
  await expect(settings).toBeVisible();
  await target.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.setViewportSize({ width: 375, height: 812 });
  await expect
    .poll(() =>
      settings.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth;
      })
    )
    .toBe(true);
  await page.keyboard.press("ArrowLeft");
  await expect(settings).toHaveCount(0);
  await expect(preferences).toBeFocused();
  await expect(page.getByRole("menu")).toBeVisible();
});

for (const path of ["/", "/account/profile"]) {
  test(`桌面头像首次点击与展开后点击均进入个人中心（${path}）`, async ({
    page
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await mockApi(page, { authenticated: true });
    const trigger = page.getByRole("button", { name: "账户菜单" });
    for (const hoverFirst of [false, true]) {
      await page.goto(path);
      if (hoverFirst) {
        await trigger.hover();
        await expect(page.getByRole("menu")).toBeVisible();
      }
      await trigger.click();
      await expect(page).toHaveURL(/\/account$/);
      await expect(
        page.getByRole("heading", { name: "个人中心" })
      ).toBeVisible();
      await expect(page.getByRole("menu")).toHaveCount(0);
    }
  });
}

test.describe("触摸账户菜单", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 375, height: 812 }
  });

  for (const path of ["/", "/account/profile"]) {
    test(`轻触头像开关菜单时保持原页，菜单链接可进入个人中心（${path}）`, async ({
      page
    }) => {
      await mockApi(page, { authenticated: true });
      await page.goto(path);
      const originalUrl = page.url();
      const trigger = page.getByRole("button", { name: "账户菜单" });
      const menu = page.getByRole("menu");
      await trigger.tap();
      await expect(menu).toBeVisible();
      await expect(page).toHaveURL(originalUrl);
      await trigger.tap();
      await expect(menu).toHaveCount(0);
      await expect(page).toHaveURL(originalUrl);
      await trigger.tap();
      await expect(menu).toBeVisible();
      await expect(page).toHaveURL(originalUrl);
      await menu.getByRole("menuitem", { name: "个人中心", exact: true }).tap();
      await expect(page).toHaveURL(/\/account$/);
      await expect(
        page.getByRole("heading", { name: "个人中心" })
      ).toBeVisible();
    });
  }
});

for (const width of [375, 1280]) {
  test(`登录态落地页通过头像设置主题并在刷新后保留（${width}px）`, async ({
    page
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, { authenticated: true });
    await page.goto("/");
    await page.getByRole("button", { name: "账户菜单" }).hover();
    await page.getByRole("menuitem", { name: "偏好设置", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "偏好设置" });
    await expect(settings).toBeVisible();
    await expect(page.getByRole("menu")).toBeVisible();
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
    await page.getByRole("button", { name: "账户菜单" }).hover();
    await page.getByRole("menuitem", { name: "偏好设置", exact: true }).click();
    await expect(
      settings.getByRole("button", { name: "深色", exact: true })
    ).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "账户菜单" })).toBeFocused();
    await page.getByRole("button", { name: "账户菜单" }).hover();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: /浅色模式|深色模式/ })
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "站内通知", exact: true }).click();
    await expect(page).toHaveURL(/\/account\/notifications$/);
    await page.getByRole("button", { name: "账户菜单" }).hover();
    await page.getByRole("menuitem", { name: "偏好设置", exact: true }).click();
    await expect(
      settings.getByRole("radio", { name: "英式英语" })
    ).toBeChecked();
    await settings.locator("label").filter({ hasText: "美式英语" }).click();
    await settings.getByRole("button", { name: "保存学习偏好" }).click();
    await expect(settings.getByText("英美偏好已保存")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.reload();
    await page.getByRole("button", { name: "账户菜单" }).hover();
    await page.getByRole("menuitem", { name: "偏好设置", exact: true }).click();
    await expect(
      settings.getByRole("radio", { name: "美式英语" })
    ).toBeChecked();
  });
}
