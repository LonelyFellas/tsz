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
  test("统一富文本弹窗：保持布局、拖动、选区连读、改字确认和取消恢复", async ({
    page
  }) => {
    test.skip(
      process.env.VITE_VOICE_EDITOR !== "true",
      "需要显式启用语音编辑器的构建"
    );
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    const opener = page
      .getByRole("button", { name: /^打开.*语法结构.*编辑器$/ })
      .first();
    await opener.click();
    const dialog = page
      .getByRole("dialog")
      .filter({ has: page.locator(".tsz-ve-editor") });
    await expect(dialog).toBeVisible();
    const input = dialog.locator(".tsz-ve-canvas-input");
    await expect(input).toHaveCount(1);
    await expect(input).toBeEditable();
    await expect
      .poll(() =>
        dialog
          .locator(".ant-modal-body")
          .evaluate((body) => body.scrollWidth - body.clientWidth)
      )
      .toBe(0);
    await expect(dialog.locator(".tsz-ve-inline-tools")).toHaveAttribute(
      "data-combined",
      "true"
    );
    const original = await input.inputValue();
    await input.fill("a job");
    await input.press("ControlOrMeta+A");
    const actions = dialog.locator(".tsz-ve-inline-tools");
    await expect(actions).toHaveCount(1);
    await expect(actions).toHaveAttribute("data-combined", "true");
    const grammarActions = actions.getByRole("group", { name: "语法标注类别" });
    const liaisonActions = actions.locator(".tsz-ve-selection-liaison");
    await expect
      .poll(async () => {
        const grammarBox = (await grammarActions.boundingBox())!;
        const liaisonBox = (await liaisonActions.boundingBox())!;
        return Math.abs(
          grammarBox.y +
            grammarBox.height / 2 -
            liaisonBox.y -
            liaisonBox.height / 2
        );
      })
      .toBeLessThan(2);
    const grammarBox = (await grammarActions.boundingBox())!;
    const liaisonBox = (await liaisonActions.boundingBox())!;
    expect(liaisonBox.x - grammarBox.x - grammarBox.width).toBeLessThan(35);
    const canvasBox = (await dialog.locator(".tsz-ve-canvas").boundingBox())!;
    const footerBox = (await dialog
      .locator(".v3-voice-text-editor-done")
      .boundingBox())!;
    expect(footerBox.y).toBeGreaterThanOrEqual(
      canvasBox.y + canvasBox.height - 1
    );
    await dialog.getByRole("button", { name: "确认添加", exact: true }).click();
    await expect(
      dialog.locator(".tsz-ve-arc-layer path").first()
    ).toBeVisible();
    await expect(actions).toHaveAttribute("data-combined", "true");
    await input.press("Escape");
    await expect(actions).toHaveAttribute("data-combined", "true");
    await input.fill("new text");
    const confirmation = page.getByRole("dialog", {
      name: "修改文字会移除已有标注"
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "保留原文" }).click();
    await expect(confirmation).toBeHidden();
    await expect(input).toHaveValue("a job");
    const handle = dialog.locator(".ant-modal-title");
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + 100, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 160, box.y + box.height / 2 + 50, {
      steps: 5
    });
    await page.mouse.up();
    await expect
      .poll(async () => Math.round((await handle.boundingBox())!.x - box.x))
      .toBe(60);
    await dialog.locator(".tsz-ve-role-button").click();
    await page.screenshot({
      path: test.info().outputPath("unified-rich-editor.png")
    });
    await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
    await expect(dialog).toBeHidden();
    await expect(opener).toBeVisible();
    await opener.click();
    await expect(dialog.locator(".tsz-ve-canvas-input")).toHaveValue(original);
  });

  test("统一富文本入口：拼写和实际发音可打开编辑并取消", async ({ page }) => {
    test.skip(
      process.env.VITE_VOICE_EDITOR !== "true",
      "需要显式启用语音编辑器的构建"
    );
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
    for (const name of [/^打开.*拼写编辑器$/, /^打开.*实际发音编辑器$/]) {
      const opener = page.getByRole("button", { name }).first();
      await opener.click();
      const dialog = page
        .getByRole("dialog")
        .filter({ has: page.locator(".tsz-ve-editor") });
      const input = dialog.locator(".tsz-ve-canvas-input");
      await expect(input).toBeEditable();
      await expect(input).toHaveCount(1);
      const original = await input.inputValue();
      await input.fill(`${original}x`);
      const confirmation = page.getByRole("dialog", {
        name: "修改文字会移除已有标注"
      });
      if (await confirmation.isVisible())
        await confirmation.getByRole("button", { name: "确认修改" }).click();
      await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
      await expect(dialog).toBeHidden();
      await opener.click();
      await expect(dialog.locator(".tsz-ve-canvas-input")).toHaveValue(
        original
      );
      await dialog.getByRole("button", { name: /^取消.*编辑$/ }).click();
      await expect(dialog).toBeHidden();
    }
  });

  test("词义删除使用页面顶部弹窗，取消保留、确认才删除", async ({ page }) => {
    await mockAdminV3Api(page);
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
    const deleteButton = page.getByLabel("删除词义 1", { exact: true });
    await deleteButton.click();
    const dialog = page.getByRole("dialog", { name: "确定删除该词义吗？" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("运行轨道");
    await expect(page.locator(".ant-popconfirm")).toHaveCount(0);
    await expect(page.locator(".ant-modal-mask")).toBeVisible();
    await expect.poll(async () => (await dialog.boundingBox())?.y).toBe(48);
    await page.screenshot({ path: test.info().outputPath("sense-delete.png") });
    await page.mouse.click(8, 8);
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "取 消" }).click();
    await expect(dialog).toBeHidden();
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "确认删除" }).click();
    await expect(dialog).toBeHidden();
    await expect(deleteButton).toHaveCount(0);
  });

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
      .getByRole("textbox", { name: /^第 \d+ 条发音的实际发音$/ })
      .nth(0)
      .fill("orbit");
    await firstForm
      .getByLabel(/第 \d+ 条发音的字典音标/)
      .nth(1)
      .fill("ˈɔrbɪt");
    await firstForm
      .getByRole("textbox", { name: /^第 \d+ 条发音的实际发音$/ })
      .nth(1)
      .fill("orbit-us");

    await page.getByRole("button", { name: "新增名词变化组" }).click();
    const secondGroup = nounGroups.nth(1);
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    // 手动加的组是空组：不再自动带原形，也不按词性自动补复数占位行。
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(0);
    await expect(secondGroup.getByText("草稿可暂时保留空变化组")).toBeVisible();

    // 英美规则按组生效，两组各自切换；第 2 组手动加原形后再填拼写。
    await firstGroup.getByLabel("英美拼写有区别").click();
    await secondGroup.getByLabel("英美拼写有区别").click();
    await secondGroup.getByRole("button", { name: "添加原形" }).click();
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);
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
    await ukSecondForm
      .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true })
      .fill("orbit-uk");
    await usSecondForm
      .getByRole("textbox", { name: "原形美式拼写", exact: true })
      .fill("orbit-center");
    await usSecondForm.getByLabel("第 1 条发音的字典音标").fill("ˈɔrbɪt");
    await usSecondForm
      .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true })
      .fill("orbit-us");

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
    for (const [form, dialect, spelling, phonetic] of [
      [ukVerb, "英式", "orbit-verb-uk", "ˈɔːbɪt"],
      [usVerb, "美式", "orbit-verb-us", "ˈɔrbɪt"]
    ] as const) {
      const input = form.getByRole("textbox", {
        name: `原形${dialect}拼写`,
        exact: true
      });
      if (await input.isEditable()) {
        await input.fill(spelling);
      } else {
        await form
          .getByRole("button", {
            name: `打开原形${dialect}拼写编辑器`,
            exact: true
          })
          .click();
        const dialog = page
          .getByRole("dialog")
          .filter({ has: page.locator(".tsz-ve-editor") });
        await dialog.locator(".tsz-ve-canvas-input").fill(spelling);
        await dialog.getByRole("button", { name: /^完成.*编辑$/ }).click();
        await expect(dialog).toBeHidden();
      }
      await form.getByLabel("第 1 条发音的字典音标").fill(phonetic);
      await form
        .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true })
        .fill(spelling);
    }

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
      .getByRole("textbox", { name: "第 1 条发音的实际发音", exact: true });
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
    await expect
      .poll(() =>
        page
          .getByRole("textbox", { name: /拼写$/ })
          .evaluateAll(
            (fields) =>
              fields.filter(
                (field) =>
                  (field as HTMLTextAreaElement).value === "orbit-common"
              ).length
          )
      )
      .toBe(2);
    await expect(page.getByLabel("原形英式拼写", { exact: true })).toHaveCount(
      2
    );
    await expect(page.getByLabel("原形美式拼写", { exact: true })).toHaveCount(
      2
    );

    await expect(nounGroups).toHaveCount(2);
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(2);
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);

    // 删除首次添加词性时生成的真实复数；保存、刷新后不能再自动补回。
    await expect(
      firstGroup.getByRole("textbox", { name: "复数英式拼写", exact: true })
    ).toHaveValue("");
    await firstGroup.getByLabel("删除变化组 1 的词形 2").click();
    await page.getByLabel("删除词形及相关发音").click();
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(1);
    await page.getByRole("button", { name: "保存草稿" }).click();
    await expect.poll(() => api.getWord().revision).toBe(3);
    const savedNoun = savedForms.pos[0]!;
    const deletedPlural = savedNoun.forms.find(
      (form) => form.form_type === "plural"
    )!;
    expect(api.getWord().forms.pos[0]).toEqual({
      ...savedNoun,
      forms: savedNoun.forms.filter((form) => form.id !== deletedPlural.id),
      form_groups: savedNoun.form_groups.map((group) => ({
        ...group,
        members: group.members.filter(
          (member) => member.form_id !== deletedPlural.id
        )
      }))
    });
    expect(api.getWord().forms.pos[1]).toEqual(savedForms.pos[1]);

    await page.reload();
    await page.getByRole("tab", { name: "名词" }).click();
    await expect(nounGroups).toHaveCount(2);
    await expect(firstGroup.locator(".v3-membership-row")).toHaveCount(1);
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);
    await expect(page.getByRole("textbox", { name: /^复数/ })).toHaveCount(0);
    await expect(
      firstGroup.getByRole("textbox", { name: "原形英式拼写", exact: true })
    ).toHaveValue("orbit-common");
    await expect(
      firstGroup.getByRole("textbox", { name: "原形美式拼写", exact: true })
    ).toHaveValue("orbit-common");
    await expect(
      secondGroup.getByRole("textbox", { name: "原形英式拼写", exact: true })
    ).toHaveValue("orbit-centre");
    await expect(
      secondGroup.getByRole("textbox", { name: "原形美式拼写", exact: true })
    ).toHaveValue("orbit-center");

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
    ).toBe(3);
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

    // 第 2 组默认为空组，手动加一个原形验证词形跟随本组英美规则。
    await secondGroup.getByRole("button", { name: "添加原形" }).click();
    await expect(secondGroup.locator(".v3-membership-row")).toHaveCount(1);

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

  test("E06 Mock 引用影响：被引用词形禁止删除，草稿词性可删除及引用跳转", async ({
    page
  }, testInfo) => {
    const api = await mockAdminV3Api(page, {
      formsFailureOnce: false,
      referencedByShared: true
    });
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);

    const firstGroup = page.locator("[data-pos-id] .v3-form-group-card").nth(0);
    // 引用不锁英美规则编辑，但阻止删除词形。
    await expect(firstGroup.getByLabel("英美拼写有区别")).toBeEnabled();
    await expect(firstGroup.getByLabel("英美音标有区别")).toBeEnabled();
    await expect(
      firstGroup.getByLabel(/修改词形类型会让 \d+ 处引用漂移/)
    ).toBeVisible();
    const deleteForm = firstGroup.getByRole("button", {
      name: "删除变化组 1 的词形 1"
    });
    await expect(deleteForm).toBeDisabled();
    await deleteForm.locator("..").hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "存在 1 处关联，解除所有关联才能删除词形"
    );
    await page.screenshot({
      path: testInfo.outputPath("task-67-delete-guard.png"),
      fullPage: true
    });
    await page.getByRole("heading").first().hover();
    const deletePos = page.getByRole("button", { name: "删除名词" });
    await expect(deletePos).toBeEnabled();
    await deletePos.click();
    const confirmation = page.getByRole("dialog", {
      name: "删除词性“名词”？",
      exact: true
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: /取\s*消/ }).click();
    await expect(confirmation).toBeHidden();
    await expect(deletePos).toBeEnabled();
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
    await mockAdminV3Api(page, { entryCreator: "other", viewerRole: "admin" });
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

test("任务72：专用词形文案与适配条件在真实弹层中展示", async ({
  page
}, testInfo) => {
  const api = await mockAdminV3Api(page);
  const word = api.getWord();
  word.capabilities.multi_group_sense_bindings = true;
  await page.route(
    `**/api/v1/admin${ADMIN_V3_ENTRIES_PATH}/${word.id}`,
    (route) => route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.goto(`/words/${word.id}/v3/wizard/forms`);
  const entry = page.getByLabel("第 1 组专用词义", { exact: true });
  await expect(entry).toHaveText("设置专用词形");
  await entry.click();
  const editor = page.getByLabel("第 1 组适用词义编辑", { exact: true });
  await expect(editor.getByText("适配专用词义")).toBeVisible();
  await expect(editor).toContainText("该词形专属于适配词义，不用于其他词义。");
  await expect(editor).toContainText("至少选一项词义才能适配，可多选。");
  await expect(editor).toContainText("只可适配同一词性下的词义。");
  await expect(editor.getByText(/沿轨道运行/)).toHaveCount(0);
  await expect(editor.getByRole("button", { name: "确认选择" })).toBeDisabled();
  await editor.getByLabel(/运行轨道/).check();
  await expect(editor.getByRole("button", { name: "确认选择" })).toBeEnabled();
  await editor.screenshot({ path: testInfo.outputPath("dedicated-form.png") });
  await editor.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(entry).toHaveText("设置专用词形");
});

test("任务74：释义文字居中、打开变蓝、关闭恢复且弹层不越界", async ({
  page
}, testInfo) => {
  await mockAdminV3Api(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/meanings`);
  await expect(page.locator(".word-sense-sub-pos-badge").first()).toHaveText(
    "Countable noun 可数名词"
  );
  const row = page.locator(".word-definition-row").first();
  const select = row.locator(".word-definition-text-select").first();
  const input = select.getByRole("combobox");
  const content = select.locator(".ant-select-content");
  const popup = page.locator(".word-definition-text-options:visible");
  await expect(row.locator(".word-definition-text-select")).toHaveCount(3);
  await expect(select.locator(".ant-select-suffix")).toHaveCount(0);
  await expect(page.locator(".word-definition-list-header").first()).toHaveText(
    "释义语句语法结构"
  );
  const closedColor = await content.evaluate(
    (el) => getComputedStyle(el).color
  );
  await input.click();
  await expect(popup).toBeVisible();
  await expect(popup).toHaveCSS("opacity", "1");
  await expect(content).toHaveCSS("color", "rgb(32, 83, 255)");
  await expect(content).toHaveCSS("opacity", "1");
  const triggerBox = (await select.boundingBox())!;
  const popupBox = (await popup.boundingBox())!;
  expect(
    Math.abs(
      triggerBox.x + triggerBox.width / 2 - popupBox.x - popupBox.width / 2
    )
  ).toBeLessThan(2);
  await page.screenshot({
    path: testInfo.outputPath("definitions-open.png"),
    fullPage: true
  });
  await popup.getByText("B2", { exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(content).toHaveCSS("color", closedColor);
  await expect(content).toHaveText("B2");
  await input.click();
  await input.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(content).toHaveCSS("color", closedColor);

  // 把真实触发器放到视口两侧，验证菜单比文字宽时的防溢出行为。
  for (const edge of ["left", "right"] as const) {
    await select.evaluate((el, edge) => {
      (el as HTMLElement).style.cssText =
        `position:fixed;top:200px;${edge}:0;width:36px;z-index:1000`;
    }, edge);
    await input.click();
    await expect(popup).toBeVisible();
    await expect(popup).toHaveCSS("opacity", "1");
    await expect
      .poll(async () => (await popup.boundingBox())!.x)
      .toBeGreaterThanOrEqual(0);
    await expect
      .poll(async () => {
        const box = (await popup.boundingBox())!;
        return box.x + box.width;
      })
      .toBeLessThanOrEqual(1440);
    await input.press("Escape");
    await expect(popup).toHaveCount(0);
  }
  await select.evaluate((el) => el.removeAttribute("style"));
  await page.screenshot({
    path: testInfo.outputPath("definitions-closed.png"),
    fullPage: true
  });
});

test("语法引用：选中与下拉保留富文本、基线和稳定弧线空间", async ({ page }) => {
  const api = await mockAdminV3Api(page);
  const word = api.getWord();
  const pos = word.meanings.pos[0]!;
  const grammar = pos.grammar_structures[0]!;
  grammar.variants[0]!.content = {
    version: 2,
    text: "a center of the wall",
    annotations: [
      { type: "emphasis", start: 2, end: 8, level: "core" },
      { type: "emphasis", start: 16, end: 20, level: "core" },
      { type: "liaison", start: 9, end: 20 }
    ]
  };
  const plain = structuredClone(grammar);
  plain.id = "00000000-0000-4000-8000-000000000991";
  plain.variants[0]!.id = "00000000-0000-4000-8000-000000000992";
  plain.variants[0]!.content = {
    version: 2,
    text: "a center of the wall",
    annotations: []
  };
  const long = structuredClone(grammar);
  long.id = "00000000-0000-4000-8000-000000000993";
  long.variants[0]!.id = "00000000-0000-4000-8000-000000000994";
  long.variants[0]!.content.text += " WWWWWWWWWWWWWWWWWWWW";
  pos.grammar_structures.push(plain, long);
  pos.senses[0]!.definitions[0]!.grammar_structure_id = grammar.id;
  await page.route(
    `**/api/v1/admin${ADMIN_V3_ENTRIES_PATH}/${word.id}`,
    (route) => route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.goto(`/words/${word.id}/v3/wizard/meanings`);
  const input = page.getByLabel("定义 1 语法结构", { exact: true }).first();
  const select = page.locator(".word-grammar-select").first();
  await expect(select.locator(".tsz-ve-arc")).toHaveCount(1);
  await expect(select.locator("strong")).toHaveText(["center", "wal", "l"]);
  await input.click();
  const dropdown = page.locator(".ant-select-dropdown:visible");
  await expect(dropdown.locator(".word-grammar-reference-label")).toHaveCount(
    3
  );
  const labels = dropdown.locator(".word-grammar-reference-label");
  await expect(dropdown).toHaveCSS("opacity", "1");
  await dropdown.screenshot({
    path: "/tmp/task62-grammar-desktop-dropdown.png"
  });
  await page.screenshot({
    path: "/tmp/task62-grammar-desktop.png",
    fullPage: true
  });
  const heights = await labels.evaluateAll((nodes) =>
    nodes.map((node) => node.getBoundingClientRect().height)
  );
  expect(heights[0]).toBe(heights[1]);
  const selectedHeight = (await select.boundingBox())!.height;

  // 用真实排版基线探针与 SVG 几何验证，不依赖 jsdom 的零尺寸布局。
  async function checkLayout() {
    for (const label of [
      select.locator(".word-grammar-reference-label"),
      labels.first()
    ]) {
      const geometry = await label.evaluate((el) => {
        const index = el.querySelector(".word-grammar-reference-index")!;
        const reader = el.querySelector(".word-grammar-reference")!;
        const baseline = (parent: Element) => {
          const marker = document.createElement("span");
          marker.style.cssText =
            "display:inline-block;width:0;height:0;padding:0;vertical-align:baseline";
          parent.append(marker);
          const y = marker.getBoundingClientRect().y;
          marker.remove();
          return y;
        };
        const path = el.querySelector(".tsz-ve-arc")!;
        const arc = path.getBoundingClientRect();
        const start = el
          .querySelector('[data-end="start"]')!
          .getBoundingClientRect();
        const end = el
          .querySelector('[data-end="end"]')!
          .getBoundingClientRect();
        const clip = el
          .querySelector(".word-grammar-reference-text")!
          .getBoundingClientRect();
        return {
          startDelta: Math.abs(arc.left - (start.left + start.width / 2)),
          endDelta: Math.abs(arc.right - (end.left + end.width / 2)),
          baselineDelta: Math.abs(baseline(index) - baseline(reader)),
          arcTop: arc.top - 1,
          clipTop: clip.top,
          arcBottom: arc.bottom + 1,
          clipBottom: clip.bottom,
          height: el.getBoundingClientRect().height
        };
      });
      expect(geometry.startDelta).toBeLessThan(3);
      expect(geometry.endDelta).toBeLessThan(3);
      expect(geometry.baselineDelta).toBeLessThan(1);
      expect(geometry.arcTop).toBeGreaterThanOrEqual(geometry.clipTop);
      expect(geometry.arcBottom).toBeLessThanOrEqual(geometry.clipBottom);
      expect(geometry.height).toBe(heights[0]);
    }
    const arrow = await select.locator(".ant-select-suffix").boundingBox();
    const box = (await select.boundingBox())!;
    expect(
      Math.abs(arrow!.y + arrow!.height / 2 - box.y - box.height / 2)
    ).toBeLessThan(1);
  }
  await checkLayout();
  await labels.nth(1).click();
  await expect(dropdown).not.toBeVisible();
  await expect(select.locator(".tsz-ve-arc")).toHaveCount(0);
  expect((await select.boundingBox())!.height).toBe(selectedHeight);
  await select.screenshot({ path: "/tmp/task62-grammar-plain-selected.png" });
  await input.click();
  await labels.first().click();
  await expect(dropdown).not.toBeVisible();
  await expect(select.locator(".tsz-ve-arc")).toHaveCount(1);
  await select.screenshot({ path: "/tmp/task62-grammar-desktop-selected.png" });

  await page.setViewportSize({ width: 320, height: 844 });
  await select.scrollIntoViewIfNeeded();
  await input.click();
  await expect(dropdown).toBeVisible();
  await expect(dropdown).toHaveCSS("opacity", "1");
  await dropdown.screenshot({
    path: "/tmp/task62-grammar-narrow-dropdown.png"
  });
  await checkLayout();
  const box = (await select.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await labels.first().click();
  await expect(dropdown).not.toBeVisible();
  await select.screenshot({ path: "/tmp/task62-grammar-narrow-selected.png" });
  await page.screenshot({ path: "/tmp/task62-grammar-narrow.png" });
  await input.click();
  await labels.nth(2).click();
  await expect(dropdown).not.toBeVisible();
  const overflow = await select
    .locator(".word-grammar-reference-text")
    .evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      overflow: getComputedStyle(el).overflowX,
      ellipsis: getComputedStyle(el).textOverflow
    }));
  expect(overflow.scroll).toBeGreaterThan(overflow.client);
  expect(overflow.overflow).toBe("hidden");
  expect(overflow.ellipsis).toBe("ellipsis");
  await expect(select).toContainText("…");
  await select.screenshot({ path: "/tmp/task62-grammar-narrow-truncated.png" });
});
