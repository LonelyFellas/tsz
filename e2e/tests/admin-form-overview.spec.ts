import { expect, test } from "@playwright/test";
import { validateRuntimeSchema } from "@tsz/api-client";
import {
  ADMIN_V3_MIXED_WORD_ID,
  mockAdminV3Api
} from "./support/mockAdminV3Api";

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
  await picker.getByRole("button", { name: /^完\s*成$/ }).click();
  await expect(picker).toBeHidden();
  await expect(dialog.locator(".v3-content-label")).toHaveCount(3);
  await expect(
    dialog
      .getByRole("radiogroup", { name: "是否规则变化", exact: true })
      .getByRole("radio", { name: "否", exact: true })
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => api.getWord().revision).toBe(2);
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
  await dialog
    .getByRole("button", { name: "分别设置规则变化", exact: true })
    .click();
  const nounRegularity = dialog.getByRole("radiogroup", {
    name: "名词第 1 组原形英美通用是否规则变化",
    exact: true
  });
  const verbRegularity = dialog.getByRole("radiogroup", {
    name: "动词第 1 组原形英美通用是否规则变化",
    exact: true
  });
  await verbRegularity.getByRole("radio", { name: "是", exact: true }).check();
  await expect(
    nounRegularity.getByRole("radio", { name: "否", exact: true })
  ).toBeChecked();
  await expect(
    dialog
      .getByRole("radiogroup", { name: "是否规则变化", exact: true })
      .getByRole("radio", { name: "是", exact: true })
  ).not.toBeChecked();
  await expect(
    dialog
      .getByRole("radiogroup", { name: "是否规则变化", exact: true })
      .getByRole("radio", { name: "否", exact: true })
  ).not.toBeChecked();
  await dialog.screenshot({
    path: test.info().outputPath("regularity-details.png")
  });
  await dialog
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "保存草稿", exact: true }).click();
  await expect.poll(() => api.getWord().revision).toBe(3);
  await page.reload();
  await overview.locator("[data-v3-open-content]").first().click();
  await dialog
    .getByRole("button", { name: "分别设置规则变化", exact: true })
    .click();
  await expect(
    nounRegularity.getByRole("radio", { name: "否", exact: true })
  ).toBeChecked();
  await expect(
    verbRegularity.getByRole("radio", { name: "是", exact: true })
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
