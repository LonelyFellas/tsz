import { expect, test } from "@playwright/test";
import { validateRuntimeSchema } from "@tsz/api-client";
import {
  ADMIN_V3_MIXED_WORD_ID,
  mockAdminV3Api
} from "./support/mockAdminV3Api";

test("整组音标拖动复制后保存重开保持独立，音色复制不改音标", async ({
  page
}) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  const source = word.forms.contents[0]!;
  const target = word.forms.contents[2]!;
  if (
    source.regional_variants.mode !== "common" ||
    target.regional_variants.mode !== "common"
  )
    throw new Error("fixture");
  source.regional_variants.common.pronunciations =
    source.regional_variants.common.pronunciations.slice(0, 1);
  for (const pos of word.forms.pos)
    for (const form of pos.forms) {
      if (
        form.content_id === source.id &&
        form.regional_bindings.mode === "common"
      ) {
        form.regional_bindings.common.pronunciations =
          form.regional_bindings.common.pronunciations.slice(0, 1);
      }
    }
  const profile = (voice: string, rate: number) => ({
    voices: (["en-GB", "en-US"] as const).map((locale) => ({
      voice_id: `${voice}-${locale}`,
      locale,
      enabled: true,
      rate_percent: rate,
      volume_percent: 80
    }))
  });
  source.regional_variants.common.pronunciations[0]!.voice_profile = profile(
    "source-voice",
    -20
  );
  target.regional_variants.common.pronunciations[0]!.voice_profile = profile(
    "target-voice",
    10
  );
  let saved = false;
  await page.route(`**/api/v1/admin/lexicon/entries/${word.id}`, (route) =>
    saved
      ? route.fallback()
      : route.fulfill({ json: { word, retired_stable_nodes: [] } })
  );
  await page.route("**/api/v1/admin/speech/voices", (route) =>
    route.fulfill({
      json: {
        items: ["source-voice", "target-voice"].flatMap((voice) =>
          ["en-GB", "en-US"].map((locale) => ({
            alias: `${voice}-${locale}`,
            display_name: voice,
            locale,
            gender: "female",
            is_common: true,
            capabilities: {
              styles: [],
              min_rate_percent: -50,
              max_rate_percent: 100,
              min_pitch_semitones: -12,
              max_pitch_semitones: 12
            }
          }))
        )
      }
    })
  );
  await page.setViewportSize({ width: 1440, height: 1600 });
  await page.goto(`/words/${word.id}/v3/wizard/forms`);
  const sourceId = word.forms.pos[0]!.forms[0]!.id;
  const targetId = word.forms.pos[0]!.forms[2]!.id;
  const sourceRow = page
    .locator(`tr.v3-overview-form-start[data-overview-form-id="${sourceId}"]`)
    .first();
  const targetCell = page
    .locator(
      `[data-form-copy-target="${targetId}"][data-form-copy-kind="phonetics"]`
    )
    .first();
  await sourceRow
    .getByRole("button", { name: "复制英美音标", exact: true })
    .dragTo(targetCell);
  await expect(
    page.getByRole("button", { name: "撤销", exact: true })
  ).toBeVisible();
  await expect(targetCell).toContainText("ˈɔːbɪt");
  const save = page.getByRole("button", { name: /保存草稿$/ });
  await expect(save).toBeEnabled();
  saved = true;
  await save.click();
  await expect(save).not.toHaveClass(/ant-btn-loading/);
  await expect(save).toBeDisabled();
  const afterPhonetics = api
    .getWord()
    .forms.contents.find((row) => row.id === target.id)!;
  if (afterPhonetics.regional_variants.mode !== "common")
    throw new Error("fixture");
  expect(afterPhonetics.regional_variants.common.spelling).toBe("orbits");
  expect(
    afterPhonetics.regional_variants.common.pronunciations[0]!.voice_profile
  ).toEqual(profile("target-voice", 10));
  await page.reload();
  await expect(targetCell).toContainText("ˈɔːbɪt");
  await sourceRow
    .getByRole("button", { name: "复制英美音色参数", exact: true })
    .click();
  await page
    .locator(
      `[data-form-copy-target="${targetId}"][data-form-copy-kind="voices"]`
    )
    .first()
    .click({ position: { x: 5, y: 5 } });
  await expect(
    page.getByRole("button", { name: "撤销", exact: true })
  ).toBeVisible();
  await save.click();
  await expect(save).toBeDisabled();
  const final = api.getWord().forms;
  const copied = final.contents.find((row) => row.id === target.id)!;
  if (copied.regional_variants.mode !== "common") throw new Error("fixture");
  expect(copied.regional_variants.common.pronunciations[0]!.actual_pron).toBe(
    "ˈɔːbɪt"
  );
  expect(
    copied.regional_variants.common.pronunciations[0]!.voice_profile?.voices[0]
  ).toMatchObject({
    voice_id: "source-voice-en-GB",
    rate_percent: -20,
    volume_percent: 80
  });
  expect(final.contents.find((row) => row.id === source.id)).toEqual(source);
  expect(final.pos).toEqual(word.forms.pos);
  await page.screenshot({
    path: test.info().outputPath("form-copy-after-save.png"),
    animations: "disabled"
  });
});

test("发布历史仅在预览并生效页显示，录入步骤没有历史入口", async ({ page }) => {
  await mockAdminV3Api(page, { formsFailureOnce: false });
  for (const step of ["basics", "forms", "meanings"]) {
    await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/${step}`);
    await expect(
      page.locator(
        step === "basics" ? ".word-entry-actions" : ".word-step-actions"
      )
    ).toBeVisible();
    await expect(page.locator(".v3-publication-history")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "发布历史", exact: true })
    ).toHaveCount(0);
    await page.screenshot({
      path: test.info().outputPath(`${step}-without-history.png`),
      animations: "disabled"
    });
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
        if (step === "forms") {
          await expect
            .poll(() =>
              actions.evaluate((node) => {
                const box = node.getBoundingClientRect();
                return [0.05, 0.15, 0.35, 0.65, 0.95].every((position) =>
                  node.contains(
                    document.elementFromPoint(
                      box.left + box.width * position,
                      box.top + box.height / 2
                    )
                  )
                );
              })
            )
            .toBe(true);
        }
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

test("未完成草稿的录入页不显示发布历史入口或弹窗", async ({ page }) => {
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
  await expect(
    page.getByRole("button", { name: "发布历史", exact: true })
  ).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "发布历史", exact: true })
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/wizard\/forms$/);
});

test("类型校验修复入口在中等宽度和窄屏完整可见并可修改词形", async ({
  page
}) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  const pos = word.forms.pos[0]!;
  const form = pos.forms.find((item) => item.form_type === "plural")!;
  await page.route(
    `**/api/v1/admin/lexicon/entries/${word.id}/validate`,
    (route) =>
      route.fulfill({
        json: {
          schema_version: 3,
          validated_revision: word.revision,
          valid: false,
          issues: [
            {
              schema_version: 3,
              step: "forms",
              node_id: form.id,
              field: "form_type",
              code: "invalid_form_type_for_part_of_speech",
              message: "请选择可用词形类型",
              node_location: {
                node_role: "form",
                ancestor_node_ids: [pos.pos_id],
                pos_id: pos.pos_id,
                form_id: form.id
              }
            }
          ]
        }
      })
  );
  await page.goto(`/words/${word.id}/v3/wizard/preview`);
  await page.getByRole("button", { name: "检查发布条件", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "发布待完成摘要" })
  ).toBeVisible();
  await page
    .locator(".ant-steps-item")
    .filter({ hasText: "词形与发音" })
    .click();
  const fix = page.getByRole("button", { name: "调整复数词形类型" });
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 1100 });
    await fix.scrollIntoViewIfNeeded();
    await expect(fix).toBeEnabled();
    expect(
      await fix.evaluate((button) => {
        const box = button.getBoundingClientRect();
        const cell = button.closest("td")!.getBoundingClientRect();
        return (
          box.left >= cell.left &&
          box.right <= cell.right &&
          box.top >= cell.top &&
          box.bottom <= cell.bottom &&
          button.scrollWidth <= button.clientWidth
        );
      })
    ).toBe(true);
  }
  await fix.click();
  await page.getByRole("menuitem", { name: "原形", exact: true }).click();
  const row = page.locator(".ant-table-row").filter({
    has: page.locator(`[data-v3-open-content="${form.id}"]`)
  });
  await expect(row.locator(".v3-overview-form-type")).toContainText("原形");
  await expect(
    page.getByRole("button", { name: "保存草稿", exact: true })
  ).toBeEnabled();
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

test("词形总览按英美发音逐行对应读法、音色、语速与音量，窄屏只滚动表格", async ({
  page
}) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  if (!("forms_format" in word.forms)) throw new Error("Expected shared forms");
  const splitForm = word.forms.pos[0]!.forms[1]!;
  const splitContent = word.forms.contents.find(
    (content) => content.id === splitForm.content_id
  )!;
  const splitRegions = splitContent.regional_variants;
  const splitBindings = splitForm.regional_bindings;
  if (splitRegions.mode !== "common" || splitBindings.mode !== "common")
    throw new Error("Expected common variant and binding");
  const ukVariant = splitRegions.common;
  ukVariant.pronunciations[0]!.style = "citation";
  ukVariant.pronunciations.push({
    ...structuredClone(ukVariant.pronunciations[0]!),
    id: "01990000-0000-7000-8000-000000009001",
    actual_pron: "ˈɔːbɪtəl ˈsentə",
    style: "weak"
  });
  const usVariant = {
    ...structuredClone(ukVariant),
    id: "01990000-0000-7000-8000-000000009002",
    spelling: "orbital center",
    pronunciations: [
      {
        ...structuredClone(ukVariant.pronunciations[0]!),
        id: "01990000-0000-7000-8000-000000009003",
        actual_pron: "ˈɔrbɪtl ˈsentər",
        style: "normal" as const
      }
    ]
  };
  splitContent.dialect_rules = {
    spelling_mode: "distinguish",
    phonetic_mode: "distinguish"
  };
  splitContent.regional_variants = {
    mode: "uk_us",
    uk: ukVariant,
    us: usVariant
  };
  splitForm.regional_bindings = {
    mode: "uk_us",
    uk: {
      ...splitBindings.common,
      pronunciations: [
        ...splitBindings.common.pronunciations,
        {
          id: "01990000-0000-7000-8000-000000009004",
          content_slot_id: ukVariant.pronunciations[1]!.id
        }
      ]
    },
    us: {
      ...splitBindings.common,
      id: "01990000-0000-7000-8000-000000009005",
      content_slot_id: usVariant.id,
      pronunciations: [
        {
          id: "01990000-0000-7000-8000-000000009006",
          content_slot_id: usVariant.pronunciations[0]!.id
        }
      ]
    }
  };
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
                  {
                    voice_id: "libby",
                    enabled: true,
                    rate_percent: -30,
                    volume_percent: 65
                  }
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
  firstRegions.common.pronunciations[0]!.synthesis!.uk!.ipa_speech!.voice_profile!.voices.push(
    {
      voice_id: "sonia",
      enabled: true,
      rate_percent: 20
    }
  );
  const longPronunciation = firstRegions.common.pronunciations[1]!;
  longPronunciation.synthesis!.uk!.ipa_speech!.voice_profile!.voices[0]!.volume_percent = 0;
  const prefix = "ˌsuːpəkælɪfrædʒɪlɪstɪkˌekspiːælɪˈdəʊʃəs ";
  longPronunciation.actual_pron = `${prefix}pick it up`;
  longPronunciation.actual_pron_rich = {
    version: 2,
    text: longPronunciation.actual_pron,
    annotations: [
      {
        type: "liaison",
        start: Array.from(prefix).length + 3,
        end: Array.from(prefix).length + 6
      }
    ]
  };
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
          },
          {
            alias: "sonia",
            display_name: "Sonia",
            locale: "en-GB",
            gender: "female"
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
  const formRows = overview.locator("tbody tr[data-overview-form-id]");
  await expect(formRows).toHaveCount(4);
  expect(
    await formRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-overview-dialect"))
    )
  ).toEqual(["uk", "uk", "us", "us"]);
  await expect(overview.locator(".v3-overview-form-start")).toHaveCount(1);
  await expect(overview.locator(".v3-overview-spelling")).toHaveText(["orbit"]);
  await expect(
    overview.locator('.v3-overview-dialect-dot[data-spelling-dialect="common"]')
  ).toHaveCount(1);
  for (const selector of [
    ".v3-overview-form-type",
    ".v3-overview-spellings",
    ".v3-overview-actions"
  ]) {
    expect(
      await overview
        .locator(selector)
        .evaluate((node) => node.closest("td")!.rowSpan)
    ).toBe(4);
  }
  const splitRows = page.locator(`tr[data-overview-form-id="${splitForm.id}"]`);
  await expect(splitRows).toHaveCount(3);
  for (const [index, style] of ["逐字正音", "弱读", "语流连读"].entries()) {
    await expect(
      splitRows.nth(index).getByRole("cell", { name: style, exact: true })
    ).toBeVisible();
  }
  expect(
    await splitRows.evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-overview-dialect"))
    )
  ).toEqual(["uk", "uk", "us"]);
  await expect(
    splitRows.locator(".v3-overview-phonetic .tsz-ve-readonly")
  ).toHaveText([
    ...ukVariant.pronunciations.map(
      (pronunciation) => pronunciation.actual_pron
    ),
    ...usVariant.pronunciations.map(
      (pronunciation) => pronunciation.actual_pron
    )
  ]);
  await expect(splitRows.locator(".v3-overview-spelling")).toHaveText([
    "orbital centre",
    "orbital center"
  ]);
  expect(
    await splitRows.locator(".v3-overview-dialect-dot").evaluateAll((dots) =>
      dots.map((dot) => ({
        dialect: dot.getAttribute("data-spelling-dialect"),
        rowSpan: dot.closest("td")!.rowSpan
      }))
    )
  ).toEqual([
    { dialect: "uk", rowSpan: 2 },
    { dialect: "us", rowSpan: 1 }
  ]);
  const assertReadingsAligned = async () => {
    const readings = await page
      .locator(".v3-form-overview tbody tr[data-overview-dialect]")
      .evaluateAll((rows) =>
        rows.map((row) =>
          [...row.querySelectorAll<HTMLElement>(".v3-overview-reading")].map(
            (reading) => {
              const box = reading.getBoundingClientRect();
              const cell = reading.closest("td")!.getBoundingClientRect();
              return {
                top: box.top,
                fits:
                  box.left >= cell.left - 1 &&
                  box.right <= cell.right + 1 &&
                  box.top >= cell.top - 1 &&
                  box.bottom <= cell.bottom + 1 &&
                  reading.scrollWidth <= reading.clientWidth + 1 &&
                  reading.scrollHeight <= reading.clientHeight + 1
              };
            }
          )
        )
      );
    for (const cells of readings) {
      expect(cells).toHaveLength(5);
      for (const cell of cells) {
        expect(Math.abs(cell.top - cells[0]!.top)).toBeLessThan(1);
        expect(cell.fits).toBe(true);
      }
    }
  };
  const assertLiaisonAligned = async () => {
    const reader = overview
      .locator(".v3-overview-phonetic .has-liaison")
      .first();
    await expect(
      reader.locator(".tsz-ve-arc-layer path").first()
    ).toBeVisible();
    await expect
      .poll(() =>
        reader.evaluate((node) => {
          const svg = node.querySelector<SVGSVGElement>(".tsz-ve-arc-layer")!;
          const path = svg.querySelector<SVGPathElement>("path")!;
          const anchor = node.querySelector('[data-end="start"]')!;
          const range = document.createRange();
          range.selectNodeContents(anchor);
          const text = range.getBoundingClientRect();
          const start = path
            .getPointAtLength(0)
            .matrixTransform(svg.getScreenCTM()!);
          return (
            Math.abs(start.x - (text.left + text.right) / 2) < 2 &&
            Math.abs(start.y - text.top) < 8
          );
        })
      )
      .toBe(true);
  };
  for (const width of [2560, 1920, 1440, 1280, 1024]) {
    await page.setViewportSize({ width, height: 1100 });
    await expect
      .poll(() =>
        overview.evaluate((node) => {
          const table = node.getBoundingClientRect();
          const body = node.closest(".ant-card-body")!.getBoundingClientRect();
          return Math.abs(table.width - body.width);
        })
      )
      .toBeLessThanOrEqual(1);
    await expect
      .poll(() =>
        overview.evaluate((node) => {
          const tab = node.closest(".v3-pos-tab")!;
          const card = node
            .closest(".v3-form-group-card")!
            .getBoundingClientRect();
          const addGroup = tab
            .querySelector(".word-form-add-group")!
            .getBoundingClientRect();
          return (
            card.width <= 1201 &&
            Math.abs(card.left - addGroup.left) <= 1 &&
            Math.abs(card.right - addGroup.right) <= 1
          );
        })
      )
      .toBe(true);
    await overview.screenshot({
      path: test.info().outputPath(`overview-${width}.png`),
      animations: "disabled"
    });
    if (width >= 1920) {
      await page
        .locator(".v3-form-group-card")
        .nth(1)
        .screenshot({
          path: test.info().outputPath(`overview-group-${width}.png`),
          animations: "disabled"
        });
    }
    await expect
      .poll(() =>
        overview.locator(".ant-table-content").evaluate((node) => ({
          fits: node.scrollWidth <= node.clientWidth,
          pageFits: document.documentElement.scrollWidth <= window.innerWidth
        }))
      )
      .toEqual({ fits: true, pageFits: true });
    await assertLiaisonAligned();
    await assertReadingsAligned();
    const voiceDetails = overview.getByRole("button", {
      name: "查看英式全部 2 个音色"
    });
    await voiceDetails.click();
    const voicePopover = page.locator(".word-pronunciation-voice-popover");
    const sonia = voicePopover
      .getByRole("listitem")
      .filter({ hasText: "Sonia" });
    await expect(sonia).toBeVisible();
    await expect(sonia).toContainText("en-GB");
    await expect(sonia).toContainText("1.20×");
    await expect(
      sonia.getByRole("button", { name: "Sonia · en-GB 获取语音" })
    ).toBeEnabled();
    expect(
      await sonia.evaluate((row) => {
        const info = row
          .querySelector(".word-pronunciation-voice-info")!
          .getBoundingClientRect();
        const rate = row
          .querySelector(".word-pronunciation-voice-rate")!
          .getBoundingClientRect();
        const controls = row
          .querySelector(".word-pronunciation-voice-controls")!
          .getBoundingClientRect();
        return (
          info.right <= rate.left &&
          rate.right <= controls.left &&
          Math.abs(
            rate.top + rate.height / 2 - controls.top - controls.height / 2
          ) < 1
        );
      })
    ).toBe(true);
    if (width === 1440) {
      await voicePopover.screenshot({
        path: test.info().outputPath("voice-popover.png"),
        animations: "disabled"
      });
    }
    await assertReadingsAligned();
    await voiceDetails.click();
    await expect(
      page.getByRole("listitem").filter({ hasText: "Sonia" })
    ).toBeHidden();
    await assertReadingsAligned();
  }
  await page.setViewportSize({ width: 1920, height: 1100 });
  await expect(overview.getByRole("combobox")).toHaveCount(0);
  await expect(overview.locator(".v3-overview-form-type")).toHaveText("原形");
  await expect(overview.getByText("Libby", { exact: true })).toHaveCount(2);
  await expect(overview.getByText("Andrew", { exact: true })).toHaveCount(2);
  await expect(overview.getByText("0.70×", { exact: true })).toHaveCount(2);
  await expect(overview.getByText("0.55×", { exact: true })).toHaveCount(2);
  await expect(formRows.locator("td:last-child")).toHaveText([
    "65%",
    "0%",
    "100%",
    "100%"
  ]);
  await expect(
    overview.getByRole("button", { name: "读法 1英式 播放语音", exact: true })
  ).toBeEnabled();
  await expect(
    overview.getByRole("button", { name: "读法 1美式 播放语音", exact: true })
  ).toBeEnabled();
  await overview.screenshot({ path: test.info().outputPath("overview.png") });
  await expect(overview.getByRole("columnheader")).toHaveText([
    "操作",
    "词形名称",
    "词形拼写",
    "读法",
    "实际发音",
    "音色",
    "语速",
    "音量"
  ]);
  const actionButtons = formRows
    .first()
    .locator("td")
    .first()
    .getByRole("button");
  await expect(actionButtons).toHaveCount(2);
  await expect(actionButtons.nth(0)).toHaveAccessibleName(/删除/);
  await expect(actionButtons.nth(1)).toHaveAttribute("data-v3-open-content");
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
        fits: text.right <= node.closest("td")!.getBoundingClientRect().right
      };
    });
    expect(geometry).toEqual({ left: true, fits: true });
  }
  await expect(overview.locator(".v3-overview-pronunciation")).toHaveCount(4);
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
  await assertLiaisonAligned();
  await assertReadingsAligned();
  const voiceDetails = overview.getByRole("button", {
    name: "查看英式全部 2 个音色"
  });
  await voiceDetails.click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Sonia" })
  ).toBeVisible();
  const narrowPopover = page.locator(".word-pronunciation-voice-popover");
  await expect
    .poll(() =>
      narrowPopover.evaluate((node) => {
        const box = node.getBoundingClientRect();
        return (
          box.left >= 0 &&
          box.right <= window.innerWidth &&
          box.top >= 0 &&
          box.bottom <= window.innerHeight &&
          getComputedStyle(node).opacity === "1" &&
          document.documentElement.scrollWidth <= window.innerWidth
        );
      })
    )
    .toBe(true);
  await narrowPopover.screenshot({
    path: test.info().outputPath("voice-popover-narrow.png"),
    animations: "disabled"
  });
  await assertReadingsAligned();
  await voiceDetails.click();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Sonia" })
  ).toBeHidden();
  await assertReadingsAligned();
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
        const range = document.createRange();
        range.selectNodeContents(phonetic);
        const text = range.getBoundingClientRect();
        const cell = node.closest("td")!.getBoundingClientRect();
        return (
          text.left >= cell.left &&
          text.right <= cell.right &&
          text.top >= cell.top &&
          text.bottom <= cell.bottom
        );
      })
    ).toBe(true);
  }
  const shortReading = (await formRows.nth(0).boundingBox())!;
  const longReading = (await formRows.nth(1).boundingBox())!;
  expect(longReading.height).toBeGreaterThan(shortReading.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
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
  await dialog.getByRole("combobox", { name: "第 1 条发音的读法" }).click();
  await page
    .locator(".ant-select-dropdown:visible")
    .getByText("逐字正音", { exact: true })
    .click();
  await dialog
    .getByRole("radiogroup", { name: "是否规则变化", exact: true })
    .getByRole("radio", { name: "否", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await expect(
    overview.getByRole("cell", { name: "逐字正音", exact: true })
  ).toHaveCount(2);
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
  await expect(
    overview.getByRole("cell", { name: "逐字正音", exact: true })
  ).toHaveCount(2);
  await expect(formRows.locator("td:last-child")).toHaveText([
    "65%",
    "0%",
    "100%",
    "100%"
  ]);
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
