import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { newSentence } from "../sentences/model";
import type { SharedSentence, AdminWordListItemAny } from "@tsz/types";
import { BatchPublicationModal } from "./BatchPublicationModal";

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  api: {
    sentences: { list: vi.fn(async () => ({ items: [], total: 0 })) },
    words: { publishBatchV3: publish }
  }
}));
function row(id: string, revision: number): AdminWordListItemAny {
  return {
    schema_version: 3,
    id,
    revision,
    lifecycle_revision: 2,
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
  publish.mockReset();
});

describe("原子批次发布确认", () => {
  it("只提交显式选中范围及确认时版本，成功后统一刷新", async () => {
    publish.mockResolvedValue({ words: [] });
    const done = mount();
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
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await screen.findByText(/发布结果暂时未知/);
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await waitFor(() => expect(done).toHaveBeenCalledOnce());
    expect(publish.mock.calls[1]).toEqual(publish.mock.calls[0]);
  });
  it("版本冲突保留范围并阻止自动取新版本重发", async () => {
    publish.mockRejectedValue(
      new HttpError(409, "revision changed", undefined, "revision_conflict")
    );
    const done = mount();
    fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
    await screen.findByText(/刷新列表并重新选择/);
    expect(
      await screen.findByRole("button", { name: "发布所选" })
    ).toBeDisabled();
    expect(publish).toHaveBeenCalledOnce();
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByText("first-page")).toBeInTheDocument();
    expect(screen.getByText("second-page")).toBeInTheDocument();
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
    created_at: "2026-09-23T00:00:00Z",
    updated_at: "2026-09-23T00:00:00Z"
  };
  const done = mount([sentence]);
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
  fireEvent.click(await screen.findByRole("button", { name: "发布所选" }));
  await screen.findByText("例句 failed-sentence：例句版本冲突");
  expect(screen.getByRole("button", { name: "发布所选" })).toBeDisabled();
  expect(done).not.toHaveBeenCalled();
});
