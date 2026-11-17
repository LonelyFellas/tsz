import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { adminShellResources } from "@/i18n";
import { api as profileApi, useAuthStore } from "@/lib/auth";
import type { NextCapabilities, NextEntry } from "@tsz/types";
import { useVoiceSave } from "@/features/dictionary/word-creation-v3/voiceSaveContext";
import { emptyFormEditor } from "@/features/lexicon-next/FormsStep";
import { LexiconNextPage, type LexiconNextRequests } from "./LexiconNext";

vi.mock("@/features/lexicon-next/FormsStep", async () => {
  const { useEffect } = await import("react");
  return {
    emptyFormEditor: () => ({
      forms_format: "shared_v1",
      contents: [],
      pos: []
    }),
    FormsStep: ({
      registerLeaveGuard
    }: {
      registerLeaveGuard: (guard?: () => Promise<boolean>) => void;
    }) => {
      const save = useVoiceSave();
      useEffect(() => {
        if (!save?.audioTasks) return;
        save.audioTasks.set("blocked-audio", async () => false);
        registerLeaveGuard(async () => false);
        return () => {
          save.audioTasks?.delete("blocked-audio");
          registerLeaveGuard(undefined);
        };
      }, [registerLeaveGuard, save]);
      return (
        <button
          onClick={() => void save?.save(undefined, { skipAudioTasks: true })}
        >
          保存实际发音
        </button>
      );
    }
  };
});

const capabilities: NextCapabilities = {
  medium_ownership: true,
  schema_version: 1,
  language_rules_version: "lexicon-next-en-zh-1",
  manual_drafts: true,
  generation: false,
  publishing: false,
  form_editor: true,
  languages: [
    {
      target_language: "en",
      target_locales: ["en-GB", "en-US"],
      medium_locales: ["zh-Hans", "zh-Hant"],
      common_target_locale: "en",
      part_of_speech_codes: ["noun"]
    }
  ]
};

const entry: NextEntry = {
  medium_locale: "zh-Hans",
  id: "entry-1",
  owner_id: "editor",
  target_language: "en",
  kind: "word",
  revision: 1,
  updated_at: "2026-11-11T00:00:00Z",
  draft: { schema_version: 1, headword: "fiction", forms: [], senses: [] }
};

function requests() {
  return {
    capabilities: vi.fn().mockResolvedValue(capabilities),
    get: vi.fn().mockResolvedValue({
      ...entry,
      draft: { ...entry.draft, form_editor: emptyFormEditor() }
    }),
    save: vi.fn().mockImplementation(async (_id, input) => ({
      ...entry,
      revision: input.expected_revision + 1,
      draft: input.draft
    })),
    workspaceEntry: vi.fn().mockResolvedValue({
      id: entry.id,
      target_language: entry.target_language,
      kind: entry.kind,
      headword: entry.draft.headword,
      owner_id: entry.owner_id,
      revision: entry.revision,
      updated_at: entry.updated_at,
      part_of_speech: [],
      gloss: null,
      status: "draft",
      lifecycle_revision: 1,
      created_at: entry.updated_at,
      created_by_name: "编辑",
      updated_by_name: "编辑",
      annotation: null,
      annotation_revision: 1,
      annotation_visible: false,
      forms: []
    }),
    publication: vi.fn(),
    publicationPreview: vi.fn(),
    publish: vi.fn(),
    sentences: vi.fn(),
    sentence: vi.fn(),
    createSentence: vi.fn(),
    saveSentence: vi.fn(),
    equivalentCatalog: vi.fn(),
    list: vi.fn(),
    stats: vi.fn(),
    creators: vi.fn(),
    command: vi.fn(),
    annotation: vi.fn(),
    workspaceList: vi.fn(),
    detect: vi.fn(),
    matchEntries: vi.fn(),
    create: vi.fn(),
    view: vi.fn()
  } as unknown as LexiconNextRequests;
}

beforeEach(() => {
  vi.spyOn(profileApi, "profile").mockImplementation(async () =>
    structuredClone(useAuthStore.getState().profile!)
  );
  useAuthStore.setState({
    profile: {
      id: "editor",
      phone: "test-only",
      display_name: "编辑",
      role: "admin",
      permission_version: 1,
      catalog_version: "test",
      permissions: ["words.access", "words.edit"],
      preferences: { dialect: "uk" }
    }
  });
});

it("实际发音保存跳过 LexiconNext 的音频任务等待", async () => {
  const api = requests();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  const router = createMemoryRouter(
    [
      {
        path: "/lexicon-next/:entryId",
        element: <LexiconNextPage requests={api} />
      }
    ],
    { initialEntries: ["/lexicon-next/entry-1"] }
  );
  render(
    <InterfaceI18nProvider resources={adminShellResources}>
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  await screen.findByText("版本 1");
  fireEvent.click(screen.getByRole("button", { name: "保存实际发音" }));
  await waitFor(() => expect(api.save).toHaveBeenCalledOnce());
});
