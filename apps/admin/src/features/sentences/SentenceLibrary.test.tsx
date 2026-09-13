import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedSentence } from "@tsz/types";
import { SentenceLibrary } from "./SentenceLibrary";
import { newSentence } from "./model";
import { api } from "@/lib/auth";
vi.mock("@/lib/auth", () => ({
  api: {
    sentences: {
      list: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      unlink: vi.fn()
    }
  }
}));
vi.mock("./SentenceEditor", () => ({
  SentenceEditor: () => <div>独立例句编辑器</div>
}));
function fixture(): SharedSentence {
  const content = newSentence();
  if (content.sentence.en_text.mode === "unified")
    content.sentence.en_text.common.value.text = "A wonderful flower.";
  content.annotations = [
    {
      id: "pending-flower",
      source_dialect: "common",
      source_segments: [{ start: 12, end: 18, surface: "flower" }],
      target: {
        state: "pending",
        kind: "word",
        headword: "flower",
        gloss: "植物的花"
      }
    }
  ];
  return {
    id: content.sentence.id,
    revision: 3,
    content,
    entries: [],
    created_by: "测试管理员",
    created_at: "2026-09-12T10:00:00Z",
    updated_at: "2026-09-12T10:00:00Z"
  };
}
function show(entryId?: string) {
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter>
        <ConfigProvider locale={zhCN} theme={{ token: { motion: false } }}>
          <App>
            <SentenceLibrary entryId={entryId} />
          </App>
        </ConfigProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("独立多维例句库", () => {
  beforeEach(() => vi.clearAllMocks());
  it("词条的例句列表不再提供创编入口，添加由 voice-editor 承接", async () => {
    vi.mocked(api.sentences.list).mockResolvedValue({ items: [], total: 0 });
    show("source-entry");
    await waitFor(() => expect(api.sentences.list).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "创编例句" })).toBeNull();
  });
  it("列表只提供查询查看编辑删除，没有创建、审核或发布入口", async () => {
    const item = fixture();
    vi.mocked(api.sentences.list).mockResolvedValue({
      items: [item],
      total: 1
    });
    show();
    await screen.findByText("A wonderful flower.");
    expect(
      [...document.querySelectorAll("button")].some((button) =>
        /创编|新增|审核|发布/.test(button.textContent ?? "")
      )
    ).toBe(false);
    expect(screen.getByText(/查\s*看/).closest("button")).toBeVisible();
    expect(screen.getByText(/编\s*辑/).closest("button")).toBeVisible();
    fireEvent.change(screen.getByLabelText("例句关键词"), {
      target: { value: "flower" }
    });
    fireEvent.click(screen.getByText(/搜\s*索/).closest("button")!);
    await waitFor(() =>
      expect(api.sentences.list).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: "flower", page: 1 })
      )
    );
  });
  it("词条汇总保留查看入口，解除关联在具体词义区块处理", async () => {
    vi.mocked(api.sentences.list).mockResolvedValue({
      items: [fixture()],
      total: 1
    });
    show("specific-flower-entry");
    await screen.findByText("A wonderful flower.");
    expect(screen.queryByText("确认收录")).toBeNull();
    expect(screen.queryByText("从当前词条解除关联")).toBeNull();
    expect(api.sentences.unlink).not.toHaveBeenCalled();
  });
});
