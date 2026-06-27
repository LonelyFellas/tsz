import { expect, test } from "@playwright/test";

test("首页可达并能进入词表", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "天生会背" })).toBeVisible();
  await page.getByRole("link", { name: "浏览词表" }).click();
  await expect(page).toHaveURL(/\/wordlists/);
  await expect(page.getByRole("heading", { name: "词表" })).toBeVisible();
});

test("创建词表向导可走通(私密)", async ({ page }) => {
  await page.goto("/wordlists/new");
  await expect(page.getByRole("heading", { name: "创建词表" })).toBeVisible();

  // 1/3 选词:勾第一个智能词库词汇后「下一步」可用。
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "下一步" }).click();

  // 2/3 命名。
  await page.getByPlaceholder("例如:小学一年级核心词").fill("E2E 冒烟词表");
  await page.getByRole("button", { name: "下一步" }).click();

  // 3/3 公开设置:默认私密,直接完成创建。
  await page.getByRole("button", { name: "完成创建" }).click();

  // 完成页显示成功文案。
  await expect(page.getByRole("heading", { name: /创建成功/ })).toBeVisible();
  await expect(page.getByText("已保存为私密词表。")).toBeVisible();
});
