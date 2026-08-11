import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_E2E_DETECTIONS_PATH,
  ADMIN_E2E_ENTRIES_PATH,
  ADMIN_E2E_WORD_ID,
  mockAdminApi,
  type MockAdminApiController,
  type MockAdminApiOptions
} from "./support/mockAdminApi";

async function createCenterDraft(
  page: Page,
  options: MockAdminApiOptions = {}
): Promise<MockAdminApiController> {
  const api = await mockAdminApi(page, options);
  await page.goto("/words");
  await page.getByRole("button", { name: "创建单词" }).click();
  await expect(page).toHaveURL(/\/words\/new$/);

  await page.getByPlaceholder("例如 center").fill("center");
  await page.getByRole("button", { name: "词典检测" }).click();
  await expect(page.getByText("已匹配", { exact: true })).toBeVisible();
  await expect(page.getByLabel("英式主词")).toHaveValue("centre");
  await expect(page.getByLabel("美式主词")).toHaveValue("center");

  await page.getByRole("button", { name: "确认并进入词形与发音" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms$`)
  );
  await expect(page.getByRole("heading", { name: "词形与发音" })).toBeVisible();
  return api;
}

test.describe("admin 新建单词 V2", () => {
  test("T19 center 四步发布后回列表并进入只读预览", async ({ page }) => {
    const api = await createCenterDraft(page);

    await page.getByRole("button", { name: "完成并进入词义与例句" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/meanings$`)
    );
    await expect(
      page.getByRole("heading", { name: "词义与例句" })
    ).toBeVisible();

    await page.getByRole("button", { name: "完成并进入预览" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/preview$`)
    );
    await expect(page.getByText("完整性检查通过，可以提交生效")).toBeVisible();

    await page
      .locator(".word-step-actions")
      .getByRole("button", { name: "提交生效" })
      .click();
    await expect(page).toHaveURL(/\/words$/);

    const publishedRow = page
      .getByRole("row")
      .filter({ hasText: "center" })
      .filter({ hasText: "已发布" })
      .first();
    await expect(publishedRow).toBeVisible();
    await publishedRow
      .getByRole("button", { name: /查\s*看/ })
      .first()
      .click();

    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/preview$`)
    );
    await expect(page.getByRole("heading", { name: "词条详情" })).toBeVisible();
    await expect(page.getByText("词条已发布", { exact: true })).toBeVisible();

    expect(api.getWord()?.status).toBe("published");
    expect(api.count("POST", ADMIN_E2E_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_E2E_ENTRIES_PATH)).toBe(1);
    expect(
      api.count(
        "POST",
        `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/publications`
      )
    ).toBe(1);
  });

  test("T20 duplicate 检测阻断创建且保留重复项入口", async ({ page }) => {
    const api = await mockAdminApi(page, { duplicate: true });
    await page.goto("/words/new");

    await page.getByPlaceholder("例如 center").fill("color");
    await page.getByRole("button", { name: "词典检测" }).click();

    await expect(page.getByText("已存在重复词条")).toBeVisible();
    await expect(page.getByRole("link", { name: "colour (uk)" })).toBeVisible();
    await expect(page.getByRole("link", { name: "color (us)" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "确认并进入词形与发音" })
    ).toBeDisabled();

    expect(api.count("POST", ADMIN_E2E_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_E2E_ENTRIES_PATH)).toBe(0);
    expect(api.getWord()).toBeUndefined();
  });

  test("T20 forms 保存失败保值，重试成功后刷新恢复 meanings", async ({
    page
  }) => {
    const api = await createCenterDraft(page, {
      failFormsSaveOnce: true
    });
    const complete = page.getByRole("button", {
      name: "完成并进入词义与例句"
    });

    await complete.click();
    await expect(page.getByText("临时保存失败")).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms$`)
    );
    await expect(page.getByLabel("英式词形拼写").first()).toHaveValue("centre");

    await complete.click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/meanings$`)
    );
    const detailReadsBeforeReload = api.count(
      "GET",
      `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}`
    );

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "词义与例句" })
    ).toBeVisible();
    await expect
      .poll(() =>
        api.count("GET", `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}`)
      )
      .toBeGreaterThan(detailReadsBeforeReload);
    expect(
      api.count(
        "PUT",
        `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms`
      )
    ).toBe(2);
    expect(api.getWord()?.max_reachable_step).toBe("meanings");
  });
});
