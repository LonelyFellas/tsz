import { expect, test } from "@playwright/test";
import {
  ADMIN_V3_DETECTIONS_PATH,
  ADMIN_V3_ENTRIES_PATH,
  ADMIN_V3_MIXED_WORD_ID,
  ADMIN_V3_NEW_WORD_ID,
  ADMIN_V3_REFERENCED_SENTENCE_ID,
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
    await expect(
      firstGroup.getByRole("textbox", { name: "复数英美通用拼写", exact: true })
    ).toHaveValue("");
    // 拼写统一 / 英美区分都会出 BrE 表头，只有共用结构没有。
    await expect(firstGroup.getByText("英式英语 · BrE")).toHaveCount(0);

    // 加词性时按词性配置铺出新建模板：原形加名词名下的复数，共 2 行。
    // 组内只剩一个原形时类型锁死；⊕ 复制出第二个原形后放开，删回去又锁上。
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeDisabled();
    await firstGroup.getByLabel("在原形 1 下方添加同类型词形").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(3);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeEnabled();
    await expect(firstGroup.getByLabel("变化组 1 词形 2 类型")).toBeEnabled();
    await firstGroup.getByLabel("删除变化组 1 的词形 2").click();
    // 确认框挂在 body 上，不在组卡片里
    await page.getByLabel("删除词形及相关发音").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    await expect(firstGroup.getByLabel("变化组 1 词形 1 类型")).toBeDisabled();

    const firstForm = firstGroup.locator(".v3-concrete-form-row").nth(0);
    await firstForm
      .getByRole("textbox", { name: "原形英美通用拼写", exact: true })
      .fill("orbit-common");
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
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    // 手动加的组不铺模板，只有自带的原形，加上按词性铺的那一个复数占位行。
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(2);

    // 英美规则按组生效，两组各自切换。
    await firstGroup.getByLabel("英美拼写有区别").click();
    await secondGroup.getByLabel("英美拼写有区别").click();
    const ukSecondForm = secondGroup
      .locator(".v3-dialect-panel-uk .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形英式拼写", { exact: true }) });
    const usSecondForm = secondGroup
      .locator(".v3-dialect-panel-us .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形美式拼写", { exact: true }) });
    await ukSecondForm
      .getByRole("textbox", { name: "原形英式拼写", exact: true })
      .fill("orbit-centre");
    await ukSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔːbɪt");
    await ukSecondForm.getByLabel("第 1 条发音的实际发音").fill("orbit-uk");
    await usSecondForm
      .getByRole("textbox", { name: "原形美式拼写", exact: true })
      .fill("orbit-center");
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
    const ukVerb = verbPanel
      .locator(".v3-dialect-panel-uk .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形英式拼写", { exact: true }) });
    const usVerb = verbPanel
      .locator(".v3-dialect-panel-us .v3-dialect-form-cell")
      .filter({ has: page.getByLabel("原形美式拼写", { exact: true }) });
    await ukVerb
      .getByRole("textbox", { name: "原形英式拼写", exact: true })
      .fill("orbit-verb-uk");
    await ukVerb.getByLabel("第 1 条发音的字典音标").fill("ˈɔːbɪt");
    await ukVerb.getByLabel("第 1 条发音的实际发音").fill("orbit-verb-uk");
    await usVerb
      .getByRole("textbox", { name: "原形美式拼写", exact: true })
      .fill("orbit-verb-us");
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
      .filter({ has: page.getByLabel("原形英式拼写", { exact: true }) })
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
    // 新建模板是真实数据，一个字没填也会保存；手动加的第二组只带自己的原形。
    expect(savedForms.pos[0]?.forms.map((item) => item.form_type)).toEqual([
      "base",
      "plural",
      "base"
    ]);
    expect(savedForms.pos[0]?.form_groups).toHaveLength(2);
    expect(savedForms.pos[0]?.form_groups[0]?.members).toHaveLength(2);
    expect(savedForms.pos[0]?.form_groups[1]?.members).toHaveLength(1);
    expect(
      savedForms.pos[0]?.form_groups.map((group) => group.dialect_rules)
    ).toEqual([
      { spelling_mode: "distinguish", phonetic_mode: "distinguish" },
      { spelling_mode: "distinguish", phonetic_mode: "distinguish" }
    ]);
    expect(
      savedForms.pos[0]?.forms.every(
        (item) => item.regional_variants.mode === "uk_us"
      )
    ).toBe(true);
    const errorPronunciation = savedForms.pos[1]?.forms[0];
    if (errorPronunciation?.regional_variants.mode !== "uk_us") {
      throw new Error("Mock E01a expected a regional verb form");
    }
    await page.reload();
    await expect(page.getByRole("tab", { name: "名词" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "动词" })).toBeVisible();
    await page.getByRole("tab", { name: "名词" }).click();
    await expect(page.locator('input[value="orbit-common"]')).toHaveCount(2);
    await expect(page.getByLabel("原形英式拼写", { exact: true })).toHaveCount(
      2
    );
    await expect(page.getByLabel("原形美式拼写", { exact: true })).toHaveCount(
      2
    );

    // 未完成词义时，顶部入口及直达链接都不能跳过完成校验。
    const previewStep = page.locator(".ant-steps-item").filter({
      has: page.getByText("预览并生效", { exact: true })
    });
    await expect(previewStep).toHaveClass(/ant-steps-item-disabled/);
    await page.getByText("预览并生效", { exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );
    await page.goto(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/preview`);
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/meanings$`)
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

  test("E03 Mock：同一词性第 2 组独立设为英美通用，保存后两组规则各自落库", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page, { formsFailureOnce: false });
    await page.goto("/words");
    await page.getByRole("button", { name: "创建词条" }).click();
    await page.getByPlaceholder("例如 center 或 give up").fill("orbit");
    await page.getByRole("button", { name: "词典检测" }).click();
    await page.getByRole("button", { name: "创建并进入词形与发音" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_NEW_WORD_ID}/v3/wizard/forms$`)
    );

    await page.getByLabel("添加基本词性").click();
    await page
      .locator(".ant-select-dropdown:visible")
      .getByText("名词", { exact: true })
      .click();
    const nounGroups = page.locator("[data-pos-id] .v3-form-group-card");
    const firstGroup = nounGroups.nth(0);
    await firstGroup.getByLabel("英美拼写有区别").click();

    await page.getByRole("button", { name: "新增名词变化组" }).click();
    const secondGroup = nounGroups.nth(1);
    // 新组沿用上一组的英美规则；这里只把第 2 组改成英美共用，第 1 组保持区分。
    await expect(secondGroup.getByLabel("英美拼写有区别")).toBeChecked();
    await secondGroup.getByLabel("英美拼写无区别").click();
    await secondGroup.getByLabel("英美音标无区别").click();
    await expect(secondGroup.getByLabel("英美音标无区别")).toBeChecked();
    await expect(firstGroup.getByLabel("英美拼写有区别")).toBeChecked();
    await expect(page.getByText("暂不能合并英美配置")).toHaveCount(0);

    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect.poll(() => api.getWord().revision).toBe(2);
    const savedPos = api.getWord().forms.pos[0]!;
    const [first, second] = savedPos.form_groups;
    expect(first?.dialect_rules).toEqual({
      spelling_mode: "distinguish",
      phonetic_mode: "distinguish"
    });
    expect(second?.dialect_rules).toEqual({
      spelling_mode: "unified",
      phonetic_mode: "unified"
    });
    const modeOf = (formId: string) =>
      savedPos.forms.find((form) => form.id === formId)?.regional_variants.mode;
    expect(
      first?.members.map((member) => modeOf(member.form_id))
    ).not.toContain("common");
    expect(second?.members.map((member) => modeOf(member.form_id))).toEqual([
      "common"
    ]);
  });

  test("E02 Mock：列表行展示 V3 投影并能进向导", async ({ page }) => {
    await mockAdminV3Api(page);
    await page.goto("/words");

    const v3Row = page.locator("tbody tr", { hasText: "orbit-v3" });
    await expect(v3Row).toBeVisible();

    await page
      .locator("tbody tr", { hasText: "orbit-v3" })
      .getByRole("button", { name: /继续创建/ })
      .click();
    await expect(page).toHaveURL(
      /\/words\/01990000-0000-7000-8000-000000000002\/v3\/wizard\/preview$/
    );
  });

  test("E06 Mock 引用保护：被例句标注的原形禁用英美切换与删除，徽标可跳到例句", async ({
    page
  }) => {
    const api = await mockAdminV3Api(page, {
      formsFailureOnce: false,
      referencedByShared: true
    });
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);

    const firstGroup = page.locator("[data-pos-id] .v3-form-group-card").nth(0);
    await expect(firstGroup.getByLabel("英美拼写有区别")).toBeDisabled();
    await expect(firstGroup.getByLabel("英美音标有区别")).toBeDisabled();
    await expect(
      firstGroup.getByRole("button", { name: "删除变化组 1 的词形 1" })
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "删除名词" })).toBeDisabled();
    // 没被引用的第 2 组照常可切英美规则。
    await expect(
      page
        .locator("[data-pos-id] .v3-form-group-card")
        .nth(1)
        .getByLabel("英美拼写有区别")
    ).toBeEnabled();

    await firstGroup.getByRole("button", { name: "被引用 1" }).first().click();
    const popover = page.locator(".ant-popover:visible");
    await expect(
      popover.getByText("The satellite entered orbit.")
    ).toBeVisible();
    await expect(popover.locator("mark")).toHaveText("orbit");
    await popover.getByRole("button", { name: "查看例句" }).click();

    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings$`)
    );
    await expect
      .poll(() =>
        api.count(
          "GET",
          `/lexicon/sentences/${ADMIN_V3_REFERENCED_SENTENCE_ID}`
        )
      )
      .toBe(1);
  });

  test("E04 Mock 身份：普通管理员看他人未发布草稿只读", async ({ page }) => {
    await mockAdminV3Api(page, { entryCreator: "other" });
    await page.goto("/words");

    const row = page.locator("tbody tr", { hasText: "orbit-v3" });
    await expect(
      row.getByRole("button", { name: "查看「orbit-v3」" })
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: "继续创建「orbit-v3」" })
    ).toHaveCount(0);
    await expect(
      row.getByRole("button", { name: "移入垃圾桶「orbit-v3」" })
    ).toBeDisabled();

    // 只读词条只剩预览可达，直链进词形步也会被改写到预览。
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/preview$`)
    );
  });

  test("E05 Mock 身份：超管对他人未发布草稿仍可写", async ({ page }) => {
    await mockAdminV3Api(page, {
      entryCreator: "other",
      viewerRole: "super_admin"
    });
    await page.goto("/words");

    const row = page.locator("tbody tr", { hasText: "orbit-v3" });
    await expect(
      row.getByRole("button", { name: "继续创建「orbit-v3」" })
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: "移入垃圾桶「orbit-v3」" })
    ).toBeEnabled();

    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
    // 先等词形步独有的内容渲染出来：详情加载前 URL 本来就是 /forms，直接断言会恒真。
    await expect(
      page.getByRole("button", { name: "新增名词变化组" })
    ).toBeVisible();
    await expect(page).toHaveURL(
      new RegExp(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms$`)
    );
  });
});
