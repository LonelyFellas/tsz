import { expect, test, type Page } from "@playwright/test";
import type {
  AdminDubbingGroupsResponse,
  SharedFormsStepContentV3
} from "@tsz/types";
import {
  mockAdminV3Api,
  ADMIN_V3_MIXED_WORD_ID,
  ADMIN_V3_ENTRIES_PATH
} from "./support/mockAdminV3Api";

const voices = [
  {
    alias: "en-GB-SoniaNeural",
    display_name: "Sonia",
    locale: "en-GB",
    gender: "Female",
    is_common: true,
    capabilities: {
      styles: ["cheerful"],
      min_rate_percent: -50,
      max_rate_percent: 50,
      min_pitch_semitones: -10,
      max_pitch_semitones: 10
    }
  },
  {
    alias: "en-US-GuyNeural",
    display_name: "Guy",
    locale: "en-US",
    gender: "Male",
    is_common: false,
    capabilities: {
      styles: [],
      min_rate_percent: 0,
      max_rate_percent: 0,
      min_pitch_semitones: 0,
      max_pitch_semitones: 0
    }
  }
];

// A silent WAV validates browser playback only; it is not synthesized speech.
function silentWav() {
  const pcmSize = 16000;
  const buffer = Buffer.alloc(44 + pcmSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcmSize, 4);
  buffer.write("WAVEfmt ", 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcmSize, 40);
  return buffer;
}

async function mockApi(
  page: Page,
  permissions = ["words.access", "speech.generate"]
) {
  const previews: Record<string, unknown>[] = [];
  let groups: AdminDubbingGroupsResponse = { groups: [], revision: 0 };
  const library = voices.map((voice) => ({
    voice_alias: voice.alias,
    description_zh: null as string | null,
    description_revision: 0,
    parameters: null as Record<string, unknown> | null,
    notes: "",
    personal_revision: 0
  }));
  await page.route("**/__voice-fixture.wav", (route) =>
    route.fulfill({ contentType: "audio/wav", body: silentWav() })
  );
  await page.route("**/api/v1/admin/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(
      /^.*\/api\/v1\/admin/,
      ""
    );
    let body: unknown;
    if (path === "/auth/refresh") {
      body = {
        access_token: "voice-library-e2e",
        expires_in: 900,
        refresh_token_expires_at: 9_999_999_999
      };
    } else if (path === "/profile") {
      body = {
        id: "voice-library-e2e",
        phone: "13800138000",
        display_name: "音色编辑测试",
        role: "admin",
        permission_version: 1,
        catalog_version: "e2e",
        permissions,
        preferences: { dialect: "uk" }
      };
    } else if (path === "/speech/voices") {
      body = { items: voices };
    } else if (path === "/speech/groups") {
      if (route.request().method() === "PUT") {
        const input = route.request().postDataJSON();
        groups = { groups: input.groups, revision: groups.revision + 1 };
      }
      body = groups;
    } else if (path === "/speech/library") {
      body = { items: library };
    } else if (path.endsWith("/personal")) {
      const item = library.find((entry) =>
        path.includes(encodeURIComponent(entry.voice_alias))
      )!;
      const input = route.request().postDataJSON();
      Object.assign(item, {
        parameters: input.parameters,
        notes: input.notes,
        personal_revision: item.personal_revision + 1
      });
      body = item;
    } else if (path === "/speech/previews") {
      previews.push(route.request().postDataJSON());
      body = {
        cache_status: "generated",
        audio_url: new URL("/__voice-fixture.wav", route.request().url()).href,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        url_expires_in_seconds: 600
      };
    } else {
      return route.fulfill({
        status: 501,
        contentType: "application/json",
        body: JSON.stringify({ code: "unexpected_request", path })
      });
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(body)
    });
  });
  return previews;
}

test("从一级菜单查找音色、调参并播放，改字后清除旧音频", async ({
  page
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const requests = await mockApi(page);
  await page.goto("/voices");
  await expect(
    page.getByRole("navigation").getByText("音色库", { exact: true })
  ).toBeVisible();
  await page.getByRole("menuitem", { name: /音色库/ }).click();
  await expect(page).toHaveURL(/\/voices$/);
  await expect(
    page.getByRole("button", { name: "试听 Guy", exact: true })
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("voice-library-overview.png"),
    fullPage: true,
    animations: "disabled"
  });
  await page.getByRole("searchbox", { name: "搜索音色" }).fill("Sonia");
  await expect(
    page.getByRole("button", { name: "试听 Guy", exact: true })
  ).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("voice-library-desktop.png"),
    fullPage: true,
    animations: "disabled"
  });
  await page.getByRole("button", { name: "调整 Sonia 参数" }).click();
  const drawer = page.getByRole("dialog");
  await drawer
    .getByRole("spinbutton", { name: "合成语速", exact: true })
    .fill("0.75");
  await drawer.getByRole("spinbutton", { name: "音调", exact: true }).fill("2");
  await drawer
    .getByRole("button", { name: "试听当前参数", exact: true })
    .click();
  const audio = drawer.getByLabel("Sonia 试听播放器");
  await expect(audio).toBeVisible();
  await expect
    .poll(() => audio.evaluate((node) => (node as HTMLAudioElement).readyState))
    .toBeGreaterThanOrEqual(2);
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    voice_alias: voices[0]!.alias,
    rate_percent: -25,
    pitch_semitones: 2,
    content: { version: 2, annotations: [] }
  });
  await audio.evaluate(async (node: HTMLAudioElement) => {
    node.loop = true;
    await node.play();
  });
  await drawer
    .getByRole("textbox", { name: "我的听感" })
    .fill("声音清晰，适合慢读");
  await expect(audio).toBeVisible();
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.paused))
    .toBe(false);
  expect(requests).toHaveLength(1);
  await page.screenshot({
    path: testInfo.outputPath("voice-library-parameters.png"),
    fullPage: true
  });
  await drawer.getByRole("button", { name: /关闭|Close/ }).click();
  await page.getByRole("button", { name: "放弃修改" }).click();
  await expect(audio).toHaveCount(0);
  await page.getByRole("button", { name: "试听 Sonia", exact: true }).click();
  await expect(page.getByLabel("Sonia 试听播放器")).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("voice-library-playing.png"),
    fullPage: true,
    animations: "disabled"
  });
  await page
    .getByRole("textbox", { name: "共用试听文本" })
    .fill("A different sentence.");
  await expect(page.getByLabel("Sonia 试听播放器")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("分组草稿受保护，保存后重新打开保持英美推荐", async ({ page }) => {
  await mockApi(page, [
    "words.access",
    "speech.generate",
    "speech.global_dubbing"
  ]);
  await page.goto("/voices");
  await page.getByRole("tab", { name: "分组配音" }).click();
  await page.evaluate(() =>
    Object.defineProperty(window.crypto, "randomUUID", {
      value: undefined,
      configurable: true
    })
  );
  await page.getByRole("button", { name: "创建三个初始分组" }).click();
  const uk = page.getByRole("region", { name: "词形与发音 英式推荐" });
  const us = page.getByRole("region", { name: "词形与发音 美式推荐" });
  const ukBox = await uk.boundingBox();
  const usBox = await us.boundingBox();
  expect(ukBox).not.toBeNull();
  expect(usBox).not.toBeNull();
  expect(Math.abs(ukBox!.y - usBox!.y)).toBeLessThan(2);
  expect(usBox!.x).toBeGreaterThan(ukBox!.x);
  await page
    .getByRole("region", { name: "例句 美式推荐" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "保存分组配音" })
  ).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("voice-groups-sticky.png"),
    animations: "disabled"
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: test.info().outputPath("voice-groups-desktop.png"),
    fullPage: true,
    animations: "disabled"
  });
  await page
    .getByRole("textbox", { name: "分组名称", exact: true })
    .first()
    .fill("发音推荐");
  await page
    .getByRole("region", { name: "发音推荐 英式推荐" })
    .getByRole("button", { name: /试\s*听/, exact: true })
    .click();
  await expect(page.getByLabel("Sonia 试听播放器")).toBeVisible();
  await page
    .getByRole("spinbutton", { name: "推荐语速", exact: true })
    .first()
    .fill("0.80");
  await expect(page.getByLabel("Sonia 试听播放器")).toHaveCount(0);
  await page.getByRole("tab", { name: "全部音色" }).click();
  await expect(page.getByRole("dialog")).toContainText("分组还有未保存的修改");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "继续编辑" })
    .click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/speech/groups") &&
      response.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "保存分组配音" }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  const body = response.request().postDataJSON();
  expect(body.groups).toHaveLength(3);
  expect(body.groups[0].uk[0].voice_alias).toBe(voices[0]!.alias);
  expect(body.groups[0].uk[0].parameters.rate_percent).toBe(-20);
  expect(body.groups[0].us[0].voice_alias).toBe(voices[1]!.alias);
  await page.reload();
  await page.getByRole("tab", { name: "分组配音" }).click();
  await expect(page.getByText("发音推荐", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "分组配音" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.getByRole("tab", { name: "全部音色" }).click();
  await expect(
    page.getByRole("table").getByLabel("试听 Sonia", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("table").getByLabel("试听 Guy", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "调整 Sonia 参数" }).click();
  const drawer = page.getByRole("dialog");
  await drawer
    .getByRole("spinbutton", { name: "合成语速", exact: true })
    .fill("0.75");
  await drawer.getByRole("spinbutton", { name: "音调", exact: true }).fill("2");
  await page.evaluate(() =>
    Object.defineProperty(window.crypto, "randomUUID", {
      value: undefined,
      configurable: true
    })
  );
  await drawer.getByRole("button", { name: "加入分组推荐" }).click();
  const recommendation = page.getByRole("dialog", {
    name: "将 Sonia 加入分组推荐"
  });
  await recommendation
    .getByRole("combobox", { name: "推荐分组", exact: true })
    .click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .getByText("发音推荐", { exact: true })
    .click();
  await recommendation
    .getByRole("textbox", { name: "推荐版本名称" })
    .fill("清晰慢读");
  const added = page.waitForResponse(
    (value) =>
      value.url().endsWith("/speech/groups") &&
      value.request().method() === "PUT"
  );
  await recommendation.getByRole("button", { name: "确认加入推荐" }).click();
  const next = await added;
  expect(next.request().postDataJSON().groups[0].uk[1]).toMatchObject({
    name: "清晰慢读",
    voice_alias: voices[0]!.alias,
    parameters: { rate_percent: -25, pitch_semitones: 2, style: null }
  });
  await expect(
    recommendation.getByText(
      "已加入分组推荐。后续修改个人参数不会改变这份推荐。"
    )
  ).toBeVisible();
});

test("空态直接新增一个分组，保存后重新打开仍保留自定义设置", async ({
  page
}) => {
  await mockApi(page, [
    "words.access",
    "speech.generate",
    "speech.global_dubbing"
  ]);
  await page.goto("/voices");
  await page.getByRole("tab", { name: "分组配音" }).click();
  await page.getByRole("button", { name: /新增分组$/ }).click();
  const names = page.getByRole("textbox", { name: "分组名称", exact: true });
  await expect(names).toHaveCount(1);
  await names.fill("朗读练习");
  await page.getByRole("combobox", { name: "朗读练习 使用板块" }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .getByText("多维例句", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "朗读练习 使用板块" })
    .press("Escape");
  await page
    .getByRole("spinbutton", { name: "推荐语速", exact: true })
    .first()
    .fill("0.85");
  const saving = page.waitForResponse(
    (response) =>
      response.url().endsWith("/speech/groups") &&
      response.request().method() === "PUT"
  );
  await page.getByRole("button", { name: "保存分组配音" }).click();
  const response = await saving;
  expect(response.ok()).toBe(true);
  expect(response.request().postDataJSON().groups).toEqual([
    expect.objectContaining({
      name: "朗读练习",
      areas: ["example"],
      uk: [
        expect.objectContaining({
          parameters: { rate_percent: -15, pitch_semitones: 0, style: null }
        })
      ]
    })
  ]);
  await page.reload();
  await page.getByRole("tab", { name: "分组配音" }).click();
  await expect(page.getByText("朗读练习", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "编辑分组" }).click();
  await expect(names).toHaveCount(1);
  await expect(
    page.getByRole("spinbutton", { name: "推荐语速", exact: true }).first()
  ).toHaveValue("0.85");
});

test("窄屏分组使用单栏，滚动后仍可保存或取消", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [
    "words.access",
    "speech.generate",
    "speech.global_dubbing"
  ]);
  await page.goto("/voices");
  await page.getByRole("tab", { name: "分组配音" }).click();
  await page.getByRole("button", { name: "创建三个初始分组" }).click();
  const uk = await page
    .getByRole("region", { name: "词形与发音 英式推荐" })
    .boundingBox();
  const us = await page
    .getByRole("region", { name: "词形与发音 美式推荐" })
    .boundingBox();
  expect(uk).not.toBeNull();
  expect(us).not.toBeNull();
  expect(Math.abs(uk!.x - us!.x)).toBeLessThan(2);
  expect(us!.y).toBeGreaterThan(uk!.y + uk!.height);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page
    .getByRole("region", { name: "例句 美式推荐" })
    .scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("button", { name: "保存分组配音" })
  ).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("voice-groups-mobile.png"),
    animations: "disabled"
  });
  await page.getByRole("button", { name: "取消编辑" }).click();
  await page.getByRole("button", { name: "放弃并重新载入" }).click();
  await expect(page.getByText("尚未设置分组推荐")).toBeVisible();
});

test("词形编辑器选用推荐并保留完整参数", async ({ page }) => {
  await mockAdminV3Api(page, { formsFailureOnce: false });
  await page.route("**/api/v1/admin/speech/voices", (route) =>
    route.fulfill({ json: { items: voices } })
  );
  await page.route("**/api/v1/admin/speech/library", (route) =>
    route.fulfill({ json: { items: [] } })
  );
  await page.route("**/api/v1/admin/speech/groups", (route) =>
    route.fulfill({
      json: {
        revision: 1,
        groups: [
          {
            id: "group",
            name: "词形与发音",
            areas: ["word", "azure"],
            uk: [
              {
                id: "recommendation",
                name: "清晰慢读",
                voice_alias: voices[0]!.alias,
                parameters: {
                  rate_percent: -25,
                  pitch_semitones: 2,
                  style: "cheerful"
                }
              }
            ],
            us: []
          }
        ]
      }
    })
  );
  await page.goto(`/words/${ADMIN_V3_MIXED_WORD_ID}/v3/wizard/forms`);
  await page.locator("[data-v3-open-content]").first().click();
  const content = page.getByRole("dialog", { name: /^词形 .* 内容设置$/ });
  await content
    .locator(".word-shared-form-spelling")
    .first()
    .getByRole("button", { name: /^打开.*编辑器$/ })
    .click();
  const editor = page.getByRole("dialog").last();
  await editor.evaluate(async (node) => {
    await Promise.all(
      node
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished)
    );
  });
  await expect(page.getByLabel("发音设置与试听")).toBeVisible();
  const recommendation = page.getByRole("combobox", {
    name: "分组推荐",
    exact: true
  });
  await recommendation.click();
  await recommendation.press("ArrowDown");
  await recommendation.press("Enter");
  await page.getByRole("button", { name: "应用到当前文本" }).click();
  await expect(
    page.getByRole("checkbox", { name: /启用 Sonia/ })
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: /设置 Sonia.*的语速/ })
  ).toContainText("0.75");
  await editor.getByRole("button", { name: /^完成.*编辑$/ }).click();
  await content
    .locator(".word-shared-form-spelling")
    .first()
    .getByRole("button", { name: /^打开.*编辑器$/ })
    .click();
  await expect(page.getByLabel("发音设置与试听")).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /启用 Sonia/ })
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: /设置 Sonia.*的语速/ })
  ).toContainText("0.75");
  const voiceRow = page
    .locator(".tsz-ve-pop-row")
    .filter({ has: page.getByRole("checkbox", { name: /启用 Sonia/ }) });
  await voiceRow.getByText("更多参数", { exact: true }).click();
  await expect(
    voiceRow.getByRole("spinbutton", { name: /Sonia.*音调/ })
  ).toHaveValue("2");
  await expect(voiceRow.locator(".ant-select")).toContainText("cheerful");
  await page.screenshot({
    path: test.info().outputPath("text-recommendation.png"),
    fullPage: true
  });
});

test("折叠拼写直接保存并刷新，默认推荐随正文保留", async ({ page }) => {
  const api = await mockAdminV3Api(page, { formsFailureOnce: false });
  const word = api.getWord();
  const forms = word.forms as SharedFormsStepContentV3;
  const regions = forms.contents[0]!.regional_variants;
  const initial = regions.mode === "common" ? regions.common : regions.uk;
  initial.spelling = "";
  delete initial.spelling_rich;
  delete initial.spelling_speech;
  const entryPath = `${ADMIN_V3_ENTRIES_PATH}/${word.id}`;
  await page.route(`**/api/v1/admin${entryPath}`, async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      json: {
        word: api.count("PUT", `${entryPath}/steps/forms`)
          ? api.getWord()
          : word,
        retired_stable_nodes: []
      }
    });
  });
  await page.route("**/api/v1/admin/speech/voices", (route) =>
    route.fulfill({ json: { items: voices } })
  );
  await page.route("**/api/v1/admin/speech/library", (route) =>
    route.fulfill({ json: { items: [] } })
  );
  await page.route("**/api/v1/admin/speech/groups", (route) =>
    route.fulfill({
      json: {
        revision: 1,
        groups: [
          {
            id: "group",
            name: "词形推荐",
            areas: ["word"],
            uk: [
              {
                id: "first",
                name: "慢读",
                voice_alias: voices[0]!.alias,
                parameters: {
                  rate_percent: -25,
                  pitch_semitones: 2,
                  style: "cheerful"
                }
              }
            ],
            us: []
          }
        ]
      }
    })
  );
  await page.goto(`/words/${word.id}/v3/wizard/forms`);
  await page.locator("[data-v3-open-content]").first().click();
  const content = page.getByRole("dialog", { name: /^词形 .* 内容设置$/ });
  const input = content.locator(".word-shared-form-spelling textarea").first();
  await expect(input).toBeEditable();
  await input.fill("hello");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await content
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith(`${entryPath}/steps/forms`)
  );
  await page.getByRole("button", { name: /保存草稿$/ }).click();
  expect((await saved).ok()).toBe(true);
  const stored = (api.getWord().forms as SharedFormsStepContentV3).contents[0]!
    .regional_variants;
  const variant = stored.mode === "common" ? stored.common : stored.uk;
  expect(variant.spelling).toBe("hello");
  expect(variant.spelling_speech?.voice_profile).toEqual({
    voices: [
      {
        voice_id: voices[0]!.alias,
        enabled: true,
        rate_percent: -25,
        pitch_semitones: 2,
        style: "cheerful"
      }
    ]
  });
  await page.reload();
  await page.locator("[data-v3-open-content]").first().click();
  await expect(input).toHaveValue("hello");
  await content
    .locator(".word-shared-form-spelling")
    .first()
    .getByRole("button", { name: /^打开.*编辑器$/ })
    .click();
  await expect(
    page.getByRole("checkbox", { name: /启用 Sonia/ })
  ).toBeChecked();
  await expect(
    page.getByRole("button", { name: /设置 Sonia.*的语速/ })
  ).toContainText("0.75");
});

test("窄屏可浏览，只有例句权限时禁止生成；固定参数不可编辑", async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await mockApi(page, ["sentences.access"]);
  await page.goto("/voices");
  await expect(
    page.getByRole("navigation").getByText("音色库", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "试听 Sonia", exact: true })
  ).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("voice-library-mobile.png"),
    fullPage: true,
    animations: "disabled"
  });
  await page.getByRole("button", { name: "调整 Guy 参数" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "合成语速", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole("spinbutton", { name: "音调", exact: true })
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "试听当前参数", exact: true })
  ).toBeDisabled();
  expect(requests).toEqual([]);
});
