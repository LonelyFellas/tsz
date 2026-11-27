import {
  act,
  fireEvent,
  isInaccessible,
  render,
  screen,
  within,
  waitFor
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi
} from "vitest";
import { HttpError } from "@tsz/api-client";
import { isSharedForms } from "@tsz/shared";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { adminShellResources } from "@/i18n";
import type {
  NextCapabilities,
  NextEntry,
  NextDraft,
  NextDetection,
  NextDetectionInput,
  NextEntryMatchInput,
  NextEntryMatches,
  NextWorkspaceEntry,
  NextSentence,
  NextSentenceDraftChange,
  V3DraftValidationIssue
} from "@tsz/types";
import { bindAdminAuthorizationCache } from "@/lib/adminAuthorization";
import { api as profileApi, tokens, useAuthStore } from "@/lib/auth";
import { LexiconNextPage, type LexiconNextRequests } from "./LexiconNext";
import * as voiceEditorSource from "@/features/dictionary/voice-editor/dataSource";

import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import {
  commonFormFixture,
  formsFixture,
  UUIDS
} from "@/features/dictionary/word-creation-v3/fixtures";
import { applyFormsStructure } from "@/features/dictionary/word-creation-v3/sharedFormsModel";
import { emptyFormEditor } from "@/features/lexicon-next/FormsStep";
import { partOfSpeechDataSource } from "@/features/dictionary/dataSource";
import { partOfSpeechKeys } from "@/features/dictionary/part-of-speech/api";
import * as localDraftStore from "@/features/lexicon-next/localDraftStore";

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
    assessment: vi.fn(),
    reviewAssessment: vi.fn(),
    publication: vi.fn(),
    publicationPreview: vi.fn(),
    publish: vi.fn(),
    sentences: vi.fn(),
    sentence: vi.fn(),
    createSentence: vi.fn(),
    saveSentence: vi.fn(),
    equivalentCatalog: vi
      .fn()
      .mockResolvedValue({ registers: [], domains: [] }),
    list: vi.fn(),
    workspaceEntry: vi.fn().mockResolvedValue(listRow()),
    stats: vi.fn().mockResolvedValue({ total: 0, today: 0, month: 0 }),
    creators: vi.fn().mockResolvedValue([]),
    updaters: vi.fn().mockResolvedValue([]),
    command: vi.fn(),
    annotation: vi.fn(),
    workspaceList: vi.fn().mockResolvedValue({
      items: [],
      pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 }
    }),
    generate: vi.fn(),
    generationCandidates: vi.fn(),
    refreshDictionaryReference: vi.fn(),
    capabilities: vi.fn().mockResolvedValue(caps),
    draftSchema: vi.fn().mockResolvedValue({
      draft_schema_version: 1,
      supported_draft_schema_versions: [1]
    }),
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
  const languages = within(screen.getByRole("group", { name: "智能词库语言" }));
  const select = languages.getByRole("combobox", { name: field });
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
    <InterfaceI18nProvider resources={adminShellResources}>
      <QueryClientProvider client={client}>
        <header>
          <div id="console-header-tools" />
        </header>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  return { client, router, unmount: rendered.unmount };
}
const button = (name: string | RegExp) => screen.getByRole("button", { name });
const stepButton = (name: string | RegExp) =>
  within(screen.getByRole("navigation", { name: "词条编辑步骤" })).getByRole(
    "button",
    { name }
  );
// 大型词形表单按唯一动作文字定位，避免每一步遍历全页计算按钮可及名。
const textAction = (name: string) => {
  const targets = [
    ...new Set(
      screen
        .getAllByText(name, { exact: true })
        .map((element) => element.closest("button"))
        .filter(
          (element): element is HTMLButtonElement =>
            !!element && !isInaccessible(element)
        )
    )
  ];
  expect(targets).toHaveLength(1);
  const target = targets[0]!;
  expect(target).toBeVisible();
  return target!;
};

async function waitForEntryReady() {
  await screen.findByTestId("lexicon-next-editor");
  const languages = within(screen.getByRole("group", { name: "智能词库语言" }));
  await waitFor(() =>
    expect(languages.getByRole("combobox", { name: "媒介语言" })).toBeEnabled()
  );
}

it("编辑器不展示词条类型和草稿版本状态", async () => {
  mount(requests());
  await waitForEntryReady();
  expect(screen.queryByText("单词 · 英语")).toBeNull();
  expect(screen.queryByText("版本 1")).toBeNull();
  expect(screen.queryByText("草稿版本 1")).toBeNull();
});

it("进入基础步骤时重新读取内置词典", async () => {
  const api = requests();
  api.get.mockResolvedValue({
    ...entry,
    creation_detection: {
      surface: "Colour",
      kind: "word",
      matches: [
        {
          id: "dictionary:colour:noun",
          term: "colour",
          part_of_speech: "noun",
          glosses: ["stale snapshot"],
          forms: [{ text: "colours", tags: ["plural"] }],
          phonetics: [{ ipa: "/ˈkʌlə/", tags: ["UK"] }],
          source_name: "Test dictionary",
          source_version: "v1"
        }
      ]
    },
    draft: {
      ...entry.draft,
      headword: "Colour"
    }
  });
  api.detect.mockResolvedValue({
    surface: "Colour",
    kind: "word",
    matches: [
      {
        id: "dictionary:colour:noun-current",
        term: "colour",
        part_of_speech: "noun",
        glosses: ["visible hue"],
        forms: [{ text: "colours", tags: ["plural"] }],
        phonetics: [{ ipa: "/ˈkʌlə/", tags: ["UK"] }],
        source_name: "Current dictionary",
        source_version: "v2"
      }
    ]
  });
  mount(api);
  await waitForEntryReady();

  const basics = stepButton("创建新词条");
  expect(basics).toBeEnabled();
  fireEvent.click(basics);

  expect(screen.getByRole("textbox", { name: "词条文本" })).toHaveValue(
    "Colour"
  );
  expect(await screen.findByText("visible hue")).toBeVisible();
  expect(screen.queryByText("stale snapshot")).toBeNull();
  expect(api.detect).toHaveBeenCalledWith({
    target_language: "en",
    surface: "Colour"
  });
  expect(screen.getByText("colours")).toBeVisible();
  expect(button("下一步：词形与发音")).toBeVisible();
});

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
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
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
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
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
  await screen.findByTestId("lexicon-next-editor");
  const languages = within(screen.getByRole("banner"));
  expect(
    languages.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
  expect(
    languages.getByRole("combobox", { name: "媒介语言" }).closest(".ui-select")
  ).toHaveTextContent("繁体中文");
  fireEvent.click(stepButton(/^词义与例句/));
  expect(screen.getByRole("button", { name: "添加词义" })).toBeVisible();
  fireEvent.click(stepButton(/^预览/));
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

it("创建 guilty 时识别词典的 adj 并生成形容词和名词模板", async () => {
  const api = requests();
  const guilty = { ...entry, draft: { ...entry.draft, headword: "guilty" } };
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  api.create.mockResolvedValue(guilty);
  api.get.mockResolvedValue(guilty);
  api.detect.mockResolvedValue({
    surface: "guilty",
    kind: "word",
    matches: ["adj", "noun"].map((pos) => ({
      id: `dictionary:guilty:${pos}`,
      term: "guilty",
      part_of_speech: pos,
      glosses: [],
      forms: [],
      phonetics: [],
      source_name: "fixture-dictionary",
      source_version: "1"
    })),
    part_of_speech_mappings: [
      {
        source_code: "adj",
        part_of_speech: "adjective",
        base_form_only: false
      },
      { source_code: "noun", part_of_speech: "noun", base_form_only: false }
    ]
  });
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "guilty" }
  });
  fireEvent.click(button("词典检测"));
  const confirm = await screen.findByRole("button", { name: "确认创建" });
  expect(await screen.findByText("形容词", { exact: true })).toBeVisible();
  fireEvent.click(confirm);

  await screen.findByTestId("lexicon-next-editor");
  expect(await screen.findByText("比较级", { exact: true })).toBeVisible();
  expect(screen.getByText("最高级", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("tab", { name: /名词/ }));
  expect(await screen.findByText("复数", { exact: true })).toBeVisible();
  fireEvent.click(stepButton(/^词义与例句/));

  expect(await screen.findByRole("tab", { name: "形容词" })).toBeVisible();
  expect(screen.getByRole("tab", { name: "名词" })).toBeVisible();
});

it("创建完成后不等待列表统计刷新再进入编辑器", async () => {
  const api = requests();
  api.stats.mockReturnValue(new Promise(() => undefined));
  api.creators.mockReturnValue(new Promise(() => undefined));
  const { router } = mount(api, "/lexicon-next");
  await screen.findByRole("button", { name: "创建词条" });
  await act(() => router.navigate("/lexicon-next/new"));
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "centre" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  await waitForEntryReady();
  expect(api.create).toHaveBeenCalledOnce();
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
  expect(stepButton(/^词形与发音/)).toBeVisible();
});

it("创建后词形步骤的自动词性草稿保护面包屑离开", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  api.detect.mockResolvedValue({
    surface: "watershed",
    kind: "word",
    matches: [
      {
        id: "dictionary:watershed:noun",
        term: "watershed",
        part_of_speech: "noun",
        glosses: [],
        forms: [],
        phonetics: [],
        source_name: "test",
        source_version: "1"
      }
    ]
  });
  const { router } = mount(
    api,
    "/lexicon-next?target_language=en&target_locale=en-GB&medium_locale=zh-Hans"
  );
  await screen.findByRole("button", { name: "创建词条" });
  fireEvent.click(button("创建词条"));
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "watershed" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  await screen.findByTestId("lexicon-next-editor");
  await waitFor(() =>
    expect(
      document.querySelector(".word-forms-tabs .word-pos-tab-label")
    ).toHaveTextContent("名词")
  );
  fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
  await screen.findByText(
    "当前有未保存修改。选择“继续编辑”保留草稿，或选择“放弃修改并离开”。"
  );
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
  fireEvent.click(button("继续编辑"));
  expect(screen.getByTestId("lexicon-next-editor")).toBeVisible();
  fireEvent.click(screen.getByRole("link", { name: "智能词库" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并离开" })
  );
  await screen.findByRole("button", { name: "创建词条" });
  expect(router.state.location.pathname).toBe("/lexicon-next");
});

it("保存请求进行中，浏览器返回不能绕过语言锁", async () => {
  const api = requests();
  let finish!: (value: NextEntry) => void;
  api.save.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  const { router } = mount(api);
  await waitForEntryReady();
  await chooseLanguage("美式英语");
  fireEvent.click(stepButton(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "center" }
  });
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  await act(() => router.navigate(-1));
  expect(
    new URLSearchParams(router.state.location.search).get("target_locale")
  ).toBe("en-US");
  fireEvent.click(await screen.findByRole("button", { name: "继续编辑" }));
  await act(async () =>
    finish({
      ...entry,
      revision: 2,
      draft: { ...entry.draft, headword: "center" }
    })
  );
  await waitForEntryReady();
  expect(
    screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
  ).toHaveTextContent("美式英语");
});

it("有未保存修改时切换目标语言需要确认离开", async () => {
  const api = requests();
  const { router } = mount(api, `/lexicon-next/${id}?target_locale=en-GB`);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "unsaved target locale" }
  });

  await chooseLanguage("美式英语");

  expect(screen.getByRole("dialog", { name: "有未保存修改" })).toBeVisible();
  expect(router.state.location.search).toContain("target_locale=en-GB");

  fireEvent.click(button("继续编辑"));
  expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue(
    "unsaved target locale"
  );

  await chooseLanguage("美式英语");
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并离开" })
  );
  await waitFor(() =>
    expect(router.state.location.search).toContain("target_locale=en-US")
  );
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
  expect(api.matchEntries).toHaveBeenLastCalledWith(
    {
      target_language: "en",
      medium_locale: "zh-Hant",
      surface: "centre",
      page: 1,
      page_size: 20
    },
    "word"
  );
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
  expect(screen.queryByRole("button", { name: "添加词义" })).toBeNull();
  fireEvent.click(button("进入词条所属语言"));
  await waitForEntryReady();
  expect(
    new URLSearchParams(router.state.location.search).get("medium_locale")
  ).toBe("zh-Hant");
  fireEvent.click(stepButton(/^预览/));
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

it("编辑中切换媒介语言保留编辑页，并按词条原媒介语言编辑保存", async () => {
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
  const { router } = mount(
    api,
    `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans`
  );

  await waitForEntryReady();
  await chooseLanguage("繁体中文");

  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
  expect(
    new URLSearchParams(router.state.location.search).get("medium_locale")
  ).toBe("zh-Hant");
  expect(
    screen.getByText("当前词条归属简体中文，仍按该媒介语编辑和保存。")
  ).toBeVisible();

  fireEvent.click(stepButton(/^词义与例句/));
  const definition = await screen.findByRole("textbox", {
    name: "简体中文解释 1"
  });
  fireEvent.change(definition, { target: { value: "保存后的简体内容" } });
  fireEvent.click(button("保存完整草稿"));

  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  expect(api.save.mock.calls[0]![1].draft.senses[0].definitions).toEqual([
    expect.objectContaining({
      locale: "zh-Hans",
      text: "保存后的简体内容"
    })
  ]);
});

it("刷新编辑页后保留当前步骤", async () => {
  const api = requests();
  const mounted = mount(
    api,
    `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans`
  );
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
  await waitFor(() =>
    expect(
      new URLSearchParams(mounted.router.state.location.search).get("step")
    ).toBe("preview")
  );
  const refreshedPath =
    mounted.router.state.location.pathname +
    mounted.router.state.location.search;
  mounted.unmount();

  mount(api, refreshedPath);
  await waitForEntryReady();
  expect(stepButton(/^预览/)).toHaveAttribute("aria-current", "step");
});

it("确认跨媒介切换时放弃修改会重载词条草稿", async () => {
  const api = requests();
  mount(api, `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans`);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "未保存内容" }
  });

  await chooseLanguage("繁体中文");
  await screen.findByRole("dialog", { name: "有未保存修改" });
  fireEvent.click(button("放弃修改并离开"));

  await screen.findByText("当前词条归属简体中文，仍按该媒介语编辑和保存。");
  expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue("centre");
});

it("列表名称只显示词头，不展示其他词形和地区标记", async () => {
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [
      listRow({
        target_language: "fr",
        forms: [
          { id: "fr-ca", locale: "fr-CA", text: "central" },
          { id: "en-GB", locale: "en-GB", text: "centre" },
          { id: "en-US", locale: "en-US", text: "center" }
        ]
      })
    ],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next");
  expect(await screen.findByText("centre")).toBeVisible();
  expect(screen.queryByText("central")).toBeNull();
  expect(screen.queryByText("center")).toBeNull();
  expect(
    screen.getByText("centre").closest(".word-list-name")
  ).toHaveTextContent("centre");
  expect(screen.getByText("centre").closest(".word-list-name")).toHaveAttribute(
    "class",
    "word-list-name"
  );
  expect(screen.queryByRole("img", { name: /美式/ })).toBeNull();
  expect(screen.queryByRole("img", { name: /英式/ })).toBeNull();
  expect(screen.queryByText(/加拿大|法语/)).toBeNull();
});

it("检测展示新版已有草稿、标注与释义，并在创建前要求新标注", async () => {
  const api = requests();
  const createdId = "00000000-0000-4000-8000-000000000003";
  api.create.mockResolvedValue({ ...entry, id: createdId });
  api.matchEntries.mockResolvedValue({
    surface: "center",
    annotation_required: true,
    items: [
      listRow({
        forms: [{ id: "form", locale: "en-US", text: "center" }],
        annotation_visible: true,
        annotation: "2",
        gloss: "已有词条的释义"
      })
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
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
  expect(matches.getByText("1 条匹配")).toBeVisible();
  expect(matches.getByText("草稿")).toBeVisible();
  expect(matches.getByText("2", { selector: "sup" })).toBeVisible();
  expect(matches.getByRole("link", { name: "继续创建" })).toHaveAttribute(
    "href",
    `/lexicon-next/${id}?target_language=en&target_locale=en-GB&medium_locale=zh-Hans`
  );
  expect(
    screen.getByText("未找到内置词典匹配，可继续创建空白草稿。")
  ).toBeVisible();
  expect(api.matchEntries).toHaveBeenCalledExactlyOnceWith(
    {
      medium_locale: "zh-Hans",
      target_language: "en",
      surface: "center",
      page: 1,
      page_size: 20
    },
    "word"
  );
  fireEvent.click(button("确认创建"));
  const annotationDialog = await screen.findByRole("dialog");
  expect(within(annotationDialog).getByText("已有词条 1")).toBeInTheDocument();
  expect(
    within(annotationDialog).getByLabelText("centre / center标注")
  ).toHaveValue("2");
  fireEvent.change(within(annotationDialog).getByLabelText("新建词条标注"), {
    target: { value: "3" }
  });
  fireEvent.click(within(annotationDialog).getByText("保存标注并创建"));
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      medium_locale: "zh-Hans",
      target_language: "en",
      kind: "word",
      headword: "center"
    })
  );
  expect(api.annotation).toHaveBeenCalledExactlyOnceWith(createdId, {
    annotation: "3",
    base_annotation_revision: 1
  });
  expect(api.save).not.toHaveBeenCalled();
});

it("仅词形重复不要求数字标注", async () => {
  const api = requests();
  const createdId = "00000000-0000-4000-8000-000000000004";
  api.create.mockResolvedValue({ ...entry, id: createdId });
  api.matchEntries.mockResolvedValue({
    surface: "flipper",
    annotation_required: false,
    items: [
      listRow({
        headword: "flip",
        forms: [{ id: "form", locale: "en-GB", text: "flipper" }]
      })
    ],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "flipper" }
  });
  fireEvent.click(button("词典检测"));
  await screen.findByRole("button", { name: "确认创建" });
  fireEvent.click(button("确认创建"));
  await waitFor(() =>
    expect(api.create).toHaveBeenCalledExactlyOnceWith({
      medium_locale: "zh-Hans",
      target_language: "en",
      kind: "word",
      headword: "flipper"
    })
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(api.annotation).not.toHaveBeenCalled();
});

it("标注弹窗只展示后端返回的精确词头冲突", async () => {
  const api = requests();
  api.matchEntries.mockResolvedValue({
    surface: "flipper",
    annotation_required: true,
    annotation_items: [listRow({ headword: "flipper", annotation: "2" })],
    items: [
      listRow({ headword: "flipper", annotation: "2" }),
      listRow({
        id: "form-only",
        headword: "flip",
        forms: [{ id: "form", locale: "en-GB", text: "flipper" }]
      })
    ],
    pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 }
  });
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "flipper" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("已有词条 1")).toBeVisible();
  expect(within(dialog).queryByText("已有词条 2")).toBeNull();
});

it("标注请求响应丢失后刷新修订号并只重试标注", async () => {
  const api = requests();
  const createdId = "00000000-0000-4000-8000-000000000003";
  api.create.mockResolvedValue({ ...entry, id: createdId });
  api.matchEntries.mockResolvedValue({
    surface: "center",
    items: [listRow({ annotation: "2", annotation_visible: true })],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
  api.annotation.mockRejectedValueOnce(new Error("响应丢失"));
  api.workspaceEntry.mockResolvedValue(
    listRow({ annotation: "3", annotation_revision: 2 })
  );
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "center" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("新建词条标注"), {
    target: { value: "3" }
  });
  fireEvent.click(within(dialog).getByText("保存标注并创建"));
  await within(dialog).findByText(/词条已创建，但标注保存失败/);
  expect(api.create).toHaveBeenCalledOnce();
  fireEvent.click(within(dialog).getByText("保存标注并创建"));
  await waitFor(() => expect(api.annotation).toHaveBeenCalledTimes(2));
  expect(api.annotation).toHaveBeenNthCalledWith(1, createdId, {
    annotation: "3",
    base_annotation_revision: 1
  });
  expect(api.annotation).toHaveBeenNthCalledWith(2, createdId, {
    annotation: "3",
    base_annotation_revision: 2
  });
  expect(api.create).toHaveBeenCalledOnce();
});

it("标注并发变化后停止重试，避免覆盖最新标注", async () => {
  const api = requests();
  const createdId = "00000000-0000-4000-8000-000000000003";
  api.create.mockResolvedValue({ ...entry, id: createdId });
  api.matchEntries.mockResolvedValue({
    surface: "center",
    items: [listRow({ annotation: "2", annotation_visible: true })],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
  api.annotation.mockRejectedValueOnce(new Error("revision conflict"));
  api.workspaceEntry.mockResolvedValue(
    listRow({ annotation: "4", annotation_revision: 2 })
  );
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "center" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("新建词条标注"), {
    target: { value: "3" }
  });
  fireEvent.click(within(dialog).getByText("保存标注并创建"));
  await screen.findByText("词条标注已发生变化，请返回词库核实后再处理。");
  expect(api.create).toHaveBeenCalledOnce();
  expect(api.annotation).toHaveBeenCalledOnce();
});

it("仅有创建权限时不创建无法保存标注的重名词条", async () => {
  const api = requests();
  useAuthStore.setState({
    profile: {
      ...useAuthStore.getState().profile!,
      permissions: ["words.access", "words.create"]
    }
  });
  api.matchEntries.mockResolvedValue({
    surface: "center",
    items: [listRow({ annotation: "2", annotation_visible: true })],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  });
  mount(api, "/lexicon-next/new");
  fireEvent.change(await screen.findByLabelText("录入词条"), {
    target: { value: "center" }
  });
  fireEvent.click(button("词典检测"));
  fireEvent.click(await screen.findByRole("button", { name: "确认创建" }));
  await screen.findByText("当前账号没有修改该词条标注的权限。");
  expect(api.create).not.toHaveBeenCalled();
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
  expect(api.matchEntries).toHaveBeenLastCalledWith(
    {
      medium_locale: "zh-Hans",
      target_language: "en",
      surface: "center",
      page: 2,
      page_size: 20
    },
    "word"
  );
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
async function chooseBasicPos(field = "选择基本词性") {
  fireEvent.mouseDown(screen.getByRole("combobox", { name: field }));
  fireEvent.click(
    await screen.findByText("名词", {
      selector: ".ui-select-item-option-content"
    })
  );
}
async function edit(label: string, value: string) {
  fireEvent.click(
    stepButton(label.includes("词形") ? /词形与发音/ : /词义与例句/)
  );
  if (label.includes("词形")) {
    if (!screen.queryByRole("textbox", { name: `${label} 1` }))
      fireEvent.click(button("已有词形"));
  } else if (!screen.queryByRole("textbox", { name: `${label} 1` })) {
    fireEvent.click(button(`添加${label}`));
  }
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
  it("恢复本地方言配对草稿时保留编辑后的配对目标", async () => {
    const api = requests();
    const senseId = "00000000-0000-4000-8000-000000000007";
    const peer = {
      entry_id: "peer-edited",
      sense_id: "peer-sense-edited",
      revision: 4,
      headword: "colour",
      gloss: "颜色",
      part_of_speech: "noun"
    };
    const original = {
      ...entry,
      dialect_senses: [
        {
          sense_id: senseId,
          usage: "en-GB" as const,
          paired: true,
          no_equivalent: false,
          note: "",
          target: {
            ...peer,
            entry_id: "peer-server",
            sense_id: "peer-server-sense",
            headword: "apartment"
          }
        }
      ],
      draft: {
        ...entry.draft,
        senses: [
          {
            id: senseId,
            part_of_speech: "noun",
            definitions: [],
            equivalents: []
          }
        ]
      }
    };
    const snapshot: localDraftStore.NextLocalDraftSnapshot = {
      snapshot_version: 1,
      account_id: "editor",
      entry_id: id,
      target_locale: "en-GB",
      medium_locale: "zh-Hans",
      base_revision: 1,
      draft_schema_version: 1,
      draft: structuredClone(original.draft),
      edited_pairs: {
        [senseId]: {
          sense_id: senseId,
          usage: "en-GB",
          paired: true,
          no_equivalent: false,
          note: "",
          target: peer
        }
      },
      sentence_resources: [],
      updated_at: "2026-11-18T00:00:00.000Z"
    };
    api.get.mockResolvedValue(original);
    api.capabilities.mockResolvedValue({ ...caps, dialect_pairs: true });
    vi.spyOn(localDraftStore, "readNextLocalDraft").mockResolvedValue(snapshot);

    mount(
      api,
      `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans&step=meanings`
    );

    await screen.findByText("发现未提交的本地草稿");
    fireEvent.click(button("恢复本地草稿"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "解除配对" })).toBeEnabled();
      expect(
        screen.getByRole("link", { name: "打开对应词义" })
      ).toHaveAttribute("href", expect.stringContaining("peer-edited"));
    });
    expect(screen.queryByText("apartment")).not.toBeInTheDocument();
  });

  it("放弃方言配对本地草稿后清除快照并回到服务器配对目标", async () => {
    const api = requests();
    const senseId = "00000000-0000-4000-8000-000000000007";
    const original = {
      ...entry,
      dialect_senses: [
        {
          sense_id: senseId,
          usage: "en-GB" as const,
          paired: true,
          no_equivalent: false,
          note: "",
          target: {
            entry_id: "peer-server",
            sense_id: "peer-server-sense",
            revision: 1,
            headword: "apartment",
            gloss: "公寓",
            part_of_speech: "noun"
          }
        }
      ],
      draft: {
        ...entry.draft,
        senses: [
          {
            id: senseId,
            part_of_speech: "noun",
            definitions: [],
            equivalents: []
          }
        ]
      }
    };
    const snapshot: localDraftStore.NextLocalDraftSnapshot = {
      snapshot_version: 1,
      account_id: "editor",
      entry_id: id,
      target_locale: "en-GB",
      medium_locale: "zh-Hans",
      base_revision: 1,
      draft_schema_version: 1,
      draft: structuredClone(original.draft),
      edited_pairs: {
        [senseId]: {
          sense_id: senseId,
          usage: "en-GB",
          paired: true,
          no_equivalent: false,
          note: "",
          target: {
            entry_id: "peer-edited",
            sense_id: "peer-edited-sense",
            revision: 4,
            headword: "colour",
            gloss: "颜色",
            part_of_speech: "noun"
          }
        }
      },
      sentence_resources: [],
      updated_at: "2026-11-18T00:00:00.000Z"
    };
    api.get.mockResolvedValue(original);
    api.capabilities.mockResolvedValue({ ...caps, dialect_pairs: true });
    vi.spyOn(localDraftStore, "readNextLocalDraft").mockResolvedValue(snapshot);
    const clear = vi
      .spyOn(localDraftStore, "clearNextLocalDraft")
      .mockResolvedValue();

    mount(
      api,
      `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans&step=meanings`
    );

    await screen.findByText("发现未提交的本地草稿");
    fireEvent.click(button("放弃本地草稿"));
    await waitFor(() =>
      expect(screen.queryByText("发现未提交的本地草稿")).not.toBeInTheDocument()
    );
    expect(clear).toHaveBeenCalledWith({
      account_id: "editor",
      entry_id: id,
      target_locale: "en-GB",
      medium_locale: "zh-Hans"
    });
    expect(screen.getByRole("link", { name: "打开对应词义" })).toHaveAttribute(
      "href",
      expect.stringContaining("peer-server")
    );
    expect(screen.queryByText("colour")).not.toBeInTheDocument();
  });

  it("不同账号不会读取其他账号的方言配对本地草稿", async () => {
    const api = requests();
    const read = vi
      .spyOn(localDraftStore, "readNextLocalDraft")
      .mockResolvedValue(undefined);
    useAuthStore.setState({
      profile: {
        ...useAuthStore.getState().profile!,
        id: "another-editor"
      }
    });
    mount(
      api,
      `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans&step=meanings`
    );

    await screen.findByRole("combobox", { name: "目标语言" });
    await waitFor(() =>
      expect(read).toHaveBeenCalledWith({
        account_id: "another-editor",
        entry_id: id,
        target_locale: "en-GB",
        medium_locale: "zh-Hans"
      })
    );
    expect(screen.queryByText("发现未提交的本地草稿")).not.toBeInTheDocument();
  });

  it("解除配对留在本地，保存失败时保留修改并用原目标版本重试", async () => {
    const scroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      HTMLElement.prototype.scrollIntoView = scroll;
    });
    const api = requests(),
      senseId = "00000000-0000-4000-8000-000000000007";
    const original = {
      ...entry,
      dialect_senses: [
        {
          sense_id: senseId,
          usage: "en-GB",
          paired: true,
          no_equivalent: false,
          note: "",
          target: {
            entry_id: "other",
            sense_id: "home",
            revision: 8,
            headword: "apartment",
            gloss: "公寓",
            part_of_speech: "noun"
          }
        }
      ],
      draft: {
        ...entry.draft,
        headword: "flat",
        senses: [
          {
            id: senseId,
            part_of_speech: "noun",
            definitions: [],
            equivalents: []
          }
        ]
      }
    };
    api.get.mockResolvedValue(original);
    api.capabilities.mockResolvedValue({ ...caps, dialect_pairs: true });
    api.save
      .mockRejectedValueOnce(new Error("保存暂时不可用"))
      .mockResolvedValue({
        ...original,
        revision: 2,
        dialect_senses: [
          { ...original.dialect_senses[0], paired: false, target: null }
        ]
      });
    mount(
      api,
      `/lexicon-next/${id}?sense=${senseId}&target_locale=en-GB&medium_locale=zh-Hans`
    );
    fireEvent.click(await screen.findByRole("button", { name: "解除配对" }));
    expect(api.save).not.toHaveBeenCalled();
    const save = screen.getByRole("button", { name: "保存完整草稿" });
    fireEvent.click(save);
    await screen.findByText("保存暂时不可用");
    expect(
      screen.queryByRole("button", { name: "解除配对" })
    ).not.toBeInTheDocument();
    fireEvent.click(save);
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    const payload = api.save.mock.calls[0]![1];
    expect(payload.dialect_changes).toEqual([
      {
        sense_id: senseId,
        usage: "en-GB",
        no_equivalent: false,
        note: "",
        target: null,
        previous_target_revision: 8
      }
    ]);
    expect(api.save.mock.calls[1]![1]).toEqual(payload);
  });

  it("配对冲突后只重载方言字段，不丢当前词头的修改", async () => {
    const api = requests(),
      sid = "sense-with-peer";
    const scroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      HTMLElement.prototype.scrollIntoView = scroll;
    });
    api.capabilities.mockResolvedValue({ ...caps, dialect_pairs: true });
    const original = {
      ...entry,
      draft: {
        ...entry.draft,
        senses: [
          { id: sid, part_of_speech: "noun", definitions: [], equivalents: [] }
        ]
      },
      dialect_senses: [
        {
          sense_id: sid,
          usage: "en-GB",
          paired: true,
          no_equivalent: false,
          note: "",
          target: {
            entry_id: "peer",
            sense_id: "home",
            revision: 8,
            headword: "apartment",
            gloss: "公寓",
            part_of_speech: "noun"
          }
        }
      ]
    };
    api.get.mockResolvedValue(original);
    api.save.mockRejectedValueOnce(
      new HttpError(409, "peer changed", [], "revision_conflict", {
        field: "dialect_changes",
        type: "about:blank",
        title: "Conflict",
        status: 409,
        detail: "peer changed",
        code: "revision_conflict"
      })
    );
    mount(
      api,
      `/lexicon-next/${id}?sense=${sid}&target_locale=en-GB&medium_locale=zh-Hans`
    );
    fireEvent.click(await screen.findByRole("button", { name: "解除配对" }));
    fireEvent.click(stepButton(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "flat" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存完整草稿" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "只重载方言配对" })
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "只重载方言配对" })
      ).not.toBeInTheDocument()
    );
    const save = screen.getByRole("button", { name: "保存完整草稿" });
    await waitFor(() => expect(save).toBeEnabled());
    fireEvent.click(save);
    await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
    expect(api.save.mock.calls[1]![1]).toMatchObject({
      draft: { headword: "flat" },
      expected_revision: 1
    });
    expect(api.save.mock.calls[1]![1]).not.toHaveProperty("dialect_changes");
  });

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
      fireEvent.click(stepButton(/^词义与例句/));
      await chooseLanguage("英式英语");
      expect(useAuthStore.getState().profile?.preferences.dialect).toBe(
        dialect
      );
      fireEvent.click(stepButton(/^词形与发音/));
      fireEvent.click(stepButton(/^词义与例句/));
      expect(
        screen.getByRole("combobox", { name: "目标语言" }).closest(".ui-select")
      ).toHaveTextContent("英式英语");
    }
  );

  it("切换目标变体保留未保存内容和词义身份，完整保存；预览不回写本地稿", async () => {
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
    fireEvent.click(stepButton(/词义与例句/));
    await edit("英式英语词形", "centre");
    fireEvent.click(stepButton(/词义与例句/));
    await chooseBasicPos();
    fireEvent.click(button("添加词义"));
    await edit("英式英语释义", "the middle");
    await edit("简体中文解释", "中心位置");
    await edit("简体中文译词", "中心");
    await chooseLanguage("美式英语");
    fireEvent.click(
      await screen.findByRole("button", { name: "放弃修改并离开" })
    );
    await edit("美式英语词形", "center");
    await edit("美式英语释义", "the center");
    await chooseLanguage("英式英语");
    fireEvent.click(
      await screen.findByRole("button", { name: "放弃修改并离开" })
    );
    fireEvent.click(stepButton(/词形与发音/));
    expect(screen.getByRole("textbox", { name: "英式英语词形 1" })).toHaveValue(
      "centre"
    );
    fireEvent.click(stepButton(/词义与例句/));
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
    await waitForEntryReady();
    fireEvent.click(stepButton(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "local unsaved" }
    });
    expect(
      within(screen.getByRole("region", { name: "草稿预览" })).getByText(
        "the middle"
      )
    ).toBeVisible();
    expect(api.view).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("local unsaved")).toBeInTheDocument();
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
      fireEvent.click(stepButton(/词义与例句/));
      fireEvent.click(stepButton(/^预览/));
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
        fireEvent.click(button("保留本地草稿并继续保存"));
        fireEvent.click(await screen.findByRole("button", { name: "取消" }));
        expect(button("比较服务器版本")).toBeEnabled();
        fireEvent.click(button("比较服务器版本"));
        await screen.findByText("服务器 · 版本 5");
        expect(screen.getByDisplayValue("local")).toBeVisible();
        fireEvent.click(button("放弃本地修改并重载"));
        await screen.findByRole("button", { name: "放弃并重载" });
        fireEvent.click(button("放弃并重载"));
        await screen.findByDisplayValue("remote");
        expect(screen.getByDisplayValue("remote")).toBeVisible();
      }
    }
  );
  it("422 校验失败时说明未保存但保留修改，并指出具体字段", async () => {
    const api = requests();
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "forms",
      node_id: "pronunciation-1",
      field: "synthesis.ipa",
      code: "pronunciation_required",
      message: "selected phoneme is required",
      node_location: {
        node_role: "pronunciation",
        ancestor_node_ids: [],
        form_id: "form-1",
        variant_id: "variant-1",
        pronunciation_id: "pronunciation-1"
      }
    };
    api.save.mockRejectedValue(
      new HttpError(
        422,
        "v3 contract validation failed",
        [],
        "validation_failed",
        [issue]
      )
    );
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(stepButton(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "local" }
    });
    fireEvent.click(button("保存完整草稿"));

    await screen.findByText(
      "草稿未保存，修改已保留。请填写有效的 Azure IPA 合成音素"
    );
    expect(screen.getByDisplayValue("local")).toBeVisible();
  });
  it("加载 422 不伪装成草稿保存失败", async () => {
    const api = requests();
    api.capabilities.mockRejectedValue(
      new HttpError(422, "v3 contract validation failed")
    );
    mount(api);

    await screen.findByText("智能词库手工编辑暂不可用");
    expect(screen.queryByText(/草稿未保存/)).toBeNull();
  });
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
    fireEvent.click(stepButton(/词义与例句/));
    expect(screen.queryByRole("textbox", { name: "词头" })).toBeNull();
    fireEvent.click(stepButton(/词义与例句/));
    expect(button("添加词义")).toBeDisabled();
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
    await waitForEntryReady();
    fireEvent.click(stepButton(/词义与例句/));
    fireEvent.click(stepButton(/^预览/));
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
    expect(screen.getByDisplayValue("latest")).toBeInTheDocument();
  });

  it("保存完成后自动放行已发起的面包屑导航", async () => {
    const api = requests();
    let finishSave!: (entry: NextEntry) => void;
    api.save.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve;
      })
    );
    const { router } = mount(api);
    await waitForEntryReady();
    fireEvent.click(stepButton(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "saved before leaving" }
    });
    fireEvent.click(button("保存完整草稿"));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());

    act(() => {
      void router.navigate("/lexicon-next");
    });
    await screen.findByRole("dialog", { name: "请求尚未完成" });
    await act(async () =>
      finishSave({
        ...entry,
        revision: 2,
        draft: { ...entry.draft, headword: "saved before leaving" }
      })
    );

    await screen.findByRole("button", { name: "创建词条" });
    expect(router.state.location.pathname).toBe("/lexicon-next");
  });
  it("从预览目录定位指定词义，再进入该词义编辑而不保存草稿", async () => {
    const scroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      HTMLElement.prototype.scrollIntoView = scroll;
    });
    const api = requests();
    api.get.mockResolvedValue({
      ...entry,
      draft: {
        ...entry.draft,
        senses: ["first", "second"].map((id) => ({
          id,
          part_of_speech: "noun",
          definitions: [],
          equivalents: []
        }))
      }
    });
    mount(api, `/lexicon-next/${id}?step=preview`);
    const index = await screen.findByRole("navigation", { name: "词义目录" });
    fireEvent.click(within(index).getByRole("button", { name: "词义 2" }));
    expect(document.activeElement).toHaveAccessibleName(/词义 2/);
    fireEvent.click(button("编辑词义 2"));
    expect(stepButton(/^词义与例句/)).toHaveAttribute("aria-current", "step");
    await waitFor(() =>
      expect(
        document.activeElement?.closest("[data-v3-node-id]")
      ).toHaveAttribute("data-v3-node-id", "second")
    );
    expect(api.save).not.toHaveBeenCalled();
  });
  it("已发布直链等候、读取失败和无快照期间不展示可编辑草稿", async () => {
    const api = requests();
    api.capabilities.mockResolvedValue({ ...caps, publishing: true });
    let reject!: (error: Error) => void;
    api.publication
      .mockReturnValueOnce(
        new Promise((_, fail) => {
          reject = fail;
        })
      )
      .mockResolvedValue({
        entry_id: id,
        status: "draft",
        lifecycle_revision: 1,
        has_unpublished_changes: true,
        current: null
      });
    mount(api, `/lexicon-next/${id}?published_sense=gone`);
    await screen.findByText("正在读取发布状态");
    const assertReadOnly = () => {
      expect(screen.queryByRole("textbox", { name: "词头" })).toBeNull();
      expect(screen.queryByRole("button", { name: "保存完整草稿" })).toBeNull();
      expect(screen.queryByRole("button", { name: "检查发布" })).toBeNull();
    };
    assertReadOnly();
    await act(async () => reject(new Error("状态请求失败")));
    await screen.findByText("无法读取发布状态");
    assertReadOnly();
    fireEvent.click(button("重试"));
    await screen.findByText("暂无已发布版本");
    assertReadOnly();
    fireEvent.click(screen.getByRole("radio", { name: "当前草稿" }));
    expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue(
      entry.draft.headword
    );
    expect(api.save).not.toHaveBeenCalled();
  });
  it("预览返回未指定词性词义时聚焦该词义的词性选择器", async () => {
    const scroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      HTMLElement.prototype.scrollIntoView = scroll;
    });
    const api = requests();
    api.get.mockResolvedValue({
      ...entry,
      draft: {
        ...entry.draft,
        form_editor: applyFormsStructure(emptyFormEditor(), formsFixture()),
        senses: [
          {
            id: "named",
            part_of_speech: "noun",
            definitions: [],
            equivalents: []
          },
          {
            id: "unassigned",
            part_of_speech: null,
            definitions: [],
            equivalents: []
          }
        ]
      }
    });
    mount(api, `/lexicon-next/${id}?step=preview`);
    fireEvent.click(await screen.findByRole("button", { name: "编辑词义 2" }));
    await waitFor(() =>
      expect(
        screen.getByRole("combobox", { name: "词义 1 词性" })
      ).toHaveFocus()
    );
    expect(
      document.activeElement?.closest("[data-v3-node-id]")
    ).toHaveAttribute("data-v3-node-id", "unassigned");
  });
  it("预览目录和词义标题使用已配置词性的本地化名称", async () => {
    const api = requests();
    api.get.mockResolvedValue({
      ...entry,
      kind: "phrase",
      draft: {
        ...entry.draft,
        senses: ["first", "second"].map((id) => ({
          id,
          part_of_speech: "phrase_noun",
          definitions: [],
          equivalents: []
        }))
      }
    });
    const { client } = mount(api, `/lexicon-next/${id}?step=preview`);
    await screen.findByRole("navigation", { name: "词义目录" });
    await act(async () => {
      client.setQueryData(partOfSpeechKeys.catalog(), {
        ...partOfSpeechCatalogFixture,
        items: [
          {
            ...partOfSpeechCatalogFixture.items[0]!,
            code: "phrase_noun",
            kind: "phrase",
            name_zh: "短语名词",
            name_en: "Noun phrase"
          }
        ]
      });
    });
    const index = within(screen.getByRole("navigation", { name: "词义目录" }));
    expect(index.getByRole("button", { name: "词义 1" })).toHaveTextContent(
      "短语名词"
    );
    expect(
      screen.getByRole("heading", { name: /词义 1.*短语名词/ })
    ).toBeVisible();
  });
  it("已发布词义链接打开只读快照，切换版本保留本地编辑且不会保存或发布", async () => {
    const scroll = HTMLElement.prototype.scrollIntoView;
    HTMLElement.prototype.scrollIntoView = vi.fn();
    onTestFinished(() => {
      HTMLElement.prototype.scrollIntoView = scroll;
    });
    const api = requests();
    api.capabilities.mockResolvedValue({ ...caps, publishing: true });
    api.publication.mockResolvedValue({
      entry_id: id,
      status: "published",
      lifecycle_revision: 2,
      has_unpublished_changes: true,
      current: {
        id: "publication",
        entry_id: id,
        revision: 1,
        lifecycle_revision: 2,
        published_by_admin_id: "editor",
        published_at: entry.updated_at,
        snapshot: {
          draft: {
            ...entry.draft,
            headword: "published spelling",
            senses: [
              {
                id: "published-sense",
                part_of_speech: "noun",
                definitions: [],
                equivalents: []
              }
            ]
          },
          relation_targets: [],
          sentence_resources: []
        }
      }
    });
    mount(api, `/lexicon-next/${id}?published_sense=published-sense`);
    const snapshot = await screen.findByRole("region", { name: "已发布版本" });
    expect(within(snapshot).getByText("published spelling")).toBeVisible();
    expect(
      within(snapshot)
        .getByRole("heading", { name: /词义 1/ })
        .closest("[tabindex]")
    ).toHaveFocus();
    expect(screen.queryByRole("textbox", { name: "词头" })).toBeNull();
    expect(screen.queryByRole("button", { name: "检查发布" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "当前草稿" }));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "local edit" }
    });
    fireEvent.click(screen.getByRole("radio", { name: "已发布版本" }));
    expect(screen.getByText("published spelling")).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "当前草稿" }));
    expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue(
      "local edit"
    );
    expect(api.save).not.toHaveBeenCalled();
    expect(api.publish).not.toHaveBeenCalled();
  });
  it("完整草稿保存后先刷新发布状态，再按最新修订执行检查", async () => {
    useAuthStore.setState({
      profile: {
        ...useAuthStore.getState().profile!,
        permissions: ["words.access", "words.edit", "words.publish"]
      }
    });
    const api = requests();
    api.capabilities.mockResolvedValue({ ...caps, publishing: true });
    api.publication.mockResolvedValue({
      entry_id: id,
      status: "draft",
      lifecycle_revision: 1,
      has_unpublished_changes: true,
      current: null
    });
    api.publicationPreview.mockResolvedValue({
      entry_id: id,
      revision: 2,
      lifecycle_revision: 1,
      preview_token: "a".repeat(64),
      issues: [],
      warnings: [],
      can_publish: true
    });
    mount(api);
    await waitForEntryReady();
    fireEvent.click(stepButton(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "saved revision" }
    });
    fireEvent.click(button("保存完整草稿"));
    await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(api.publication.mock.calls.length).toBeGreaterThanOrEqual(2)
    );
    fireEvent.click(button("检查发布"));
    await waitFor(() => expect(api.publicationPreview).toHaveBeenCalledOnce());
    expect(api.publicationPreview).toHaveBeenCalledWith(id, {
      base_revision: 2,
      base_lifecycle_revision: 1
    });
  });
  it("撤销编辑权限后的导航与语言切换不会因缓存清理丢失本地草稿", async () => {
    const api = requests();
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(stepButton(/词义与例句/));
    fireEvent.click(stepButton(/^预览/));
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
  it("删除词义前确认全部语言范围；取消和校验失败均保留草稿", async () => {
    const api = requests();
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(stepButton(/词义与例句/));
    fireEvent.click(stepButton(/词义与例句/));
    await chooseBasicPos();
    fireEvent.click(button("添加词义"));
    fireEvent.click(button("添加英式英语释义"));
    fireEvent.click(button("保存完整草稿"));
    await screen.findByText(/不能为空/);
    expect(api.save).not.toHaveBeenCalled();
    fireEvent.click(button("删除词义 1"));
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
  fireEvent.click(await screen.findByRole("button", { name: "第 2 页" }));
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
  fireEvent.click(stepButton(/词义与例句/));
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
});

it("新版列表按任务布局显示高级筛选并提交最后更新人", async () => {
  const api = requests();
  const updaterId = "00000000-0000-4000-8000-000000000009";
  api.updaters.mockResolvedValue([{ id: updaterId, display_name: "更新者" }]);
  api.workspaceList.mockResolvedValue({
    items: [listRow()],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next");
  await screen.findByText("centre");
  fireEvent.click(button("更多筛选"));
  const toggle = button("收起筛选");
  const panel = document.getElementById(toggle.getAttribute("aria-controls")!);
  expect(
    [...panel!.querySelectorAll("label")].map((label) => label.textContent)
  ).toEqual(["基本词性", "最后更新人", "词条类型", "创建人", "创建时间"]);
  const updater = screen.getByLabelText("最后更新人");
  fireEvent.mouseDown(updater.closest(".ui-select")!);
  fireEvent.click(await screen.findByText("更新者"));
  fireEvent.click(button("搜索"));
  await waitFor(() =>
    expect(api.workspaceList).toHaveBeenLastCalledWith(
      expect.objectContaining({ updated_by: updaterId, page: 1 })
    )
  );
});

it("新版列表在同一行显示保存的英美原形，旧响应仍可显示词条名", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [
      listRow({
        headword: "old name",
        name_variants: [
          { text: "centre", dialects: ["uk"] },
          { text: "center", dialects: ["us"] }
        ]
      }),
      listRow({ id: "older-entry", headword: "panel" })
    ],
    pagination: { total: 2, page: 1, page_size: 20, total_pages: 1 }
  });

  mount(api, "/lexicon-next");

  const americanName = await screen.findByText("center");
  const names = within(americanName.closest("td")!);
  expect(names.getByText("centre")).toBeVisible();
  expect(names.getByRole("img", { name: "英式拼写" })).toBeVisible();
  expect(names.getByRole("img", { name: "美式拼写" })).toBeVisible();
  expect(screen.getByText("panel")).toBeVisible();
  expect(
    screen.getByRole("checkbox", { name: "选择「centre / center」" })
  ).toBeVisible();
  fireEvent.mouseEnter(button("更多操作：centre / center"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "移入垃圾桶" }));
  expect(
    within(await screen.findByRole("dialog")).getByText("centre / center")
  ).toBeVisible();
});

it("新版列表将词条状态和词条名称按顺序固定在左侧", async () => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    ...matchMedia(query),
    matches: true
  }));
  const columnKey = "tsz:admin:table-columns:v1:lexicon-next";
  localStorage.setItem(
    columnKey,
    JSON.stringify(
      [
        ["status", "left"],
        ["label", "left"],
        ["kind", false],
        ["gloss", false],
        ["pos_list", false],
        ["levels", false],
        ["updated_at", false],
        ["updated_by_name", false],
        ["created_at", false],
        ["created_by_name", false],
        ["references", false],
        ["action", "right"]
      ].map(([key, fixed]) => ({ key, visible: true, fixed }))
    )
  );
  onTestFinished(() => localStorage.removeItem(columnKey));
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow({ status: "published" })],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next");
  await screen.findByText("centre");
  const headers = screen.getAllByRole("columnheader");
  expect(headers.map((header) => header.textContent)).toEqual([
    "",
    "词条状态",
    "词条名称",
    "词条类型",
    "常见词义",
    "基本词性",
    "词义难度",
    "更新时间",
    "最后更新人",
    "创建时间",
    "创建人",
    "关联项",
    "操作"
  ]);
  expect(headers[1]).toHaveStyle({ position: "sticky", left: "44px" });
  expect(headers[2]).toHaveStyle({ position: "sticky", left: "128px" });
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
it("列表入口位于结果工具栏", async () => {
  grantListPermissions();
  const api = requests();
  mount(api, "/lexicon-next");

  const create = await screen.findByRole("button", { name: "创建词条" });
  expect(create.closest(".word-list-results-panel")).not.toBeNull();
  expect(create.closest(".word-list-page-actions")).toBeNull();

  const trash = screen.getByRole("link", { name: "查看垃圾桶" });
  expect(trash.closest(".admin-table-toolbar-trailing")).not.toBeNull();
  expect(screen.getByRole("button", { name: "列设置" })).toBeVisible();
});

it("列表请求失败仍保留创建和垃圾桶入口", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockRejectedValue(new HttpError(500, "列表失败"));
  mount(api, "/lexicon-next");

  await screen.findByText("列表失败");
  const create = screen.getByRole("button", { name: "创建词条" });
  expect(create.closest(".word-list-page-actions")).not.toBeNull();
  expect(screen.getByRole("link", { name: "查看垃圾桶" })).toBeVisible();
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
  fireEvent.click(stepButton(/词义与例句/));
  expect(router.state.location.pathname).toBe(`/lexicon-next/${id}`);
  fireEvent.click(stepButton(/^预览/));
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

it.each([
  ["published", "词条已恢复发布状态"],
  ["draft", "词条已恢复为草稿"],
  ["unavailable", "词条已恢复"]
] as const)(
  "垃圾桶单条恢复按状态回读显示反馈：%s",
  async (status, feedback) => {
    grantListPermissions();
    const api = requests();
    api.workspaceList.mockResolvedValue({
      items: [listRow({ status: "archived" })],
      pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
    });
    api.command.mockResolvedValue({ entry_ids: [id] });
    if (status === "unavailable") {
      api.workspaceEntry.mockRejectedValueOnce(
        new Error("readback unavailable")
      );
    } else {
      api.workspaceEntry.mockResolvedValueOnce(listRow({ status }));
    }
    mount(api, "/lexicon-next/trash");
    fireEvent.click(
      await screen.findByRole("button", { name: "恢复「centre」" })
    );
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "恢复"
      })
    );
    expect(await screen.findByText(feedback, { exact: true })).toBeVisible();
    expect(api.workspaceEntry).toHaveBeenCalledWith(id);
    expect(api.command).toHaveBeenCalledOnce();
  }
);

it("批量恢复按实际状态汇总草稿和已发布词条", async () => {
  grantListPermissions();
  const api = requests();
  const publishedId = crypto.randomUUID();
  api.workspaceList.mockResolvedValue({
    items: [
      listRow({ status: "archived" }),
      listRow({ id: publishedId, headword: "center", status: "archived" })
    ],
    pagination: { total: 2, page: 1, page_size: 20, total_pages: 1 }
  });
  api.command.mockResolvedValue({ entry_ids: [id, publishedId] });
  api.workspaceEntry.mockImplementation(async (entryId) =>
    listRow({
      id: entryId,
      status: entryId === publishedId ? "published" : "draft"
    })
  );
  mount(api, "/lexicon-next/trash");
  fireEvent.click(
    await screen.findByRole("checkbox", { name: "选择「centre」" })
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "选择「center」" }));
  fireEvent.click(button(/恢\s*复\(2\)/));
  fireEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "恢复"
    })
  );
  expect(
    await screen.findByText("已恢复 2 个词条（草稿 1 个，已发布 1 个）")
  ).toBeVisible();
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

it("标注同原型冲突展示服务器标注，并按最新修订再次确认", async () => {
  grantListPermissions();
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [listRow({ annotation_visible: true, annotation: "1" })],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  api.workspaceEntry.mockResolvedValue(
    listRow({ annotation_visible: true, annotation: "1" })
  );
  api.annotation
    .mockRejectedValueOnce(
      new HttpError(
        409,
        "标注或原型分组已变化",
        [],
        "annotation_conflict",
        [],
        {
          annotation_conflict: {
            reason: "revision_conflict",
            groups: [],
            entries: [
              {
                entry_id: id,
                annotation: "9",
                annotation_revision: 4,
                created_by: "editor",
                created_by_name: "编辑",
                presentation: {
                  label: "centre",
                  matched_surfaces: ["centre"],
                  strategy_version: "surface_summary_v1"
                },
                pos_labels: ["noun"],
                gloss_previews: ["中心"],
                updated_at: entry.updated_at,
                inbound_relations: {
                  total: 0,
                  by_type: { synonym: 0, antonym: 0, derivative: 0 },
                  previews: [],
                  truncated: false
                }
              }
            ]
          }
        }
      )
    )
    .mockResolvedValue({
      entry_id: id,
      annotation: "9",
      annotation_revision: 4
    });
  mount(api, "/lexicon-next");
  fireEvent.mouseEnter(
    await screen.findByRole("button", { name: "更多操作：centre" })
  );
  fireEvent.click(await screen.findByText("标注"));
  const field = await screen.findByDisplayValue("1");
  fireEvent.change(field, { target: { value: "2" } });
  fireEvent.click(button("保存标注"));
  await screen.findByText("标注或原型分组已变化，请根据当前标注重新确认。");
  expect(screen.getByDisplayValue("9")).toBeVisible();
  fireEvent.click(button("保存标注"));
  await waitFor(() =>
    expect(api.annotation).toHaveBeenLastCalledWith(id, {
      annotation: "9",
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
  fireEvent.click(stepButton(/词义与例句/));
  fireEvent.click(stepButton(/词义与例句/));
  await chooseBasicPos("词义 1 词性");
  fireEvent.click(button("删除简体中文解释 1"));
  api.workspaceList.mockResolvedValue({
    items: [],
    pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 }
  });
  api.stats.mockResolvedValue({ total: 0, today: 0, month: 0 });
  api.creators.mockResolvedValue([]);
  fireEvent.click(button("保存完整草稿"));
  // The revision renders before the save finally releases the navigation lock.
  await waitForEntryReady();
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
  await waitForEntryReady();
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
  fireEvent.click(stepButton(/词义与例句/));
  fireEvent.click(stepButton(/^预览/));
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

it.each([false, true])(
  "打开 Step 2 后拖动默认词性保持选中（恢复本地草稿：%s）",
  async (restore) => {
    const api = requests();
    api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
    const formEditor = applyFormsStructure(emptyFormEditor(), {
      pos: [
        ...formsFixture().pos,
        ...formsFixture({
          pos_id: UUIDS.pos_2,
          pos: "verb",
          forms: [],
          groups: []
        }).pos
      ]
    });
    if (!isSharedForms(formEditor)) throw new Error("expected shared forms");
    const draft = { ...entry.draft, form_editor: formEditor };
    if (restore) {
      const original = {
        ...entry.draft,
        form_editor: applyFormsStructure(
          emptyFormEditor(),
          formsFixture({ pos: "adjective", forms: [], groups: [] })
        )
      };
      api.get.mockResolvedValue({ ...entry, draft: original });
      vi.spyOn(localDraftStore, "readNextLocalDraft").mockResolvedValue({
        snapshot_version: 1,
        account_id: "editor",
        entry_id: id,
        target_locale: "en-GB",
        medium_locale: "zh-Hans",
        base_revision: entry.revision,
        draft_schema_version: 1,
        draft,
        edited_pairs: {},
        sentence_resources: [],
        updated_at: "2026-11-22T00:00:00.000Z"
      });
    } else {
      api.get.mockResolvedValue({ ...entry, draft });
    }
    mount(api, `/lexicon-next/${id}?step=forms`);
    if (restore) {
      await screen.findByText("发现未提交的本地草稿");
      fireEvent.click(button("恢复本地草稿"));
    }
    await screen.findByRole("button", { name: "编辑原形内容" });

    const tabs = () => within(screen.getByRole("tablist"));
    const noun = () => tabs().getByRole("tab", { name: /名词/ });
    const verb = () => tabs().getByRole("tab", { name: /动词/ });
    const expectTabs = (first: HTMLElement, second: HTMLElement) => {
      expect(tabs().getAllByRole("tab")).toEqual([first, second]);
      expect(noun()).toHaveAttribute("aria-selected", "true");
      expect(verb()).toHaveAttribute("aria-selected", "false");
    };
    function dragNounOntoVerb() {
      const grip = within(noun()).getByRole("button", { name: "拖动名词" });
      const target = within(verb())
        .getByRole("button", { name: "拖动动词" })
        .closest(".word-pos-tab-handle")!;
      const store = new Map<string, string>();
      const dataTransfer = {
        get types() {
          return [...store.keys()];
        },
        setData: (type: string, value: string) => store.set(type, value),
        getData: (type: string) => store.get(type) ?? ""
      };
      fireEvent.dragStart(grip, { dataTransfer });
      fireEvent.dragOver(target, { dataTransfer });
      fireEvent.drop(target, { dataTransfer });
      fireEvent.dragEnd(grip, { dataTransfer });
    }

    expectTabs(noun(), verb());
    dragNounOntoVerb();
    expectTabs(verb(), noun());
    expect(button("编辑原形内容")).toBeVisible();

    fireEvent.click(stepButton(/^词义与例句/));
    expectTabs(verb(), noun());
    fireEvent.click(stepButton(/^词形与发音/));

    dragNounOntoVerb();
    expectTabs(noun(), verb());
    expect(button("编辑原形内容")).toBeVisible();
    fireEvent.click(stepButton(/^词义与例句/));
    expectTabs(noun(), verb());
  }
);

it("Step 2 复用 V1 词性、词形与发音编辑，沿用 Step 1 的语言，保存并重新打开不丢内容", async () => {
  const loadCatalog = vi.spyOn(partOfSpeechDataSource, "catalog");
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const mounted = mount(api);
  const addPos = await screen.findByRole("button", { name: "添加词性" });
  expect(screen.queryByRole("tab", { name: /^词性$/ })).toBeNull();
  fireEvent.click(
    screen.getByLabelText("展开词条概览", { selector: "button" })
  );
  fireEvent.click(
    screen.getByLabelText("展开英语词形", { selector: "button" })
  );
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
  expect(loadCatalog).toHaveBeenCalledOnce();
  fireEvent.click(addPos);
  fireEvent.click(await screen.findByRole("menuitem", { name: "名词" }));
  fireEvent.click(
    await screen.findByLabelText("编辑原形内容", { selector: "button" })
  );
  const spelling = await screen.findByRole("textbox", {
    name: "词形英美通用拼写"
  });
  expect(spelling).toHaveValue("centre");
  expect(screen.getByRole("combobox", { name: "目标语言" })).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "媒介语言" })).toBeDisabled();
  expect(spelling).toHaveValue("centre");
  fireEvent.click(textAction("确认，应用到草稿"));
  expect(await formProgress.findByText("1 项")).toBeVisible();
  expect(formProgress.getByText("通用英语：centre")).toBeVisible();
  expect(formProgress.queryByText("暂未添加")).toBeNull();
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
  await waitForEntryReady();
  // Reopen from the server response rather than retaining editor component state.
  api.get.mockResolvedValue({ ...entry, revision: 2, draft });
  await act(() => mounted.router.navigate("/lexicon-next"));
  await screen.findByRole("button", { name: "创建词条" });
  await act(() => mounted.router.navigate(`/lexicon-next/${id}`));
  await screen.findByLabelText("编辑原形内容", { selector: "button" });
  expect(
    screen.getAllByText("centre").some((element) => element.closest("td"))
  ).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(2);
});

it("只有原形的短语词性可以新增变化组，保存后可重新打开两组", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  vi.spyOn(partOfSpeechDataSource, "catalog").mockResolvedValue({
    ...partOfSpeechCatalogFixture,
    items: [
      {
        ...partOfSpeechCatalogFixture.items[0]!,
        code: "phrase_noun",
        kind: "phrase",
        name_zh: "名词性成分",
        name_en: "Nominal constituent",
        allowed_form_types: [],
        default_form_types: []
      }
    ]
  });
  const formEditor = applyFormsStructure(
    emptyFormEditor(),
    formsFixture({
      pos: "phrase_noun",
      forms: [commonFormFixture({ spelling: "city centre" })]
    })
  );
  if (!isSharedForms(formEditor)) throw new Error("Expected shared fixture");
  const phrase: NextEntry = {
    ...entry,
    kind: "phrase",
    draft: {
      ...entry.draft,
      headword: "city centre",
      form_editor: formEditor
    }
  };
  let stored = phrase;
  api.get.mockImplementation(async () => stored);
  api.save.mockImplementation(async (_id, input) => {
    stored = {
      ...phrase,
      revision: input.expected_revision + 1,
      draft: structuredClone(input.draft)
    };
    return stored;
  });
  const path = `/lexicon-next/${id}?step=forms`;
  const mounted = mount(api, path);
  fireEvent.click(
    await screen.findByRole("button", { name: "新增名词性成分变化组" })
  );
  fireEvent.click(button("为第 2 组增加词形"));
  fireEvent.click(await screen.findByRole("menuitem", { name: "原形" }));
  const editBase = screen.getAllByRole("button", { name: "编辑原形内容" });
  expect(editBase).toHaveLength(2);
  fireEvent.click(editBase[1]!);
  fireEvent.change(
    await screen.findByRole("textbox", { name: "词形英美通用拼写" }),
    { target: { value: "city center" } }
  );
  fireEvent.click(textAction("确认，应用到草稿"));
  await waitFor(() => expect(stored.revision).toBe(2));
  await waitFor(() => expect(button("保存草稿")).toBeDisabled());
  mounted.unmount();

  mount(api, path);
  expect(
    await screen.findByRole("button", { name: "为第 2 组增加词形" })
  ).toBeVisible();
  expect(screen.getByRole("cell", { name: /city centre$/ })).toBeVisible();
  expect(screen.getByRole("cell", { name: /city center$/ })).toBeVisible();
  expect(api.get).toHaveBeenCalledTimes(2);
});

it("完整保存前清理其他词形中的历史失配富文本", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const form_editor = applyFormsStructure(emptyFormEditor(), formsFixture());
  if (!("forms_format" in form_editor))
    throw new Error("Expected shared fixture");
  const content = form_editor.contents[0]!;
  if (content.regional_variants.mode !== "common")
    throw new Error("Expected common variant fixture");
  content.regional_variants.common.spelling_rich = {
    version: 2,
    text: "stale spelling",
    annotations: []
  };
  const pronunciation = content.regional_variants.common.pronunciations[0]!;
  pronunciation.dict_phonetic_rich = {
    version: 2,
    text: "stale phonetic",
    annotations: []
  };
  pronunciation.actual_pron_rich = {
    version: 2,
    text: pronunciation.actual_pron,
    annotations: [{ type: "liaison", start: 0, end: 999 }]
  };
  api.get.mockResolvedValue({
    ...entry,
    draft: { ...entry.draft, form_editor }
  });
  mount(api);
  await screen.findByLabelText("编辑原形内容", { selector: "button" });
  fireEvent.click(stepButton(/^词义与例句/));
  fireEvent.click(stepButton(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "centre later" }
  });
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));

  const saved = api.save.mock.calls[0]![1].draft;
  const savedContent = saved.form_editor!.contents[0]!;
  if (savedContent.regional_variants.mode !== "common")
    throw new Error("Expected common variant fixture");
  expect(savedContent.regional_variants.common.spelling_rich).toBeUndefined();
  const savedPronunciation =
    savedContent.regional_variants.common.pronunciations[0]!;
  expect(savedPronunciation.dict_phonetic_rich).toBeUndefined();
  expect(savedPronunciation.actual_pron_rich).toBeUndefined();
  expect(
    screen.getByText("已清理历史失配标注，正文和录音已保留。")
  ).toBeVisible();
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
    for (const step of [/^词义与例句/, /^预览/]) {
      fireEvent.click(stepButton(step));
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
    fireEvent.click(stepButton(/^词形与发音/));
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
  await screen.findByLabelText("编辑原形内容", { selector: "button" });
  const steps = within(
    screen.getByRole("navigation", { name: "词条编辑步骤" })
  );
  fireEvent.click(steps.getByRole("button", { name: /^词义与例句/ }));
  fireEvent.click(steps.getByRole("button", { name: /^预览/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "local" }
  });
  fireEvent.click(textAction("保存完整草稿"));
  await screen.findByText(/服务器版本已更新/);
  fireEvent.click(steps.getByRole("button", { name: /词形与发音/ }));
  fireEvent.click(
    screen.getByLabelText("编辑原形内容", { selector: "button" })
  );
  fireEvent.click(await screen.findByRole("button", { name: "收起" }));
  expect(textAction("比较服务器版本")).toBeDisabled();
  fireEvent.click(
    screen.getByLabelText("关闭词形内容设置", { selector: "button" })
  );
  await waitFor(() => expect(textAction("比较服务器版本")).toBeEnabled());
  api.get.mockResolvedValue({
    ...entry,
    revision: 5,
    draft: {
      ...entry.draft,
      headword: "remote",
      form_editor: emptyFormEditor()
    }
  });
  fireEvent.click(textAction("比较服务器版本"));
  await screen.findByText("服务器 · 版本 5");
  fireEvent.click(textAction("放弃本地修改并重载"));
  fireEvent.click(await screen.findByRole("button", { name: "放弃并重载" }));
  await waitForEntryReady();
  expect(screen.getByText("暂无词性")).toBeVisible();
  expect(screen.queryByRole("button", { name: "编辑原形内容" })).toBeNull();
});

it("Step3 按 Step2 词性归类，切换词性与折叠不丢失多语言内容，完整保存保留其他词义", async () => {
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
  fireEvent.click(stepButton(/^词义与例句/));
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
  fireEvent.click(button("添加词义"));
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
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
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
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并离开" })
  );
  expect(screen.getByRole("textbox", { name: "英式英语释义 1" })).toHaveValue(
    "a centre"
  );
  await chooseLanguage("美式英语");
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并离开" })
  );
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

it("Step3 从标签添加基本词性、排序，Step2 和保存请求沿用同一份结构", async () => {
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
  mount(api);
  await screen.findByLabelText("编辑原形内容", { selector: "button" });
  const steps = within(
    screen.getByRole("navigation", { name: "词条编辑步骤" })
  );
  fireEvent.click(steps.getByRole("button", { name: /^词义与例句/ }));
  const tabs = within(screen.getByRole("tablist"));
  expect(tabs.getByRole("button", { name: "拖动名词" })).toBeDisabled();
  expect(tabs.queryByRole("button", { name: "删除名词" })).toBeNull();
  const addPos = tabs.getByRole("combobox", { name: "添加基本词性" });
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
  expect(tabs.getByRole("tab", { name: /动词/ })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  const meanings = within(screen.getByRole("tabpanel"));
  fireEvent.click(meanings.getByRole("button", { name: "添加简体中文译词" }));
  fireEvent.change(meanings.getByRole("textbox", { name: "简体中文译词 1" }), {
    target: { value: "集中于" }
  });
  fireEvent.keyDown(tabs.getByRole("button", { name: "拖动动词" }), {
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
  fireEvent.click(steps.getByRole("button", { name: /^词形与发音/ }));
  expect(visiblePosOrder()).toEqual(["拖动动词", "拖动名词"]);
  expect(
    within(screen.getByRole("tablist")).getByRole("tab", { name: /动词/ })
  ).toHaveAttribute("aria-selected", "true");
  expect(
    screen.getByLabelText("编辑过去式内容", { selector: "button" })
  ).toBeVisible();
  fireEvent.click(
    within(screen.getByRole("tablist")).getByRole("tab", { name: /名词/ })
  );
  fireEvent.click(steps.getByRole("button", { name: /^词义与例句/ }));
  expect(
    within(screen.getByRole("tablist")).getByRole("tab", { name: /名词/ })
  ).toHaveAttribute("aria-selected", "true");
  fireEvent.click(
    within(screen.getByRole("tablist")).getByRole("tab", { name: /动词/ })
  );
  expect(meanings.getByRole("textbox", { name: "简体中文译词 1" })).toHaveValue(
    "集中于"
  );
  fireEvent.click(textAction("保存完整草稿"));
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
});

it("Step3 保存后重新打开保留词性顺序和词义，只读时禁用标签操作", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const forms = formsFixture();
  forms.pos.unshift(
    ...formsFixture({ pos: "verb", pos_id: crypto.randomUUID(), forms: [] }).pos
  );
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      form_editor: applyFormsStructure(emptyFormEditor(), forms) as NonNullable<
        NextDraft["form_editor"]
      >,
      senses: [
        {
          id: crypto.randomUUID(),
          part_of_speech: "verb",
          definitions: [],
          equivalents: [
            { id: crypto.randomUUID(), locale: "zh-Hans", text: "集中" }
          ]
        }
      ]
    }
  });
  const mounted = mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  fireEvent.change(screen.getByRole("textbox", { name: "简体中文译词 1" }), {
    target: { value: "集中于" }
  });
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const saved: NextDraft = api.save.mock.calls[0]![1].draft;
  await waitForEntryReady();
  mounted.unmount();
  api.get.mockResolvedValue({ ...entry, revision: 2, draft: saved });
  mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  const tabs = within(screen.getByRole("tablist"));
  expect(
    tabs
      .getAllByRole("tab")
      .map((tab) =>
        within(tab)
          .getByRole("button", { name: /^拖动/ })
          .getAttribute("aria-label")
      )
  ).toEqual(["拖动动词", "拖动名词"]);
  expect(screen.getByRole("textbox", { name: "简体中文译词 1" })).toHaveValue(
    "集中于"
  );
  act(() =>
    useAuthStore.setState({
      profile: { ...useAuthStore.getState().profile!, permissions: [] }
    })
  );
  expect(tabs.getByRole("button", { name: "拖动动词" })).toBeDisabled();
  expect(tabs.getByRole("button", { name: "删除动词" })).toBeDisabled();
  expect(
    tabs
      .getAllByRole("combobox", { name: "添加基本词性" })
      .every((select) => select.hasAttribute("disabled"))
  ).toBe(true);
});

it("词性配置失效后，Step3 新增词性使用最新词形模板", async () => {
  const source = vi.spyOn(partOfSpeechDataSource, "catalog");
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  const mounted = mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  const addPos = await screen.findByRole("button", { name: "添加词性" });
  await waitFor(() => expect(addPos).toBeEnabled());
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
  fireEvent.click(addPos);
  fireEvent.click(await screen.findByRole("menuitem", { name: "动词" }));
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(1));
  const saved: NextDraft = api.save.mock.calls[0]![1].draft;
  expect(
    saved.form_editor!.pos[0]!.forms.map((form) => form.form_type)
  ).toEqual(["base", "past_tense"]);
});

it.each(["词形与发音", "词义与例句"])(
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
    fireEvent.click(stepButton(new RegExp(`^${step}`)));
    fireEvent.click(screen.getByRole("button", { name: "删除名词" }));
    let dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/会移除此词性下的词形.*所有语言/)).toBeVisible();
    fireEvent.click(dialog.getByRole("button", { name: "取消" }));
    expect(screen.getByRole("tab", { name: /名词/ })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "删除名词" }));
    dialog = within(await screen.findByRole("dialog"));
    fireEvent.click(dialog.getByRole("button", { name: "删除" }));
    expect(screen.queryByRole("tab", { name: /名词/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除动词" })).toBeNull();
    expect(screen.getByRole("button", { name: "拖动动词" })).toBeDisabled();
    fireEvent.click(stepButton(/^词义与例句/));
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
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
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
    screen.getByRole("combobox", { name: "词义 1 所属语义区间" })
  );
  fireEvent.click(
    screen
      .getAllByText("机构")
      .find((node) => node.classList.contains("ui-select-item-option-content"))!
  );
  expect(
    screen
      .getByRole("combobox", { name: "词义 1 所属语义区间" })
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
  await waitForEntryReady();
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
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
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

it("语法结构排序后保存顺序，保留其他词性和释义引用", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, grammar_structures: true });
  const grammar = (id: string, pos: string, text: string) => ({
    id,
    part_of_speech: pos,
    variants: ["en-GB", "en-US"].map((locale) => ({
      id: crypto.randomUUID(),
      locale,
      content: { version: 2 as const, text, annotations: [] }
    }))
  });
  const first = grammar("first", "noun", "a job");
  const second = grammar("second", "noun", "a position");
  const other = grammar("other", "verb", "to work");
  const draft: NextDraft = {
    ...entry.draft,
    grammar_structures: [first, other, second],
    senses: [
      {
        id: "sense",
        part_of_speech: "noun",
        definitions: [
          {
            id: "definition",
            locale: "en-GB",
            style: "definition",
            text: "paid work",
            grammar_structure_id: first.id
          }
        ],
        equivalents: []
      }
    ]
  };
  const url = `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans`;
  api.get.mockResolvedValue({ ...entry, draft });
  const mounted = mount(api, url);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  const handle = await screen.findByRole("button", { name: "拖动语法结构 2" });
  await waitFor(() => expect(handle).toBeEnabled());
  fireEvent.keyDown(handle, { key: "ArrowUp" });
  const firstEditor = () => button("编辑语法结构 1 英式英语内容");
  expect(firstEditor()).toHaveTextContent("a position");
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  const saved: NextDraft = api.save.mock.calls[0]![1].draft;
  expect(saved.grammar_structures).toEqual([second, other, first]);
  expect(saved.senses).toEqual(draft.senses);

  await waitForEntryReady();
  mounted.unmount();
  api.get.mockResolvedValue({ ...entry, revision: 2, draft: saved });
  mount(api, url);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  expect(firstEditor()).toHaveTextContent("a position");
});

it("目录缓存更新后，停留在预览页也立即去除失效结构且不改草稿", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, grammar_structures: true });
  const draft: NextDraft = {
    schema_version: 1,
    headword: "job",
    forms: [],
    grammar_structures: [
      {
        id: "g",
        part_of_speech: "noun",
        sub_pos: "N-COUNT",
        variants: ["en-GB", "en-US"].map((locale) => ({
          id: locale,
          locale,
          content: { version: 2, text: "a job", annotations: [] }
        }))
      }
    ],
    senses: [
      {
        id: "s",
        part_of_speech: "noun",
        sub_pos: "N-COUNT",
        definitions: [
          {
            id: "d",
            locale: "en-GB",
            style: "definition",
            text: "paid work",
            grammar_structure_id: "g"
          }
        ],
        equivalents: []
      }
    ]
  };
  const original = structuredClone(draft);
  api.get.mockResolvedValue({ ...entry, draft });
  const mounted = mount(
    api,
    `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans`
  );
  await waitForEntryReady();
  await waitFor(() =>
    expect(
      mounted.client.getQueryData(partOfSpeechKeys.catalog())
    ).toBeDefined()
  );
  fireEvent.click(stepButton(/^预览/));
  const pane = screen.getByRole("region", { name: "草稿预览" });
  expect(within(pane).getByLabelText("语法结构")).toHaveTextContent("a job");
  const changed = structuredClone(partOfSpeechCatalogFixture);
  changed.items.find((item) => item.code === "noun")!.sub_parts = changed.items
    .find((item) => item.code === "noun")!
    .sub_parts.filter((item) => item.code !== "N-COUNT");
  await act(async () => {
    mounted.client.setQueryData(partOfSpeechKeys.catalog(), changed);
  });
  await waitFor(() =>
    expect(within(pane).queryByLabelText("语法结构")).toBeNull()
  );
  expect(within(pane).getByText("语法结构尚未完整配置")).toBeVisible();
  expect(api.save).not.toHaveBeenCalled();
  await expect(api.get.mock.results[0]!.value).resolves.toMatchObject({
    draft: original
  });
});

it("词义总体数据复用 V1 控件并随完整草稿保存，切换英美不复制词义", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({
    ...caps,
    sense_metadata: true,
    sense_groups: true,
    grammar_structures: true
  });
  const sense = {
    id: "sense-metadata",
    part_of_speech: null,
    sub_pos: "N-COUNT",
    level: "A1",
    frequency: "0",
    depends_on_context: false,
    definitions: [],
    equivalents: []
  };
  api.get.mockResolvedValue({
    ...entry,
    draft: { ...entry.draft, senses: [sense] }
  });
  mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/词义与例句/));
  fireEvent.mouseDown(
    await screen.findByRole("combobox", { name: "词义 1 词性" })
  );
  fireEvent.click(
    await screen.findByText("名词", {
      selector: ".ui-select-item-option-content"
    })
  );
  const level = await screen.findByRole("combobox", { name: "词义 1 等级" });
  fireEvent.mouseDown(level);
  fireEvent.click(
    await screen.findByText("B2", {
      selector: ".ui-select-item-option-content"
    })
  );
  fireEvent.change(screen.getByRole("spinbutton", { name: "词义 1 频率" }), {
    target: { value: "95.5" }
  });
  fireEvent.click(screen.getByRole("switch", { name: "词义 1 是否依赖语境" }));
  await chooseLanguage("美式英语");
  expect(screen.getByRole("spinbutton", { name: "词义 1 频率" })).toHaveValue(
    "95.50"
  );
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalled());
  expect(api.save.mock.calls[0]![1]).toMatchObject({
    expected_revision: 1,
    draft: {
      senses: [
        {
          ...sense,
          part_of_speech: "noun",
          level: "B2",
          frequency: "95.5",
          depends_on_context: true
        }
      ]
    }
  });
  await waitForEntryReady();
  expect(screen.getByRole("button", { name: "删除词义 1" })).toBeDisabled();
  fireEvent.click(button("添加词义"));
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[1]![1].draft.senses).toHaveLength(2);
  expect(api.save.mock.calls[1]![1].draft.senses[1]).toMatchObject({
    level: "A1",
    frequency: "0",
    depends_on_context: false
  });
});

it.each([false, true])(
  "译词新能力为 %s 时按协商结果校验旧草稿的重复译词",
  async (available) => {
    const api = requests();
    api.capabilities.mockResolvedValue({
      ...caps,
      equivalent_metadata: available
    });
    const equivalents = [
      { id: "legacy-one", locale: "zh-Hans", text: "ＪＯＢ" },
      { id: "legacy-two", locale: "zh-Hans", text: "job" }
    ];
    api.get.mockResolvedValue({
      ...entry,
      draft: {
        ...entry.draft,
        senses: [
          { id: "sense", part_of_speech: "noun", definitions: [], equivalents }
        ]
      }
    });
    mount(api);
    await screen.findByDisplayValue("centre");
    fireEvent.click(stepButton(/^预览/));
    fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
      target: { value: "center" }
    });
    fireEvent.click(button("保存完整草稿"));
    if (available) {
      await waitFor(() =>
        expect(
          screen
            .getAllByRole("alert")
            .some(
              (alert) =>
                alert.textContent === "当前词义与媒介语言内已有该译词。"
            )
        ).toBe(true)
      );
      expect(api.save).not.toHaveBeenCalled();
    } else {
      await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
      expect(api.save.mock.calls[0]![1].draft.senses[0].equivalents).toEqual(
        equivalents
      );
      expect(api.save.mock.calls[0]![1].draft.headword).toBe("center");
    }
  }
);

it("确认释义能力后开放双语表格，完整稿保存保留其他语言、音频及并发版本", async () => {
  const api = requests();
  let ready!: (value: NextCapabilities) => void;
  api.capabilities.mockImplementation(
    () =>
      new Promise((resolve) => {
        ready = resolve;
      })
  );
  const original: NextDraft = {
    ...entry.draft,
    forms: [{ id: "form", locale: "en-US", text: "center" }],
    grammar_structures: [],
    senses: [
      {
        id: "sense",
        part_of_speech: "noun",
        level: "B2",
        definitions: [
          {
            id: "def-en",
            locale: "en-GB",
            text: "a centre",
            style: "definition",
            level: "A1",
            grammar_unbound: true,
            content: {
              version: 2,
              text: "a centre",
              annotations: [
                { type: "emphasis", start: 2, end: 8, level: "core" }
              ]
            },
            voice_profile: {
              voices: [
                {
                  voice_id: "sonia",
                  locale: "en-GB",
                  enabled: true,
                  rate_percent: 0,
                  audio_asset_id: "existing-generated"
                }
              ]
            }
          },
          {
            id: "def-zh",
            locale: "zh-Hans",
            text: "中心",
            style: "definition"
          },
          { id: "def-us", locale: "en-US", text: "a center", style: "sentence" }
        ],
        equivalents: [{ id: "equivalent", locale: "zh-Hans", text: "中心" }]
      },
      { id: "other", part_of_speech: "verb", definitions: [], equivalents: [] }
    ]
  };
  api.get.mockResolvedValue({ ...entry, revision: 7, draft: original });
  mount(api);
  expect(screen.queryByRole("table", { name: "英式英语释义" })).toBeNull();
  expect(api.get).not.toHaveBeenCalled();
  await act(async () =>
    ready({ ...caps, definition_details: true, sense_metadata: true })
  );
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  expect(screen.getByRole("table", { name: "英式英语释义" })).toBeVisible();
  expect(
    screen.getByRole("button", { name: "编辑英式英语释义 1" })
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "编辑简体中文解释 1" })
  ).toBeNull();
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "词义 1 等级" }));
  fireEvent.click(
    await screen.findByText("B1", {
      selector: ".ui-select-item-option-content"
    })
  );
  const field = screen.getByRole("combobox", { name: "英式英语释义 1 等级" });
  fireEvent.mouseDown(field);
  fireEvent.click(
    await screen.findByText("C1", {
      selector:
        ".ui-select-dropdown:not(.ui-select-dropdown-hidden) .ui-select-item-option-content"
    })
  );
  fireEvent.change(screen.getByRole("textbox", { name: "简体中文解释 1" }), {
    target: { value: "中央位置" }
  });
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  expect(api.save).toHaveBeenCalledWith(id, {
    expected_revision: 7,
    draft: {
      ...original,
      senses: [
        {
          ...original.senses[0],
          level: "B1",
          definitions: [
            { ...original.senses[0]!.definitions[0], level: "C1" },
            { ...original.senses[0]!.definitions[1], text: "中央位置" },
            original.senses[0]!.definitions[2]
          ]
        },
        original.senses[1]
      ]
    }
  });
});

it("释义弹窗未应用时锁住语言切换和保存，取消不写宿主正文", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, definition_details: true });
  const definition = {
    id: "def",
    locale: "en-GB",
    text: "centre",
    style: "definition" as const
  };
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      senses: [
        {
          id: "sense",
          part_of_speech: "noun",
          definitions: [definition],
          equivalents: []
        }
      ]
    }
  });
  mount(api);
  await screen.findByDisplayValue("centre");
  fireEvent.click(stepButton(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "center" }
  });
  fireEvent.click(stepButton(/^词义与例句/));
  await waitFor(() => expect(button("编辑英式英语释义 1")).toBeEnabled());
  fireEvent.click(button("编辑英式英语释义 1"));
  const dialog = await screen.findByRole("dialog");
  const editor = await within(dialog).findByRole(
    "textbox",
    { name: "英式英语释义 1" },
    { timeout: 10_000 }
  );
  fireEvent.change(editor, { target: { value: "unapplied body" } });
  expect(button("保存完整草稿")).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "目标语言" })).toBeDisabled();
  fireEvent.click(button("保存完整草稿"));
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() => expect(button("保存完整草稿")).toBeEnabled());
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  expect(api.save.mock.calls[0]![1].draft.senses[0].definitions).toEqual([
    definition
  ]);
});

it("已归档词条的新版释义表格保持只读", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, definition_details: true });
  api.workspaceEntry.mockResolvedValue(listRow({ status: "archived" }));
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      senses: [
        {
          id: "sense",
          part_of_speech: "noun",
          definitions: [
            {
              id: "en1",
              locale: "en-GB",
              text: "centre",
              style: "definition",
              level: "A1"
            },
            {
              id: "en2",
              locale: "en-GB",
              text: "middle",
              style: "definition",
              level: "B2"
            },
            { id: "zh", locale: "zh-Hans", text: "中心", style: "definition" }
          ],
          equivalents: []
        }
      ]
    }
  });
  mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  expect(button("编辑英式英语释义 1")).toBeDisabled();
  expect(button("添加英式英语释义")).toBeDisabled();
  expect(
    screen.getByRole("combobox", { name: "英式英语释义 1 等级" })
  ).toBeDisabled();
  expect(
    screen.getByRole("textbox", { name: "简体中文解释 1" })
  ).toBeDisabled();
  fireEvent.keyDown(button("拖动英式英语释义 1"), { key: "ArrowDown" });
  expect(api.save).not.toHaveBeenCalled();
});

it("Step3下一步和当前草稿预览都读取当前目标语言例句", async () => {
  useAuthStore.setState({
    profile: {
      ...useAuthStore.getState().profile!,
      permissions: ["words.access", "words.edit", "sentences.access"]
    }
  });
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, sentences: true });
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      senses: [
        {
          id: "sense",
          part_of_speech: "noun",
          definitions: [],
          equivalents: [],
          sentence_ids: ["example"]
        }
      ]
    }
  });
  api.sentence.mockResolvedValue({
    id: "example",
    target_language: "en",
    owner_id: "editor",
    revision: 1,
    reference_count: 1,
    updated_at: entry.updated_at,
    draft: {
      schema_version: 1,
      variants: [
        {
          id: "example-uk",
          locale: "en-GB",
          level: "A2",
          content: { version: 2, text: "Scoped example", annotations: [] },
          translations: []
        },
        {
          id: "example-us",
          locale: "en-US",
          level: "A2",
          content: {
            version: 2,
            text: "Other target example",
            annotations: []
          },
          translations: []
        }
      ]
    }
  });
  mount(api, `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans`);
  await screen.findByDisplayValue("centre");
  fireEvent.click(button(/词义与例句/));
  fireEvent.click(button("下一步：预览"));
  await waitFor(() =>
    expect(
      screen
        .getAllByText("Scoped example")
        .filter((node) => !isInaccessible(node))
    ).toHaveLength(1)
  );
  expect(screen.queryByText("Other target example")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "当前草稿预览（含未保存修改）" })
  ).toBeNull();
  fireEvent.click(stepButton(/^词义与例句/));
  fireEvent.click(button("当前草稿预览（含未保存修改）"));
  expect(
    within(screen.getByRole("region", { name: "草稿预览" })).getByText(
      "Scoped example"
    )
  ).toBeVisible();
  expect(api.sentence).toHaveBeenCalledWith("example");
  expect(api.view).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});

it("Step 2 未指定词性时保留已有词形但禁止录入，选定词性后开放", async () => {
  const api = requests();
  const legacyForms = [
    { id: "old-form", locale: "en-GB", text: "existing spelling" }
  ];
  api.capabilities.mockResolvedValue({ ...caps, form_editor: true });
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      forms: legacyForms,
      form_editor: emptyFormEditor()
    }
  });
  mount(api);
  const addPos = await screen.findByRole("button", { name: "添加词性" });
  fireEvent.click(button("已有词形"));
  expect(screen.getByRole("textbox", { name: "英式英语词形 1" })).toHaveValue(
    "existing spelling"
  );
  expect(
    screen.getByRole("textbox", { name: "英式英语词形 1" })
  ).toBeDisabled();
  for (const name of [
    "添加通用英语词形",
    "添加英式英语词形",
    "添加美式英语词形"
  ]) {
    expect(button(name)).toBeDisabled();
  }
  expect(
    screen.queryByLabelText("编辑原形内容", { selector: "button" })
  ).toBeNull();
  await waitFor(() => expect(addPos).toBeEnabled());
  fireEvent.click(addPos);
  fireEvent.click(await screen.findByRole("menuitem", { name: "名词" }));
  expect(
    await screen.findByLabelText("编辑原形内容", { selector: "button" })
  ).toBeEnabled();
  expect(screen.getByRole("textbox", { name: "英式英语词形 1" })).toBeEnabled();
  for (const name of [
    "添加通用英语词形",
    "添加英式英语词形",
    "添加美式英语词形"
  ]) {
    expect(button(name)).toBeEnabled();
  }
  fireEvent.click(button("保存草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  expect(api.save.mock.calls[0]![1].draft.forms).toEqual(legacyForms);
});

it("Step2 新增词性和双向切换时，Step3 选中同一词性", async () => {
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
  await screen.findByLabelText("编辑原形内容", { selector: "button" });
  const posPicker = within(screen.getByRole("tablist")).getByRole("combobox", {
    name: "添加基本词性"
  });
  await waitFor(() => expect(posPicker).toBeEnabled());
  fireEvent.mouseDown(posPicker);
  fireEvent.click(
    await screen.findByText("动词", {
      selector: ".ui-select-item-option-content"
    })
  );
  const selectedTab = (name: RegExp) =>
    within(screen.getByRole("tablist")).getByRole("tab", { name });
  expect(selectedTab(/动词/)).toHaveAttribute("aria-selected", "true");
  fireEvent.click(button("下一步：词义与译词"));
  expect(selectedTab(/动词/)).toHaveAttribute("aria-selected", "true");
  fireEvent.click(selectedTab(/名词/));
  fireEvent.click(button("上一步"));
  expect(selectedTab(/名词/)).toHaveAttribute("aria-selected", "true");
  fireEvent.click(selectedTab(/动词/));
  fireEvent.click(stepButton(/^词义与例句/));
  expect(selectedTab(/动词/)).toHaveAttribute("aria-selected", "true");
  expect(api.save).not.toHaveBeenCalled();
});

function unifiedSentenceRequests() {
  vi.spyOn(
    voiceEditorSource.adminVoicePreviewAdapter,
    "listVoices"
  ).mockResolvedValue([
    {
      id: "sonia",
      label: "Sonia",
      locale: "en-GB",
      gender: "female",
      styles: [],
      supportsRate: true,
      supportsPitch: true,
      isDefault: true
    },
    {
      id: "guy",
      label: "Guy",
      locale: "en-US",
      gender: "male",
      styles: [],
      supportsRate: true,
      supportsPitch: true,
      isDefault: true
    }
  ]);
  vi.spyOn(
    voiceEditorSource,
    "loadAdminVoiceRecommendations"
  ).mockResolvedValue([
    {
      id: "uk-default",
      name: "Sonia",
      locale: "en-GB",
      groupId: "global",
      groupName: "全局常用",
      setting: { voice_id: "sonia", enabled: true, rate_percent: 0 }
    },
    {
      id: "us-default",
      name: "Guy",
      locale: "en-US",
      groupId: "global",
      groupName: "全局常用",
      setting: { voice_id: "guy", enabled: true, rate_percent: 0 }
    }
  ]);
  vi.spyOn(
    voiceEditorSource.adminVoicePreviewAdapter,
    "resolveVoices"
  ).mockImplementation(async ({ accent }) => ({
    voices: [
      {
        voice_id: accent === "gb" ? "sonia" : "guy",
        version_id: accent === "gb" ? "uk-default" : "us-default",
        version_name: accent === "gb" ? "Sonia" : "Guy",
        locale: accent === "gb" ? "en-GB" : "en-US",
        enabled: true,
        rate_percent: 0
      }
    ],
    source: {
      kind: "recommendation",
      group_id: "global",
      recommendation_id: accent === "gb" ? "uk-default" : "us-default",
      is_global: true
    }
  }));
  useAuthStore.setState({
    profile: {
      ...useAuthStore.getState().profile!,
      permissions: [
        "words.access",
        "words.edit",
        "sentences.access",
        "sentences.edit",
        "sentences.create"
      ]
    }
  });
  const legacySource = {
    id: "legacy-source",
    source_type: "human_composed" as const,
    title: "历史来源",
    url: "",
    locator: ""
  };
  const source: NextSentence = {
    id: "shared",
    target_language: "en",
    owner_id: "editor",
    revision: 3,
    updated_at: entry.updated_at,
    reference_count: 2,
    draft: {
      schema_version: 1,
      variants: [
        {
          id: "uk",
          locale: "en-GB",
          level: "A1",
          content: { version: 2, text: "Stored British.", annotations: [] },
          metadata: {
            register_ids: [],
            domain_ids: [],
            sources: [legacySource]
          },
          translations: [
            {
              id: "hans",
              locale: "zh-Hans",
              style: "balanced_fluency",
              content: { version: 2, text: "已保存译文", annotations: [] },
              metadata: { freedom: null, sources: [legacySource] }
            },
            {
              id: "hant",
              locale: "zh-Hant",
              style: "balanced_fluency",
              content: { version: 2, text: "保留繁體", annotations: [] }
            }
          ]
        },
        {
          id: "us",
          locale: "en-US",
          level: "A1",
          content: { version: 2, text: "Stored American.", annotations: [] },
          translations: []
        }
      ]
    }
  };
  const api = requests();
  api.capabilities.mockResolvedValue({
    ...caps,
    sentences: true,
    sentence_details: true,
    sentence_drafts: true,
    relations: true
  });
  const saved: NextEntry = {
    ...entry,
    sentence_resources: [source],
    draft: {
      ...entry.draft,
      senses: [
        {
          id: "sense",
          part_of_speech: "noun",
          definitions: [],
          equivalents: [],
          relations: [
            {
              id: "retained-relation",
              relation: "synonym",
              pending_target_headword: "middle",
              pending_target_gloss: "中间",
              score: "80"
            }
          ],
          sentence_ids: [source.id]
        }
      ]
    }
  };
  api.get.mockResolvedValue(saved);
  let storedSentence = source;
  api.save.mockImplementation(async (_id, input) => {
    const current = structuredClone(storedSentence);
    for (const change of input.sentence_changes ?? []) {
      const previous = current.draft.variants.find(
        (v) => v.locale === change.target_locale
      );
      current.draft.variants = [
        ...current.draft.variants.filter(
          (v) => v.locale !== change.target_locale
        ),
        {
          ...change.variant,
          translations: [
            ...change.variant.translations,
            ...(previous?.translations.filter(
              (v) => v.locale !== change.medium_locale
            ) ?? [])
          ]
        }
      ];
    }
    if (input.sentence_changes?.length) current.revision++;
    storedSentence = current;
    return {
      ...saved,
      revision: input.expected_revision + 1,
      draft: input.draft,
      sentence_resources: [current]
    };
  });
  const { unmount } = mount(
    api,
    `/lexicon-next/${id}?target_locale=en-GB&medium_locale=zh-Hans`
  );
  return { api, source, saved, unmount };
}
it("英文例句点击进入编辑器，未应用时锁住宿主操作，取消保留原文", async () => {
  const { api } = unifiedSentenceRequests();
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  const trigger = await screen.findByRole("button", {
    name: "编辑英式英语例句原文"
  });
  expect(trigger).toHaveTextContent("Stored British.");
  fireEvent.change(
    screen.getByRole("textbox", { name: "译文 1 简体中文正文" }),
    {
      target: { value: "宿主译文" }
    }
  );
  expect(button("保存完整草稿")).toBeEnabled();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText("编辑英式英语例句", { exact: true })
  ).toBeVisible();
  const editor = await within(dialog).findByRole("textbox", {
    name: "英式英语例句原文"
  });
  fireEvent.change(editor, { target: { value: "Not applied." } });
  expect(trigger).toHaveTextContent("Stored British.");
  expect(button("保存完整草稿")).toBeDisabled();
  expect(screen.getByRole("combobox", { name: "目标语言" })).toBeDisabled();
  fireEvent.click(within(dialog).getByRole("button", { name: "取消" }));
  await waitFor(() => expect(button("保存完整草稿")).toBeEnabled());
  expect(trigger).toHaveTextContent("Stored British.");
  fireEvent.click(trigger);
  expect(
    await screen.findByRole("textbox", { name: "英式英语例句原文" })
  ).toHaveValue("Stored British.");
  expect(api.save).not.toHaveBeenCalled();
  expect(api.createSentence).not.toHaveBeenCalled();
  expect(api.saveSentence).not.toHaveBeenCalled();
});
async function editSentenceOriginal(locale: string, text: string) {
  fireEvent.click(await screen.findByLabelText(`编辑${locale}例句原文`));
  const dialog = await screen.findByRole("dialog");
  expect(
    within(dialog).getByText(`编辑${locale}例句`, { exact: true })
  ).toBeVisible();
  const editor = await within(dialog).findByLabelText(`${locale}例句原文`);
  fireEvent.change(editor, { target: { value: text } });
  const apply = within(dialog)
    .getByText("应用修改", { selector: "button span", exact: true })
    .closest("button")!;
  await waitFor(() => expect(apply).toBeEnabled());
  fireEvent.click(apply);
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
}
it("例句弹窗编辑和草稿预览零写入，统一保存提交英美两侧并忽略空白译文占位", async () => {
  const { api, source } = unifiedSentenceRequests();
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  fireEvent.click(textAction("添加例句"));
  fireEvent.click(textAction("保存完整草稿"));
  await screen.findAllByText("请填写例句原文，或移除空白例句。");
  expect(api.save).not.toHaveBeenCalled();
  fireEvent.click(screen.getAllByLabelText("移除引用")[1]!);
  await waitFor(() =>
    expect(screen.queryByText("请填写例句原文，或移除空白例句。")).toBeNull()
  );
  expect(screen.queryByLabelText("英式英语例句原文")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
  const freedomSlider = screen.getByLabelText("译文 1 自由度滑块");
  expect(freedomSlider).toHaveAttribute("aria-disabled", "false");
  expect(freedomSlider).toHaveAttribute("aria-valuenow", "0");
  const freedomInput = screen.getByLabelText("译文 1 自由度");
  expect(freedomInput).toHaveAttribute("aria-valuenow", "0");
  fireEvent.keyDown(freedomSlider, { key: "ArrowRight" });
  expect(freedomInput).toHaveAttribute("aria-valuenow", "0.1");
  fireEvent.change(freedomInput, { target: { value: "52" } });
  expect(freedomSlider).toHaveAttribute("aria-disabled", "false");
  expect(freedomSlider).toHaveAttribute("aria-valuenow", "52");
  fireEvent.change(freedomInput, { target: { value: "" } });
  expect(freedomInput).toHaveAttribute("aria-valuenow", "0");
  expect(freedomSlider).toHaveAttribute("aria-disabled", "false");
  expect(freedomSlider).toHaveAttribute("aria-valuenow", "0");
  await editSentenceOriginal("英式英语", "Local British.");
  fireEvent.change(screen.getByLabelText("译文 1 简体中文正文"), {
    target: { value: "本地译文" }
  });
  fireEvent.click(textAction("添加译文"));
  expect(screen.getByLabelText("译文 2 简体中文正文")).toHaveValue("");
  await chooseLanguage("美式英语");
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并离开" })
  );
  await editSentenceOriginal("美式英语", "Local American.");
  await chooseLanguage("英式英语");
  fireEvent.click(
    await screen.findByRole("button", { name: "放弃修改并离开" })
  );
  expect(
    await screen.findByLabelText("编辑英式英语例句原文")
  ).toHaveTextContent("Local British.");
  fireEvent.click(textAction("下一步：预览"));
  const preview = screen.getByLabelText("多维例句预览");
  expect(within(preview).getByText("Local British.")).toBeVisible();
  expect(within(preview).getByText("本地译文")).toBeVisible();
  expect(api.save).not.toHaveBeenCalled();
  expect(api.createSentence).not.toHaveBeenCalled();
  expect(api.saveSentence).not.toHaveBeenCalled();
  expect(api.sentence).not.toHaveBeenCalled();
  fireEvent.click(textAction("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  expect(api.save.mock.calls[0]![1].draft.senses[0].relations).toEqual([
    expect.objectContaining({ id: "retained-relation", score: "80" })
  ]);
  const changes: NextSentenceDraftChange[] =
    api.save.mock.calls[0]![1].sentence_changes!;
  expect(
    changes.map((c) => [
      c.expected_revision,
      c.target_locale,
      c.variant.content.text
    ])
  ).toEqual([
    [3, "en-GB", "Local British."],
    [3, "en-US", "Local American."]
  ]);
  expect(changes[0]!.variant.metadata?.sources).toEqual(
    source.draft.variants[0]!.metadata!.sources
  );
  expect(changes[0]!.variant.translations[0]!.metadata?.freedom).toBe(0);
  expect(changes[0]!.variant.translations[0]!.metadata?.sources).toEqual(
    source.draft.variants[0]!.translations[0]!.metadata!.sources
  );
  expect(changes[0]!.variant.translations).toEqual([
    expect.objectContaining({
      id: "hans",
      content: expect.objectContaining({ text: "本地译文" })
    })
  ]);
  await waitForEntryReady();
}, 15_000);
it("例句配音不可用时仍保存词条、例句文字和译文", async () => {
  const { env } = await import("@/lib/env");
  const previous = env.VOICE_PREVIEW;
  env.VOICE_PREVIEW = true;
  onTestFinished(() => {
    env.VOICE_PREVIEW = previous;
  });
  const { api, unmount } = unifiedSentenceRequests();
  const profile = useAuthStore.getState().profile!;
  act(() =>
    useAuthStore.setState({
      profile: {
        ...profile,
        permissions: [...profile.permissions, "speech.generate"]
      }
    })
  );
  const generate = vi
    .spyOn(voiceEditorSource.adminVoicePreviewAdapter, "generateAudio")
    .mockRejectedValue(new HttpError(503, "配音服务不可用"));
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  await editSentenceOriginal("英式英语", "The farmer led the horses.");
  fireEvent.change(screen.getByLabelText("译文 1 简体中文正文"), {
    target: { value: "农夫牵着马。" }
  });
  fireEvent.click(textAction("保存完整草稿"));
  await waitFor(() => expect(generate).toHaveBeenCalled());
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
  const input = api.save.mock.calls[0]![1];
  expect(input.expected_revision).toBe(1);
  expect(input.draft.senses[0].sentence_ids).toEqual(["shared"]);
  expect(input.sentence_changes).toMatchObject([
    {
      expected_revision: 3,
      variant: {
        content: { text: "The farmer led the horses." },
        translations: [{ content: { text: "农夫牵着马。" } }]
      }
    }
  ]);
  expect(
    input.sentence_changes[0].variant.voice_profile?.voices.some(
      (voice: { audio_asset_id?: string }) => voice.audio_asset_id
    )
  ).not.toBe(true);
  await screen.findByText("草稿已保存，例句配音待补。");
  api.get.mockResolvedValue(await api.save.mock.results[0]!.value);
  unmount();
  env.VOICE_PREVIEW = false;
  const offline = mount(api);
  await waitForEntryReady();
  expect(screen.queryByRole("button", { name: "重试例句配音" })).toBeNull();
  fireEvent.click(stepButton(/^词义与例句/));
  await editSentenceOriginal("英式英语", "The farmer led two horses.");
  fireEvent.click(textAction("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(generate).toHaveBeenCalledTimes(1);
  api.get.mockResolvedValue(await api.save.mock.results[1]!.value);
  offline.unmount();
  env.VOICE_PREVIEW = true;
  mount(api);
  const retry = await screen.findByRole("button", { name: "重试例句配音" });
  expect(retry).toBeEnabled();
  fireEvent.click(retry);
  await waitFor(() => expect(generate).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(retry).toBeEnabled());
  expect(api.save).toHaveBeenCalledTimes(2);
  generate.mockResolvedValue({
    id: "new-audio",
    locale: "en-GB",
    gender: "female",
    content_type: "audio/mpeg",
    original_name: "generated.mp3",
    size_bytes: 128,
    created_at: entry.updated_at
  });
  fireEvent.click(retry);
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(3));
  expect(api.save.mock.calls[2]![1]).toMatchObject({
    expected_revision: 3,
    sentence_changes: [
      {
        expected_revision: 5,
        variant: {
          content: { text: "The farmer led two horses." },
          voice_profile: {
            voices: [expect.objectContaining({ audio_asset_id: "new-audio" })]
          }
        }
      }
    ]
  });
  await waitFor(() => expect(retry).not.toBeInTheDocument());
});

it("统一保存冲突保留本地例句，可比较服务器例句，明确确认后才重载", async () => {
  const { api, saved, source } = unifiedSentenceRequests();
  api.save.mockRejectedValueOnce(
    new HttpError(409, "conflict", [], "revision_conflict")
  );
  await waitForEntryReady();
  fireEvent.click(stepButton(/^词义与例句/));
  const english = await screen.findByRole("button", {
    name: "编辑英式英语例句原文"
  });
  await editSentenceOriginal("英式英语", "Keep local example.");
  fireEvent.click(button("保存完整草稿"));
  await screen.findByText("服务器版本已更新。本地草稿已保留，请先比较版本。");
  expect(english).toHaveTextContent("Keep local example.");
  const remote = structuredClone(source);
  remote.revision = 4;
  remote.draft.variants[0]!.content.text = "Server example.";
  api.get.mockResolvedValue({
    ...saved,
    revision: 4,
    sentence_resources: [remote]
  });
  fireEvent.click(button("比较服务器版本"));
  const compare = (
    await screen.findByText("服务器 · 版本 4")
  ).closest<HTMLElement>('[role="dialog"]')!;
  expect(within(compare).getByText("Keep local example.")).toBeVisible();
  expect(within(compare).getByText("Server example.")).toBeVisible();
  fireEvent.click(
    within(compare).getByRole("button", {
      name: "保留本地草稿并继续保存"
    })
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "保留本地并继续" })
  );
  await waitFor(() => expect(english).toHaveTextContent("Keep local example."));
  expect(button("保存完整草稿")).toBeEnabled();
  fireEvent.click(button("保存完整草稿"));
  await waitFor(() => expect(api.save).toHaveBeenCalledTimes(2));
  expect(api.save.mock.calls[1]![1].expected_revision).toBe(4);
  expect(api.save.mock.calls[1]![1].sentence_changes).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        variant: expect.objectContaining({
          content: expect.objectContaining({ text: "Keep local example." })
        })
      })
    ])
  );
});

it("服务器不支持当前草稿版本时阻止进入编辑器", async () => {
  const api = requests();
  api.draftSchema.mockResolvedValue({
    draft_schema_version: 2,
    supported_draft_schema_versions: [2]
  });
  mount(api);
  await screen.findByText("当前服务不支持此草稿版本");
  expect(screen.queryByText("保存完整草稿")).toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});

it("无法读取草稿版本兼容性时保留安全阻断并允许重试", async () => {
  const api = requests();
  api.draftSchema.mockRejectedValue(new HttpError(404, "not found"));
  mount(api);
  await screen.findByText("无法确认草稿版本兼容性");
  expect(screen.getByRole("button", { name: "重试" })).toBeEnabled();
  expect(api.save).not.toHaveBeenCalled();
});

it("其他标签页只改变发布生命周期时，比较重载后使用新版本恢复预检", async () => {
  useAuthStore.setState({
    profile: {
      ...useAuthStore.getState().profile!,
      permissions: ["words.access", "words.edit", "words.publish"]
    }
  });
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, publishing: true });
  api.publication.mockResolvedValueOnce({
    entry_id: id,
    status: "draft",
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    current: null
  });
  api.publication.mockResolvedValue({
    entry_id: id,
    status: "published",
    lifecycle_revision: 2,
    has_unpublished_changes: false,
    current: null
  });
  api.publicationPreview.mockRejectedValueOnce(
    new HttpError(409, "词条版本已变化", [], "revision_conflict")
  );
  api.publicationPreview.mockResolvedValue({
    entry_id: id,
    revision: 1,
    lifecycle_revision: 2,
    preview_token: "a".repeat(64),
    can_publish: false,
    issues: [],
    warnings: []
  });
  mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
  fireEvent.click(button("检查发布"));
  await screen.findByRole("button", { name: "比较服务器版本" });
  await waitFor(() => expect(button("比较服务器版本")).toBeEnabled());
  fireEvent.click(button("比较服务器版本"));
  await screen.findByText("服务器 · 版本 1");
  fireEvent.click(button("放弃本地修改并重载"));
  fireEvent.click(await screen.findByRole("button", { name: "放弃并重载" }));
  await waitFor(() => expect(button("检查发布")).toBeEnabled());
  fireEvent.click(button("检查发布"));
  await waitFor(() => expect(api.publicationPreview).toHaveBeenCalledTimes(2));
  expect(api.publicationPreview).toHaveBeenLastCalledWith(id, {
    base_revision: 1,
    base_lifecycle_revision: 2
  });
});

it("比较发布冲突的状态读取失败时保留未保存草稿并允许重试", async () => {
  const api = requests();
  api.capabilities.mockResolvedValue({ ...caps, publishing: true });
  api.publication.mockResolvedValue({
    entry_id: id,
    status: "draft",
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    current: null
  });
  api.save.mockRejectedValue(new HttpError(409, "服务器版本已变化"));
  mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
  fireEvent.change(screen.getByRole("textbox", { name: "词头" }), {
    target: { value: "local-unsaved" }
  });
  fireEvent.click(button("保存完整草稿"));
  await screen.findByRole("button", { name: "比较服务器版本" });
  api.workspaceEntry.mockRejectedValueOnce(new HttpError(503, "状态暂不可用"));
  fireEvent.click(button("比较服务器版本"));
  await screen.findByText("状态暂不可用");
  expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue(
    "local-unsaved"
  );
  expect(button("比较服务器版本")).toBeEnabled();
  fireEvent.click(button("比较服务器版本"));
  await screen.findByText("服务器 · 版本 1");
  expect(screen.getByRole("textbox", { name: "词头" })).toHaveValue(
    "local-unsaved"
  );
});

it("列表显示真实词头和当前词义等级，不展示其他词形", async () => {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
    ...matchMedia(query),
    matches: true
  }));
  const api = requests();
  api.workspaceList.mockResolvedValue({
    items: [
      {
        ...listRow(),
        headword: "give up",
        forms: [{ id: "form", locale: "en", text: "center" }],
        levels: ["A1", "B2"]
      }
    ],
    pagination: { total: 1, page: 1, page_size: 20, total_pages: 1 }
  });
  mount(api, "/lexicon-next");
  const row = (await screen.findByText("give up")).closest("tr")!;
  expect(within(row).getByText("give up")).toBeVisible();
  expect(within(row).queryByText("center")).toBeNull();
  expect(within(row).getByText("A1")).toBeVisible();
  expect(within(row).getByText("B2")).toBeVisible();
});

it("发布缺项可切到缺失方言并聚焦对应语法编辑入口", async () => {
  const scrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  onTestFinished(() => {
    HTMLElement.prototype.scrollIntoView = scrollIntoView;
  });
  useAuthStore.setState({
    profile: {
      ...useAuthStore.getState().profile!,
      permissions: ["words.access", "words.edit", "words.publish"]
    }
  });
  const api = requests();
  api.capabilities.mockResolvedValue({
    ...caps,
    publishing: true,
    grammar_structures: true
  });
  api.get.mockResolvedValue({
    ...entry,
    draft: {
      ...entry.draft,
      grammar_structures: [
        {
          id: "grammar-focus",
          part_of_speech: "noun",
          variants: [
            {
              id: "gb-focus",
              locale: "en-GB",
              content: { version: 2, text: "a centre", annotations: [] }
            },
            {
              id: "us-focus",
              locale: "en-US",
              content: { version: 2, text: "", annotations: [] }
            }
          ]
        }
      ]
    }
  });
  api.publication.mockResolvedValue({
    entry_id: id,
    status: "draft",
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    current: null
  });
  api.publicationPreview.mockResolvedValue({
    entry_id: id,
    revision: 1,
    lifecycle_revision: 1,
    can_publish: false,
    preview_token: "a".repeat(64),
    issues: [
      {
        node_id: "grammar-focus",
        field: "variants",
        message: "请完整填写语法结构的英美内容"
      }
    ],
    warnings: []
  });
  const { router } = mount(api);
  await waitForEntryReady();
  fireEvent.click(stepButton(/^预览/));
  fireEvent.click(button("检查发布"));
  const problem = await screen.findByRole("button", {
    name: "请完整填写语法结构的英美内容"
  });
  await waitFor(() => expect(problem).toBeEnabled());
  fireEvent.click(problem);
  await waitFor(() =>
    expect(router.state.location.search).toContain("target_locale=en-US")
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "编辑语法结构 1 美式英语内容" })
    ).toHaveFocus()
  );
});
