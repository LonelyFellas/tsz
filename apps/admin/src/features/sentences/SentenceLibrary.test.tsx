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
const auth = vi.hoisted(() => ({ role: "admin" }));
vi.mock("@/lib/auth", () => ({
  useAuthStore: (
    select: (state: {
      profile: { role: string; can_publish_lexicon: boolean };
    }) => unknown
  ) => select({ profile: { role: auth.role, can_publish_lexicon: false } }),
  api: {
    sentences: {
      list: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      setVisibility: vi.fn()
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
    lifecycle_revision: 1,
    view: "draft",
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

beforeEach(() => {
  vi.clearAllMocks();
  auth.role = "admin";
});

describe("独立多维例句库", () => {
  it("列表与查看详情保留连读标注及英文展示字体类", async () => {
    const item = fixture();
    if (item.content.sentence.en_text.mode === "unified") {
      item.content.sentence.en_text.common.value = {
        version: 2,
        text: "He is looking for a job.",
        annotations: [{ type: "liaison", start: 12, end: 15 }]
      };
    }
    vi.mocked(api.sentences.list).mockResolvedValue({
      items: [item],
      total: 1
    });
    vi.mocked(api.sentences.get).mockResolvedValue(item);
    show();
    await screen.findByText(/查\s*看/);
    const reader = document.querySelector(".tsz-ve-readonly");
    expect(reader).toHaveClass("tsz-entry-en", "has-liaison");
    expect(
      reader?.querySelectorAll(".tsz-ve-liaison-anchor").length
    ).toBeGreaterThanOrEqual(2);
    fireEvent.click(screen.getByText(/查\s*看/).closest("button")!);
    await screen.findByText("查看例句");
    expect(document.querySelector(".ant-modal .tsz-ve-readonly")).toHaveClass(
      "tsz-entry-en",
      "has-liaison"
    );
  });
  it("词条的例句列表不再提供创编入口，添加由 voice-editor 承接", async () => {
    vi.mocked(api.sentences.list).mockResolvedValue({ items: [], total: 0 });
    show("source-entry");
    await waitFor(() => expect(api.sentences.list).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "创编例句" })).toBeNull();
  });
  it("普通管理员可查询查看，但不能编辑删除或发布", async () => {
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
    expect(screen.queryByText(/^编\s*辑$/)).toBeNull();
    expect(screen.queryByText(/^删\s*除$/)).toBeNull();
    expect(screen.getByText("删除所选").closest("button")).toBeDisabled();
    expect(api.sentences.delete).not.toHaveBeenCalled();
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
    expect(api.sentences.setVisibility).not.toHaveBeenCalled();
  });
});

it("已发布例句不提供永久删除，超管编辑读取草稿而不是发布快照", async () => {
  auth.role = "super_admin";
  const item = { ...fixture(), current_publication_id: "publication" };
  vi.mocked(api.sentences.list).mockResolvedValue({ items: [item], total: 1 });
  vi.mocked(api.sentences.get).mockResolvedValue(item);
  show();
  await screen.findByText("已有发布");
  expect(screen.queryByText(/^删\s*除$/)).toBeNull();
  fireEvent.click(screen.getByText(/^编\s*辑$/).closest("button")!);
  await screen.findByText("独立例句编辑器");
  expect(api.sentences.get).toHaveBeenLastCalledWith(item.id, "draft");
  expect(api.sentences.delete).not.toHaveBeenCalled();
});
