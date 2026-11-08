import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { act } from "@testing-library/react";
import { api } from "@/lib/auth";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { newSentence } from "../sentences/model";
import type { SharedSentence, AdminWordListItemAny } from "@tsz/types";
import { BatchPublicationModal } from "./BatchPublicationModal";

const { publish, auth, checkAudio } = vi.hoisted(() => ({
  publish: vi.fn(),
  checkAudio: vi.fn(),
  auth: { role: "super_admin", permissions: [] as string[] }
}));
vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({
      profile: {
        id: "11111111-1111-4111-8111-111111111111",
        role: auth.role,
        permissions: auth.permissions
      }
    }),
  api: {
    sentences: {
      list: vi.fn(async () => ({ items: [], total: 0 })),
      publicationAudio: {
        check: (
          id: string,
          input: { base_revision: number },
          signal?: AbortSignal
        ) => checkAudio("sentence", id, input, signal),
        confirm: vi.fn()
      }
    },
    words: {
      publishBatchV3: publish,
      publicationAudio: {
        check: (
          id: string,
          input: { base_revision: number },
          signal?: AbortSignal
        ) => checkAudio("entry", id, input, signal),
        confirm: vi.fn()
      }
    }
  }
}));
function row(id: string, revision: number): AdminWordListItemAny {
  return {
    schema_version: 3,
    id,
    revision,
    lifecycle_revision: 2,
    created_by: "11111111-1111-4111-8111-111111111111",
    presentation: {
      label: id,
      matched_surfaces: [id],
      strategy_version: "surface_summary_v1"
    }
  } as AdminWordListItemAny;
}
function mount(sentences: SharedSentence[] = []) {
  const onPublished = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <BatchPublicationModal
        rows={[row("first-page", 3), row("second-page", 7)]}
        sentences={sentences}
        onClose={vi.fn()}
        onPublished={onPublished}
      />
    </QueryClientProvider>
  );
  return onPublished;
}
beforeEach(() => {
  vi.mocked(api.sentences.list)
    .mockReset()
    .mockResolvedValue({ items: [], total: 0 });
  publish.mockReset();
  checkAudio.mockReset().mockImplementation(async (owner, id, input) => ({
    manifest: {
      owner: { [owner]: id },
      revision: input.base_revision,
      policy_version: 1,
      items: [],
      ready: true,
      manifest_hash: "a".repeat(64)
    },
    confirmed: true,
    receipt_id: `review-${id}`
  }));
  auth.role = "super_admin";
  auth.permissions = [];
});

async function prepareAudio() {
  fireEvent.click(screen.getByRole("button", { name: "检查所选音频" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "发布所选" })).toBeEnabled()
  );
}

describe("原子批次发布确认", () => {
  it.each([true, false])(
    "普通管理员批次发布例句按owner UUID，不借edit_others扩发布（本人=%s）",
    async (own) => {
      auth.role = "admin";
      auth.permissions = [
        "words.access",
        "words.publish",
        "sentences.access",
        "sentences.publish",
        "sentences.edit",
        "sentences.edit_others"
      ];
      const sentence: SharedSentence = {
        id: "selected-sentence",
        revision: 9,
        lifecycle_revision: 4,
        view: "draft",
        content: newSentence(),
        entries: [],
        created_by: "创建人昵称",
        created_by_admin_id: own
          ? "11111111-1111-4111-8111-111111111111"
          : "22222222-2222-4222-8222-222222222222",
        created_at: "2026-09-23T00:00:00Z",
        updated_at: "2026-09-23T00:00:00Z"
      };
      mount([sentence]);
      if (own) await prepareAudio();
      const button = await screen.findByRole("button", { name: "发布所选" });
      if (own) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
      expect(publish).not.toHaveBeenCalled();
    }
  );
  it("只提交显式选中范围及确认时版本，成功后统一刷新", async () => {
    publish.mockResolvedValue({ words: [] });
    const done = mount();
    await prepareAudio();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(publish).toHaveBeenCalledWith(expect.any(String), {
      schema_version: 3,
      sentences: [],
      items: [
        {
          entry_id: "first-page",
          base_revision: 3,
          base_lifecycle_revision: 2
        },
        {
          entry_id: "second-page",
          base_revision: 7,
          base_lifecycle_revision: 2
        }
      ]
    });
  });
  it("结果未知重试复用同一幂等键和版本，不重复提交并发请求", async () => {
    publish
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValue({ words: [] });
    const done = mount();
    await prepareAudio();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await screen.findByText(/发布结果暂时未知/);
    expect(screen.getByRole("button", { name: "检查所选音频" })).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(publish.mock.calls[1]).toEqual(publish.mock.calls[0]);
  });
  it("版本冲突保留范围并阻止自动取新版本重发", async () => {
    publish.mockRejectedValue(
      new HttpError(409, "revision changed", undefined, "revision_conflict")
    );
    const done = mount();
    await prepareAudio();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await screen.findByText(/刷新列表并重新选择/);
    expect(
      await screen.findByRole("button", { name: "发布所选" })
    ).toBeDisabled();
    expect(publish).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    expect(screen.getAllByText("first-page")[0]).toBeInTheDocument();
    expect(screen.getAllByText("second-page")[0]).toBeInTheDocument();
  });
});

it("混合范围同一次提交，例句使用自己的双 revision", async () => {
  publish.mockResolvedValue({ words: [], sentences: [] });
  const sentence: SharedSentence = {
    id: "selected-sentence",
    revision: 9,
    lifecycle_revision: 4,
    view: "draft",
    content: newSentence(),
    entries: [],
    created_by: "创建人",
    created_by_admin_id: "11111111-1111-4111-8111-111111111111",
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z"
  };
  const done = mount([sentence]);
  await prepareAudio();
  fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
  await waitFor(() => expect(done).toHaveBeenCalledOnce());
  expect(publish).toHaveBeenCalledOnce();
  expect(publish.mock.calls[0]![1]).toMatchObject({
    items: [
      { entry_id: "first-page", base_revision: 3 },
      { entry_id: "second-page", base_revision: 7 }
    ],
    sentences: [
      {
        sentence_id: "selected-sentence",
        base_revision: 9,
        base_lifecycle_revision: 4
      }
    ]
  });
});

it("混合失败定位具体例句并禁止自动换版本重发", async () => {
  publish.mockRejectedValue(
    new HttpError(409, "例句版本冲突", [], "revision_conflict", [], {
      sentence_id: "failed-sentence"
    })
  );
  const done = mount();
  await prepareAudio();
  fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
  await screen.findByText("例句 failed-sentence：例句版本冲突");
  expect(screen.getByRole("button", { name: "发布所选" })).toBeDisabled();
  expect(done).not.toHaveBeenCalled();
});

function selectedSentence(): SharedSentence {
  const content = newSentence();
  if (content.sentence.en_text.mode === "unified")
    content.sentence.en_text.common.value.text = "Original sentence centre";
  return {
    id: "sentence-frozen",
    revision: 9,
    lifecycle_revision: 4,
    view: "draft",
    content,
    entries: [],
    created_by: "原始创建人",
    created_by_admin_id: "11111111-1111-4111-8111-111111111111",
    withdrawn_at: "2026-09-23T00:00:00Z",
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z"
  };
}

it("四语切换保留搜索/例句选择和冻结范围，在途及未知结果重试复用原幂等请求", async () => {
  const sentence = selectedSentence(),
    rows = [row("entry-frozen", 3)];
  vi.mocked(api.sentences.list).mockResolvedValue({
    items: [sentence],
    total: 1
  });
  let reject!: (error: unknown) => void;
  publish
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    )
    .mockResolvedValueOnce({ words: [], sentences: [] });
  const done = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <BatchPublicationModal
          rows={rows}
          sentences={[sentence]}
          onClose={vi.fn()}
          onPublished={done}
        />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  const input = screen.getByRole("textbox", { name: "查找待发布例句" });
  fireEvent.change(input, { target: { value: "原始搜索 centre" } });
  await waitFor(() =>
    expect(api.sentences.list).toHaveBeenLastCalledWith({
      view: "draft",
      q: "原始搜索 centre",
      page: 1,
      page_size: 20
    })
  );
  const calls = vi.mocked(api.sentences.list).mock.calls.length;
  for (const locale of ["zh-Hant", "en-GB", "en-US"] as const) {
    view.rerender(content(locale));
    expect(input).toHaveValue("原始搜索 centre");
    expect(
      screen.getAllByText(/Original sentence centre/).length
    ).toBeGreaterThan(0);
    expect(checkAudio).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(api.sentences.list).toHaveBeenCalledTimes(calls);
  }
  expect(
    screen.getByRole("dialog", { name: "Publish 1 entry and 1 sentence" })
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Check selected audio" }));
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Publish selected" })
    ).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: "Publish selected" }));
  const sent = structuredClone(publish.mock.calls[0]);
  expect(sent).toEqual([
    expect.any(String),
    {
      schema_version: 3,
      items: [
        {
          entry_id: "entry-frozen",
          base_revision: 3,
          base_lifecycle_revision: 2
        }
      ],
      sentences: [
        {
          sentence_id: sentence.id,
          base_revision: 9,
          base_lifecycle_revision: 4
        }
      ]
    }
  ]);
  view.rerender(content("zh-Hant"));
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  expect(input).toBeDisabled();
  expect(publish).toHaveBeenCalledTimes(1);
  await act(async () => reject(new TypeError("network")));
  expect(await screen.findByText(/發布結果暫時未知/)).toBeVisible();
  view.rerender(content("en-US"));
  expect(screen.getByText(/The publication result is unknown/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Publish selected" }));
  await waitFor(() => expect(done).toHaveBeenCalledTimes(1));
  expect(publish.mock.calls[1]).toEqual(sent);
  expect(checkAudio).toHaveBeenCalledTimes(2);
});

it("确定性失败切换语言只更新定位前缀，保留后端原文和冻结范围并阻止重发", async () => {
  publish.mockRejectedValue(
    new HttpError(409, "后端原文 centre", [], "revision_conflict", [], {
      sentence_id: "sentence-frozen"
    })
  );
  const rows = [row("entry-frozen", 3)],
    sentence = selectedSentence(),
    closed = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <BatchPublicationModal
          rows={rows}
          sentences={[sentence]}
          onClose={closed}
          onPublished={vi.fn()}
        />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  await prepareAudio();
  fireEvent.click(screen.getByRole("button", { name: "发布所选" }));
  await screen.findByText("例句 sentence-frozen：后端原文 centre");
  view.rerender(content("en-US"));
  expect(
    screen.getByText("Sentence sentence-frozen: 后端原文 centre")
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Publish selected" })
  ).toBeDisabled();
  expect(screen.getAllByText("entry-frozen").length).toBeGreaterThan(0);
  expect(publish).toHaveBeenCalledTimes(1);
  expect(checkAudio).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(closed).toHaveBeenCalledTimes(1);
});
