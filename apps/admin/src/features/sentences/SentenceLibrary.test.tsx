import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
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
      collect: vi.fn(),
      delete: vi.fn(),
      uncollect: vi.fn()
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
  it("发现 pending 候选不会自动收录，确认显式绑定当前词条；冲突保留弹窗", async () => {
    const item = fixture();
    vi.mocked(api.sentences.list).mockImplementation(async (q) =>
      q?.candidates ? { items: [item], total: 1 } : { items: [], total: 0 }
    );
    vi.mocked(api.sentences.get).mockResolvedValue(item);
    vi.mocked(api.sentences.collect).mockRejectedValue(
      new Error("标记已被其他词条关联，请刷新")
    );
    show("specific-flower-entry");
    await screen.findByText("A wonderful flower.");
    expect(api.sentences.collect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("确认收录").closest("button")!);
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("button", { name: /确\s*定/ })
    ).toBeDisabled();
    fireEvent.click(within(dialog).getByRole("checkbox"));
    fireEvent.click(within(dialog).getByRole("button", { name: /确\s*定/ }));
    await waitFor(() =>
      expect(api.sentences.collect).toHaveBeenCalledWith(item.id, {
        base_revision: 3,
        entry_id: "specific-flower-entry",
        annotation_ids: ["pending-flower"]
      })
    );
    await screen.findByText("标记已被其他词条关联，请刷新");
    await waitFor(() => expect(screen.getByRole("dialog")).toBeVisible());
  });
});
