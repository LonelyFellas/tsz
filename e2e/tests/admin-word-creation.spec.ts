import { expect, test, type Page } from "@playwright/test";
import {
  ADMIN_E2E_DETECTIONS_PATH,
  ADMIN_E2E_ENTRIES_PATH,
  ADMIN_E2E_PLURAL_UK_ID,
  ADMIN_E2E_PLURAL_US_ID,
  ADMIN_E2E_POS_ID,
  ADMIN_E2E_SURFACE_ARCHIVED_ID,
  ADMIN_E2E_WORD_ID,
  mockAdminApi,
  type MockAdminApiController,
  type MockAdminApiOptions
} from "./support/mockAdminApi";

async function openCenterDraft(
  page: Page,
  options: MockAdminApiOptions = {}
): Promise<MockAdminApiController> {
  const api = await mockAdminApi(page, { ...options, seedDraft: true });
  await page.goto(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms`);
  await expect(page.getByRole("heading", { name: "词形与发音" })).toBeVisible();
  return api;
}

test.describe("admin V2 兼容流程", () => {
  test("同名 workspace 列表保留两行并按精确 ID 查看", async ({ page }) => {
    await mockAdminApi(page, { sameHeadwordList: true });
    const listResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.endsWith(ADMIN_E2E_ENTRIES_PATH)
    );
    await page.goto("/words");
    await expect(await (await listResponsePromise).json()).toMatchObject({
      words: [
        {
          kind: "word",
          headword: "workspace",
          dialects: ["common"],
          headword_variants: [{ dialect: "common", headword: "workspace" }]
        },
        {
          kind: "phrase",
          headword: "workspace / workspace",
          dialects: ["uk", "us"],
          source_dialect: "uk",
          headword_variants: [
            { dialect: "uk", headword: "workspace" },
            { dialect: "us", headword: "workspace" }
          ]
        }
      ]
    });

    await expect(page.getByText("workspace", { exact: true })).toHaveCount(1);
    await expect(
      page.getByText("workspace / workspace", { exact: true })
    ).toHaveCount(1);
    await expect(page.getByText("a1b2c3d4", { exact: true })).toBeVisible();
    await expect(page.getByText("e5f6a7b8", { exact: true })).toBeVisible();
    await expect(page.getByText("工作空间", { exact: true })).toBeVisible();
    await expect(page.getByText("协作空间", { exact: true })).toBeVisible();

    const secondRow = page.locator("tbody tr", { hasText: "e5f6a7b8" });
    await secondRow.getByRole("button", { name: "继续创建" }).click();
    await expect(page).toHaveURL(
      /\/words\/10000000-0000-4000-8000-0000e5f6a7b8\/wizard\/forms$/
    );
  });

  test("创建入口统一输入并自动分流单词与短语", async ({ page }) => {
    await mockAdminApi(page);

    await page.goto("/words");
    await expect(page.getByRole("button", { name: "创建词条" })).toHaveCount(1);
    await expect(page.getByRole("button", { name: "创建单词" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "创建短语" })).toHaveCount(0);

    await page.getByRole("button", { name: "创建词条" }).click();
    await expect(page).toHaveURL(/\/words\/new$/);
    await expect(
      page.getByRole("heading", { name: "输入要创建的英文词条" })
    ).toBeVisible();
    await expect(page.getByPlaceholder("例如 center 或 give up")).toBeVisible();
    await expect(page.getByText("系统会自动识别单词或短语")).toBeVisible();
  });

  test("T19 center 四步发布后回列表并进入只读预览", async ({ page }) => {
    const api = await openCenterDraft(page);

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
    const listResponsePromise = page.waitForResponse(
      (response) =>
        response.request().method() === "GET" &&
        new URL(response.url()).pathname.endsWith(ADMIN_E2E_ENTRIES_PATH)
    );

    await page
      .locator(".word-step-actions")
      .getByRole("button", { name: "提交生效" })
      .click();
    await expect(page).toHaveURL(/\/words$/);

    const listResponse = await listResponsePromise;
    await expect(await listResponse.json()).toMatchObject({
      words: [
        {
          kind: "word",
          headword: "center / centre",
          dialects: ["us", "uk"],
          source_dialect: "us",
          headword_variants: [
            { dialect: "us", headword: "center" },
            { dialect: "uk", headword: "centre" }
          ]
        }
      ]
    });

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
    expect(api.count("POST", ADMIN_E2E_DETECTIONS_PATH)).toBe(0);
    expect(api.count("POST", ADMIN_E2E_ENTRIES_PATH)).toBe(0);
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
    const api = await openCenterDraft(page);
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
    const api = await openCenterDraft(page, { relatedSearchV2: true });
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
      target_word_id: "22222222-0000-4000-8000-000000000002",
      target_sense_id: "30000000-0000-4000-8000-000000000003"
    });
  });

  test("T20 短语重复检查阻断创建且保留候选详情", async ({ page }) => {
    const api = await mockAdminApi(page, {
      duplicate: true,
      entryKind: "phrase"
    });
    await page.goto("/words/new");

    const input = page.getByPlaceholder("例如 center 或 give up");
    await input.fill("true color");
    await page.getByRole("button", { name: "继续创建" }).click();

    await expect(page.getByText("智能词库中已有相同词条")).toBeVisible();
    const duplicateButtons = page.getByText("查看候选详情");
    await expect(duplicateButtons).toHaveCount(2);
    await duplicateButtons.first().click();
    await expect(page.getByText("colour", { exact: true })).toBeVisible();
    await expect(
      page.getByText("已归档", { exact: true }).first()
    ).toBeVisible();
    await expect(page.getByText("命中原因：已有相同主词 · 英式")).toBeVisible();
    await expect(page).toHaveURL(/\/words\/new$/);
    await expect(input).toHaveValue("true color");
    await expect(
      page.getByRole("button", { name: "确认并继续创建" })
    ).toHaveCount(0);

    expect(api.count("POST", ADMIN_E2E_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_E2E_ENTRIES_PATH)).toBe(0);
    expect(api.getWord()).toBeUndefined();
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
      const api = await mockAdminApi(page, {
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
          new URL(response.url()).pathname.endsWith(ADMIN_E2E_DETECTIONS_PATH)
      );
      await page.getByRole("button", { name: "继续创建" }).click();
      await expect(await (await detectionResponsePromise).json()).toMatchObject(
        {
          entry_kind: "phrase",
          smart_dictionary: {
            surface_match_page: {
              items: [
                { candidate: { entry_kind: "phrase" } },
                { candidate: { entry_kind: "phrase" } }
              ]
            }
          }
        }
      );

      await expect(page.getByText("发现可能重复的词条")).toBeVisible();
      const archivedButtons = page.getByText("查看候选详情");
      await expect(archivedButtons).toHaveCount(3);
      await expect(
        page.getByRole("button", { name: "确认并继续创建" })
      ).toBeEnabled();
      await archivedButtons.first().click();
      await expect(page.getByText("workspace").first()).toBeVisible();
      await expect(page.getByText("已归档").first()).toBeVisible();
      await expect(page).toHaveURL(/\/words\/new$/);
      await expect(input).toHaveValue(phrase);

      await page.getByRole("button", { name: "确认并继续创建" }).click();
      await expect(page).toHaveURL(
        new RegExp(`/words/${ADMIN_E2E_WORD_ID}/wizard/forms$`)
      );
      const createRequest = api.requests.find(
        (request) =>
          request.method === "POST" && request.path === ADMIN_E2E_ENTRIES_PATH
      );
      expect(createRequest?.body).toMatchObject({
        detection_id: `detect-${phrase}`,
        confirmed_surface_match_token: `surface-token-${phrase}`
      });
      expect(api.getWord()).toMatchObject({
        kind: "phrase",
        detection_snapshot: { entry_kind: "phrase" }
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
          name: `workspace ${ADMIN_E2E_SURFACE_ARCHIVED_ID}，在新标签页打开`
        })
      ).toHaveAttribute(
        "href",
        `/words/${ADMIN_E2E_SURFACE_ARCHIVED_ID}/wizard/basics`
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
      expireSurfaceSnapshotOnce: true,
      entryKind: "phrase"
    });
    await page.goto("/words/new");
    const input = page.getByPlaceholder("例如 center 或 give up");
    await input.fill("workspace phrase");
    await page.getByRole("button", { name: "继续创建" }).click();
    await expect(page.getByText("查看候选详情")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "确认并继续创建" })
    ).toBeEnabled();

    await page.getByRole("button", { name: "确认并继续创建" }).click();
    await expect(page.getByText("检查结果已变化，请重新提交。")).toBeVisible();
    await expect(input).toHaveValue("workspace phrase");

    await page.getByRole("button", { name: "继续创建" }).click();
    await expect(page.getByText("查看候选详情")).toHaveCount(3);
    await expect(
      page.getByRole("button", { name: "确认并继续创建" })
    ).toBeEnabled();
    await page.getByRole("button", { name: "确认并继续创建" }).click();
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
    const api = await openCenterDraft(page, {
      formsSurfaceWarnings: true,
      formsDownstreamImpact: true,
      formsSurfaceTerminalDelayMs: 1_000
    });
    const formsPath = `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms`;
    const impactPath = `${formsPath}/impact`;
    const pluralInput = page
      .locator(`[data-word-node-id="${ADMIN_E2E_PLURAL_US_ID}"]`)
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
            pos_id: ADMIN_E2E_POS_ID,
            form_groups: [
              {
                slots: [
                  {
                    form_type: "plural",
                    variants: [
                      { id: ADMIN_E2E_PLURAL_UK_ID, spelling: "centres" },
                      { id: ADMIN_E2E_PLURAL_US_ID, spelling: "workspaces" }
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
      confirmed_impact_token: "66000000-0000-4000-8000-000000000001",
      content: {
        pos: [
          {
            form_groups: [
              {
                slots: [
                  {
                    variants: [
                      { id: ADMIN_E2E_PLURAL_UK_ID, spelling: "centres" },
                      { id: ADMIN_E2E_PLURAL_US_ID, spelling: "workspaces" }
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
    const api = await openCenterDraft(page, {
      formsSurfaceWarnings: true,
      formsDownstreamImpact: true,
      changeFormsSurfaceOnFirstSave: true
    });
    const formsPath = `${ADMIN_E2E_ENTRIES_PATH}/${ADMIN_E2E_WORD_ID}/steps/forms`;
    const pluralInput = page
      .locator(`[data-word-node-id="${ADMIN_E2E_PLURAL_US_ID}"]`)
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
      confirmed_impact_token: "66000000-0000-4000-8000-000000000001"
    });
    expect(saveAttempts[1]!.body).toMatchObject({
      base_revision: 1,
      confirmed_surface_match_token: "forms-surface-token-v2",
      confirmed_impact_token: "66000000-0000-4000-8000-000000000002"
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
    const api = await openCenterDraft(page, {
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
