import "fake-indexeddb/auto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { NextCapabilities, NextEntry } from "@tsz/types";
import { adminShellResources } from "@/i18n";
import { bindAdminAuthorizationCache } from "@/lib/adminAuthorization";
import { api as profileApi, useAuthStore } from "@/lib/auth";
import * as localDraftStore from "@/features/lexicon-next/localDraftStore";
import { LexiconNextPage, type LexiconNextRequests } from "./LexiconNext";
import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";

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

const accountId = "00000000-0000-4000-8000-000000000002";
const entryId = "00000000-0000-4000-8000-000000000001";
const senseId = "00000000-0000-4000-8000-000000000007";
const peerId = "00000000-0000-4000-8000-000000000008";
const dbName = "tsz-admin-drafts";
const detachCaches: (() => void)[] = [];
const caps: NextCapabilities = {
  medium_ownership: true,
  schema_version: 1,
  language_rules_version: "lexicon-next-en-zh-1",
  manual_drafts: true,
  generation: false,
  publishing: false,
  dialect_pairs: true,
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
  id: entryId,
  owner_id: accountId,
  target_language: "en",
  kind: "word",
  revision: 1,
  updated_at: "2026-11-11T00:00:00Z",
  dialect_senses: [
    {
      sense_id: senseId,
      usage: "en-GB",
      paired: true,
      no_equivalent: false,
      note: "",
      target: {
        entry_id: peerId,
        sense_id: "00000000-0000-4000-8000-000000000009",
        revision: 1,
        headword: "apartment",
        gloss: "公寓",
        part_of_speech: "noun"
      }
    }
  ],
  draft: {
    schema_version: 1,
    headword: "flat",
    forms: [],
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

function requests() {
  return {
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
    workspaceEntry: vi.fn().mockResolvedValue({
      id: entryId,
      headword: "flat",
      target_language: "en",
      kind: "word",
      owner_id: accountId,
      revision: 1,
      lifecycle_revision: 1,
      status: "draft",
      updated_at: entry.updated_at,
      created_at: entry.updated_at,
      created_by_name: "编辑",
      updated_by_name: "编辑",
      part_of_speech: ["noun"],
      gloss: "公寓",
      forms: [],
      annotation: null,
      annotation_revision: 1,
      annotation_visible: false
    }),
    stats: vi.fn().mockResolvedValue({ total: 0, today: 0, month: 0 }),
    creators: vi.fn().mockResolvedValue([]),
    command: vi.fn(),
    annotation: vi.fn(),
    workspaceList: vi.fn().mockResolvedValue({
      items: [],
      pagination: { total: 0, page: 1, page_size: 20, total_pages: 0 }
    }),
    capabilities: vi.fn().mockResolvedValue(caps),
    draftSchema: vi.fn().mockResolvedValue({
      draft_schema_version: 1,
      supported_draft_schema_versions: [1]
    }),
    get: vi.fn().mockResolvedValue(structuredClone(entry)),
    detect: vi.fn(),
    matchEntries: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    view: vi.fn()
  } satisfies LexiconNextRequests;
}

function mount(requests: LexiconNextRequests) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false }
    }
  });
  detachCaches.push(bindAdminAuthorizationCache(useAuthStore, queryClient));
  const router = createMemoryRouter(
    [
      {
        path: "/lexicon-next/:entryId",
        element: <LexiconNextPage requests={requests} />
      }
    ],
    {
      initialEntries: [
        `/lexicon-next/${entryId}?target_locale=en-GB&medium_locale=zh-Hans&step=meanings`
      ]
    }
  );
  return render(
    <InterfaceI18nProvider resources={adminShellResources}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
}

async function resetDraftStore() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB reset blocked"));
  });
}

describe("LexiconNext 与真实 IndexedDB 草稿存储联动", () => {
  beforeEach(async () => {
    await resetDraftStore();
    useAuthStore.setState({
      profile: {
        id: accountId,
        phone: "test-only",
        display_name: "编辑",
        role: "admin",
        permission_version: 1,
        catalog_version: "test",
        permissions: ["words.access", "words.create", "words.edit"],
        preferences: { dialect: "uk" }
      }
    });
    vi.spyOn(profileApi, "profile").mockImplementation(async () =>
      structuredClone(useAuthStore.getState().profile!)
    );
  });

  afterEach(async () => {
    detachCaches.splice(0).forEach((detach) => detach());
    await resetDraftStore();
    vi.restoreAllMocks();
  });

  it("把方言配对修改写入 IndexedDB，重新挂载后恢复本地草稿", async () => {
    const api = requests();
    const first = mount(api);
    await screen.findByRole("button", { name: "解除配对" });

    fireEvent.click(screen.getByRole("button", { name: "解除配对" }));
    await waitFor(async () => {
      const stored = await localDraftStore.readNextLocalDraft({
        account_id: accountId,
        entry_id: entryId,
        target_locale: "en-GB",
        medium_locale: "zh-Hans"
      });
      expect(stored?.edited_pairs[senseId]).toMatchObject({
        usage: "en-GB",
        paired: false,
        target: null
      });
    });
    first.unmount();

    const second = mount(api);
    await screen.findByText("发现未提交的本地草稿");
    fireEvent.click(screen.getByRole("button", { name: "恢复本地草稿" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "选择配对词义" })
      ).toBeEnabled();
      expect(
        screen.queryByRole("button", { name: "解除配对" })
      ).not.toBeInTheDocument();
    });
    second.unmount();
  });

  it("读取本地草稿失败时仍可继续编辑", async () => {
    const read = vi
      .spyOn(localDraftStore, "readNextLocalDraft")
      .mockRejectedValue(new Error("indexedDB unavailable"));
    const api = requests();
    mount(api);

    await expect(
      screen.findByRole("button", { name: "解除配对" })
    ).resolves.toBeTruthy();
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    expect(screen.queryByText("发现未提交的本地草稿")).not.toBeInTheDocument();
  });

  it("写入本地草稿失败时仍可继续编辑配对字段", async () => {
    vi.spyOn(localDraftStore, "readNextLocalDraft").mockResolvedValue(
      undefined
    );
    const write = vi
      .spyOn(localDraftStore, "writeNextLocalDraft")
      .mockRejectedValue(new Error("quota exceeded"));
    const api = requests();
    mount(api);

    await screen.findByRole("button", { name: "解除配对" });
    fireEvent.click(screen.getByRole("button", { name: "解除配对" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "选择配对词义" })).toBeEnabled()
    );
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
  });

  it("本地配对草稿遇到 409 后保留本地内容并用新版本继续保存", async () => {
    const api = requests();
    const remote = {
      ...structuredClone(entry),
      revision: 2,
      draft: { ...entry.draft, headword: "remote-flat" }
    };
    api.get
      .mockResolvedValueOnce(structuredClone(entry))
      .mockResolvedValue(remote);
    api.save
      .mockRejectedValueOnce(
        new HttpError(409, "revision conflict", [], "revision_conflict")
      )
      .mockResolvedValue({ ...remote, revision: 3 });
    mount(api);

    await screen.findByRole("button", { name: "解除配对" });
    fireEvent.click(screen.getByRole("button", { name: "解除配对" }));
    await waitFor(async () => {
      const stored = await localDraftStore.readNextLocalDraft({
        account_id: accountId,
        entry_id: entryId,
        target_locale: "en-GB",
        medium_locale: "zh-Hans"
      });
      expect(stored?.edited_pairs[senseId]?.paired).toBe(false);
    });

    fireEvent.click(screen.getByRole("button", { name: "保存完整草稿" }));
    await screen.findByText("服务器版本已更新。本地草稿已保留，请先比较版本。");
    fireEvent.click(screen.getByRole("button", { name: "比较服务器版本" }));
    await screen.findByText("服务器 · 版本 2");
    fireEvent.click(
      screen.getByRole("button", { name: "保留本地草稿并继续保存" })
    );
    await screen.findByRole("button", { name: "保留本地并继续" });
    fireEvent.click(screen.getByRole("button", { name: "保留本地并继续" }));
    fireEvent.click(screen.getByRole("button", { name: "保存完整草稿" }));

    await waitFor(() => {
      expect(api.save).toHaveBeenCalledTimes(2);
      expect(api.save.mock.calls[1]![1].expected_revision).toBe(2);
      expect(api.save.mock.calls[1]![1].draft.headword).toBe("flat");
      expect(api.save.mock.calls[1]![1].dialect_changes).toEqual([
        {
          sense_id: senseId,
          usage: "en-GB",
          no_equivalent: false,
          note: "",
          target: null,
          previous_target_revision: 1
        }
      ]);
    });
    await waitFor(async () => {
      await expect(
        localDraftStore.readNextLocalDraft({
          account_id: accountId,
          entry_id: entryId,
          target_locale: "en-GB",
          medium_locale: "zh-Hans"
        })
      ).resolves.toBeUndefined();
    });
  });
});
