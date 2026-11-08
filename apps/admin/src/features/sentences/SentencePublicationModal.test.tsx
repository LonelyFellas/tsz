import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { act } from "@testing-library/react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import type { SharedSentence } from "@tsz/types";
import {
  SentencePublicationModal,
  type SentencePublicationAction
} from "./SentencePublicationModal";
import { newSentence } from "./model";
import { api } from "@/lib/auth";
vi.mock("@/lib/auth", () => ({
  api: {
    sentences: {
      publicationAudio: { check: vi.fn(), confirm: vi.fn() },
      publish: vi.fn(),
      rollback: vi.fn(),
      withdraw: vi.fn(),
      restore: vi.fn(),
      withdrawalImpact: vi.fn(),
      publications: vi.fn()
    }
  }
}));
vi.mock(
  "../dictionary/word-creation-v3/components/V3EnglishTextPreview",
  () => ({ V3EnglishTextPreview: () => <div>发布快照</div> })
);
const sentence: SharedSentence = {
  id: "sentence",
  revision: 8,
  lifecycle_revision: 3,
  view: "draft",
  current_publication_id: "published",
  withdrawn_at: "2026-09-23T00:00:00Z",
  content: newSentence(),
  entries: [],
  created_by: "创建人",
  created_by_admin_id: "11111111-1111-4111-8111-111111111111",
  created_at: "2026-09-23T00:00:00Z",
  updated_at: "2026-09-23T00:00:00Z"
};
function show(action: SentencePublicationAction, canPublish = true) {
  const onChanged = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={client}>
      <SentencePublicationModal
        sentence={sentence}
        action={action}
        canPublish={canPublish}
        onClose={vi.fn()}
        onChanged={onChanged}
      />
    </QueryClientProvider>
  );
  return onChanged;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.sentences.publicationAudio.check).mockImplementation(
    async (id, input) => ({
      manifest: {
        owner: { sentence: id },
        revision: input.base_revision,
        policy_version: 1,
        items: [],
        ready: true,
        manifest_hash: "a".repeat(64)
      },
      confirmed: false,
      receipt_id: null
    })
  );
});
describe("共享例句独立发布操作", () => {
  it("未知结果重试使用相同双版本和幂等键，发布不触发恢复", async () => {
    vi.mocked(api.sentences.publish)
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValue(sentence);
    const done = show("publish");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^确\s*认$/ })
      ).not.toBeDisabled()
    );
    fireEvent.click(screen.getByRole("button", { name: /确\s*认/ }));
    await screen.findByText(/操作结果暂时未知/);
    fireEvent.click(screen.getByRole("button", { name: /确\s*认/ }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    const calls = vi.mocked(api.sentences.publish).mock.calls;
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]).toEqual([
      "sentence",
      expect.any(String),
      { base_revision: 8, base_lifecycle_revision: 3 }
    ]);
    expect(api.sentences.restore).not.toHaveBeenCalled();
  });
  it("下架必须加载影响并填写原因，确认时携带指纹", async () => {
    vi.mocked(api.sentences.withdrawalImpact).mockResolvedValue({
      sentence_id: "sentence",
      lifecycle_revision: 3,
      publication_id: "published",
      fingerprint: "fingerprint",
      targets: [
        {
          entry_id: "word",
          sense_id: "sense",
          lifecycle_revision: 2,
          hidden: false
        }
      ]
    });
    vi.mocked(api.sentences.withdraw).mockResolvedValue(sentence);
    const done = show("withdraw");
    expect(screen.getByRole("button", { name: /确\s*认/ })).toBeDisabled();
    await screen.findByText("word / sense");
    fireEvent.change(screen.getByLabelText("下架原因"), {
      target: { value: "  需修正内容  " }
    });
    fireEvent.click(screen.getByRole("button", { name: /确\s*认/ }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(api.sentences.withdraw).toHaveBeenCalledWith(
      "sentence",
      expect.any(String),
      {
        base_revision: 8,
        base_lifecycle_revision: 3,
        reason: "需修正内容",
        impact_fingerprint: "fingerprint"
      }
    );
  });
  it("影响已变化时停止重试，不自动获取新版本绕过确认", async () => {
    vi.mocked(api.sentences.restore).mockRejectedValue(
      new HttpError(409, "版本冲突")
    );
    show("restore");
    fireEvent.click(screen.getByRole("button", { name: /确\s*认/ }));
    await screen.findByText(/版本冲突/);
    expect(screen.getByRole("button", { name: /确\s*认/ })).toBeDisabled();
    expect(api.sentences.publish).not.toHaveBeenCalled();
  });
  it("历史恢复调用带双版本校验的独立草稿恢复命令", async () => {
    vi.mocked(api.sentences.publications).mockResolvedValue([
      {
        id: "old",
        sentence_id: "sentence",
        publication_number: 1,
        source_revision: 2,
        snapshot: newSentence(),
        published_at: "2026-09-23T00:00:00Z",
        published_by_admin_id: "admin",
        created_by_admin_id: sentence.created_by_admin_id
      }
    ]);
    vi.mocked(api.sentences.rollback).mockResolvedValue(sentence);
    const done = show("history");
    fireEvent.click(await screen.findByRole("button", { name: "选择恢复" }));
    fireEvent.click(screen.getByRole("button", { name: "恢复所选历史到草稿" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(api.sentences.rollback).toHaveBeenCalledWith(
      "sentence",
      "old",
      expect.any(String),
      { base_revision: 8, base_lifecycle_revision: 3 }
    );
    expect(api.sentences.restore).not.toHaveBeenCalled();
  });
  it("没有发布权时不能执行发布", () => {
    show("publish", false);
    expect(screen.getByRole("button", { name: /确\s*认/ })).toBeDisabled();
    expect(api.sentences.publish).not.toHaveBeenCalled();
  });
});

it("历史选择及未知结果重试跨语言保留 publication ID、双版本和幂等键", async () => {
  const publication = {
    id: "original-history",
    sentence_id: sentence.id,
    publication_number: 1,
    source_revision: 2,
    snapshot: newSentence(),
    published_at: sentence.created_at,
    published_by_admin_id: "admin",
    created_by_admin_id: sentence.created_by_admin_id
  };
  vi.mocked(api.sentences.publications).mockResolvedValue([publication]);
  let reject!: (error: unknown) => void;
  vi.mocked(api.sentences.rollback)
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        })
    )
    .mockRejectedValueOnce(new HttpError(500, "original backend error"));
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const changed = vi.fn();
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <SentencePublicationModal
          sentence={sentence}
          action="history"
          canPublish
          onClose={vi.fn()}
          onChanged={changed}
        />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  fireEvent.click(await screen.findByRole("button", { name: "选择恢复" }));
  const list = screen.getByRole("list");
  for (const locale of ["zh-Hant", "en-GB", "en-US"] as const) {
    view.rerender(content(locale));
    expect(screen.getByRole("list")).toBe(list);
    expect(api.sentences.publications).toHaveBeenCalledTimes(1);
    expect(api.sentences.rollback).not.toHaveBeenCalled();
  }
  fireEvent.click(
    screen.getByRole("button", { name: "Restore selected history to draft" })
  );
  const sent = vi.mocked(api.sentences.rollback).mock.calls[0];
  expect(sent).toEqual([
    sentence.id,
    publication.id,
    expect.any(String),
    { base_revision: 8, base_lifecycle_revision: 3 }
  ]);
  view.rerender(content("zh-Hant"));
  expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
  await act(async () => reject(new TypeError("network")));
  view.rerender(content("en-US"));
  fireEvent.click(
    screen.getByRole("button", { name: "Restore selected history to draft" })
  );
  await waitFor(() => expect(api.sentences.rollback).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.sentences.rollback).mock.calls[1]).toEqual(sent);
  expect(changed).not.toHaveBeenCalled();
});

it("撤回原因和影响指纹跨语言保持，单项影响使用完整短语", async () => {
  vi.mocked(api.sentences.withdrawalImpact).mockResolvedValue({
    sentence_id: sentence.id,
    lifecycle_revision: 3,
    publication_id: "published",
    fingerprint: "original-fingerprint",
    targets: [
      {
        entry_id: "word-id",
        sense_id: "sense-id",
        lifecycle_revision: 2,
        hidden: false
      }
    ]
  });
  vi.mocked(api.sentences.withdraw).mockResolvedValue(sentence);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <SentencePublicationModal
          sentence={sentence}
          action="withdraw"
          canPublish
          onClose={vi.fn()}
          onChanged={vi.fn()}
        />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  await screen.findByText("word-id / sense-id");
  const input = screen.getByLabelText("下架原因");
  fireEvent.change(input, { target: { value: "原始原因 centre" } });
  view.rerender(content("en-US"));
  expect(input).toHaveValue("原始原因 centre");
  expect(
    screen.getByText("Affects 1 meaning in the current publication")
  ).toBeVisible();
  expect(api.sentences.withdraw).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(api.sentences.withdraw).toHaveBeenCalledWith(
      sentence.id,
      expect.any(String),
      {
        base_revision: 8,
        base_lifecycle_revision: 3,
        reason: "原始原因 centre",
        impact_fingerprint: "original-fingerprint"
      }
    )
  );
});
