import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
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

function sampleWav() {
  const buffer = silentWav();
  for (let sample = 0; sample < 8000; sample++) {
    const amplitude = sample < 4000 ? 0.7 : 0.15;
    buffer.writeInt16LE(
      Math.round(
        Math.sin((sample * 2 * Math.PI * 220) / 8000) * amplitude * 32767
      ),
      44 + sample * 2
    );
  }
  return buffer;
}

async function mockApi(
  page: Page,
  permissions = ["words.access", "speech.generate"]
) {
  const previews: Record<string, unknown>[] = [];
  let groups: AdminDubbingGroupsResponse = {
    groups: [
      {
        id: "00000000-0000-4000-8000-000000000001",
        name: "全局常用",
        areas: [],
        uk: [],
        us: [],
        revision: 0,
        is_global: true
      }
    ],
    revision: 0
  };
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
    } else if (path === "/speech/audio-update-settings") {
      body = { wait_seconds: 60, revision: 0 };
    } else if (
      path === "/speech/audio-updates" ||
      path.endsWith("/audio-updates")
    ) {
      body = { updates: [] };
    } else if (
      path === "/speech/groups" ||
      path.startsWith("/speech/groups/")
    ) {
      const method = route.request().method();
      if (
        method === "POST" ||
        (method === "PUT" && path.startsWith("/speech/groups/"))
      ) {
        const input = route.request().postDataJSON();
        const group = { ...input.group, revision: input.base_revision + 1 };
        for (const key of ["uk", "us"] as const)
          group[key].sort(
            (a: { selected?: boolean }, b: { selected?: boolean }) =>
              Number(b.selected !== false) - Number(a.selected !== false)
          );
        groups = {
          revision: groups.revision + 1,
          groups:
            method === "POST"
              ? [...groups.groups, group]
              : groups.groups.map((item) =>
                  item.id === group.id ? group : item
                )
        };
      } else if (method === "DELETE") {
        const id = path.split("/").at(-1);
        groups = {
          revision: groups.revision + 1,
          groups: groups.groups.filter((item) => item.id !== id)
        };
      } else if (method === "PUT") {
        return route.fulfill({
          status: 409,
          json: { code: "revision_conflict" }
        });
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
    } else if (path === "/speech/ssml") {
      body = {
        ssml: '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB"><voice name="en-GB-SoniaNeural">Hello</voice></speak>'
      };
    } else if (path === "/speech/previews/ssml") {
      previews.push(route.request().postDataJSON());
      body = {
        cache_status: "generated",
        audio_url: new URL("/__voice-fixture.wav", route.request().url()).href,
        expires_at: new Date(Date.now() + 600_000).toISOString(),
        url_expires_in_seconds: 600
      };
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
    page.getByRole("navigation").getByText("配音中心")
  ).toBeVisible();
  await page.getByRole("menuitem", { name: /配音中心/ }).click();
  await expect(page).toHaveURL(/\/voices$/);
  await expect(page.getByRole("tab", { name: "分组配音" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.getByRole("tab", { name: "音色库" }).click();
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
  await page.getByRole("button", { name: "试听 Sonia", exact: true }).click();
  const originalAudio = page.getByLabel("Sonia 试听播放器");
  await expect(originalAudio).toBeVisible();
  await expect
    .poll(() =>
      originalAudio.evaluate((node: HTMLAudioElement) => node.readyState)
    )
    .toBeGreaterThanOrEqual(2);
  await originalAudio.evaluate(async (node: HTMLAudioElement) => {
    node.loop = true;
    node.dataset.previewIdentity = "original";
    await node.play();
  });
  await page.getByRole("button", { name: "查看 Sonia 详情" }).click();
  const drawer = page.getByRole("dialog", { name: "Sonia 音色详情" });
  await expect(drawer.getByRole("tab", { name: "调节声音" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(originalAudio).toHaveCount(0);
  await drawer.getByRole("tab", { name: "音色资料" }).click();
  await expect(drawer.getByRole("region", { name: "音色资料" })).toBeVisible();
  await expect(drawer.getByRole("button", { name: "保存听感" })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("voice-library-details.png"),
    fullPage: true,
    animations: "disabled"
  });
  await drawer.getByRole("tab", { name: "调节声音" }).click();
  expect(requests).toHaveLength(1);
  requests.length = 0;
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
  await audio.evaluate((node: HTMLAudioElement) => {
    node.dataset.previewIdentity = "detail-preview";
  });
  await drawer.getByRole("tab", { name: "音色资料" }).click();
  await expect(audio).toHaveAttribute(
    "data-preview-identity",
    "detail-preview"
  );
  expect(await audio.evaluate((node: HTMLAudioElement) => node.paused)).toBe(
    false
  );
  await drawer.getByRole("tab", { name: "调节声音" }).click();
  await expect(drawer.getByRole("textbox", { name: "我的听感" })).toHaveValue(
    "声音清晰，适合慢读"
  );
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

test("窄屏展开更多筛选后场景多选与清除可操作，弹层不撑宽页面", async ({
  page
}) => {
  await mockApi(page);
  await page.route("**/api/v1/admin/speech/voices", (route) =>
    route.fulfill({
      json: {
        items: voices.map((voice) => ({
          ...voice,
          metadata: {
            provider_voice_id: voice.alias,
            model: "neural",
            age_group: "Adult",
            description: "Official description",
            personalities: null,
            scenarios:
              voice.locale === "en-GB" ? ["News", "Narration"] : ["Chat"],
            roles: [],
            source_url: "https://speech.microsoft.com/portal/voicegallery",
            checked_at: "2026-10-25T13:14:11Z"
          }
        }))
      }
    })
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/voices");
  await page.getByRole("tab", { name: "音色库" }).click();
  await page.getByRole("button", { name: "更多筛选" }).click();
  const select = page.getByRole("combobox", { name: "推荐场景", exact: true });
  await select.scrollIntoViewIfNeeded();
  await select.click();
  const option = page.locator(
    ".ant-select-dropdown:visible .ant-select-item-option-content"
  );
  await option.getByText("新闻", { exact: true }).click();
  await option.getByText("旁白", { exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("试听 Sonia", { exact: true })).toHaveCount(1);
  await expect(page.getByLabel("试听 Guy", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "清除筛选" }).click();
  await expect(page.getByLabel("试听 Guy", { exact: true })).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
});

test("HD Flash按模型能力禁用参数并保留自然试听请求", async ({ page }) => {
  const requests = await mockApi(page);
  await page.route("**/api/v1/admin/speech/voices", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            ...voices[1],
            display_name: "Tiana",
            alias: "azure-hd-flash-tiana",
            capabilities: {
              styles: [],
              min_rate_percent: 0,
              max_rate_percent: 0,
              min_pitch_semitones: 0,
              max_pitch_semitones: 0,
              supports_volume_percent: false,
              supports_pause: false,
              supports_phoneme: false
            }
          }
        ]
      }
    })
  );
  await page.goto("/voices");
  await page.getByRole("tab", { name: "音色库" }).click();
  await page.getByLabel("查看 Tiana 详情", { exact: true }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByLabel("合成音量", { exact: true })).toBeDisabled();
  await expect(drawer.getByLabel("合成语速", { exact: true })).toBeDisabled();
  await expect(drawer.getByLabel("音调", { exact: true })).toBeDisabled();
  await expect(drawer.getByText(/该模型仅支持原速/)).toBeVisible();
  await drawer.getByRole("button", { name: "试听当前参数" }).click();
  await expect.poll(() => requests.length).toBe(1);
  expect(requests[0]).toMatchObject({
    voice_alias: "azure-hd-flash-tiana",
    rate_percent: 0,
    pitch_semitones: 0
  });
  expect(requests[0]).not.toHaveProperty("volume_percent");
});

async function createGroupDraft(page: Page, name: string) {
  await page.getByRole("button", { name: /新增分组$/ }).click();
  const card = page
    .locator(".dubbing-group")
    .filter({
      has: page.getByRole("textbox", { name: "分组名称", exact: true })
    })
    .last();
  await card.getByRole("textbox", { name: "分组名称", exact: true }).fill(name);
  return card;
}

async function completeGroup(
  page: Page,
  card: ReturnType<Page["locator"]>,
  method: "POST" | "PUT"
) {
  const response = page.waitForResponse(
    (response) =>
      response.url().includes("/speech/groups") &&
      response.request().method() === method
  );
  await card.getByRole("button", { name: "完成", exact: true }).click();
  const saved = await response;
  expect(saved.ok()).toBe(true);
  return saved.request().postDataJSON();
}

test("A保留草稿时完成B仅提交B，取消A后刷新无残留", async ({ page }) => {
  await mockApi(page, [
    "words.access",
    "speech.generate",
    "speech.global_dubbing"
  ]);
  await page.goto("/voices");
  const a = await createGroupDraft(page, "A未完成");
  const aId = await a
    .getByLabel("分组名称", { exact: true })
    .getAttribute("id");
  const b = await createGroupDraft(page, "B已完成");
  const body = await completeGroup(page, b, "POST");
  expect(body.group.name).toBe("B已完成");
  expect(body).not.toHaveProperty("groups");
  const retained = page
    .locator(".dubbing-group")
    .filter({ has: page.locator(`input[id="${aId}"]`) });
  await expect(retained.getByLabel("分组名称", { exact: true })).toHaveValue(
    "A未完成"
  );
  await retained.getByRole("button", { name: /取\s*消/, exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "分组名称", exact: true })
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "编辑B已完成", exact: true })
  ).toBeVisible();
  await expect(page.getByText("A未完成", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "编辑全局常用", exact: true }).click();
  const global = page.locator(".dubbing-group").filter({
    has: page.getByRole("combobox", {
      name: "全局常用 使用板块",
      exact: true
    })
  });
  await expect(
    global.getByRole("button", { name: "删除分组", exact: true })
  ).toHaveCount(0);
  await expect(
    global.getByRole("combobox", { name: "全局常用 使用板块", exact: true })
  ).toBeDisabled();
});

test("勾选保持行位，拖动后完成稳定前置并折叠更多，加入推荐只改草稿", async ({
  page
}) => {
  await mockApi(page, [
    "words.access",
    "speech.generate",
    "speech.global_dubbing"
  ]);
  await page.goto("/voices");
  const card = await createGroupDraft(page, "发音推荐");
  const groupId = await card
    .getByLabel("分组名称", { exact: true })
    .getAttribute("id");
  await card.getByRole("button", { name: "添加英式推荐", exact: true }).click();
  await card.getByRole("button", { name: "添加英式推荐", exact: true }).click();
  const names = card.getByRole("textbox", { name: "推荐名称", exact: true });
  await names.nth(0).fill("第一版本");
  await names.nth(1).fill("第二版本");
  await card
    .getByRole("checkbox", { name: "选用 第一版本", exact: true })
    .uncheck();
  await expect(names.nth(0)).toHaveValue("第一版本");
  const first = card.locator(".dubbing-recommendation").nth(0),
    second = card.locator(".dubbing-recommendation").nth(1);
  await second.dragTo(first, {
    sourcePosition: { x: 16, y: 16 },
    targetPosition: { x: 16, y: 16 }
  });
  await expect(names.nth(0)).toHaveValue("第二版本");
  const body = await completeGroup(page, card, "POST");
  expect(
    body.group.uk.map((item: { name: string; selected: boolean }) => [
      item.name,
      item.selected
    ])
  ).toEqual([
    ["第二版本", true],
    ["第一版本", false]
  ]);
  const saved = page.locator(".dubbing-group").filter({
    has: page.getByRole("button", { name: "编辑发音推荐", exact: true })
  });
  await expect(saved.getByLabel("选用 第一版本", { exact: true })).toHaveCount(
    0
  );
  await saved.getByRole("button", { name: "更多音色", exact: true }).click();
  await expect(
    saved.getByLabel("选用 第一版本", { exact: true })
  ).not.toBeChecked();
  await page.getByRole("tab", { name: "音色库", exact: true }).click();
  await page
    .getByRole("button", { name: "查看 Sonia 详情", exact: true })
    .click();
  await page
    .getByRole("spinbutton", { name: "合成语速", exact: true })
    .fill("0.73");
  await page.getByRole("button", { name: "加入分组推荐", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "将 Sonia 加入分组推荐" });
  await modal.getByRole("combobox", { name: "推荐分组", exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .getByText("发音推荐", { exact: true })
    .click();
  await modal.getByLabel("推荐版本名称", { exact: true }).fill("清晰慢读");
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/speech/groups") && request.method() !== "GET")
      writes.push(request.method());
  });
  await modal
    .getByRole("button", { name: "确认加入推荐", exact: true })
    .click();
  await expect(
    modal.getByText("已应用到分组草稿，请回到该组点击“完成”后保存。", {
      exact: true
    })
  ).toBeVisible();
  expect(writes).toEqual([]);
  await modal.getByRole("button", { name: /完\s*成/, exact: true }).click();
  await expect(modal).toBeHidden();
  await page.locator(".ant-drawer-close").click();
  await page.getByRole("tab", { name: "分组配音", exact: true }).click();
  const draft = page
    .locator(".dubbing-group")
    .filter({ has: page.locator(`input[id="${groupId}"]`) });
  await expect(
    draft.getByLabel("选用 清晰慢读", { exact: true })
  ).toBeChecked();
  const committed = await completeGroup(page, draft, "PUT");
  expect(
    committed.group.uk.find(
      (item: { name: string }) => item.name === "清晰慢读"
    ).parameters.rate_percent
  ).toBe(-27);
  await page.reload();
  await expect(page.getByText("清晰慢读", { exact: true })).toBeVisible();
});

test("窄屏单组编辑可取消且无页面横向溢出", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockApi(page, [
    "words.access",
    "speech.generate",
    "speech.global_dubbing"
  ]);
  await page.goto("/voices");
  const card = await createGroupDraft(page, "窄屏草稿");
  await card.getByRole("button", { name: "添加英式推荐", exact: true }).click();
  await card.getByRole("button", { name: "添加美式推荐", exact: true }).click();
  const uk = await card
    .getByRole("region", { name: "窄屏草稿 英式推荐", exact: true })
    .boundingBox();
  const us = await card
    .getByRole("region", { name: "窄屏草稿 美式推荐", exact: true })
    .boundingBox();
  expect(uk).not.toBeNull();
  expect(us).not.toBeNull();
  expect(us!.y).toBeGreaterThan(uk!.y + uk!.height);
  await card
    .getByRole("spinbutton", { name: "推荐语速", exact: true })
    .first()
    .fill("0.73");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth
    )
  ).toBe(true);
  await card.getByRole("button", { name: /取\s*消/, exact: true }).click();
  await expect(page.getByText("窄屏草稿", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "编辑全局常用", exact: true })
  ).toBeVisible();
});

test("词形编辑器选用推荐并保留完整参数", async ({ page }) => {
  await mockAdminV3Api(page, { formsFailureOnce: false });
  const generatedId = "11111111-2222-4333-8444-555555555555";
  await page.route("**/api/v1/admin/speech/resolve", async (route) => {
    const { profile, accent } = route.request().postDataJSON();
    const selected =
      profile.dubbing?.mode === "local"
        ? profile.voices.filter(
            (setting: { enabled: boolean; locale: string }) =>
              setting.enabled &&
              setting.locale === (accent === "gb" ? "en-GB" : "en-US")
          )
        : [];
    await route.fulfill({ json: { voices: selected } });
  });
  await page.route("**/api/v1/admin/speech/audio", (route) =>
    route.fulfill({
      json: {
        asset: {
          id: generatedId,
          locale: "en-GB",
          gender: "female",
          content_type: "audio/mpeg",
          size_bytes: 100,
          duration_ms: null,
          original_name: "generated.mp3",
          created_at: "2026-10-25T00:00:00Z"
        }
      }
    })
  );
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
  await page
    .getByRole("textbox", { name: "新版本名称" })
    .fill("另一个慢读版本");
  await page.getByRole("button", { name: "另存为新版本" }).click();
  const version = page.getByLabel("配音版本 另一个慢读版本", { exact: true });
  await version.getByRole("button", { name: "正式选用", exact: true }).click();
  await expect(version.getByText("正式选用", { exact: true })).toHaveCount(1);
  await expect(
    version.getByRole("button", { name: "取消选用", exact: true })
  ).toBeEnabled();
  await version
    .getByRole("button", { name: "生成正式音频", exact: true })
    .click();
  await expect(version.getByText("已生成音频", { exact: true })).toBeVisible();
  await editor.getByRole("button", { name: /^完成.*编辑$/ }).click();
  await content
    .getByRole("button", { name: "确认，应用到草稿", exact: true })
    .click();
  const savedVersions = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      response.url().endsWith("/steps/forms")
  );
  await page.getByRole("button", { name: /保存草稿$/ }).click();
  expect((await savedVersions).ok()).toBe(true);
  await page.reload();
  await page.locator("[data-v3-open-content]").first().click();
  await content
    .locator(".word-shared-form-spelling")
    .first()
    .getByRole("button", { name: /^打开.*编辑器$/ })
    .click();
  await expect(
    page.getByLabel("配音版本 清晰慢读", { exact: true })
  ).toBeVisible();
  await expect(version).toBeVisible();
  await expect(version.getByText("已生成音频", { exact: true })).toBeVisible();
  await expect(
    version.getByRole("button", { name: "取消选用", exact: true })
  ).toBeEnabled();
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
  await page.route("**/api/v1/admin/speech/resolve", async (route) => {
    const { profile, accent } = route.request().postDataJSON();
    await route.fulfill({
      json: { voices: accent === "gb" ? profile.voices : [] }
    });
  });
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
                id: "11111111-1111-4111-8111-111111111111",
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
    dubbing: {
      mode: "inherit",
      area: "word",
      recommendation_order: ["11111111-1111-4111-8111-111111111111"]
    },
    voices: [
      {
        voice_id: voices[0]!.alias,
        version_id: "11111111-1111-4111-8111-111111111111",
        version_name: "慢读",
        locale: "en-GB",
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

test("真实样本解码波形、循环与下载保持原字节，手动SSML原文一致", async ({
  page,
  context
}, testInfo) => {
  const requests = await mockApi(page);
  const sample = sampleWav();
  await page.route("**/__voice-fixture.wav", (route) =>
    route.fulfill({ contentType: "audio/wav", body: sample })
  );
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/voices");
  await page.getByRole("tab", { name: "音色库", exact: true }).click();
  await page
    .getByRole("button", { name: "查看 Sonia 详情", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Sonia 音色详情" });
  await dialog.getByLabel("试听输出格式", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: /^WAV$/ })
    .click();
  await dialog
    .getByRole("button", { name: "试听当前参数", exact: true })
    .click();
  const review = dialog.getByRole("region", {
    name: "审听 Sonia",
    exact: true
  });
  const wave = review.getByLabel("音频波形，点击定位或拖动选择区间");
  await expect(wave).toBeVisible();
  expect(requests.at(-1)?.output_format).toBe("wav");
  const shape = await wave.locator(".tsz-ve-wave-samples").getAttribute("d");
  expect(shape).toMatch(/v(?:[1-9][0-9])/);
  await review.getByLabel("循环起点秒数").fill("0.2");
  await review.getByLabel("循环起点秒数").press("Tab");
  await review.getByLabel("循环终点秒数").fill("0.6");
  await review.getByLabel("循环终点秒数").press("Tab");
  await review.getByLabel("区间循环").check();
  const audio = dialog.getByLabel("Sonia 试听播放器", { exact: true });
  await audio.evaluate(async (node: HTMLAudioElement) => {
    node.currentTime = 0.8;
    await node.play();
  });
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.currentTime))
    .toBeLessThan(0.65);
  await review.getByLabel("审听倍速", { exact: true }).click();
  await page
    .locator(".ant-select-dropdown:visible .ant-select-item-option-content")
    .filter({ hasText: /^1\.5×$/ })
    .click();
  await expect
    .poll(() => audio.evaluate((node: HTMLAudioElement) => node.playbackRate))
    .toBe(1.5);
  const download = page.waitForEvent("download");
  await review.getByRole("button", { name: "下载原音频", exact: true }).click();
  expect(await readFile((await (await download).path())!)).toEqual(sample);
  await dialog.getByRole("button", { name: "查看 SSML", exact: true }).click();
  const ssml = dialog.getByLabel("SSML 原文", { exact: true });
  await expect(ssml).toContainText("<speak");
  await dialog.getByLabel("手动编辑 SSML", { exact: true }).check();
  const raw =
    ' <speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-GB">\n<voice name="en-GB-SoniaNeural"><sub alias="kitten">cat</sub></voice></speak> ';
  await ssml.fill(raw);
  await dialog.getByRole("button", { name: "复制 SSML", exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(raw);
  const textDownload = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "下载 SSML", exact: true }).click();
  expect(await readFile((await (await textDownload).path())!, "utf8")).toBe(
    raw
  );
  await dialog.getByRole("button", { name: "试听 SSML", exact: true }).click();
  await expect.poll(() => requests.at(-1)?.ssml).toBe(raw);
  await dialog.getByLabel("导入参考音频", { exact: true }).setInputFiles({
    name: "reference.wav",
    mimeType: "audio/wav",
    buffer: sample
  });
  await expect(
    dialog
      .getByRole("region", { name: "审听 reference.wav", exact: true })
      .getByLabel("音频波形，点击定位或拖动选择区间")
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)
    )
    .toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("audio-review-mobile.png"),
    fullPage: true,
    animations: "disabled"
  });
});

test("窄屏可浏览，只有例句权限时禁止生成；固定参数不可编辑", async ({
  page
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await mockApi(page, ["sentences.access"]);
  await page.goto("/voices");
  await page.getByRole("tab", { name: "音色库" }).click();
  await expect(
    page.getByRole("navigation").getByText("配音中心")
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
  await page.getByRole("button", { name: "查看 Guy 详情" }).click();
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
