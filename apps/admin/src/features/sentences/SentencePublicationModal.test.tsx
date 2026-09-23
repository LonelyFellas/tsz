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
beforeEach(() => vi.resetAllMocks());
describe("共享例句独立发布操作", () => {
  it("未知结果重试使用相同双版本和幂等键，发布不触发恢复", async () => {
    vi.mocked(api.sentences.publish)
      .mockRejectedValueOnce(new Error("connection lost"))
      .mockResolvedValue(sentence);
    const done = show("publish");
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
  it("历史回退调用独立命令，不把快照写入正在编辑的草稿", async () => {
    vi.mocked(api.sentences.publications).mockResolvedValue([
      {
        id: "old",
        sentence_id: "sentence",
        publication_number: 1,
        source_revision: 2,
        snapshot: newSentence(),
        published_at: "2026-09-23T00:00:00Z",
        published_by_admin_id: "admin"
      }
    ]);
    vi.mocked(api.sentences.rollback).mockResolvedValue(sentence);
    const done = show("history");
    fireEvent.click(await screen.findByRole("button", { name: "选择回退" }));
    fireEvent.click(
      screen.getByRole("button", { name: "将所选历史发布为新版本" })
    );
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
