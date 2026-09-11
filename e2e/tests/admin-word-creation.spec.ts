import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_V3_DETECTIONS_PATH,
  ADMIN_V3_ENTRIES_PATH,
  ADMIN_V3_NEW_WORD_ID,
  mockAdminV3Api
} from "./support/mockAdminV3Api";

async function confirmDetectedCreation(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: "确认并创建，进入词形与发音" })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "继续创建" }).click();
}

test.describe("统一 V3 创建流程", () => {
  test("创建入口统一输入并自动分流单词与短语", async ({ page }) => {
    await mockAdminV3Api(page);

    await page.goto("/words");
    await expect(page.getByRole("button", { name: "创建词条" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "创建单词" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "创建短语" })).toHaveCount(0);

    await page.getByRole("button", { name: "创建词条" }).click();
    await expect(page).toHaveURL(/\/words\/new$/);
    await expect(
      page.getByRole("heading", { name: "创建新词条" })
    ).toBeVisible();
    await expect(page.getByPlaceholder("例如 center 或 give up")).toBeVisible();
    await expect(page.getByRole("button", { name: "词典检测" })).toBeVisible();
  });

  test("T20 短语重复检查保留候选详情并经二次确认独立创建", async ({ page }) => {
    const api = await mockAdminV3Api(page, {
      duplicate: true,
      entryKind: "phrase"
    });
    await page.goto("/words/new");

    const input = page.getByPlaceholder("例如 center 或 give up");
    await input.fill("true color");
    await page.getByRole("button", { name: "词典检测" }).click();

    await expect(page.getByText("原形检测")).toBeVisible();
    await expect(page.getByText("已发现")).toBeVisible();
    const duplicateButtons = page.getByText("查看已有原形");
    await expect(duplicateButtons).toHaveCount(2);
    await duplicateButtons.first().click();
    await expect(page.getByText("原形：colour", { exact: true })).toBeVisible();
    await expect(
      page.getByText("垃圾桶", { exact: true }).first()
    ).toBeVisible();
    await expect(page).toHaveURL(/\/words\/new$/);
    await expect(input).toHaveValue("true color");
    await confirmDetectedCreation(page);
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );

    expect(api.count("POST", ADMIN_V3_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_V3_ENTRIES_PATH)).toBe(1);
    expect(api.getWord()).toMatchObject({ kind: "phrase" });
  });

  for (const scenario of [
    {
      headword: "workspace"
    },
    {
      headword: "workspaces"
    }
  ]) {
    test(`surface warning：${scenario.headword} 加载全部页并确认后继续创建`, async ({
      page
    }) => {
      const api = await mockAdminV3Api(page, {
        surfaceWarnings: true,
        entryKind: "phrase"
      });
      await page.goto("/words/new");

      const input = page.getByPlaceholder("例如 center 或 give up");
      const phrase = `${scenario.headword} phrase`;
      await input.fill(phrase);
      const detectionResponsePromise = page.waitForResponse(
        (response) =>
          response.request().method() === "POST" &&
          new URL(response.url()).pathname.endsWith(ADMIN_V3_DETECTIONS_PATH)
      );
      await page.getByRole("button", { name: "词典检测" }).click();
      await expect(await (await detectionResponsePromise).json()).toMatchObject(
        {
          request: { kind: "phrase", surface: phrase },
          surface_match_page: {
            items: [
              { match: { entry_kind: "phrase" } },
              { match: { entry_kind: "phrase" } }
            ]
          }
        }
      );

      await expect(page.getByText("原形检测")).toBeVisible();
      const archivedButtons = page.getByText("查看已有原形");
      await expect(archivedButtons).toHaveCount(3);
      await expect(
        page.getByRole("button", { name: "确认并创建，进入词形与发音" })
      ).toBeEnabled();
      await archivedButtons.first().click();
      await expect(page.getByText("workspace").first()).toBeVisible();
      await expect(page.getByText("垃圾桶").first()).toBeVisible();
      await expect(page).toHaveURL(/\/words\/new$/);
      await expect(input).toHaveValue(phrase);

      await confirmDetectedCreation(page);
      await expect(page).toHaveURL(
        new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
      );
      const createRequest = api.requests.find(
        (request) =>
          request.method === "POST" && request.path === ADMIN_V3_ENTRIES_PATH
      );
      expect(createRequest?.body).toMatchObject({
        kind: "phrase",
        confirmed_surface_match_token: `surface-token-${phrase}`
      });
      expect(api.getWord()).toMatchObject({
        kind: "phrase"
      });
    });
  }

  test("surface warning：410 后清 token、保留输入、换新 key 并重新检测成功", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page, {
      surfaceWarnings: true,
      expireSurfaceSnapshotOnce: true,
      entryKind: "phrase"
    });
    await page.goto("/words/new");
    const input = page.getByPlaceholder("例如 center 或 give up");
    await input.fill("workspace phrase");
    await page.getByRole("button", { name: "词典检测" }).click();
    await expect(page.getByText("查看已有原形")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "确认并创建，进入词形与发音" })
    ).toBeEnabled();

    await confirmDetectedCreation(page);
    await expect(page.getByText("检查结果已变化，请重新提交。")).toBeVisible();
    await expect(input).toHaveValue("workspace phrase");

    await page.getByRole("button", { name: "词典检测" }).click();
    await expect(page.getByText("查看已有原形")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "确认并创建，进入词形与发音" })
    ).toBeEnabled();
    await confirmDetectedCreation(page);
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );

    const attempts = api.requests.filter(
      (request) =>
        request.method === "POST" && request.path === ADMIN_V3_ENTRIES_PATH
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.idempotency_key).toBeTruthy();
    expect(attempts[1]!.idempotency_key).toBeTruthy();
    expect(attempts[1]!.idempotency_key).not.toBe(attempts[0]!.idempotency_key);
  });
});
