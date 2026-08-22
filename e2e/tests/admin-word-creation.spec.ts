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
  await page.getByRole("button", { name: "创建词条" }).click();
  await expect(page).toHaveURL(/\/words\/new$/);

  await page.getByPlaceholder("例如 center").fill("center");
  await page.getByRole("button", { name: "词典检测" }).click();
  await expect(page.getByText("已匹配", { exact: true })).toBeVisible();
  // 输入侧由检测凭证锁定，管理员只确认另一侧；两侧会原样进入创建请求。
  await expect(
    page.getByText(/美式主词来自本次输入，暂不可修改/)
  ).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "区分英美词形" })
  ).toBeChecked();
  await expect(page.getByLabel("英式主词")).toHaveValue("centre");
  await expect(page.getByLabel("英式主词")).toBeEnabled();
  await expect(page.getByLabel("美式主词")).toHaveValue("center");
  await expect(page.getByLabel("美式主词")).toBeDisabled();

  await page.getByRole("button", { name: "确认并进入词形与发音" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms$`)
  );
  await expect(page.getByRole("heading", { name: "词形与发音" })).toBeVisible();
  return api;
}

test.describe("admin 新建单词 V2", () => {
  test("同名 workspace 列表保留两行并按精确 ID 查看", async ({ page }) => {
    await mockAdminApi(page, { sameHeadwordList: true });
    await page.goto("/words");

    await expect(page.getByText("workspace", { exact: true })).toHaveCount(2);
    await expect(page.getByText("a1b2c3d4", { exact: true })).toBeVisible();
    await expect(page.getByText("e5f6a7b8", { exact: true })).toBeVisible();
    await expect(page.getByText("工作空间", { exact: true })).toBeVisible();
    await expect(page.getByText("协作空间", { exact: true })).toBeVisible();

    const secondRow = page.locator("tbody tr", { hasText: "e5f6a7b8" });
    await secondRow.getByRole("button", { name: "继续创建" }).click();
    await expect(page).toHaveURL(
      /\/words\/workspace-entry-e5f6a7b8\/wizard\/forms$/
    );
  });

  test("创建入口统一为词条，并保留单词、短语直达兼容语义", async ({ page }) => {
    await mockAdminApi(page);

    await page.goto("/words");
    await expect(page.getByRole("button", { name: "创建词条" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "创建单词" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "创建短语" })).toHaveCount(0);
    await page.getByRole("button", { name: "创建词条" }).click();
    await expect(page).toHaveURL(/\/words\/new$/);
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建词条"
    );
    await page.reload();
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建词条"
    );

    await page.goto("/words/new?kind=word");
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建单词"
    );
    await page.goto("/words/new?kind=phrase");
    await expect(page.locator(".word-creation-breadcrumb")).toContainText(
      "创建短语"
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

  test("词形未完成也能先录词义：越步保存草稿后两步内容都在", async ({
    page
  }) => {
    const api = await createCenterDraft(page);
    const stepper = page.locator(".word-creation-steps");

    // 不点「完成并进入词义与例句」，直接从步骤条跳到尚未可达的第 3 步。
    await stepper.getByText("词义与例句").click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/meanings$`)
    );
    expect(api.getWord()?.max_reachable_step).toBe("forms");

    const definition = page.getByLabel("中文释义").first();
    await definition.fill("词形还没做完就先录的中文释义");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("草稿已保存")).toBeVisible();
    // 保存草稿不推进完成度：完成情况面板仍如实显示词形未完成。
    expect(api.getWord()?.completed_steps).toEqual(["basics"]);
    expect(api.getWord()?.max_reachable_step).toBe("forms");

    await stepper.getByText("词形与发音").click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms$`)
    );
    await expect(page.getByLabel("英式词形拼写").first()).toHaveValue("centre");

    await stepper.getByText("词义与例句").click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/meanings$`)
    );
    await expect(page.getByLabel("中文释义").first()).toHaveValue(
      "词形还没做完就先录的中文释义"
    );
  });

  test("F8 两个同名关联目标明确选择第二个并保存其 word_id+sense_id", async ({
    page
  }) => {
    const api = await createCenterDraft(page, { relatedSearchV2: true });
    await page.getByRole("button", { name: "完成并进入词义与例句" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/meanings$`)
    );

    await page.getByRole("button", { name: "添加近义词" }).click();
    const target = page.getByLabel("近义词目标词条");
    await target.fill("workspace");
    await expect(page.getByText("完全同名", { exact: true })).toHaveCount(2);
    await expect(
      page.getByText("word · 11111111", { exact: true })
    ).toBeVisible();
    await page.getByText("word · 22222222", { exact: true }).click();

    await page.getByLabel("近义词目标词义").click();
    await page.getByText("工作区乙二", { exact: true }).click();
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("草稿已保存")).toBeVisible();

    const savedRelation = api
      .getWord()
      ?.meanings.pos[0]?.senses[0]?.relations.at(-1);
    expect(savedRelation).toMatchObject({
      target_word_id: "22222222-workspace-second",
      target_sense_id: "workspace-second-sense-2"
    });
  });

  test("T20 duplicate 检测阻断创建且保留重复项入口", async ({ page }) => {
    const api = await mockAdminApi(page, { duplicate: true });
    await page.goto("/words/new");

    await page.getByPlaceholder("例如 center").fill("color");
    await page.getByRole("button", { name: "词典检测" }).click();

    await expect(page.getByTestId("smart-dictionary-result")).toHaveText(
      "已发现"
    );
    const duplicateButtons = page.getByRole("button", {
      name: /查看重复词条/
    });
    await expect(duplicateButtons).toHaveCount(2);
    await duplicateButtons.first().click();
    const detailDialog = page.getByRole("dialog");
    await expect(detailDialog.getByText("重复词条详情")).toBeVisible();
    await expect(detailDialog.getByText("主词")).toBeVisible();
    await expect(detailDialog.getByText("状态")).toBeVisible();
    await expect(detailDialog.getByText("词条类型")).toBeVisible();
    await expect(detailDialog.getByText("基本词性")).toBeVisible();
    await expect(detailDialog.getByText("释义预览")).toBeVisible();
    await expect(detailDialog.getByText("colour")).toBeVisible();
    await expect(detailDialog.getByText("已归档")).toBeVisible();
    await expect(page).toHaveURL(/\/words\/new$/);
    await expect(page.getByPlaceholder("例如 center")).toHaveValue("color");
    await detailDialog.getByRole("button", { name: "Close" }).click();
    await expect(detailDialog).toHaveCount(0);
    await expect(page.getByTestId("smart-dictionary-result")).toHaveText(
      "已发现"
    );
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

      await expect(page.getByTestId("smart-dictionary-result")).toHaveText(
        "已发现"
      );
      await expect(page.getByText("已加载 3/3 条匹配来源。")).toBeVisible();
      await expect(page.getByText(scenario.matchLabel).first()).toBeVisible();
      const archivedButtons = page.getByRole("button", {
        name: /workspace，查看重复词条/
      });
      await expect(archivedButtons).toHaveCount(3);
      await archivedButtons.first().click();
      const detailDialog = page.getByRole("dialog");
      await expect(detailDialog.getByText("重复词条详情")).toBeVisible();
      await expect(detailDialog.getByText("workspace")).toBeVisible();
      await expect(detailDialog.getByText("已归档")).toBeVisible();
      await expect(page).toHaveURL(/\/words\/new$/);
      await expect(input).toHaveValue(scenario.headword);
      await detailDialog.getByRole("button", { name: "Close" }).click();
      await expect(detailDialog).toHaveCount(0);
      await expect(page.getByTestId("smart-dictionary-result")).toHaveText(
        "已发现"
      );

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

  test("forms surface+impact：终页门禁、候选定位、取消保值并以双 token 保存一次", async ({
    page
  }) => {
    const api = await createCenterDraft(page, {
      formsSurfaceWarnings: true,
      formsDownstreamImpact: true,
      formsSurfaceTerminalDelayMs: 1_000
    });
    const formsPath = `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms`;
    const impactPath = `${formsPath}/impact`;
    const pluralInput = page
      .locator('[data-word-node-id="noun-plural-us"]')
      .getByPlaceholder("词形拼写");

    // A1 阶段 5：偏好侧（缺省英式）主导，美式那一栏默认折叠，要先展开才能编辑。
    // 基准原形与派生词形各有一条折叠条，这里要展开的是派生词形组那一条。
    await page
      .locator('[data-word-field="slots"]')
      .getByLabel("展开美式词形")
      .click();
    await pluralInput.fill("workspaces");
    await page.getByRole("button", { name: "保存草稿" }).click();

    const confirmationTitle = page.getByText("保存前请确认同形提示与下游影响", {
      exact: true
    });
    await expect(confirmationTitle).toBeVisible();
    await expect(page.getByText("正在加载全部同形命中（1/2）")).toBeVisible();
    const confirm = page.getByRole("button", { name: "确认并保存" });
    await expect(confirm).toBeDisabled();
    expect(api.count("PUT", formsPath)).toBe(0);

    await expect(page.getByText("发现 2 条跨词条同形命中")).toBeVisible();
    await expect(confirm).toBeEnabled();
    await expect(
      page.getByText("workspaces 已在 workspaces 中存在")
    ).toBeVisible();
    await expect(
      page.getByText("workspaces 已在 workspace 中存在")
    ).toBeVisible();
    await expect(page.getByText("主词：workspaces")).toBeVisible();
    await expect(page.getByText("noun · 复数词形：workspaces")).toBeVisible();
    await expect(
      page.getByText("当前候选：noun · 复数 · 美式").first()
    ).toBeVisible();
    await expect(page.getByText("共影响 1 个下游节点。")).toBeVisible();

    await pluralInput.evaluate((input) => {
      input.addEventListener(
        "focus",
        () => input.setAttribute("data-e2e-located", "true"),
        { once: true }
      );
    });
    await page.getByRole("button", { name: "定位词形" }).first().click();
    await expect(pluralInput).toHaveAttribute("data-e2e-located", "true");
    await page.getByRole("button", { name: /取\s*消/ }).click();
    await expect(confirmationTitle).toBeHidden();
    await expect(pluralInput).toHaveValue("workspaces");
    expect(api.count("PUT", formsPath)).toBe(0);
    expect(api.getWord()?.revision).toBe(1);

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("发现 2 条跨词条同形命中")).toBeVisible();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText("草稿已保存")).toBeVisible();

    const impactAttempts = api.requests.filter(
      (request) => request.method === "POST" && request.path === impactPath
    );
    expect(impactAttempts).toHaveLength(2);
    expect(impactAttempts[0]!.body).toMatchObject({
      base_revision: 1,
      content: {
        pos: [
          {
            pos_id: "pos-noun",
            form_groups: [
              {
                slots: [
                  {
                    form_type: "plural",
                    variants: [
                      { id: "noun-plural-uk", spelling: "centres" },
                      { id: "noun-plural-us", spelling: "workspaces" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    });
    const saveAttempts = api.requests.filter(
      (request) => request.method === "PUT" && request.path === formsPath
    );
    expect(saveAttempts).toHaveLength(1);
    expect(saveAttempts[0]!.body).toMatchObject({
      base_revision: 1,
      confirmed_surface_match_token: "forms-surface-token-v1",
      confirmed_impact_token: "forms-impact-token-v1",
      content: {
        pos: [
          {
            form_groups: [
              {
                slots: [
                  {
                    variants: [
                      { id: "noun-plural-uk", spelling: "centres" },
                      { id: "noun-plural-us", spelling: "workspaces" }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    });
    expect(api.getWord()?.revision).toBe(2);
    expect(
      api.getWord()?.forms.pos[0]?.form_groups[0]?.slots[0]?.variants[1]
        ?.spelling
    ).toBe("workspaces");
  });

  test("forms surface changed 409：保留输入并使用锁后新双 token 重确认", async ({
    page
  }) => {
    const api = await createCenterDraft(page, {
      formsSurfaceWarnings: true,
      formsDownstreamImpact: true,
      changeFormsSurfaceOnFirstSave: true
    });
    const formsPath = `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms`;
    const pluralInput = page
      .locator('[data-word-node-id="noun-plural-us"]')
      .getByPlaceholder("词形拼写");
    const confirm = page.getByRole("button", { name: "确认并保存" });

    // A1 阶段 5：美式那一栏默认折叠，先展开派生词形组那一条。
    await page
      .locator('[data-word-field="slots"]')
      .getByLabel("展开美式词形")
      .click();
    await pluralInput.fill("workspaces");
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByText("发现 2 条跨词条同形命中")).toBeVisible();
    await expect(confirm).toBeEnabled();
    await confirm.click();

    await expect.poll(() => api.count("PUT", formsPath)).toBe(1);
    expect(api.getWord()?.revision).toBe(1);
    await expect(pluralInput).toHaveValue("workspaces");
    await expect(
      page.getByText("workspaces 已在 workspace-updated 中存在")
    ).toBeVisible();
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.getByText("草稿已保存")).toBeVisible();

    const saveAttempts = api.requests.filter(
      (request) => request.method === "PUT" && request.path === formsPath
    );
    expect(saveAttempts).toHaveLength(2);
    expect(saveAttempts[0]!.body).toMatchObject({
      base_revision: 1,
      confirmed_surface_match_token: "forms-surface-token-v1",
      confirmed_impact_token: "forms-impact-token-v1"
    });
    expect(saveAttempts[1]!.body).toMatchObject({
      base_revision: 1,
      confirmed_surface_match_token: "forms-surface-token-v2",
      confirmed_impact_token: "forms-impact-token-v2"
    });
    expect(api.getWord()?.revision).toBe(2);
    expect(
      api.getWord()?.forms.pos[0]?.form_groups[0]?.slots[0]?.variants[1]
        ?.spelling
    ).toBe("workspaces");
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
