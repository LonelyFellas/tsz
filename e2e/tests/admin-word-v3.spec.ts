import { expect, test } from "@playwright/test";
import {
  ADMIN_V2_LEGACY_WORD_ID,
  ADMIN_V3_CANARY_WORD_ID,
  ADMIN_V3_DETECTIONS_PATH,
  ADMIN_V3_ENTRIES_PATH,
  ADMIN_V3_NEW_WORD_ID,
  mockAdminV3Api
} from "./support/mockAdminV3Api";

test.describe("Smart Lexicon 管理端 Mock E2E（非真实后端联调）", () => {
  test("E01a Mock：统一入口新建复杂单词、保存刷新、422 定位及发布阻断", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page);
    await page.goto("/words");

    await page.getByRole("button", { name: "创建词条" }).click();
    await expect(page).toHaveURL(/\/words\/new$/);
    await page.getByPlaceholder("例如 center 或 give up").fill("orbit");
    await page.getByRole("button", { name: "词典检测" }).click();
    await page.getByRole("button", { name: "创建并进入词形与发音" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );
    await expect(page.getByText("草稿可暂时不添加词性")).toBeVisible();

    await page.getByLabel("添加基本词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("名词", { exact: true })
      .click();
    await expect(page.getByRole("tab", { name: "名词" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    const nounGroups = page.locator("[data-pos-id] .v3-form-group-card");
    const firstGroup = nounGroups.nth(0);
    await firstGroup.getByLabel("在原形 1 下方添加同类型词形").click();
    const firstForm = firstGroup.locator(".v3-concrete-form-row").nth(0);
    const secondForm = firstGroup.locator(".v3-concrete-form-row").nth(1);
    await firstForm.getByLabel("原形 1通用拼写").fill("orbit-common");
    await firstForm.getByRole("button", { name: /新增发音/ }).click();
    await firstForm
      .getByLabel(/第 \d+ 条发音的字典音标/)
      .nth(0)
      .fill("ˈɔːbɪt");
    await firstForm
      .getByLabel(/第 \d+ 条发音的实际发音/)
      .nth(0)
      .fill("orbit");
    await firstForm
      .getByLabel(/第 \d+ 条发音的字典音标/)
      .nth(1)
      .fill("ˈɔrbɪt");
    await firstForm
      .getByLabel(/第 \d+ 条发音的实际发音/)
      .nth(1)
      .fill("orbit-us");

    await page.getByRole("button", { name: "新增名词变化组" }).click();
    const secondGroup = nounGroups.nth(1);
    const secondMembership = firstGroup.locator(".v3-membership-row").nth(1);
    await secondMembership.getByText("移动到其他组", { exact: true }).click();
    await secondMembership.getByLabel("移动词形 2 到其他变化组").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("变化组 2", { exact: true })
      .click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(1);
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);

    await page.getByLabel("英美拼写有区别").click();
    const ukSecondForm = secondGroup.locator(
      ".v3-dialect-panel-uk .v3-dialect-form-cell"
    );
    const usSecondForm = secondGroup.locator(
      ".v3-dialect-panel-us .v3-dialect-form-cell"
    );
    await ukSecondForm.getByLabel("原形英式拼写").fill("orbit-centre");
    await ukSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔːbɪt");
    await ukSecondForm.getByLabel("第 1 条发音的实际发音").fill("orbit-uk");
    await usSecondForm.getByLabel("原形美式拼写").fill("orbit-center");
    await usSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔrbɪt");
    await usSecondForm.getByLabel("第 1 条发音的实际发音").fill("orbit-us");

    await page.getByLabel("添加基本词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("动词", { exact: true })
      .click();
    await expect(page.getByRole("tab", { name: "动词" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const verbPanel = page.getByRole("tabpanel", { name: /动词/ });
    const ukVerb = verbPanel.locator(
      ".v3-dialect-panel-uk .v3-dialect-form-cell"
    );
    const usVerb = verbPanel.locator(
      ".v3-dialect-panel-us .v3-dialect-form-cell"
    );
    await ukVerb.getByLabel("原形英式拼写").fill("orbit-verb-uk");
    await ukVerb.getByLabel("第 1 条发音的字典音标").fill("ˈɔːbɪt");
    await ukVerb.getByLabel("第 1 条发音的实际发音").fill("orbit-verb-uk");
    await usVerb.getByLabel("原形美式拼写").fill("orbit-verb-us");
    await usVerb.getByLabel("第 1 条发音的字典音标").fill("ˈɔrbɪt");
    await usVerb.getByLabel("第 1 条发音的实际发音").fill("orbit-verb-us");

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect(page.getByRole("tab", { name: "动词" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await page.getByRole("button", { name: "去处理首项" }).click();
    const issueTarget = page
      .getByRole("tabpanel", { name: /动词/ })
      .locator(".v3-dialect-panel-uk .v3-dialect-form-cell")
      .getByLabel("第 1 条发音的实际发音");
    await expect(issueTarget).toBeFocused();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "仍有内容需要完成" })
        .getByText("请完整填写发音方式、字典音标和实际发音")
    ).toBeVisible();

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect.poll(() => api.getWord().revision).toBe(2);
    const savedForms = api.getWord().forms;
    expect(savedForms.pos.map((item) => item.pos)).toEqual(["noun", "verb"]);
    expect(savedForms.pos[0]?.forms.map((item) => item.form_type)).toEqual([
      "base",
      "base"
    ]);
    expect(savedForms.pos[0]?.form_groups).toHaveLength(2);
    expect(savedForms.pos[0]?.form_groups[0]?.members).toHaveLength(1);
    expect(savedForms.pos[0]?.form_groups[1]?.members).toHaveLength(1);
    expect(savedForms.pos[0]?.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
    expect(savedForms.pos[0]?.forms[0]?.regional_variants.mode).toBe("uk_us");
    expect(savedForms.pos[0]?.forms[1]?.regional_variants.mode).toBe("uk_us");
    const errorPronunciation = savedForms.pos[1]?.forms[0];
    if (errorPronunciation?.regional_variants.mode !== "uk_us") {
      throw new Error("Mock E01a expected a regional verb form");
    }
    await page.reload();
    await expect(page.getByRole("tab", { name: "名词" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "动词" })).toBeVisible();
    await page.getByRole("tab", { name: "名词" }).click();
    await expect(page.locator('input[value="orbit-common"]')).toHaveCount(2);
    await expect(page.getByText("英式拼写", { exact: true })).toHaveCount(2);
    await expect(page.getByText("美式拼写", { exact: true })).toHaveCount(2);

    await page.getByText("预览并生效", { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/preview$`)
    );
    await expect(page.getByRole("button", { name: "发布词条" })).toHaveCount(0);

    expect(api.count("POST", ADMIN_V3_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_V3_ENTRIES_PATH)).toBe(1);
    expect(
      api.count(
        "PUT",
        `${ADMIN_V3_ENTRIES_PATH}/${ADMIN_V3_NEW_WORD_ID}/steps/forms`
      )
    ).toBe(2);
  });

  test("E01b Mock：迁移词条发布且旧历史快照保持不变", async ({ page }) => {
    const api = await mockAdminV3Api(page, { initial: "canary" });
    const legacyBefore = api.getPublications()[0];

    await page.goto(`/words/${ADMIN_V3_CANARY_WORD_ID}/v3/wizard/preview`);
    await expect(
      page.getByText("legacy-orbit", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "查看第 1 次发布" })
    ).toBeVisible();
    await expect(page.getByText("发布历史加载失败")).toHaveCount(0);
    await page.getByRole("button", { name: "查看第 1 次发布" }).click();
    const legacyDetail = page.getByTestId("publication-detail");
    const legacySnapshot = legacyDetail.getByTestId(
      "publication-snapshot-body"
    );
    await expect(legacySnapshot.getByText("legacy-orbit")).toBeVisible();
    await expect(
      legacySnapshot.getByText("词典音标 ˈɔːbɪt · 实际发音 ˈɔːbɪt · 常规")
    ).toBeVisible();
    await expect(legacySnapshot.getByText("历史旧版轨道释义")).toBeVisible();
    await expect(legacySnapshot.getByText("orbital centre")).toHaveCount(0);
    await expect(legacySnapshot.getByText("运行轨道")).toHaveCount(0);
    await legacyDetail.getByRole("button", { name: "关闭发布详情" }).click();
    await page.getByRole("button", { name: "检查发布条件" }).click();
    await expect(page.getByText("影响预览：0 项")).toBeVisible();
    await page.getByRole("button", { name: "发布词条" }).click();
    await expect(page.getByText("已发布", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "查看第 1 次发布" })
    ).toBeVisible();
    await expect(page.getByText("发布历史加载失败")).toHaveCount(0);

    const publications = api.getPublications();
    expect(publications).toHaveLength(2);
    expect(publications[0]).toEqual(legacyBefore);
    expect(publications[0]).toMatchObject({
      schema_version: 2,
      publication_number: 1,
      word: {
        schema_version: 2,
        headwords: { mode: "unified", common: "legacy-orbit" }
      }
    });
    expect(publications[1]).toMatchObject({
      schema_version: 3,
      publication_number: 2,
      word: { schema_version: 3, status: "published" }
    });
    expect(
      api.count(
        "POST",
        `${ADMIN_V3_ENTRIES_PATH}/${ADMIN_V3_CANARY_WORD_ID}/validate`
      )
    ).toBe(1);
    expect(
      api.count(
        "POST",
        `${ADMIN_V3_ENTRIES_PATH}/${ADMIN_V3_CANARY_WORD_ID}/publications`
      )
    ).toBe(1);
  });

  test("E02 Mock：混合词条列表展示各自投影并路由到原生向导", async ({
    page
  }) => {
    await mockAdminV3Api(page);
    await page.goto("/words");

    const legacyRow = page.locator("tbody tr", { hasText: "legacy-orbit" });
    const v3Row = page.locator("tbody tr", { hasText: "orbit-v3" });
    await expect(legacyRow).toBeVisible();
    await expect(v3Row).toBeVisible();
    await legacyRow.getByRole("button", { name: /查看/ }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V2_LEGACY_WORD_ID}/wizard/preview$`)
    );

    await page.goto("/words");
    await page
      .locator("tbody tr", { hasText: "orbit-v3" })
      .getByRole("button", { name: /继续创建/ })
      .click();
    await expect(page).toHaveURL(
      /\/words\/01990000-0000-7000-8000-000000000002\/v3\/wizard\/preview$/
    );
  });
});
