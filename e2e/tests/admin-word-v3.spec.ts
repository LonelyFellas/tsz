import { expect, test } from "@playwright/test";
import {
  ADMIN_V2_LEGACY_WORD_ID,
  ADMIN_V3_CANARY_WORD_ID,
  ADMIN_V3_DETECTIONS_PATH,
  ADMIN_V3_ENTRIES_PATH,
  ADMIN_V3_NEW_WORD_ID,
  mockAdminV3Api
} from "./support/mockAdminV3Api";

test.describe("Smart Lexicon V3 Mock E2E（非真实后端联调）", () => {
  test("E01a Mock：新建复杂 V3、保存刷新、422 定位及 shadow 发布阻断", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page);
    await page.goto("/words");

    await page.getByRole("button", { name: "创建单词" }).click();
    await expect(page).toHaveURL(/\/words\/new\/v3$/);
    await page.getByLabel("待创建词面").fill("orbit");
    await page.getByRole("button", { name: "检测 V3 词面" }).click();
    await expect(page.getByText("检测有效：orbit")).toBeVisible();
    await page.getByRole("button", { name: "创建 V3 草稿" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );
    await expect(page.getByText("草稿可暂时不添加词性")).toBeVisible();

    await page.getByLabel("待新增词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("名词", { exact: true })
      .click();
    await page.getByRole("button", { name: "新增词性" }).click();
    await expect(page.getByRole("tab", { name: "noun" })).toHaveAttribute(
      "aria-selected",
      "true"
    );

    await page.getByRole("button", { name: /新增变化组/ }).click();
    const nounGroups = page.locator("[data-pos-id] .v3-form-group-card");
    const firstGroup = nounGroups.nth(0);
    await firstGroup
      .getByRole("button", { name: /新增 concrete form/ })
      .click();
    await firstGroup
      .getByRole("button", { name: /新增 concrete form/ })
      .click();
    const firstForm = firstGroup.locator(".v3-concrete-form-row").nth(0);
    const secondForm = firstGroup.locator(".v3-concrete-form-row").nth(1);
    await firstForm.getByLabel(/^common 拼写 /).fill("orbit-common");
    await firstForm.getByRole("button", { name: /新增发音/ }).click();
    await firstForm.getByRole("button", { name: /新增发音/ }).click();
    await firstForm
      .getByLabel(/^字典音标 /)
      .nth(0)
      .fill("ˈɔːbɪt");
    await firstForm
      .getByLabel(/^实际发音 /)
      .nth(0)
      .fill("orbit");
    await firstForm
      .getByLabel(/^字典音标 /)
      .nth(1)
      .fill("ˈɔrbɪt");
    await firstForm
      .getByLabel(/^实际发音 /)
      .nth(1)
      .fill("orbit-us");

    await secondForm.getByLabel(/^common 拼写 /).fill("orbit-regional");
    await secondForm.getByRole("button", { name: /切换为 UK\/US/ }).click();
    await page.getByLabel("UK 映射拼写").fill("orbit-centre");
    await page.getByLabel("UK 映射字典音标").fill("ˈɔːbɪt");
    await page.getByLabel("UK 映射实际发音").fill("orbit-uk");
    await page.getByLabel("US 映射拼写").fill("orbit-center");
    await page.getByLabel("US 映射字典音标").fill("ˈɔrbɪt");
    await page.getByLabel("US 映射实际发音").fill("orbit-us");
    await page.getByRole("button", { name: "确认转换" }).click();

    await page.getByRole("button", { name: /新增变化组/ }).click();
    const secondGroup = nounGroups.nth(1);
    await secondGroup.getByLabel(/添加已有词形到/).click();
    await page
      .locator(".ant-select-dropdown:visible")
      .locator(".ant-select-item-option")
      .first()
      .click();
    await secondGroup.getByRole("button", { name: /添加 membership/ }).click();
    await firstGroup
      .locator(".v3-membership-row")
      .nth(1)
      .getByLabel(/移动 membership .* 到变化组/)
      .click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("变化组 2", { exact: true })
      .click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(1);
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(2);

    await page.getByLabel("待新增词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("动词", { exact: true })
      .click();
    await page.getByRole("button", { name: "新增词性" }).click();
    await expect(page.getByRole("tab", { name: "verb" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await page.getByRole("button", { name: /新增变化组/ }).click();
    const verbGroup = page.locator("[data-pos-id] .v3-form-group-card").first();
    await verbGroup.getByRole("button", { name: /新增 concrete form/ }).click();
    const verbForm = verbGroup.locator(".v3-concrete-form-row");
    await verbForm.getByLabel(/^common 拼写 /).fill("orbit-verb");
    await verbForm.getByRole("button", { name: /新增发音/ }).click();
    await verbForm.getByLabel(/^字典音标 /).fill("ˈɔːbɪt");
    await verbForm.getByLabel(/^实际发音 /).fill("orbit-verb");

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
    expect(savedForms.pos[0]?.form_groups[1]?.members).toHaveLength(2);
    expect(savedForms.pos[0]?.forms[0]?.regional_variants.mode).toBe("common");
    expect(savedForms.pos[0]?.forms[1]?.regional_variants.mode).toBe("uk_us");
    const errorPronunciation = savedForms.pos[1]?.forms[0];
    if (errorPronunciation?.regional_variants.mode !== "common") {
      throw new Error("Mock E01a expected a common verb form");
    }
    const errorPronunciationId =
      errorPronunciation.regional_variants.common.pronunciations[0]!.id;

    await page.reload();
    await expect(page.getByRole("tab", { name: "noun" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "verb" })).toBeVisible();
    await page.getByRole("tab", { name: "noun" }).click();
    await expect(page.locator('input[value="orbit-common"]')).toHaveCount(2);
    await expect(page.getByText("UK", { exact: true })).toBeVisible();
    await expect(page.getByText("US", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "完成词形" }).click();
    await expect(page.getByRole("tab", { name: "verb" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    const issueTarget = page.getByLabel(`实际发音 ${errorPronunciationId}`);
    await expect(issueTarget).toBeFocused();
    await expect(
      page
        .getByRole("alert")
        .filter({ hasText: "词形与发音尚未完成" })
        .getByText("Mock：第二词性的实际发音需要确认")
    ).toBeVisible();

    await page.getByText("核对与发布", { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/preview$`)
    );
    await expect(page.getByText("当前 V3 词条不可发布")).toBeVisible();
    await expect(
      page.getByText("phase2_consumers_not_ready", { exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "发布 V3 词条" })
    ).toHaveCount(0);

    expect(api.count("POST", ADMIN_V3_DETECTIONS_PATH)).toBe(1);
    expect(api.count("POST", ADMIN_V3_ENTRIES_PATH)).toBe(1);
    expect(
      api.count(
        "PUT",
        `${ADMIN_V3_ENTRIES_PATH}/${ADMIN_V3_NEW_WORD_ID}/steps/forms`
      )
    ).toBe(2);
  });

  test("E01b Mock：migrated bridge canary 发布且 V2 历史快照保持不变", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page, { initial: "canary" });
    const legacyBefore = api.getPublications()[0];

    await page.goto(`/words/${ADMIN_V3_CANARY_WORD_ID}/v3/wizard/preview`);
    await expect(page.getByText("兼容桥（只读）")).toBeVisible();
    await expect(
      page.getByText("legacy-orbit", { exact: true }).first()
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "查看发布 #1" })
    ).toBeVisible();
    await expect(page.getByText("发布历史加载失败")).toHaveCount(0);
    await page.getByRole("button", { name: "查看发布 #1" }).click();
    const legacyDetail = page.getByTestId("publication-detail");
    const legacySnapshot = legacyDetail.getByTestId(
      "publication-snapshot-body"
    );
    await expect(legacySnapshot.getByText("legacy-orbit")).toBeVisible();
    await expect(
      legacySnapshot.getByText("ˈɔːbɪt → ˈɔːbɪt · normal")
    ).toBeVisible();
    await expect(legacySnapshot.getByText("历史旧版轨道释义")).toBeVisible();
    await expect(legacySnapshot.getByText("orbital centre")).toHaveCount(0);
    await expect(legacySnapshot.getByText("运行轨道")).toHaveCount(0);
    await legacyDetail.getByRole("button", { name: "关闭发布详情" }).click();
    await page.getByRole("button", { name: "检查发布条件" }).click();
    await expect(page.getByText("影响预览：0 项")).toBeVisible();
    await page.getByRole("button", { name: "发布 V3 词条" }).click();
    await expect(page.getByText("published", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "查看发布 #1" })
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

  test("E02 Mock：mixed V2/V3 列表展示各自投影并路由到各自向导", async ({
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
