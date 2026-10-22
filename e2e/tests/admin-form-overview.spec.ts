import { expect, test } from "@playwright/test";
import { validateRuntimeSchema } from "@tsz/api-client";
import {
  ADMIN_V3_MIXED_WORD_ID,
  mockAdminV3Api
} from "./support/mockAdminV3Api";

test("发布历史仅在核对与发布页显示，录入步骤底部没有历史卡片", async ({
  page
}) => {
  await mockAdminV3Api(page, { formsFailureOnce: false });
  for (const step of ["basics", "forms", "meanings"]) {
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/${step}`);
    await expect(
      page.locator(
        step === "basics" ? ".word-entry-actions" : ".word-step-actions"
      )
    ).toBeVisible();
    await expect(page.locator(".v3-publication-history")).toHaveCount(0);
  }
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/preview`);
  await expect(page.locator(".v3-publication-history")).toBeVisible();
  await expect(page.getByText("暂无发布记录", { exact: true })).toBeVisible();
  await page
    .locator(".ant-steps-item")
    .filter({ hasText: "词形与发音" })
    .click();
  await expect(page.locator(".v3-forms-step")).toBeVisible();
  await expect(page.locator(".v3-publication-history")).toHaveCount(0);
  await page.locator(".word-step-actions").scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("forms-footer.png") });
});

test("词形和词义操作栏滚动时吸底，到页尾与容器底边对齐且不遮挡正文", async ({
  page
}) => {
  await mockAdminV3Api(page, { formsFailureOnce: false });
  for (const viewport of [
    { width: 1920, height: 1600 },
    { width: 1280, height: 900 },
    { width: 390, height: 844 }
  ]) {
    await page.setViewportSize(viewport);
    for (const step of ["forms", "meanings"]) {
      await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/${step}`);
      const actions = page.locator(".word-step-actions");
      await expect(actions).toBeVisible();
      for (const fraction of [0, 0.5, 1]) {
        await page.evaluate((fraction) => {
          window.scrollTo(
            0,
            (document.documentElement.scrollHeight - innerHeight) * fraction
          );
        }, fraction);
        await expect
          .poll(async () => {
            const box = (await actions.boundingBox())!;
            const shell = (await page
              .locator(".word-creation-shell")
              .boundingBox())!;
            const bottom = Math.min(
              viewport.height,
              shell.y + shell.height - 1
            );
            return Math.abs(box.y + box.height - bottom);
          })
          .toBeLessThanOrEqual(1);
      }
      const shell = (await page.locator(".word-creation-shell").boundingBox())!;
      const summary = (await page
        .locator(".word-creation-summary")
        .boundingBox())!;
      const main = (await page
        .locator(".word-creation-content")
        .boundingBox())!;
      const box = (await actions.boundingBox())!;
      const expectedLeft =
        summary.x + summary.width <= main.x + 1
          ? summary.x + summary.width
          : shell.x + 1;
      expect(Math.abs(box.x - expectedLeft)).toBeLessThanOrEqual(1);
      expect(
        Math.abs(box.x + box.width - (shell.x + shell.width - 1))
      ).toBeLessThanOrEqual(1);
      const lastContent = page
        .locator(step === "forms" ? ".v3-forms-step" : ".word-pos-tabs")
        .last();
      const lastBox = (await lastContent.boundingBox())!;
      expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(box.y);
      await page.screenshot({
        path: test.info().outputPath(`${step}-footer-${viewport.width}.png`)
      });
    }
  }
});

test("未完成草稿可独立打开历史，录入页不常驻历史卡片", async ({ page }) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  word.completed_steps = ["basics"];
  word.max_reachable_step = "forms";
  await page.route(
    `**/api/v1/admin/lexicon/entries/${ADMIN_V3_MIXED_WORD_ID}`,
    (route) => route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
  await expect(page.locator(".v3-form-overview").first()).toBeVisible();
  await expect(page.locator(".v3-publication-history")).toHaveCount(0);
  await page.getByRole("button", { name: "发布历史", exact: true }).click();
  const history = page.getByRole("dialog", { name: "发布历史", exact: true });
  await expect(history.getByText("暂无发布记录")).toBeVisible();
  await expect(page).toHaveURL(/\/wizard\/forms$/);
  await expect
    .poll(async () => (await history.boundingBox())!.width)
    .toBeGreaterThan(850);
  await history.screenshot({
    path: test.info().outputPath("unfinished-draft-history.png"),
    animations: "disabled"
  });
  await history.getByRole("button", { name: /close|关闭/i }).click();
  await expect(page.locator(".v3-publication-history")).toHaveCount(0);
});

test("浏览器后退保护未确认指派，继续编辑后可确认并保存替换", async ({
  page
}) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const original = api.getWord().forms;
  await page.goto("/words");
  await page
    .locator("tbody tr", { hasText: "orbit-v3" })
    .getByRole("button", { name: /继续创建/ })
    .click();
  await page
    .locator(".ant-steps-item")
    .filter({ hasText: "词形与发音" })
    .click();
  await page.locator("[data-v3-open-content]").first().click();
  const drawer = page.getByRole("dialog", { name: /^词形 .* 内容设置$/ });
  await drawer.getByRole("button", { name: "新增标签", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: /这种拼写形式 指派词形标签$/
  });
  await picker.getByRole("checkbox", { name: "动词原形", exact: true }).check();
  await page.goBack();
  const navigation = page.getByRole("dialog", {
    name: "词条还有未保存的修改",
    exact: true
  });
  await navigation
    .getByRole("button", { name: "离开页面", exact: true })
    .click();
  const prompt = page.getByRole("dialog", {
    name: "词形内容尚未应用",
    exact: true
  });
  await expect(prompt.getByText(/动词第 1 组原形/)).toBeVisible();
  await prompt.screenshot({
    path: test.info().outputPath("assignment-leave.png")
  });
  await prompt.getByRole("button", { name: "继续编辑", exact: true }).click();
  await navigation
    .getByRole("button", { name: "继续编辑", exact: true })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: "动词原形", exact: true })
  ).toBeChecked();
  expect(api.getWord().forms).toEqual(original);
  await picker.getByRole("button", { name: "确认替换", exact: true }).click();
  await drawer
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => api.getWord().revision).toBe(2);
  const forms = api.getWord().forms;
  expect(forms.pos.map((pos) => pos.forms.map((form) => form.id))).toEqual(
    original.pos.map((pos) => pos.forms.map((form) => form.id))
  );
  if (!("forms_format" in forms)) throw new Error("Expected shared forms");
  expect(forms.pos[1]!.forms[0]!.content_id).toBe(
    forms.pos[0]!.forms[0]!.content_id
  );
});

test("旧后端缺少替换能力时保持内容可编辑并禁用指派替换", async ({ page }) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  delete word.capabilities.form_content_reassignment;
  await page.route(
    `**/api/v1/admin/lexicon/entries/${ADMIN_V3_MIXED_WORD_ID}`,
    (route) => route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
  await page.locator("[data-v3-open-content]").first().click();
  const dialog = page.getByRole("dialog", { name: /^词形 .* 内容设置$/ });
  await expect(dialog.locator(".word-shared-form-spelling")).toBeVisible();
  await dialog.getByRole("button", { name: "新增标签", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: /这种拼写形式 指派词形标签$/
  });
  await expect(
    picker.getByRole("checkbox", { name: "动词原形", exact: true })
  ).toBeDisabled();
  await expect(picker.getByRole("alert")).toContainText(
    "当前服务暂不支持替换词形内容"
  );
  await picker.screenshot({
    path: test.info().outputPath("old-backend-assignment.png")
  });
});

test("多个原形自动编号，指派只替换选中行且保存刷新后不新增", async ({
  page
}) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  if (!("forms_format" in word.forms)) throw new Error("Expected shared forms");
  const pos = word.forms.pos[0]!;
  const group = pos.form_groups[1]!;
  const targets = group.members.map((member) =>
    pos.forms.find((form) => form.id === member.form_id)!
  );
  targets[1]!.form_type = "base";
  const originalIds = word.forms.pos.map((item) =>
    item.forms.map((form) => form.id)
  );
  await page.route(
    `**/api/v1/admin/lexicon/entries/${ADMIN_V3_MIXED_WORD_ID}`,
    (route) => route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
  const overview = page.locator(".v3-form-overview");
  await expect(
    overview.nth(1).locator(".v3-overview-form-type sup")
  ).toHaveText(["1", "2"]);
  await overview.first().locator("[data-v3-open-content]").first().click();
  const dialog = page.getByRole("dialog", { name: /^词形 .* 内容设置$/ });
  await dialog.getByRole("button", { name: "新增标签", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: /这种拼写形式 指派词形标签$/
  });
  const selected = picker.getByRole("checkbox", {
    name: "名词第 2 组原形 2（orbits）",
    exact: true
  });
  await selected.check();
  await expect(
    picker.getByRole("checkbox", {
      name: "名词第 2 组原形 1（orbital centre）",
      exact: true
    })
  ).not.toBeChecked();
  await selected.uncheck();
  await expect(picker.getByRole("alert")).toHaveCount(0);
  await selected.check();
  await picker.screenshot({
    path: test.info().outputPath("numbered-form-replacement.png")
  });
  await picker.getByRole("button", { name: "确认替换", exact: true }).click();
  await dialog
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => api.getWord().revision).toBe(2);
  const saved = api.getWord().forms;
  expect(saved.pos.map((item) => item.forms.map((form) => form.id))).toEqual(
    originalIds
  );
  expect(
    saved.pos[0]!.forms.find((form) => form.id === targets[0]!.id)
  ).toEqual(targets[0]);
  expect(
    saved.pos[0]!.forms.find((form) => form.id === targets[1]!.id)
  ).toMatchObject({ content_id: pos.forms[0]!.content_id });
  await page.unroute(
    `**/api/v1/admin/lexicon/entries/${ADMIN_V3_MIXED_WORD_ID}`
  );
  await page.reload();
  await expect(
    overview.nth(1).locator(".v3-overview-form-type sup")
  ).toHaveText(["1", "2"]);
  await expect(overview.nth(1).locator(".v3-overview-spelling")).toHaveText([
    "orbital centre",
    "orbit"
  ]);
});

test("词形总览按设计横排发音、音色与语速，窄屏只滚动表格", async ({ page }) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  if (!("forms_format" in word.forms)) throw new Error("Expected shared forms");
  for (const content of word.forms.contents) {
    const regions = content.regional_variants;
    const variants =
      regions.mode === "common" ? [regions.common] : [regions.uk, regions.us];
    for (const variant of variants) {
      for (const pronunciation of variant.pronunciations) {
        pronunciation.synthesis = {
          alphabet: "ipa",
          ipa: "",
          ups: "",
          uk: {
            ipa: "ˈɔːbɪt",
            ups: "",
            ipa_speech: {
              content: { version: 2, text: variant.spelling, annotations: [] },
              voice_profile: {
                voices: [
                  { voice_id: "libby", enabled: true, rate_percent: -30 }
                ]
              }
            }
          },
          us: {
            ipa: "ˈɔrbɪt",
            ups: "",
            ipa_speech: {
              content: { version: 2, text: variant.spelling, annotations: [] },
              voice_profile: {
                voices: [
                  { voice_id: "andrew", enabled: true, rate_percent: -45 }
                ]
              }
            }
          }
        };
      }
    }
  }
  const firstRegions = word.forms.contents[0]!.regional_variants;
  if (firstRegions.mode !== "common")
    throw new Error("Expected common variant");
  firstRegions.common.pronunciations[1]!.actual_pron =
    "ˌsuːpəkælɪfrædʒɪlɪstɪkˌekspiːælɪˈdəʊʃəs";
  const response = { word, retired_stable_nodes: [] };
  expect(validateRuntimeSchema("AdminWordDraftV3Envelope", response)).toEqual({
    valid: true
  });
  await page.route(
    `**/api/v1/admin/lexicon/entries/${ADMIN_V3_MIXED_WORD_ID}`,
    (route) => route.fulfill({ json: response })
  );
  await page.route("**/api/v1/admin/speech/voices", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            alias: "libby",
            display_name: "Libby",
            locale: "en-GB",
            gender: "female"
          },
          {
            alias: "andrew",
            display_name: "Andrew",
            locale: "en-US",
            gender: "male"
          }
        ].map((voice) => ({
          ...voice,
          is_common: true,
          capabilities: {
            styles: [],
            min_rate_percent: -50,
            max_rate_percent: 100,
            min_pitch_semitones: -12,
            max_pitch_semitones: 12
          }
        }))
      }
    })
  );
  await page.route("**/api/v1/admin/speech/library", (route) =>
    route.fulfill({ json: { items: [] } })
  );
  await page.route("**/api/v1/admin/speech/groups", (route) =>
    route.fulfill({ json: { groups: [], revision: 0 } })
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1100 });
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
  const overview = page.locator(".v3-form-overview").first();
  await expect(overview).toBeVisible();
  await expect(overview.getByRole("combobox")).toHaveCount(0);
  await expect(overview.locator(".v3-overview-form-type")).toHaveText("原形");
  await expect(overview.getByText("Libby", { exact: true })).toHaveCount(2);
  await expect(overview.getByText("Andrew", { exact: true })).toHaveCount(2);
  await expect(overview.getByText("0.70×", { exact: true })).toHaveCount(2);
  await expect(overview.getByText("0.55×", { exact: true })).toHaveCount(2);
  await expect(
    overview.getByRole("button", { name: "读法 1英式 播放语音", exact: true })
  ).toBeEnabled();
  await expect(
    overview.getByRole("button", { name: "读法 1美式 播放语音", exact: true })
  ).toBeEnabled();
  await overview.screenshot({ path: test.info().outputPath("overview.png") });
  await expect(overview.getByRole("columnheader")).toHaveText([
    "词形名称",
    "词形变化",
    "英式发音",
    "音色",
    "语速",
    "美式发音",
    "音色",
    "语速",
    ""
  ]);
  await expect(overview.getByRole("button", { name: /获取语音/ })).toHaveCount(
    0
  );
  for (const reading of await overview
    .locator(".v3-overview-pronunciation")
    .all()) {
    const geometry = await reading.evaluate((node) => {
      const button = node.querySelector("button")!.getBoundingClientRect();
      const text = node
        .querySelector(".tsz-ve-readonly")!
        .getBoundingClientRect();
      return {
        left: button.right <= text.left,
        centerDelta: Math.abs(
          button.y + button.height / 2 - text.y - text.height / 2
        )
      };
    });
    expect(geometry.left).toBe(true);
    expect(geometry.centerDelta).toBeLessThan(2);
  }
  await expect(overview.locator(".v3-overview-pronunciation")).toHaveCount(4);
  for (const [dialect, color] of [
    ["uk", "rgb(47, 91, 255)"],
    ["us", "rgb(212, 42, 145)"]
  ]) {
    await expect(
      overview.locator(`[data-playback-dialect="${dialect}"]`).first()
    ).toHaveCSS("color", color!);
  }
  await overview.locator("[data-v3-open-content]").first().click();
  const dialog = page.getByRole("dialog", { name: /^词形 .* 内容设置$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveClass(/ant-drawer-section/);
  await dialog.screenshot({
    path: test.info().outputPath("content-drawer.png")
  });
  await dialog
    .getByRole("radiogroup", { name: "英美音标是否有区别", exact: true })
    .getByRole("radio", { name: "是", exact: true })
    .check();
  const ukPronunciation = dialog.locator(".word-shared-pronunciation-uk");
  const usPronunciation = dialog.locator(".word-shared-pronunciation-us");
  await expect(ukPronunciation).toBeVisible();
  await expect(usPronunciation).toBeVisible();
  await expect(dialog.locator(".word-shared-form-spelling")).toHaveCount(1);
  const ukBox = (await ukPronunciation.boundingBox())!;
  const usBox = (await usPronunciation.boundingBox())!;
  expect(Math.abs(ukBox.y - usBox.y)).toBeLessThan(1);
  expect(usBox.x).toBeGreaterThanOrEqual(ukBox.x + ukBox.width);
  await dialog.screenshot({
    path: test.info().outputPath("content-drawer-dialects.png")
  });
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await page.getByRole("button", { name: "放弃修改", exact: true }).click();
  await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 390, height: 844 });
  const content = overview.locator(".ant-table-content");
  expect(
    await content.evaluate((node) => node.scrollWidth > node.clientWidth)
  ).toBe(true);
  for (const reading of await overview
    .locator(".v3-overview-pronunciation")
    .all()) {
    expect(
      await reading.evaluate((node) => {
        const phonetic = node.querySelector(".v3-overview-phonetic")!;
        return (
          phonetic.getBoundingClientRect().right <=
          node.closest("td")!.getBoundingClientRect().right
        );
      })
    ).toBe(true);
  }
  await content.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await overview.evaluate((node) => node.scrollIntoView({ block: "center" }));
  await overview.screenshot({
    path: test.info().outputPath("overview-narrow.png")
  });
  expect(await content.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  await overview.locator("[data-v3-open-content]").first().click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "确认，应用到草稿" })
  ).toBeInViewport();
  expect(
    await dialog.evaluate((node) => node.getBoundingClientRect().width)
  ).toBeLessThanOrEqual(391);
  await dialog.screenshot({
    path: test.info().outputPath("content-drawer-narrow.png")
  });
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(dialog).toBeHidden();
  await page.setViewportSize({ width: 1920, height: 1100 });
  await overview.locator("[data-v3-open-content]").first().click();
  await dialog
    .getByRole("radiogroup", { name: "是否规则变化", exact: true })
    .getByRole("radio", { name: "否", exact: true })
    .check();
  await dialog.getByRole("button", { name: "新增标签", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: /这种拼写形式 指派词形标签$/
  });
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("combobox")).toHaveCount(0);
  await expect(
    picker.getByRole("region", { name: "名词词形标签" })
  ).toBeVisible();
  await expect(
    picker.getByRole("region", { name: "动词词形标签" })
  ).toBeVisible();
  await expect(
    picker.getByRole("checkbox", { name: "名词第 1 组原形", exact: true })
  ).toBeChecked();
  await expect(
    picker.getByRole("checkbox", { name: "名词第 1 组原形", exact: true })
  ).toBeDisabled();
  await expect(picker.getByRole("checkbox")).toHaveCount(4);
  await expect(
    picker.getByRole("checkbox", { name: "名词第 1 组复数", exact: true })
  ).toHaveCount(0);
  await expect(
    picker.getByRole("checkbox", { name: "动词第三人称单数", exact: true })
  ).toHaveCount(0);
  await picker
    .getByRole("checkbox", { name: "名词第 2 组复数", exact: true })
    .check();
  await picker.getByRole("checkbox", { name: "动词原形", exact: true }).check();
  await picker.screenshot({
    path: test.info().outputPath("label-assignment.png")
  });
  await expect(picker.getByRole("alert")).toContainText(
    "以下词形的拼写与发音将被替换"
  );
  await picker.getByRole("button", { name: "确认替换", exact: true }).click();
  await expect(picker).toBeHidden();
  await expect(dialog.locator(".v3-content-label")).toHaveCount(3);
  await dialog
    .getByRole("radiogroup", { name: "是否规则变化", exact: true })
    .getByRole("radio", { name: "否", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => api.getWord().revision).toBe(2);
  expect(
    api.getWord().forms.pos.map((pos) => pos.forms.map((form) => form.id))
  ).toEqual(word.forms.pos.map((pos) => pos.forms.map((form) => form.id)));
  expect(api.getWord().forms.pos.map((pos) => pos.form_groups)).toEqual(
    word.forms.pos.map((pos) => pos.form_groups)
  );
  await page.unroute(
    `**/api/v1/admin/lexicon/entries/${ADMIN_V3_MIXED_WORD_ID}`
  );
  await page.reload();
  await overview.locator("[data-v3-open-content]").first().click();
  await expect(dialog.locator(".v3-content-label")).toHaveCount(3);
  await expect(
    dialog
      .getByRole("radiogroup", { name: "是否规则变化", exact: true })
      .getByRole("radio", { name: "否", exact: true })
  ).toBeChecked();
  await dialog.getByRole("button", { name: "新增标签", exact: true }).click();
  await expect(
    picker.getByRole("checkbox", { name: "名词第 2 组复数", exact: true })
  ).toBeChecked();
  await expect(
    picker.getByRole("checkbox", { name: "动词原形", exact: true })
  ).toBeChecked();
  await page.setViewportSize({ width: 390, height: 844 });
  await picker.screenshot({
    path: test.info().outputPath("label-assignment-narrow.png")
  });
  await picker.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(picker).toBeHidden();
  await dialog.getByRole("button", { name: /^取\s*消$/ }).click();
  await expect(dialog).toBeHidden();
  expect(errors).toEqual([]);
});
