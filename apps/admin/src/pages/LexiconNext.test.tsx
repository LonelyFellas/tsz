import {
  act,
  fireEvent,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { isSharedForms } from "@tsz/shared";
import type {
  NextCapabilities,
  NextEntry,
  NextDraft,
  NextDetection,
  NextDetectionInput,
  NextEntryMatchInput,
  NextEntryMatches,
  NextWorkspaceEntry
} from "@tsz/types";
import { bindAdminAuthorizationCache } from "@/lib/adminAuthorization";
import { api as profileApi, tokens, useAuthStore } from "@/lib/auth";
import { LexiconNextPage, type LexiconNextRequests } from "./LexiconNext";

import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import { formsFixture } from "@/features/dictionary/word-creation-v3/fixtures";
import { applyFormsStructure } from "@/features/dictionary/word-creation-v3/sharedFormsModel";
import { emptyFormEditor } from "@/features/lexicon-next/FormsStep";
import { partOfSpeechDataSource } from "@/features/dictionary/dataSource";
import { partOfSpeechKeys } from "@/features/dictionary/part-of-speech/api";
import { changeVoiceText } from "@/features/dictionary/word-creation-v3/components/V3VoiceTextField.test-helper";

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, env: { ...actual.env, VOICE_PREVIEW: false } };
});
vi.mock("@/features/dictionary/dataSource", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/dictionary/dataSource")>();
  return {
    ...actual,
    partOfSpeechDataSource: {
      ...actual.partOfSpeechDataSource,
      catalog: async () => partOfSpeechCatalogFixture
    }
  };
});

const id = "00000000-0000-4000-8000-000000000001";
const caps: NextCapabilities = {
  medium_ownership: true,
  schema_version: 1,
  language_rules_version: "lexicon-next-en-zh-1",
  manual_drafts: true,
  generation: false,
  publishing: false,
  languages: [
    {
      target_language: "en",
      target_locales: ["en-GB", "en-US"],
      medium_locales: ["zh-Hans", "zh-Hant"],
      common_target_locale: "en",
      part_of_speech_codes: ["noun", "verb"]
    }
  ]
};
const entry: NextEntry = {
  medium_locale: "zh-Hans",
  id,
  owner_id: "editor",
  target_language: "en",
  kind: "word",
  revision: 1,
  updated_at: "2026-11-11T00:00:00Z",
  draft: { schema_version: 1, headword: "centre", forms: [], senses: [] }
};
function requests() {
  return {
    list: vi.fn(),
    workspaceEntry: vi.fn().mockResolvedValue(listRow()),
    stats: vi.fn().mockResolvedValue({ total: 0, today: 0, month: 0 }),
    creators: vi.fn().mockResolvedValue([]),
    command: vi.fn(),
    annotation: vi.fn(),
    workspaceList: vi.fn().mockResolvedValue({
      items: [],
      pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 }
    }),
    capabilities: vi.fn().mockResolvedValue(caps),
    get: vi.fn().mockResolvedValue(structuredClone(entry)),
    detect: vi
      .fn()
      .mockImplementation(
        async (input: NextDetectionInput): Promise<NextDetection> => ({
          surface: input.surface,
          kind: input.surface.includes(" ") ? "phrase" : "word",
          matches: []
        })
      ),
    matchEntries: vi
      .fn()
      .mockImplementation(
        async (input: NextEntryMatchInput): Promise<NextEntryMatches> => ({
          surface: input.surface,
          items: [],
          pagination: {
            page: input.page ?? 1,
            page_size: input.page_size ?? 20,
            total: 0,
            total_pages: 0
          }
        })
      ),
    create: vi.fn().mockResolvedValue(structuredClone(entry)),
    save: vi.fn().mockImplementation(async (_id, input) => ({
      ...entry,
      revision: input.expected_revision + 1,
      draft: structuredClone(input.draft)
    })),
    view: vi.fn()
  } satisfies LexiconNextRequests;
}
async function chooseLanguage(label: string) {
  const field = label.includes("英语") ? "目标语言" : "媒介语言";
  const select = screen.getByRole("combobox", { name: field });
  await waitFor(() => expect(select).toBeEnabled());
  fireEvent.mouseDown(select);
  fireEvent.click(
    await screen.findByText(label, {
      selector: ".ui-select-item-option-content"
    })
  );
}
let preferenceGeneration = 0;
const detachCaches: (() => void)[] = [];
afterEach(() => {
  detachCaches.splice(0).forEach((detach) => detach());
  vi.restoreAllMocks();
});
function mount(
  api: LexiconNextRequests,
  path = `/lexicon-next/${id}`,
  staleTime = 0
) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime },
      mutations: { retry: false }
    }
  });
  detachCaches.push(bindAdminAuthorizationCache(useAuthStore, client));
  const router = createMemoryRouter(
    [
      {
        path: "/lexicon-next/:entryId?",
        element: <LexiconNextPage requests={api} />
      },
      { path: "/words", element: <p>旧库页面</p> }
    ],
    { initialEntries: [path] }
  );
  const rendered = render(
    <QueryClientProvider client={client}>
      <header>
        <div id="console-header-tools" />
      </header>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  return { client, router, unmount: rendered.unmount };
}
const button = (name: string | RegExp) => screen.getByRole("button", { name });

const accountChoice = {
  target_language: "en",
  target_locale: "en-US",
  medium_locale: "zh-Hant"
};
function withAccountChoice(value: typeof accountChoice | null) {
  useAuthStore.getState().setProfile({
    ...useAuthStore.getState().profile!,
    preferences: {
      ...useAuthStore.getState().profile!.preferences,
      lexicon_languages: value
    }
  });
}

it("账号值优先于旧浏览器记忆；无缓存的新客户端从账号恢复且首个请求正确", async () => {
  withAccountChoice(accountChoice);
  const key = "tsz:admin:lexicon-languages:v1:editor:en";
  localStorage.setItem(
    key,
    JSON.stringify({ target_locale: "en-GB", medium_locale: "zh-Hans" })
  );
  const api = requests();
  const first = mount(api, "/lexicon-next");
  await screen.findByRole("combobox", { name: "目标语言" });
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
  expect(api.workspaceList).toHaveBeenCalledExactlyOnceWith({
    target_language: "en",
    medium_locale: "zh-Hant",
    page: 1,
    page_size: 20
  });
  first.unmount();
  localStorage.removeItem(key);
  const another = requests();
  mount(another, "/lexicon-next");
  await screen.findByRole("combobox", { name: "媒介语言" });
  expect(
    screen.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("繁体中文");
  expect(another.workspaceList).toHaveBeenCalledExactlyOnceWith({
    target_language: "en",
    medium_locale: "zh-Hant",
    page: 1,
    page_size: 20
  });
  expect(profileApi.profile).toHaveBeenCalledTimes(2);
  expect(profileApi.updateProfilePreferences).not.toHaveBeenCalled();
});

it("旧链接只覆盖当前视图，不把旧组合反写账号", async () => {
  withAccountChoice(accountChoice);
  const linked = mount(
    requests(),
    "/lexicon-next?target_locale=en-GB&medium_locale=zh-Hans"
  );
  await screen.findByRole("combobox", { name: "目标语言" });
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("英式英语");
  linked.unmount();
  mount(requests(), "/lexicon-next");
  await screen.findByRole("combobox", { name: "目标语言" });
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
  expect(profileApi.updateProfilePreferences).not.toHaveBeenCalled();
  expect(
    useAuthStore.getState().profile!.preferences.lexicon_languages
  ).toEqual(accountChoice);
});

it("账号模式下取消切换不保存，确认离页后才保存生效的组合", async () => {
  withAccountChoice(accountChoice);
  const api = requests();
  api.get.mockResolvedValue({ ...entry, medium_locale: "zh-Hant" });
  mount(api, `/lexicon-next/${id}?target_locale=en-US&medium_locale=zh-Hant`);
  await screen.findByText("版本 1");
  fireEvent.click(button(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "local kept" }
  });
  await chooseLanguage("简体中文");
  fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
  expect(profileApi.updateProfilePreferences).not.toHaveBeenCalled();
  await chooseLanguage("简体中文");
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并离开" })
  );
  await waitFor(() =>
    expect(profileApi.updateProfilePreferences).toHaveBeenCalledExactlyOnceWith(
      { lexicon_languages: { ...accountChoice, medium_locale: "zh-Hans" } }
    )
  );
  expect(api.save).not.toHaveBeenCalled();
});

it("账号读取失败不加载错误范围，读取和保存均可重试", async () => {
  withAccountChoice(accountChoice);
  vi.mocked(profileApi.profile).mockRejectedValueOnce(
    new Error("offline read")
  );
  const api = requests();
  mount(api, "/lexicon-next");
  await screen.findByText("读取账号语言选择失败");
  expect(api.workspaceList).not.toHaveBeenCalled();
  fireEvent.click(button("重试读取"));
  await screen.findByRole("combobox", { name: "目标语言" });
  vi.mocked(profileApi.updateProfilePreferences).mockRejectedValueOnce(
    new Error("offline save")
  );
  await chooseLanguage("英式英语");
  await screen.findByText("语言选择尚未保存到账号");
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("英式英语");
  fireEvent.click(button("重试保存语言"));
  await waitFor(() =>
    expect(screen.queryByText("语言选择尚未保存到账号")).toBeNull()
  );
  expect(
    useAuthStore.getState().profile!.preferences.lexicon_languages
  ).toEqual({ ...accountChoice, target_locale: "en-GB" });
});

it("语言选择在离开重进和整页重新挂载后恢复，首个请求即使用记忆范围", async () => {
  const api = requests();
  const first = mount(api, "/lexicon-next");
  await screen.findByRole("combobox", { name: "目标语言" });
  await chooseLanguage("美式英语");
  await chooseLanguage("繁体中文");
  await act(() => first.router.navigate("/words"));
  api.workspaceList.mockClear();
  await act(() => first.router.navigate("/lexicon-next"));
  await screen.findByRole("combobox", { name: "目标语言" });
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
  expect(api.workspaceList).toHaveBeenCalledExactlyOnceWith({
    target_language: "en",
    medium_locale: "zh-Hant",
    page: 1,
    page_size: 20
  });
  first.unmount();
  const reloaded = requests();
  mount(reloaded, "/lexicon-next");
  await screen.findByRole("combobox", { name: "媒介语言" });
  expect(
    screen.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("繁体中文");
  expect(reloaded.workspaceList).toHaveBeenCalledExactlyOnceWith({
    target_language: "en",
    medium_locale: "zh-Hant",
    page: 1,
    page_size: 20
  });
});

it("显式链接优先并更新记忆，不同账号的默认选择隔离", async () => {
  const initial = mount(
    requests(),
    "/lexicon-next?target_locale=en-US&medium_locale=zh-Hant"
  );
  await screen.findByRole("combobox", { name: "媒介语言" });
  initial.unmount();
  const linked = mount(
    requests(),
    "/lexicon-next?target_locale=en-GB&medium_locale=zh-Hans"
  );
  await screen.findByRole("combobox", { name: "媒介语言" });
  linked.unmount();
  const remembered = mount(requests(), "/lexicon-next");
  await screen.findByRole("combobox", { name: "目标语言" });
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("英式英语");
  await chooseLanguage("美式英语");
  await chooseLanguage("繁体中文");
  remembered.unmount();
  act(() =>
    useAuthStore.setState({
      profile: { ...useAuthStore.getState().profile!, id: "another-editor" }
    })
  );
  const another = mount(requests(), "/lexicon-next");
  await screen.findByRole("combobox", { name: "媒介语言" });
  expect(
    screen.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("简体中文");
  another.unmount();
  act(() =>
    useAuthStore.setState({
      profile: { ...useAuthStore.getState().profile!, id: "editor" }
    })
  );
  mount(requests(), "/lexicon-next");
  await screen.findByRole("combobox", { name: "目标语言" });
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
  expect(
    screen.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("繁体中文");
});

it("取消跨媒介离页不会覆盖记忆，裸链接返回仍保护未保存稿", async () => {
  const api = requests();
  api.get.mockResolvedValue({ ...entry, medium_locale: "zh-Hant" });
  const active = mount(
    api,
    `/lexicon-next/${id}?target_locale=en-US&medium_locale=zh-Hant`
  );
  await screen.findByText("版本 1");
  fireEvent.click(button(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "local kept" }
  });
  await chooseLanguage("简体中文");
  fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
  await act(() => active.router.navigate(`/lexicon-next/${id}`));
  fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
  expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue(
    "local kept"
  );
  active.unmount();
  mount(requests(), "/lexicon-next");
  await screen.findByRole("combobox", { name: "媒介语言" });
  expect(
    screen.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("繁体中文");
});

it("损坏或已不支持的记忆退回默认，存储不可用时仍能选择", async () => {
  const key = "tsz:admin:lexicon-languages:v1:editor:en";
  localStorage.setItem(key, "{broken");
  const broken = mount(requests(), "/lexicon-next");
  await screen.findByRole("combobox", { name: "目标语言" });
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("英式英语");
  broken.unmount();
  localStorage.setItem(
    key,
    JSON.stringify({ target_locale: "fr", medium_locale: "en" })
  );
  const stale = mount(requests(), "/lexicon-next");
  await screen.findByRole("combobox", { name: "媒介语言" });
  expect(
    screen.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("简体中文");
  stale.unmount();
  const read = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("denied", "SecurityError");
  });
  const write = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
  try {
    mount(requests(), "/lexicon-next");
    await screen.findByRole("combobox", { name: "目标语言" });
    await chooseLanguage("美式英语");
    expect(
      screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
    ).toHaveTextContent("美式英语");
  } finally {
    read.mockRestore();
    write.mockRestore();
  }
});

it("顶栏语言组合贯穿列表、新建、编辑和返回，离开智能词库后移除", async () => {
  grantListPermissions();
  const api = requests();
  const boundEntry = { ...entry, medium_locale: "zh-Hant" };
  api.create.mockResolvedValue(boundEntry);
  api.get.mockResolvedValue(boundEntry);
  const { router } = mount(api, "/lexicon-next");
  await screen.findByRole("button", { name: "创建词条" });
  await chooseLanguage("美式英语");
  await chooseLanguage("繁体中文");
  await waitFor(() =>
    expect(api.stats).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hant"
    })
  );
  fireEvent.click(button("创建词条"));
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "centre" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  await screen.findByText("版本 1");
  const languages = within(screen.getByRole("banner"));
  expect(
    languages.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
  expect(
    languages.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("繁体中文");
  fireEvent.click(button(/^词义与译词/));
  expect(screen.getByRole("button", { name: "添加义项" })).toBeVisible();
  fireEvent.click(button(/^预览/));
  expect(
    languages.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
  expect(
    languages.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("繁体中文");
  fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
  await screen.findByRole("button", { name: "创建词条" });
  expect(
    new URLSearchParams(router.state.location.search).get("target_locale")
  ).toBe("en-US");
  expect(
    new URLSearchParams(router.state.location.search).get("medium_locale")
  ).toBe("zh-Hant");
  await act(() => router.navigate("/words"));
  expect(screen.queryByRole("group", { name: "智能词库语言" })).toBeNull();
});

it("预览请求进行中，浏览器返回不能绕过语言锁", async () => {
  const api = requests();
  let finish!: (
    value: Awaited<ReturnType<LexiconNextRequests["view"]>>
  ) => void;
  api.view.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const { router } = mount(api);
  await screen.findByText("版本 1");
  await chooseLanguage("美式英语");
  fireEvent.click(button(/^预览/));
  fireEvent.click(button("查看已保存预览"));
  await waitFor(() =>
    expect(api.view).toHaveBeenCalledWith(id, {
      target_locale: "en-US",
      medium_locale: "zh-Hans"
    })
  );
  await act(() => router.navigate(-1));
  expect(
    new URLSearchParams(router.state.location.search).get("target_locale")
  ).toBe("en-US");
  fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
  await act(async () =>
    finish({
      entry_id: id,
      revision: 1,
      target_locale: "en-US",
      medium_locale: "zh-Hans",
      forms: [],
      missing_forms: true,
      senses: []
    })
  );
  await screen.findByText("已保存预览 · 版本 1");
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
});

it("新建中切换媒介语言清除旧范围匹配，保留输入并重新检测", async () => {
  const api = requests();
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "centre" }
  });
  fireEvent.click(button("词典检测"));
  await screen.findByRole("button", { name: "确认创建" });
  await chooseLanguage("繁体中文");
  expect(screen.getByLabelText("录入词条")).toHaveValue("centre");
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  fireEvent.click(button("词典检测"));
  await screen.findByRole("button", { name: "确认创建" });
  expect(api.matchEntries).toHaveBeenLastCalledWith({
    target_language: "en",
    medium_locale: "zh-Hant",
    surface: "centre",
    page: 1,
    page_size: 20
  });
});

it("旧API未开放归属能力时不发起词条读写", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, medium_ownership: undefined });
  mount(api);
  await screen.findByText("智能词库手工编辑暂不可用");
  expect(api.get).not.toHaveBeenCalled();
  expect(api.create).not.toHaveBeenCalled();
});

it("深链接归属不匹配时不挂载编辑器，可显式进入词条所属语言", async () => {
  const api = requests();
  api.get.mockResolvedValue({ ...entry, medium_locale: "zh-Hant" });
  const { router } = mount(api);
  await screen.findByText("该词条不属于当前媒介语言");
  expect(screen.queryByRole("button", { name: "添加义项" })).toBeNull();
  fireEvent.click(button("进入词条所属语言"));
  await screen.findByText("版本 1");
  expect(
    new URLSearchParams(router.state.location.search).get("medium_locale")
  ).toBe("zh-Hant");
  fireEvent.click(button(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "unsaved deep link" }
  });
  await act(() => router.navigate(-1));
  fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
  expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue(
    "unsaved deep link"
  );
  expect(
    new URLSearchParams(router.state.location.search).get("medium_locale")
  ).toBe("zh-Hant");
});

it("列表保留词条自身的非英语地区信息，不标成美式拼写", async () => {
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [
      listRow({
        target_language: "fr",
        forms: [{ id: "fr-ca", locale: "fr-CA", text: "centre" }]
      })
    ],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next");
  const label = new Intl.DisplayNames(["zh-Hans"], { type: "language" }).of(
    "fr-CA"
  )!;
  expect(await screen.findByText(label)).toBeVisible();
  expect(screen.queryByRole("img", { name: /美式/ })).toBeNull();
});

it("检测同时展示新版已有草稿、垃圾桶、标注与释义，并保留独立创建", async () => {
  const api = requests();
  const archivedId = "00000000-0000-4000-8000-000000000002";
  api.matchEntries.mockResolvedValue({
    surface: "center",
    items: [
      listRow({
        forms: [{ id: "form", locale: "en-US", text: "center" }],
        annotation_visible: true,
        annotation: "2",
        gloss: "已有词条的释义"
      }),
      listRow({
        id: archivedId,
        status: "archived",
        headword: "center",
        kind: "phrase",
        gloss: "垃圾桶词条的释义"
      })
    ],
    pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 }
  });
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "center" }
  });
  fireEvent.click(button("词典检测"));
  const matches = within(
    await screen.findByRole("region", { name: "智能词库匹配结果" })
  );
  expect(matches.getByText("已有词条的释义")).toBeVisible();
  expect(matches.getByText("垃圾桶词条的释义")).toBeVisible();
  expect(matches.getByText("2 条匹配")).toBeVisible();
  expect(matches.getByText("草稿")).toBeVisible();
  expect(matches.getByText("垃圾桶")).toBeVisible();
  expect(matches.getByText("2", { selector: "sup" })).toBeVisible();
  expect(matches.getByRole("link", { name: "继续创建" })).toHaveAttribute(
    "href",
    `/lexicon-next/${id}?target_language=en&target_locale=en-GB&medium_locale=zh-Hans`
  );
  expect(matches.getByRole("link", { name: "查看词条" })).toHaveAttribute(
    "href",
    `/lexicon-next/${archivedId}?target_language=en&target_locale=en-GB&medium_locale=zh-Hans`
  );
  expect(
    screen.getByText("未找到内置词典匹配，可继续创建空白草稿。")
  ).toBeVisible();
  expect(api.matchEntries).toHaveBeenCalledExactlyOnceWith({
    medium_locale: "zh-Hans",
    target_language: "en",
    surface: "center",
    page: 1,
    page_size: 20
  });
  fireEvent.click(button("确认创建"));
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      medium_locale: "zh-Hans",
      target_language: "en",
      kind: "word",
      headword: "center"
    })
  );
  expect(api.save).not.toHaveBeenCalled();
});

it("已有词条翻页只重查新版匹配，失败保留原结果并支持重试；改输入清空结果", async () => {
  const api = requests();
  api.matchEntries
    .mockResolvedValueOnce({
      surface: "center",
      items: Array.from({ length: 20 }, (_, index) =>
        listRow({
          id: `entry-${index}`,
          gloss: index === 0 ? "第一页已有释义" : null
        })
      ),
      pagination: { page: 1, page_size: 20, total: 21, total_pages: 2 }
    })
    .mockRejectedValueOnce(new Error("匹配分页暂不可用"))
    .mockResolvedValueOnce({
      surface: "center",
      items: [listRow({ gloss: "第二页已有释义" })],
      pagination: { page: 2, page_size: 20, total: 21, total_pages: 2 }
    });
  mount(api, "/lexicon-next/new");
  const input = await screen.findByLabelText("录入词条");
  fireEvent.change(input, { target: { value: "center" } });
  fireEvent.click(button("词典检测"));
  const region = await screen.findByRole("region", {
    name: "智能词库匹配结果"
  });
  fireEvent.click(within(region).getByRole("button", { name: /2.*页/ }));
  await screen.findByText("匹配分页暂不可用");
  expect(screen.getByText("第一页已有释义")).toBeVisible();
  fireEvent.click(within(region).getByRole("button", { name: /2.*页/ }));
  await screen.findByText("第二页已有释义");
  await waitFor(() => expect(region).toHaveFocus());
  expect(api.detect).toHaveBeenCalledTimes(1);
  expect(api.matchEntries).toHaveBeenLastCalledWith({
    medium_locale: "zh-Hans",
    target_language: "en",
    surface: "center",
    page: 2,
    page_size: 20
  });
  fireEvent.change(input, { target: { value: "another" } });
  expect(screen.queryByRole("region", { name: "智能词库匹配结果" })).toBeNull();
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
});

it("已有匹配未完成、失败或回显不符时不能创建，也不伪装成无匹配", async () => {
  const api = requests();
  let finish!: (value: NextEntryMatches) => void;
  api.matchEntries.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  mount(api, "/lexicon-next/new");
  const input = await screen.findByLabelText("录入词条");
  fireEvent.change(input, { target: { value: "center" } });
  fireEvent.click(button("词典检测"));
  await waitFor(() => expect(api.matchEntries).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  await act(async () =>
    finish({
      surface: "another",
      items: [],
      pagination: { page: 1, page_size: 20, total: 0, total_pages: 0 }
    })
  );
  await screen.findByText("检测结果与当前输入不一致，请重新检测。");
  expect(screen.queryByText("未找到智能词库中的匹配词条。")).toBeNull();
  api.matchEntries.mockRejectedValueOnce(
    new HttpError(404, "已有词条检测暂不可用")
  );
  fireEvent.click(button("词典检测"));
  await screen.findByText("已有词条检测暂不可用");
  expect(input).toHaveValue("center");
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
});

it("多条词典记录平等展示，按原输入创建且不带入参考内容", async () => {
  const api = requests();
  api.detect.mockResolvedValue({
    surface: "Colour",
    kind: "word",
    matches: ["visible hue", "a flag"].map((gloss, index) => ({
      id: `dictionary:${index}`,
      term: "color",
      part_of_speech: "noun",
      glosses: [gloss],
      forms: [{ text: "colors", tags: ["plural"] }],
      phonetics: [{ ipa: "/ˈkʌlə/", tags: ["UK"] }],
      source_name: "Test dictionary",
      source_version: "v1"
    }))
  });
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "  Colour  " }
  });
  fireEvent.click(button("词典检测"));
  await screen.findByText("visible hue");
  expect(screen.getByText("a flag")).toBeVisible();
  expect(screen.getByText("2 条匹配")).toBeVisible();
  expect(screen.queryByLabelText("英美通用主词")).toBeNull();
  expect(api.detect).toHaveBeenCalledWith({
    target_language: "en",
    surface: "Colour"
  });
  expect(api.create).not.toHaveBeenCalled();
  fireEvent.click(button("确认创建"));
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      medium_locale: "zh-Hans",
      target_language: "en",
      kind: "word",
      headword: "Colour"
    })
  );
  expect(api.save).not.toHaveBeenCalled();
});

it("保留全部词典匹配，每条释义独立展开收起，重新检测恢复前三条", async () => {
  const api = requests();
  api.detect.mockResolvedValue({
    surface: "colour",
    kind: "word",
    matches: [5, 4, 3, 2, 1, 0].map((length, index) => ({
      id: `dictionary:${index}`,
      term: `match ${index}`,
      part_of_speech: "noun",
      glosses: Array.from(
        { length },
        (_, gloss) => `meaning ${index}-${gloss}`
      ),
      forms: [],
      phonetics: [],
      source_name: "Test dictionary",
      source_version: "v1"
    }))
  });
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "colour" }
  });
  fireEvent.click(button("词典检测"));
  await screen.findByText("6 条匹配");
  const records = screen.getAllByRole("article");
  expect(records).toHaveLength(6);
  records.forEach((record, index) => {
    expect(within(record).queryAllByRole("listitem")).toHaveLength(
      Math.min(5 - index, 3)
    );
    expect(within(record).queryAllByRole("button")).toHaveLength(
      index < 2 ? 1 : 0
    );
  });
  const first = within(records[0]!);
  const second = within(records[1]!);
  const expandFirst = first.getByRole("button", { expanded: false });
  fireEvent.click(expandFirst);
  expect(first.getAllByRole("listitem")).toHaveLength(5);
  expect(first.getByText("meaning 0-4")).toBeVisible();
  expect(second.queryByText("meaning 1-3")).toBeNull();
  fireEvent.click(second.getByRole("button", { expanded: false }));
  fireEvent.click(first.getByRole("button", { expanded: true }));
  expect(expandFirst).toHaveAttribute("aria-expanded", "false");
  expect(first.queryByText("meaning 0-3")).toBeNull();
  expect(second.getByText("meaning 1-3")).toBeVisible();
  expect(screen.getAllByRole("article")).toHaveLength(6);
  fireEvent.click(button("词典检测"));
  await screen.findByText("6 条匹配");
  expect(screen.queryByText("meaning 1-3")).toBeNull();
  expect(
    within(screen.getAllByRole("article")[1]!).getByRole("button", {
      expanded: false
    })
  ).toBeVisible();
  expect(api.create).not.toHaveBeenCalled();
});

it("输入变化清除旧结果，短语自动识别；检测失败保留输入并支持重试", async () => {
  const api = requests();
  mount(api, "/lexicon-next/new");
  const input = await screen.findByLabelText("录入词条");
  fireEvent.change(input, { target: { value: "centre" } });
  fireEvent.click(button("词典检测"));
  await screen.findByRole("button", { name: "确认创建" });
  fireEvent.change(input, { target: { value: " give   up " } });
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  api.detect.mockRejectedValueOnce(new Error("内置词典暂时不可用"));
  fireEvent.click(button("词典检测"));
  await screen.findByText("内置词典暂时不可用");
  expect(input).toHaveValue("give up");
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  fireEvent.click(button("词典检测"));
  await screen.findByText("短语");
  fireEvent.click(button("确认创建"));
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      medium_locale: "zh-Hans",
      target_language: "en",
      kind: "phrase",
      headword: "give up"
    })
  );
});

it("Enter 检测 pending 不重复请求，非法输入和不对应的检测结果不能创建", async () => {
  const api = requests();
  let finish!: (detection: NextDetection) => void;
  api.detect.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  mount(api, "/lexicon-next/new");
  const input = await screen.findByLabelText("录入词条");
  fireEvent.change(input, { target: { value: "中文" } });
  fireEvent.click(button("词典检测"));
  expect(api.detect).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "centre" } });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 13 });
  fireEvent.keyDown(input, { key: "Enter", code: "Enter", keyCode: 13 });
  fireEvent.click(button("词典检测"));
  await waitFor(() =>
    expect(api.detect).toHaveBeenCalledExactlyOnceWith({
      target_language: "en",
      surface: "centre"
    })
  );
  expect(input).toBeDisabled();
  expect(button("词典检测")).toBeDisabled();
  expect(button("词典检测")).toHaveAttribute("aria-busy", "true");
  await act(async () =>
    finish({ surface: "another", kind: "word", matches: [] })
  );
  await screen.findByText("检测结果与当前输入不一致，请重新检测。");
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
});

it("词典归一化仅用于匹配，创建保留输入；未知创建结果阻止重复写入", async () => {
  const api = requests();
  api.detect.mockResolvedValue({ surface: "café", kind: "word", matches: [] });
  api.create.mockRejectedValue(new Error("网络连接中断"));
  mount(api, "/lexicon-next/new");
  const input = await screen.findByLabelText("录入词条");
  fireEvent.change(input, { target: { value: "cafe\u0301" } });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  await screen.findByText(/创建结果未确认/);
  await chooseLanguage("繁体中文");
  expect(screen.getByText(/创建结果未确认/)).toBeVisible();
  expect(screen.getByLabelText("录入词条")).toBeDisabled();
  expect(api.create).toHaveBeenCalledExactlyOnceWith({
    medium_locale: "zh-Hans",
    target_language: "en",
    kind: "word",
    headword: "cafe\u0301"
  });
  expect(input).toHaveValue("cafe\u0301");
  expect(input).toBeDisabled();
  expect(screen.queryByRole("button", { name: "确认创建" })).toBeNull();
});
async function edit(label: string, value: string) {
  fireEvent.click(button(label.includes("词形") ? /词性与发音/ : /词义与译词/));
  if (label.includes("词形")) {
    if (!screen.queryByRole("textbox", { name: `${label} 1` }))
      fireEvent.click(button("已有词形"));
  } else fireEvent.click(button(`添加${label}`));
  fireEvent.change(await screen.findByRole("textbox", { name: `${label} 1` }), {
    target: { value }
  });
}
beforeEach(() => {
  const generation = ++preferenceGeneration;
  vi.spyOn(tokens, "getSessionGeneration").mockReturnValue(generation);
  vi.spyOn(profileApi, "profile").mockImplementation(async () =>
    structuredClone(useAuthStore.getState().profile!)
  );
  vi.spyOn(profileApi, "updateProfilePreferences").mockImplementation(
    async (input) => ({
      preferences: {
        ...useAuthStore.getState().profile!.preferences,
        ...(input.lexicon_languages
          ? { lexicon_languages: input.lexicon_languages }
          : {})
      }
    })
  );
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("tsz:admin:lexicon-languages:v1:"))
      localStorage.removeItem(key);
  }
  useAuthStore.setState({
    profile: {
      id: "editor",
      phone: "test-only",
      display_name: "编辑",
      role: "admin",
      permission_version: 1,
      catalog_version: "test",
      permissions: ["words.access", "words.create", "words.edit"],
      preferences: { dialect: "uk" }
    }
  });
});
describe("新版词库手工闭环", () => {
  it.each(["uk", "us"] as const)(
    "账号偏好为 %s 时沿用全局语言组合，跨步骤切换不改账号偏好",
    async (dialect) => {
      useAuthStore.setState({
        profile: {
          ...useAuthStore.getState().profile!,
          preferences: { dialect }
        }
      });
      const api = requests();
      api.get.mockResolvedValue({
        ...entry,
        draft: {
          ...entry.draft,
          forms: [{ id: "us-form", locale: "en-US", text: "center" }]
        }
      });
      mount(
        api,
        `/lexicon-next/${id}?target_locale=en-US&medium_locale=zh-Hans`
      );
      await screen.findByDisplayValue("centre");
      expect(
        screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
      ).toHaveTextContent("美式英语");
      fireEvent.click(button(/^词义与译词/));
      await chooseLanguage("英式英语");
      expect(useAuthStore.getState().profile?.preferences.dialect).toBe(
        dialect
      );
      fireEvent.click(button(/^词性与发音/));
      fireEvent.click(button(/^词义与译词/));
      expect(
        screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
      ).toHaveTextContent("英式英语");
    }
  );

  it("切换目标变体保留未保存内容和义项身份，完整保存；预览不回写本地稿", async () => {
    const api = requests();
    api.get.mockResolvedValue({
      ...entry,
      draft: {
        ...entry.draft,
        forms: [
          { id: crypto.randomUUID(), locale: "en-GB", text: "centre" },
          { id: crypto.randomUUID(), locale: "en-US", text: "center" }
        ]
      }
    });
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(button(/词义与译词/));
    await edit("英式英语词形", "centre");
    fireEvent.click(button(/词义与译词/));
    fireEvent.click(button("添加义项"));
    await edit("英式英语释义", "the middle");
    await edit("简体中文解释", "中心位置");
    await edit("简体中文译词", "中心");
    await chooseLanguage("美式英语");
    await edit("美式英语词形", "center");
    await edit("美式英语释义", "the center");
    await chooseLanguage("英式英语");
    fireEvent.click(button(/词性与发音/));
    expect(screen.getByRole("textbox", { name: "英式英语词形 1" })).toHaveValue(
      "centre"
    );
    fireEvent.click(button(/词义与译词/));
    expect(screen.getByDisplayValue("中心位置")).toBeVisible();
    fireEvent.click(button("保存完整草稿"));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const saved = api.save.mock.calls[0]![1];
    expect(saved.expected_revision).toBe(1);
    expect(saved.draft.forms.map((row: { text: string }) => row.text)).toEqual([
      "centre",
      "center"
    ]);
    expect(saved.draft.senses).toHaveLength(1);
    expect(
      saved.draft.senses[0].definitions.map(
        (row: { locale: string }) => row.locale
      )
    ).toEqual(["en-GB", "zh-Hans", "en-US"]);
    const senseId = saved.draft.senses[0].id;
    await screen.findByText("版本 2");
    fireEvent.click(button(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "local unsaved" }
    });
    api.view.mockResolvedValue({
      entry_id: id,
      revision: 2,
      target_locale: "en-GB",
      medium_locale: "zh-Hans",
      forms: [],
      missing_forms: true,
      senses: []
    });
    fireEvent.click(button("查看已保存预览"));
    await screen.findByText("已保存预览 · 版本 2");
    expect(screen.getByDisplayValue("local unsaved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "关闭" }));
    fireEvent.click(button("保存完整草稿"));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]![1].draft.senses[0].id).toBe(senseId);
  });
  it.each([403, 409])(
    "%s 保留本地草稿，409 比较不会覆盖；显式确认才重载",
    async (status) => {
      const api = requests();
      api.save.mockRejectedValue(new HttpError(status, "rejected"));
      mount(api);
      await screen.findByDisplayValue("centre");
      fireEvent.click(button(/词义与译词/));
      fireEvent.click(button(/^预览/));
      fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
        target: { value: "local" }
      });
      fireEvent.click(button("保存完整草稿"));
      await screen.findByText(/本地草稿已保留/);
      expect(screen.getByDisplayValue("local")).toBeVisible();
      expect(api.save).toHaveBeenCalledTimes(1);
      if (status === 409) {
        api.get.mockResolvedValue({
          ...entry,
          revision: 5,
          draft: { ...entry.draft, headword: "remote" }
        });
        expect(button("保存完整草稿")).toBeDisabled();
        fireEvent.click(button("比较服务器版本"));
        await screen.findByText("服务器 · 版本 5");
        fireEvent.click(button("保留本地草稿"));
        expect(button("比较服务器版本")).toBeEnabled();
        fireEvent.click(button("比较服务器版本"));
        await screen.findByText("服务器 · 版本 5");
        expect(screen.getByDisplayValue("local")).toBeVisible();
        fireEvent.click(button("放弃本地修改并重载"));
        await screen.findByRole("button", { name: "放弃并重载" });
        fireEvent.click(button("放弃并重载"));
        await screen.findByDisplayValue("remote");
        expect(screen.getByText("版本 5")).toBeVisible();
      }
    }
  );
  it("能力不可用时不请求条目，不回退旧库；无创建/编辑他人权限时禁止写入", async () => {
    const api = requests();
    api.capabilities.mockRejectedValue(new HttpError(404, "not found"));
    const mounted = mount(api);
    await screen.findByText("智能词库手工编辑暂不可用");
    expect(api.get).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    api.capabilities.mockResolvedValue(caps);
    api.get.mockResolvedValue({ ...entry, owner_id: "another-editor" });
    fireEvent.click(button("重新检查"));
    await screen.findByDisplayValue("centre");
    fireEvent.click(button(/词义与译词/));
    expect(screen.queryByRole("textbox", { name: "词头" })).toBeNull();
    fireEvent.click(button(/词义与译词/));
    expect(button("添加义项")).toBeDisabled();
    act(() =>
      useAuthStore.setState({
        profile: {
          ...useAuthStore.getState().profile!,
          permissions: ["words.access"]
        }
      })
    );
    await act(() => mounted.router.navigate("/lexicon-next/new"));
    await screen.findByText("当前账号没有创建词条权限");
    expect(button("词典检测")).toBeDisabled();
  });
  it("创建只发送一次；保存 pending 不接收编辑，离开需要确认；重新打开读取新版本", async () => {
    const api = requests();
    let finishCreate!: (entry: NextEntry) => void;
    api.create.mockReturnValue(
      new Promise((resolve) => {
        finishCreate = resolve;
      })
    );
    const { router } = mount(api, "/lexicon-next/new");
    await screen.findByLabelText("录入词条");
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "centre" }
    });
    fireEvent.click(button("词典检测"));
    await screen.findByText("未找到内置词典匹配，可继续创建空白草稿。");
    fireEvent.click(button("确认创建"));
    fireEvent.click(button("确认创建"));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("combobox", { name: "目标语言" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "媒介语言" })).toBeDisabled();
    await act(() =>
      router.navigate(
        "/lexicon-next/new?target_locale=en-US&medium_locale=zh-Hant"
      )
    );
    fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
    expect(
      new URLSearchParams(router.state.location.search).get("medium_locale")
    ).toBe("zh-Hans");
    await act(async () => finishCreate(structuredClone(entry)));
    await screen.findByText("版本 1");
    fireEvent.click(button(/词义与译词/));
    fireEvent.click(button(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "local" }
    });
    fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
    await screen.findByRole("dialog", { name: "有未保存修改" });
    fireEvent.click(button("继续编辑"));
    expect(screen.getByDisplayValue("local")).toBeVisible();
    let finishSave!: (entry: NextEntry) => void;
    api.save.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      })
    );
    fireEvent.click(button("保存完整草稿"));
    expect(screen.getByRole("textbox", { name: "词头" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "目标语言" })).toBeDisabled();
    expect(screen.getByRole("combobox", { name: "媒介语言" })).toBeDisabled();
    await act(async () =>
      finishSave({
        ...entry,
        revision: 2,
        draft: { ...entry.draft, headword: "local" }
      })
    );
    fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
    await screen.findByRole("button", { name: "创建词条" });
    api.get.mockResolvedValue({
      ...entry,
      revision: 3,
      draft: { ...entry.draft, headword: "latest" }
    });
    await act(() => router.navigate(`/lexicon-next/${id}`));
    await screen.findByDisplayValue("latest");
    expect(screen.getByText("版本 3")).toBeVisible();
  });
  it("撤销编辑权限后的导航与语言切换不会因缓存清理丢失本地草稿", async () => {
    const api = requests();
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(button(/词义与译词/));
    fireEvent.click(button(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "unsaved after revocation" }
    });
    act(() =>
      useAuthStore.setState({
        profile: {
          ...useAuthStore.getState().profile!,
          permission_version: 2,
          permissions: ["words.access"]
        }
      })
    );
    await chooseLanguage("美式英语");
    fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
    await screen.findByRole("dialog", { name: "有未保存修改" });
    fireEvent.click(button("继续编辑"));
    expect(screen.getByDisplayValue("unsaved after revocation")).toBeVisible();
    expect(api.get).toHaveBeenCalledTimes(1);
  });
  it("删除义项前确认全部语言范围；取消和校验失败均保留草稿", async () => {
    const api = requests();
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(button(/词义与译词/));
    fireEvent.click(button(/词义与译词/));
    fireEvent.click(button("添加义项"));
    await edit("英式英语释义", "");
    fireEvent.click(button("保存完整草稿"));
    await screen.findByText(/不能为空/);
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(button("删除义项"));
    fireEvent.click(await screen.findByRole("button", { name: /取\s*消/ }));
    expect(
      screen.getByRole("textbox", { name: "英式英语释义 1" })
    ).toBeVisible();
  });
});

it.each([true, false])(
  "空状态按创建权限提供入口，筛选无结果可清空（创建权限：%s）",
  async (canCreate) => {
    if (!canCreate) {
      const profile = useAuthStore.getState().profile!;
      useAuthStore.setState({
        profile: { ...profile, permissions: ["words.access"] }
      });
    }
    const api = requests();
    const { router } = mount(
      api,
      "/lexicon-next?headword=missing&kind=phrase&page=2"
    );
    await screen.findByText("未找到符合条件的数据");
    fireEvent.click(button("重置筛选"));
    await screen.findByText("暂无词条");
    expect(screen.getByRole("searchbox", { name: "词条" })).toHaveValue("");
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      page: 1,
      page_size: 20
    });
    const createButtons = screen.queryAllByRole("button", { name: "创建词条" });
    expect(createButtons).toHaveLength(canCreate ? 1 : 0);
    if (canCreate) {
      fireEvent.click(createButtons[0]!);
      await waitFor(() =>
        expect(router.state.location.pathname).toBe("/lexicon-next/new")
      );
    }
  }
);

it("越界空页可返回有效页，并保留已应用的筛选条件", async () => {
  const api = requests();
  api.workspaceList
    .mockResolvedValueOnce({
      items: [],
      pagination: { total: 21, page: 3, page_size: 20, total_pages: 2 }
    })
    .mockResolvedValue({
      items: [
        {
          status: "draft",
          forms: [],
          lifecycle_revision: 1,
          annotation: null,
          annotation_revision: 1,
          annotation_visible: false,
          created_at: entry.updated_at,
          created_by_name: "编辑",
          updated_by_name: "编辑",
          id,
          headword: "centre",
          target_language: "en",
          kind: "word",
          owner_id: "editor",
          revision: 2,
          updated_at: entry.updated_at,
          part_of_speech: ["noun"],
          gloss: "中心位置"
        }
      ],
      pagination: { total: 21, page: 2, page_size: 20, total_pages: 2 }
    });
  mount(api, "/lexicon-next?headword=centre&kind=word&page=3&page_size=20");
  await screen.findByText("未找到符合条件的数据");
  expect(button("上一页")).toBeEnabled();
  fireEvent.click(button("上一页"));
  await screen.findByText("centre");
  expect(api.workspaceList).toHaveBeenLastCalledWith({
    target_language: "en",
    medium_locale: "zh-Hans",
    headword: "centre",
    kind: "word",
    page: 2,
    page_size: 20
  });
});

it("列表查询筛选与分页走新版接口，列表入口和创建入口使用新版路由", async () => {
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [
      {
        status: "draft",
        forms: [],
        lifecycle_revision: 1,
        annotation: null,
        annotation_revision: 1,
        annotation_visible: false,
        created_at: entry.updated_at,
        created_by_name: "编辑",
        updated_by_name: "编辑",
        id,
        headword: "centre",
        target_language: "en",
        kind: "word",
        owner_id: "editor",
        revision: 2,
        updated_at: entry.updated_at,
        part_of_speech: ["noun"],
        gloss: "中心位置"
      }
    ],
    pagination: { total: 45, page: 1, page_size: 20, total_pages: 3 }
  });
  const { router } = mount(api, "/lexicon-next");
  await screen.findByText("centre");
  fireEvent.change(screen.getByRole("searchbox", { name: "词条" }), {
    target: { value: "centre" }
  });
  expect(api.workspaceList).toHaveBeenCalledTimes(1);
  fireEvent.click(button("搜索"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      headword: "centre",
      page: 1,
      page_size: 20
    })
  );
  fireEvent.click(button("第 2 页"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      headword: "centre",
      page: 2,
      page_size: 20
    })
  );
  await act(() => router.navigate("/lexicon-next?page_size=10"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      page: 1,
      page_size: 10
    })
  );
  fireEvent.click(button("继续创建"));
  await screen.findByDisplayValue("centre");
  fireEvent.click(button(/词义与译词/));
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
});

function listRow(
  overrides: Partial<NextWorkspaceEntry> = {}
): NextWorkspaceEntry {
  return {
    id,
    headword: "centre",
    target_language: "en",
    kind: "word",
    owner_id: "editor",
    revision: 2,
    lifecycle_revision: 1,
    status: "draft",
    updated_at: entry.updated_at,
    created_at: entry.updated_at,
    created_by_name: "编辑",
    updated_by_name: "编辑",
    part_of_speech: ["noun"],
    gloss: "中心",
    forms: [],
    annotation: null,
    annotation_revision: 1,
    annotation_visible: false,
    ...overrides
  };
}
function grantListPermissions() {
  useAuthStore.setState({
    profile: {
      ...useAuthStore.getState().profile!,
      permissions: [
        "words.access",
        "words.create",
        "words.edit",
        "words.archive",
        "words.restore",
        "words.publish"
      ]
    }
  });
}
it("列表组合条件只在提交后生效，翻页保留，状态切换及移除条件回到第一页", async () => {
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow()],
    pagination: { total: 45, page: 1, page_size: 20, total_pages: 3 }
  });
  mount(
    api,
    "/lexicon-next?headword=centre&gloss=middle&kind=word&pos=noun&page=2"
  );
  await screen.findByText("centre");
  expect(api.workspaceList).toHaveBeenLastCalledWith({
    target_language: "en",
    medium_locale: "zh-Hans",
    headword: "centre",
    gloss: "middle",
    kind: "word",
    pos: "noun",
    page: 2,
    page_size: 20
  });
  fireEvent.change(screen.getByRole("searchbox", { name: "词义" }), {
    target: { value: "中心" }
  });
  expect(api.workspaceList).toHaveBeenCalledTimes(1);
  fireEvent.click(button("搜索"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      headword: "centre",
      gloss: "中心",
      kind: "word",
      pos: "noun",
      page: 1,
      page_size: 20
    })
  );
  fireEvent.click(button("已发布"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "published", page: 1 })
    )
  );
  expect(api.list).not.toHaveBeenCalled();
});
it("语言条件贯穿搜索、统计、分页、垃圾桶导航与重置", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow()],
    pagination: { total: 45, page: 2, page_size: 20, total_pages: 3 }
  });
  const { router } = mount(
    api,
    "/lexicon-next?target_language=en&medium_locale=zh-Hans&headword=centre&page=2"
  );
  await screen.findByText("centre");
  expect(api.stats).toHaveBeenLastCalledWith({
    target_language: "en",
    medium_locale: "zh-Hans",
    headword: "centre"
  });
  fireEvent.click(button("第 3 页"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      headword: "centre",
      page: 3,
      page_size: 20
    })
  );
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  );
  await chooseLanguage("繁体中文");
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hant",
      headword: "centre",
      page: 1,
      page_size: 20
    })
  );
  expect(
    screen.getByRole("checkbox", { name: "选择「centre」" })
  ).not.toBeChecked();
  expect(api.stats).toHaveBeenLastCalledWith({
    target_language: "en",
    medium_locale: "zh-Hant",
    headword: "centre"
  });
  expect(
    new URLSearchParams(router.state.location.search).get("medium_locale")
  ).toBe("zh-Hant");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  );
  await act(() => router.navigate(-1));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      headword: "centre",
      page: 3,
      page_size: 20
    })
  );
  expect(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  ).not.toBeChecked();
  fireEvent.click(screen.getByRole("link", { name: "查看垃圾桶" }));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      status: "archived",
      page: 1,
      page_size: 20
    })
  );
  fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      page: 1,
      page_size: 20
    })
  );
  fireEvent.click(button("重置"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith({
      target_language: "en",
      medium_locale: "zh-Hans",
      page: 1,
      page_size: 20
    })
  );
  expect(api.stats).toHaveBeenLastCalledWith({
    target_language: "en",
    medium_locale: "zh-Hans"
  });
  expect(
    new URLSearchParams(router.state.location.search).get("medium_locale")
  ).toBe("zh-Hans");
});

it("批量操作冻结版本、锁住 pending，未知结果沿用同一请求重试；发布入口保持不可用", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow()],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  );
  expect(button("批量审听与发布")).toBeDisabled();
  fireEvent.click(button(/移入垃圾桶\(1\)/));
  let reject!: (error: Error) => void;
  api.command
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, no) => {
          reject = no;
        })
    )
    .mockResolvedValue({ entry_ids: [id] });
  fireEvent.click(button("移入垃圾桶"));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(1));
  expect(button("取消")).toBeDisabled();
  const sent = api.command.mock.calls[0]![0];
  expect(sent.items).toEqual([
    { entry_id: id, base_revision: 2, base_lifecycle_revision: 1 }
  ]);
  await act(async () => reject(new Error("network")));
  await screen.findByText(/操作结果未确认/);
  fireEvent.click(button("移入垃圾桶"));
  await waitFor(() => expect(api.command).toHaveBeenCalledTimes(2));
  expect(api.command.mock.calls[1]![0]).toEqual(sent);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
});
it("权限与冲突不丢失选择，垃圾桶固定归档，归档词条打开后只读", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow({ status: "archived", lifecycle_revision: 2 })],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  api.command.mockRejectedValue(new HttpError(409, "词条已变化"));
  api.workspaceEntry.mockResolvedValue({ status: "archived" });
  const { router } = mount(api, "/lexicon-next/trash?status=published");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  );
  expect(api.workspaceList).toHaveBeenLastCalledWith({
    target_language: "en",
    medium_locale: "zh-Hans",
    status: "archived",
    page: 1,
    page_size: 20
  });
  expect(button(/永久删除\(1\)/)).toBeDisabled();
  fireEvent.click(button(/恢\s*复\(1\)/));
  fireEvent.click(button("恢复"));
  await screen.findByText("词条已变化");
  expect(button("恢复")).toBeDisabled();
  fireEvent.click(button("取消"));
  expect(
    screen.getByRole("checkbox", { name: "选择「centre」" })
  ).toBeChecked();
  fireEvent.click(button("查看"));
  await screen.findByDisplayValue("centre");
  fireEvent.click(button(/词义与译词/));
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
  fireEvent.click(button(/^预览/));
  expect(screen.getByRole("textbox", { name: "词头" })).toBeDisabled();
  expect(api.save).not.toHaveBeenCalled();
});
it("更多操作与 V1 一致，支持悬停、聚焦和逐行切换，归档仍走新版命令", async () => {
  grantListPermissions();
  const api = requests();
  const secondId = "00000000-0000-4000-8000-000000000002";
  api.workspaceList.mockResolvedValue({
    items: [listRow(), listRow({ id: secondId, headword: "center" })],
    pagination: { total: 2, page: 1, page_size: 20, total_pages: 1 }
  });
  api.command.mockResolvedValue({});
  mount(api, "/lexicon-next");
  const first = await screen.findByRole("button", { name: "更多操作：centre" });
  const second = button("更多操作：center");
  expect(
    within(first.closest("tr")!).getByRole("button", { name: "继续创建" })
  ).toBeVisible();
  expect(first).toHaveAttribute("aria-expanded", "false");
  fireEvent.mouseEnter(first);
  await waitFor(() => expect(first).toHaveAttribute("aria-expanded", "true"));
  fireEvent.focus(second);
  await waitFor(() => {
    expect(first).toHaveAttribute("aria-expanded", "false");
    expect(second).toHaveAttribute("aria-expanded", "true");
  });
  fireEvent.keyDown(second, { key: "ArrowDown" });
  const archive = await screen.findByRole("menuitem", { name: "移入垃圾桶" });
  await waitFor(() => expect(archive).toHaveFocus());
  fireEvent.keyDown(archive, { key: "Escape" });
  await waitFor(() => {
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute("aria-expanded", "false");
  });
  fireEvent.mouseEnter(second);
  fireEvent.click(await screen.findByRole("menuitem", { name: "移入垃圾桶" }));
  await waitFor(() => expect(second).toHaveAttribute("aria-expanded", "false"));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "移入垃圾桶"
    })
  );
  await waitFor(() =>
    expect(api.command).toHaveBeenCalledWith({
      request_id: expect.any(String),
      action: "archive",
      items: [
        { entry_id: secondId, base_revision: 2, base_lifecycle_revision: 1 }
      ]
    })
  );
});

it("垃圾桶与 V1 一致保留直接恢复入口，并按权限禁用", async () => {
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow({ status: "archived", annotation_visible: true })],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next/trash");
  const restore = await screen.findByRole("button", { name: "恢复「centre」" });
  expect(restore).toBeDisabled();
  act(() => grantListPermissions());
  await waitFor(() => expect(restore).toBeEnabled());
  fireEvent.mouseEnter(button("更多操作：centre"));
  await screen.findByRole("menuitem", { name: "永久删除" });
  expect(screen.queryByRole("menuitem", { name: "标注" })).toBeNull();
  fireEvent.click(restore);
  expect(await screen.findByRole("dialog")).toBeVisible();
  expect(api.command).not.toHaveBeenCalled();
});

it("标注版本冲突保留输入且可取消，不能盲目重试覆盖", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow({ annotation_visible: true, annotation: "1" })],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  api.workspaceEntry.mockResolvedValue(
    listRow({ annotation_visible: true, annotation: "1" })
  );
  api.annotation.mockRejectedValue(
    new HttpError(409, "标注已变化，请重新打开后确认", [], "revision_conflict")
  );
  mount(api, "/lexicon-next");
  fireEvent.mouseEnter(
    await screen.findByRole("button", { name: "更多操作：centre" })
  );
  fireEvent.click(await screen.findByText("标注"));
  const field = await screen.findByDisplayValue("1");
  fireEvent.change(field, { target: { value: "2" } });
  fireEvent.click(button("保存标注"));
  await screen.findByText("标注已变化，请重新打开后确认");
  expect(screen.getByDisplayValue("2")).toBeVisible();
  expect(button("保存标注")).toBeDisabled();
  fireEvent.click(button("取消"));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  api.workspaceEntry.mockResolvedValue(
    listRow({
      annotation_visible: true,
      annotation: "9",
      annotation_revision: 4
    })
  );
  api.annotation.mockResolvedValue({
    entry_id: id,
    annotation: "10",
    annotation_revision: 5
  });
  fireEvent.mouseEnter(button("更多操作：centre"));
  fireEvent.click(await screen.findByText("标注"));
  const reopened = await screen.findByDisplayValue("9");
  fireEvent.change(reopened, { target: { value: "10" } });
  fireEvent.click(button("保存标注"));
  await waitFor(() =>
    expect(api.annotation).toHaveBeenLastCalledWith(id, {
      annotation: "10",
      base_annotation_revision: 4
    })
  );
});
it("保存移除最后一项媒介内容后，返回列表立即刷新统计与创建人，不等待生产缓存过期", async () => {
  const api = requests();
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      senses: [
        {
          id: "sense",
          part_of_speech: null,
          definitions: [
            {
              id: "definition",
              locale: "zh-Hans",
              text: "简体内容",
              style: "definition"
            }
          ],
          equivalents: []
        }
      ]
    }
  });
  api.workspaceList.mockResolvedValue({
    items: [listRow()],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  api.stats.mockResolvedValue({ total: 1, today: 1, month: 1 });
  api.creators.mockResolvedValue([{ id: "editor", display_name: "编辑" }]);
  const path =
    "/lexicon-next?target_language=en&medium_locale=zh-Hans&kind=word";
  const { router, client } = mount(api, path, 60000);
  await screen.findByText("centre");
  await waitFor(() => expect(api.creators).toHaveBeenCalledTimes(1));
  fireEvent.click(button("继续创建"));
  await screen.findByDisplayValue("centre");
  fireEvent.click(button(/词义与译词/));
  fireEvent.click(button(/词义与译词/));
  fireEvent.click(button("删除简体中文解释 1"));
  api.workspaceList.mockResolvedValue({
    items: [],
    pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 }
  });
  api.stats.mockResolvedValue({ total: 0, today: 0, month: 0 });
  api.creators.mockResolvedValue([]);
  fireEvent.click(button("保存完整草稿"));
  await screen.findByText("版本 2");
  expect(api.save.mock.calls[0]![1].draft.senses[0].definitions).toEqual([]);
  await act(() => router.navigate(-1));
  await screen.findByText("未找到符合条件的数据");
  await waitFor(() => {
    expect(api.stats).toHaveBeenCalledTimes(2);
    expect(api.creators).toHaveBeenCalledTimes(2);
  });
  expect(
    client.getQueryData([
      "admin-lexicon-next",
      "stats",
      { target_language: "en", medium_locale: "zh-Hans", kind: "word" }
    ])
  ).toEqual({ total: 0, today: 0, month: 0 });
});

it("从列表创建后同步刷新缓存中的统计，不等待缓存过期", async () => {
  const api = requests();
  const { client, router } = mount(api, "/lexicon-next");
  client.setQueryDefaults(["admin-lexicon-next", "stats"], {
    staleTime: Infinity
  });
  await screen.findByText("暂无词条");
  expect(api.stats).toHaveBeenCalledTimes(1);
  fireEvent.click(button("创建词条"));
  await screen.findByLabelText("录入词条");
  api.stats.mockResolvedValue({ total: 1, today: 1, month: 1 });
  fireEvent.change(screen.getByLabelText("录入词条"), {
    target: { value: "centre" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
  await screen.findByText("版本 1");
  await act(() => router.navigate("/lexicon-next"));
  await waitFor(() =>
    expect(
      client.getQueryData([
        "admin-lexicon-next",
        "stats",
        { target_language: "en", medium_locale: "zh-Hans" }
      ])
    ).toEqual({
      total: 1,
      today: 1,
      month: 1
    })
  );
});

it("编辑期间被归档后保留本地输入并转只读，不引导丢弃草稿比较版本", async () => {
  const api = requests();
  api.save.mockRejectedValue(
    new HttpError(409, "归档词条不能编辑", [], "entry_archived")
  );
  const { client } = mount(api);
  await screen.findByDisplayValue("centre");
  fireEvent.click(button(/词义与译词/));
  fireEvent.click(button(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "local unsaved" }
  });
  fireEvent.click(button("保存完整草稿"));
  await screen.findByText(/词条已被归档/);
  expect(screen.getByDisplayValue("local unsaved")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "词头" })).toBeDisabled();
  expect(button("保存完整草稿")).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "比较服务器版本" })
  ).not.toBeInTheDocument();
  expect(
    client.getQueryData(["admin-lexicon-next", "workspace-entry", id])
  ).toMatchObject({ status: "archived" });
});

it("Step 2 复用 V1 词性、词形与发音编辑，沿用 Step 1 的语言，保存并重新打开不丢内容", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const mounted = mount(api);
  const addPos = await screen.findByRole("combobox", { name: "添加基本词性" });
  fireEvent.click(button("展开词条概览"));
  fireEvent.click(button("展开英语词形"));
  const formProgress = within(
    screen.getByRole("region", { name: "英语词形摘要" })
  );
  expect(formProgress.getByText("0 项")).toBeVisible();
  expect(formProgress.getByText("暂未添加")).toBeVisible();
  expect(screen.queryByRole("radiogroup", { name: "方言" })).toBeNull();
  expect(
    screen.queryByRole("checkbox", { name: "编辑通用英语内容" })
  ).toBeNull();
  await waitFor(() => expect(addPos).toBeEnabled());
  fireEvent.mouseDown(addPos);
  fireEvent.click(
    screen
      .getAllByText("名词")
      .find((node) => node.classList.contains("ui-select-item-option-content"))!
  );
  fireEvent.click(await screen.findByRole("button", { name: "编辑原形内容" }));
  const spelling = await screen.findByRole("textbox", {
    name: "词形英美通用拼写"
  });
  expect(screen.getByRole("combobox", { name: "目标语言" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "媒介语言" })).toBeDisabled();
  await changeVoiceText(spelling, { target: { value: "centre" } });
  fireEvent.click(button("确认，应用到草稿"));
  expect(await formProgress.findByText("1 项")).toBeVisible();
  expect(formProgress.getByText("通用英语：centre")).toBeVisible();
  expect(formProgress.queryByText("暂未添加")).toBeNull();
  await waitFor(() => expect(button("保存草稿")).toBeEnabled());
  fireEvent.click(button("保存草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const draft: NextDraft = api.save.mock.calls[0]![1].draft;
  expect(draft.form_editor?.pos[0]?.pos).toBe("noun");
  expect(
    draft.form_editor?.contents.some(
      (content) =>
        content.regional_variants.mode === "common" &&
        content.regional_variants.common.spelling === "centre"
    )
  ).toBe(true);
  expect(draft.forms).toEqual([]);
  await screen.findByText("版本 2");
  // Reopen from the server response rather than retaining editor component state.
  api.get.mockResolvedValue({ ...entry, revision: 2, draft });
  await act(() => mounted.router.navigate("/lexicon-next"));
  await screen.findByRole("button", { name: "创建词条" });
  await act(() => mounted.router.navigate(`/lexicon-next/${id}`));
  await screen.findByRole("button", { name: "编辑原形内容" });
  expect(
    screen.getAllByText("centre").some((element) => element.closest("td"))
  ).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(2);
});

it("词形底栏随步骤切换移除，切回词形仍保留编辑面板", async () => {
  const bounds = HTMLElement.prototype.getBoundingClientRect;
  const spy = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      return this.classList.contains("word-creation-shell")
        ? ({ left: 24, right: 824, bottom: 650, width: 800 } as DOMRect)
        : bounds.call(this);
    });
  try {
    const api = requests();
    api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
    api.get.mockResolvedValue({
      ...entry,
      draft: {
        ...entry.draft,
        form_editor: applyFormsStructure(emptyFormEditor(), formsFixture())
      }
    });
    mount(api);
    const editor = await screen.findByRole("button", { name: "编辑原形内容" });
    expect(
      button("下一步：词义与译词").closest(".v3-step-actions")
    ).not.toBeNull();
    for (const step of [/^词义与译词/, /^预览/]) {
      fireEvent.click(button(step));
      expect(
        screen.queryByRole("button", { name: "下一步：词义与译词" })
      ).toBeNull();
      if (step.source.includes("词义")) {
        expect(
          button("下一步：预览").closest(".v3-step-actions")
        ).not.toBeNull();
        expect(document.querySelectorAll(".v3-step-actions")).toHaveLength(1);
      } else expect(document.querySelector(".v3-step-actions")).toBeNull();
    }
    fireEvent.click(button(/^词性与发音/));
    expect(await screen.findByRole("button", { name: "编辑原形内容" })).toBe(
      editor
    );
    expect(button("下一步：词义与译词")).toBeVisible();
  } finally {
    spy.mockRestore();
  }
});

it("冲突后内容窗口未关闭时禁止重载远端，关闭后才能采纳服务器版本", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const form_editor = applyFormsStructure(emptyFormEditor(), formsFixture());
  if (!("forms_format" in form_editor))
    throw new Error("Expected shared fixture");
  api.get.mockResolvedValue({
    ...entry,
    draft: { ...entry.draft, form_editor }
  });
  api.save.mockRejectedValue(new HttpError(409, "rejected"));
  mount(api);
  await screen.findByRole("button", { name: "编辑原形内容" });
  fireEvent.click(button(/^词义与译词/));
  fireEvent.click(button(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "local" }
  });
  fireEvent.click(button("保存完整草稿"));
  await screen.findByText(/服务器版本已更新/);
  fireEvent.click(button(/词性与发音/));
  fireEvent.click(button("编辑原形内容"));
  fireEvent.click(await screen.findByRole("button", { name: "收起" }));
  expect(button("比较服务器版本")).toBeDisabled();
  fireEvent.click(button("关闭词形内容设置"));
  await waitFor(() => expect(button("比较服务器版本")).toBeEnabled());
  api.get.mockResolvedValue({
    ...entry,
    revision: 5,
    draft: {
      ...entry.draft,
      headword: "remote",
      form_editor: emptyFormEditor()
    }
  });
  fireEvent.click(button("比较服务器版本"));
  await screen.findByText("服务器 · 版本 5");
  fireEvent.click(button("放弃本地修改并重载"));
  fireEvent.click(await screen.findByRole("button", { name: "放弃并重载" }));
  await screen.findByText("版本 5");
  expect(screen.getByText("暂无词性")).toBeVisible();
  expect(screen.queryByRole("button", { name: "编辑原形内容" })).toBeNull();
});

it("Step3 按 Step2 词性归类，切换词性与折叠不丢失多语言内容，完整保存保留其他义项", async () => {
  const api = requests();
  const nounId = crypto.randomUUID();
  const verbId = crypto.randomUUID();
  const definitionId = crypto.randomUUID();
  const formEditor = applyFormsStructure(emptyFormEditor(), formsFixture());
  if (!isSharedForms(formEditor)) throw new Error("expected shared forms");
  const original: NextDraft = {
    ...entry.draft,
    form_editor: formEditor,
    senses: [
      {
        id: nounId,
        part_of_speech: "noun",
        definitions: [
          {
            id: definitionId,
            locale: "en-GB",
            text: "a centre",
            style: "definition"
          },
          {
            id: crypto.randomUUID(),
            locale: "en-US",
            text: "a center",
            style: "sentence"
          }
        ],
        equivalents: []
      },
      {
        id: verbId,
        part_of_speech: "verb",
        definitions: [],
        equivalents: [
          { id: crypto.randomUUID(), locale: "zh-Hant", text: "集中" }
        ]
      }
    ]
  };
  api.get.mockResolvedValue({ ...entry, draft: original });
  mount(api);
  await screen.findByDisplayValue("centre");
  fireEvent.click(button(/^词义与译词/));
  expect(screen.getByRole("tab", { name: /名词/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  fireEvent.change(screen.getByRole("textbox", { name: "英式英语释义 1" }), {
    target: { value: "the middle" }
  });
  fireEvent.click(button("收起英式英语释义"));
  expect(screen.queryByRole("textbox", { name: "英式英语释义 1" })).toBeNull();
  fireEvent.click(button("展开英式英语释义"));
  expect(screen.getByRole("textbox", { name: "英式英语释义 1" })).toHaveValue(
    "the middle"
  );
  fireEvent.click(screen.getByRole("tab", { name: /动词/ }));
  fireEvent.click(button("添加义项"));
  fireEvent.click(button("添加简体中文译词"));
  fireEvent.change(screen.getByRole("textbox", { name: "简体中文译词 1" }), {
    target: { value: "集中于" }
  });
  fireEvent.click(screen.getByRole("tab", { name: /名词/ }));
  expect(screen.getByRole("textbox", { name: "英式英语释义 1" })).toHaveValue(
    "the middle"
  );
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const result = api.save.mock.calls[0]![1].draft;
  expect(result.senses[0]).toEqual({
    ...original.senses[0],
    definitions: [
      { ...original.senses[0]!.definitions[0], text: "the middle" },
      original.senses[0]!.definitions[1]
    ]
  });
  expect(result.senses[1]).toEqual(original.senses[1]);
  expect(result.senses[2]).toMatchObject({
    part_of_speech: "verb",
    equivalents: [{ locale: "zh-Hans", text: "集中于" }]
  });
  expect(result.form_editor).toEqual(original.form_editor);
});

it("Step3 释义跟随顶部语言选择，保留已有通用英语内容及完整多语言草稿", async () => {
  const api = requests();
  const definitions = [
    {
      id: crypto.randomUUID(),
      locale: "en",
      text: "the middle",
      style: "definition" as const
    },
    {
      id: crypto.randomUUID(),
      locale: "en-GB",
      text: "a centre",
      style: "definition" as const
    },
    {
      id: crypto.randomUUID(),
      locale: "en-US",
      text: "a center",
      style: "definition" as const
    }
  ];
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      senses: [
        {
          id: crypto.randomUUID(),
          part_of_speech: "noun",
          definitions,
          equivalents: []
        }
      ]
    }
  });
  mount(api);
  await screen.findByText("版本 1");
  fireEvent.click(button(/^词义与译词/));
  expect(
    screen.queryByRole("checkbox", { name: "编辑通用英语内容" })
  ).toBeNull();
  expect(screen.queryByRole("textbox", { name: "词头" })).toBeNull();
  expect(screen.queryByRole("heading", { name: "语言变体" })).toBeNull();
  expect(screen.queryByRole("radiogroup", { name: "方言" })).toBeNull();
  expect(
    within(screen.getByRole("banner")).getByRole("combobox", {
      name: "目标语言"
    })
  ).toBeVisible();
  expect(
    within(screen.getByRole("banner")).getByRole("combobox", {
      name: "媒介语言"
    })
  ).toBeVisible();
  expect(screen.getByRole("textbox", { name: "英式英语释义 1" })).toHaveValue(
    "a centre"
  );
  await chooseLanguage("美式英语");
  fireEvent.change(screen.getByRole("textbox", { name: "美式英语释义 1" }), {
    target: { value: "the center" }
  });
  await chooseLanguage("英式英语");
  expect(screen.getByRole("textbox", { name: "英式英语释义 1" })).toHaveValue(
    "a centre"
  );
  await chooseLanguage("美式英语");
  await chooseLanguage("繁体中文");
  fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
  expect(
    screen.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("简体中文");
  expect(screen.getByRole("textbox", { name: "美式英语释义 1" })).toHaveValue(
    "the center"
  );
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(api.save.mock.calls[0]![1].draft.headword).toBe("centre");
  expect(api.save.mock.calls[0]![1].draft.senses[0].definitions).toEqual([
    definitions[0],
    definitions[1],
    { ...definitions[2], text: "the center" }
  ]);
});

it("Step3 从标签添加基本词性、排序，Step2 和重新打开沿用同一份结构", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const original: NextDraft = {
    ...entry.draft,
    form_editor: applyFormsStructure(
      emptyFormEditor(),
      formsFixture()
    ) as NonNullable<NextDraft["form_editor"]>,
    senses: [
      {
        id: crypto.randomUUID(),
        part_of_speech: "noun",
        definitions: [],
        equivalents: [
          { id: crypto.randomUUID(), locale: "zh-Hant", text: "中心" }
        ]
      }
    ]
  };
  api.get.mockResolvedValue({ ...entry, draft: original });
  const mounted = mount(api);
  await screen.findByRole("button", { name: "编辑原形内容" });
  fireEvent.click(button(/^词义与译词/));
  expect(screen.getByRole("button", { name: "拖动名词" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "删除名词" })).toBeNull();
  const addPos = screen.getByRole("combobox", { name: "添加基本词性" });
  await waitFor(() => expect(addPos).toBeEnabled());
  fireEvent.mouseDown(addPos);
  expect(
    screen.queryByText("名词", { selector: ".ui-select-item-option-content" })
  ).toBeNull();
  fireEvent.click(
    await screen.findByText("动词", {
      selector: ".ui-select-item-option-content"
    })
  );
  expect(screen.getByRole("tab", { name: /动词/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  fireEvent.click(button("添加义项"));
  fireEvent.click(button("添加简体中文译词"));
  fireEvent.change(screen.getByRole("textbox", { name: "简体中文译词 1" }), {
    target: { value: "集中于" }
  });
  fireEvent.keyDown(screen.getByRole("button", { name: "拖动动词" }), {
    key: "ArrowUp"
  });
  const visiblePosOrder = () =>
    screen
      .getAllByRole("tab")
      .map((tab) =>
        within(tab)
          .getByRole("button", { name: /^拖动/ })
          .getAttribute("aria-label")
      );
  expect(visiblePosOrder()).toEqual(["拖动动词", "拖动名词"]);
  fireEvent.click(button(/^词性与发音/));
  expect(visiblePosOrder()).toEqual(["拖动动词", "拖动名词"]);
  fireEvent.click(screen.getByRole("tab", { name: /动词/ }));
  expect(
    screen.getAllByRole("button", { name: /编辑.*内容/ }).length
  ).toBeGreaterThan(1);
  fireEvent.click(button(/^词义与译词/));
  expect(screen.getByRole("textbox", { name: "简体中文译词 1" })).toHaveValue(
    "集中于"
  );
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const saved: NextDraft = api.save.mock.calls[0]![1].draft;
  expect(saved.form_editor!.pos.map((pos) => pos.pos)).toEqual([
    "verb",
    "noun"
  ]);
  expect(saved.senses[0]).toEqual(original.senses[0]);
  expect(saved.senses[1]).toMatchObject({
    part_of_speech: "verb",
    equivalents: [{ locale: "zh-Hans", text: "集中于" }]
  });
  mounted.unmount();
  api.get.mockResolvedValue({ ...entry, revision: 2, draft: saved });
  mount(api);
  await screen.findByText("版本 2");
  fireEvent.click(button(/^词义与译词/));
  expect(visiblePosOrder()).toEqual(["拖动动词", "拖动名词"]);
  expect(screen.getByRole("textbox", { name: "简体中文译词 1" })).toHaveValue(
    "集中于"
  );
  act(() =>
    useAuthStore.setState({
      profile: { ...useAuthStore.getState().profile!, permissions: [] }
    })
  );
  expect(screen.getByRole("button", { name: "拖动动词" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "删除动词" })).toBeDisabled();
  expect(
    screen
      .getAllByRole("combobox", { name: "添加基本词性" })
      .every((select) => select.hasAttribute("disabled"))
  ).toBe(true);
});

it("词性配置失效后，Step3 新增词性使用最新词形模板", async () => {
  const source = vi.spyOn(partOfSpeechDataSource, "catalog");
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const mounted = mount(api);
  await screen.findByText("版本 1");
  fireEvent.click(button(/^词义与译词/));
  await waitFor(() =>
    expect(screen.getByRole("combobox", { name: "添加基本词性" })).toBeEnabled()
  );
  source.mockResolvedValue({
    ...partOfSpeechCatalogFixture,
    catalog_version: 2,
    items: partOfSpeechCatalogFixture.items.map((item) =>
      item.code === "verb"
        ? { ...item, default_form_types: ["past_tense"] }
        : item
    )
  });
  await act(() =>
    mounted.client.invalidateQueries({ queryKey: partOfSpeechKeys.all })
  );
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "添加基本词性" }));
  fireEvent.click(
    await screen.findByText("动词", {
      selector: ".ui-select-item-option-content"
    })
  );
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const saved: NextDraft = api.save.mock.calls[0]![1].draft;
  expect(
    saved.form_editor!.pos[0]!.forms.map((form) => form.form_type)
  ).toEqual(["base", "past_tense"]);
});

it.each(["词性与发音", "词义与译词"])(
  "在%s标签删除词性，取消保留数据，确认后只移除对应的词形和全部语言词义",
  async (step) => {
    const api = requests();
    api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
    const forms = formsFixture();
    forms.pos.push(
      ...formsFixture({ pos: "verb", pos_id: crypto.randomUUID(), forms: [] })
        .pos
    );
    const original: NextDraft = {
      ...entry.draft,
      form_editor: applyFormsStructure(emptyFormEditor(), forms) as NonNullable<
        NextDraft["form_editor"]
      >,
      senses: [
        {
          id: crypto.randomUUID(),
          part_of_speech: "noun",
          definitions: [
            {
              id: crypto.randomUUID(),
              locale: "en-US",
              text: "a center",
              style: "definition"
            }
          ],
          equivalents: [
            { id: crypto.randomUUID(), locale: "zh-Hant", text: "中心" }
          ]
        },
        {
          id: crypto.randomUUID(),
          part_of_speech: "verb",
          definitions: [],
          equivalents: [
            { id: crypto.randomUUID(), locale: "zh-Hans", text: "集中于" }
          ]
        }
      ]
    };
    api.get.mockResolvedValue({ ...entry, draft: original });
    mount(api);
    await screen.findByRole("button", { name: "编辑原形内容" });
    fireEvent.click(button(new RegExp(`^${step}`)));
    fireEvent.click(screen.getByRole("button", { name: "删除名词" }));
    let dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/会移除此词性下的词形和所有语言/)).toBeVisible();
    fireEvent.click(dialog.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("tab", { name: /名词/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "删除名词" }));
    dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "删除" }));
    expect(screen.queryByRole("tab", { name: /名词/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除动词" })).toBeNull();
    expect(screen.getByRole("button", { name: "拖动动词" })).toBeDisabled();
    fireEvent.click(button(/^词义与译词/));
    expect(screen.getByRole("textbox", { name: "简体中文译词 1" })).toHaveValue(
      "集中于"
    );
    fireEvent.click(button("保存完整草稿"));
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
    const saved: NextDraft = api.save.mock.calls[0]![1].draft;
    expect(saved.form_editor!.pos).toEqual([original.form_editor!.pos[1]]);
    expect(saved.form_editor!.contents).toEqual([]);
    expect(saved.senses).toEqual([original.senses[1]]);
  }
);

it("Step3 复用语义区间的名称、排序与归属，删除区间解除隐藏词性的归属并完整保存", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, sense_groups: true });
  const group = {
    id: crypto.randomUUID(),
    name_zh: "位置",
    name_en: "position"
  };
  const original: NextDraft = {
    ...entry.draft,
    sense_groups: [group],
    senses: [
      {
        id: crypto.randomUUID(),
        part_of_speech: "noun",
        sense_group_id: group.id,
        definitions: [],
        equivalents: []
      },
      {
        id: crypto.randomUUID(),
        part_of_speech: "verb",
        sense_group_id: group.id,
        definitions: [
          {
            id: crypto.randomUUID(),
            locale: "en-US",
            text: "to center",
            style: "definition"
          }
        ],
        equivalents: []
      }
    ]
  };
  api.get.mockResolvedValue({ ...entry, draft: original });
  mount(api);
  await screen.findByText("版本 1");
  fireEvent.click(button(/^词义与译词/));
  expect(button("删除语义区间 1")).toBeDisabled();
  fireEvent.click(button("添加语义区间"));
  fireEvent.change(screen.getByRole("textbox", { name: "语义区间 2 中文" }), {
    target: { value: "机构" }
  });
  fireEvent.change(screen.getByRole("textbox", { name: "语义区间 2 英文" }), {
    target: { value: "institution" }
  });
  fireEvent.keyDown(screen.getByLabelText("拖动语义区间 2"), {
    key: "ArrowUp"
  });
  expect(screen.getByRole("textbox", { name: "语义区间 1 中文" })).toHaveValue(
    "机构"
  );
  fireEvent.mouseDown(
    screen.getByRole("combobox", { name: "释义 1 所属语义区间" })
  );
  fireEvent.click(
    screen
      .getAllByText("机构")
      .find((node) => node.classList.contains("ui-select-item-option-content"))!
  );
  expect(
    screen
      .getByRole("combobox", { name: "释义 1 所属语义区间" })
      .closest(".ui-select")
  ).toHaveTextContent("机构");
  fireEvent.click(button("删除语义区间 2"));
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const saved = api.save.mock.calls[0]![1].draft;
  expect(saved.sense_groups).toEqual([
    { id: expect.any(String), name_zh: "机构", name_en: "institution" }
  ]);
  expect(saved.sense_groups![0]!.id).not.toBe(group.id);
  expect(saved.senses[0]!.sense_group_id).toBe(saved.sense_groups![0]!.id);
  const ungrouped = { ...original.senses[1]! };
  delete ungrouped.sense_group_id;
  expect(saved.senses[1]).toEqual(ungrouped);
  await screen.findByText("版本 2");
});

it("语义区间在只读词条中不能新增、修改、删除或排序", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, sense_groups: true });
  api.get.mockResolvedValue({
    ...entry,
    owner_id: "other",
    draft: {
      ...entry.draft,
      sense_groups: [
        { id: crypto.randomUUID(), name_zh: "位置", name_en: "position" },
        { id: crypto.randomUUID(), name_zh: "机构", name_en: "institution" }
      ]
    }
  });
  mount(api);
  await screen.findByText("版本 1");
  fireEvent.click(button(/^词义与译词/));
  expect(
    screen.getByRole("textbox", { name: "语义区间 1 中文" })
  ).toBeDisabled();
  expect(button("添加语义区间")).toBeDisabled();
  expect(button("删除语义区间 1")).toBeDisabled();
  expect(button("拖动语义区间 1")).toBeDisabled();
  fireEvent.keyDown(screen.getByLabelText("拖动语义区间 1"), {
    key: "ArrowDown"
  });
  expect(screen.getByRole("textbox", { name: "语义区间 1 中文" })).toHaveValue(
    "位置"
  );
  expect(api.save).not.toHaveBeenCalled();
});
