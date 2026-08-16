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
  await expect(page).toHaveURL(/\/words\/new\?kind=word$/);

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
  test("创建入口向导显示单词、短语与中性语义", async ({ page }) => {
    await mockAdminApi(page);

    await page.goto("/words");
    await page.getByRole("button", { name: "创建单词" }).click();
    await expect(page).toHaveURL(/\/words\/new\?kind=word$/);
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建单词"
    );
    await page.reload();
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建单词"
    );

    await page.goBack();
    await page.getByRole("button", { name: "创建短语" }).click();
    await expect(page).toHaveURL(/\/words\/new\?kind=phrase$/);
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建短语"
    );
    await page.reload();
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建短语"
    );
    await page.goBack();
    await expect(page).toHaveURL(/\/words$/);
    await page.goForward();
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建短语"
    );

    await page.goto("/words/new");
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建词条"
    );
  });

  test("T19 center 四步发布后回列表并进入只读预览", async ({ page }) => {
    const api = await createCenterDraft(page);

    await page.getByRole("button", { name: "完成并进入词义与例句" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/meanings$`)
    );
    await expect(
      page.getByRole("heading", { name: "词义与例句" })
    ).toBeVisible();

    const definition = page.getByLabel("中文释义").first();
    const translation = page.getByLabel("汉语译文").first();
    await definition.fill("浏览器烟测更新后的中文释义");
    await translation.fill("浏览器烟测更新后的汉语译文。");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("草稿已保存")).toBeVisible();

    await page.reload();
    await expect(definition).toHaveValue("浏览器烟测更新后的中文释义");
    await expect(translation).toHaveValue("浏览器烟测更新后的汉语译文。");

    await page.getByRole("button", { name: "完成并进入预览" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/preview$`)
    );
    await expect(page.getByText("完整性检查通过，可以提交生效")).toBeVisible();
    const revisionBeforePublish = api.getWord()?.revision;

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
    expect(api.getWord()?.revision).toBe(revisionBeforePublish);
    expect(api.getWord()?.published_revision).toBe(revisionBeforePublish);
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
    const archivedEntry = page.getByRole("link", {
      name: /colour \(uk\).*已归档/
    });
    await expect(archivedEntry).toHaveAttribute(
      "href",
      "/words/existing-colour/wizard/basics"
    );
    await expect(archivedEntry).toHaveAttribute("target", "_blank");
    const publishedEntry = page.getByRole("link", {
      name: /color \(us\).*已发布/
    });
    await expect(publishedEntry).toHaveAttribute("target", "_blank");
    await expect(page.getByText("归档词条仍占用词头")).toBeVisible();
    await expect(
      page.getByText(
        "点击上方重复词条会在新标签页打开详情，也可以在归档列表中定位。"
      )
    ).toBeVisible();
    const archivedList = page.getByRole("link", {
      name: "在归档列表查看（新标签页打开）"
    });
    await expect(archivedList).toHaveAttribute(
      "href",
      "/words?keyword=colour&status=archived"
    );
    await expect(archivedList).toHaveAttribute("target", "_blank");

    const [existingEntryPage] = await Promise.all([
      page.waitForEvent("popup"),
      archivedEntry.click()
    ]);
    await expect(existingEntryPage).toHaveURL(
      /\/words\/existing-colour\/wizard\/basics$/
    );
    await expect(page).toHaveURL(/\/words\/new$/);
    await expect(page.getByPlaceholder("例如 center")).toHaveValue("color");
    await expect(page.getByText("已存在重复词条")).toBeVisible();
    await existingEntryPage.close();
    await expect(
      page.getByRole("button", { name: "确认并进入词形与发音" })
    ).toHaveCount(0);

    expect(api.count("POST", ADMIN_E2E_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_E2E_ENTRIES_PATH)).toBe(0);
    expect(api.getWord()).toBeUndefined();
  });

  for (const scenario of [
    {
      headword: "workspace",
      matchLabel: "已存在同名主词"
    },
    {
      headword: "workspaces",
      matchLabel: "本次主词已作为已有词条的词形存在"
    }
  ]) {
    test(`surface warning：${scenario.headword} 加载全部页并确认后继续创建`, async ({
      page
    }) => {
      const api = await mockAdminApi(page, { surfaceWarnings: true });
      await page.goto("/words/new");

      const input = page.getByPlaceholder("例如 center");
      await input.fill(scenario.headword);
      await page.getByRole("button", { name: "词典检测" }).click();

      await expect(
        page.getByText("发现同名或同形词条，请确认后再继续")
      ).toBeVisible();
      await expect(page.getByText("已加载 3/3 条匹配来源。")).toBeVisible();
      await expect(page.getByText(scenario.matchLabel).first()).toBeVisible();
      const archivedLinks = page.getByRole("link", {
        name: /existing-workspace-archived-[ab]，在新标签页打开/
      });
      await expect(archivedLinks).toHaveCount(2);

      const [existingEntryPage] = await Promise.all([
        page.waitForEvent("popup"),
        archivedLinks.first().click()
      ]);
      await expect(existingEntryPage).toHaveURL(
        /\/words\/existing-workspace-archived-a\/wizard\/basics$/
      );
      await expect(page).toHaveURL(/\/words\/new$/);
      await expect(input).toHaveValue(scenario.headword);
      await expect(
        page.getByText("发现同名或同形词条，请确认后再继续")
      ).toBeVisible();
      await existingEntryPage.close();

      await page.getByRole("button", { name: "仍继续创建" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms$`)
      );
      const createRequest = api.requests.find(
        (request) =>
          request.method === "POST" && request.path === ADMIN_E2E_ENTRIES_PATH
      );
      expect(createRequest?.body).toMatchObject({
        detection_id: `detect-${scenario.headword}`,
        confirmed_surface_match_token: `surface-token-${scenario.headword}`
      });

      await page.goto(`/words/${ADMIN_E2E_WORD_ID}/wizard/basics`);
      await expect(
        page.getByText("创建时发现同名或同形词条，管理员已确认继续")
      ).toBeVisible();
      await expect(
        page.getByText("已确认 3 条匹配，当前展示 3 条摘要。")
      ).toBeVisible();
      await expect(
        page.getByRole("link", {
          name: "workspace existing-workspace-archived-a，在新标签页打开"
        })
      ).toHaveAttribute(
        "href",
        "/words/existing-workspace-archived-a/wizard/basics"
      );
      await expect(
        page.getByText("内置词典已匹配，智能词库创建时未发现重复项。")
      ).toHaveCount(0);
    });
  }

  test("surface warning：410 后清 token、保留输入、换新 key 并重新检测成功", async ({
    page
  }) => {
    const api = await mockAdminApi(page, {
      surfaceWarnings: true,
      expireSurfaceSnapshotOnce: true
    });
    await page.goto("/words/new");
    const input = page.getByPlaceholder("例如 center");
    await input.fill("workspace");
    await page.getByRole("button", { name: "词典检测" }).click();
    await expect(page.getByText("已加载 3/3 条匹配来源。")).toBeVisible();

    await page.getByRole("button", { name: "仍继续创建" }).click();
    await expect(page.getByText("检测结果已过期，请重新检测")).toBeVisible();
    await expect(input).toHaveValue("workspace");
    await expect(page.getByText("等待检测")).toBeVisible();

    await page.getByRole("button", { name: "词典检测" }).click();
    await expect(page.getByText("已加载 3/3 条匹配来源。")).toBeVisible();
    await page.getByRole("button", { name: "仍继续创建" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms$`)
    );

    const attempts = api.requests.filter(
      (request) =>
        request.method === "POST" && request.path === ADMIN_E2E_ENTRIES_PATH
    );
    expect(attempts).toHaveLength(2);
    expect(attempts[0]!.idempotencyKey).toBeTruthy();
    expect(attempts[1]!.idempotencyKey).toBeTruthy();
    expect(attempts[1]!.idempotencyKey).not.toBe(attempts[0]!.idempotencyKey);
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
