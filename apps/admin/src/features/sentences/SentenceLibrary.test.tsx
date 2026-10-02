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
const ownerId = "11111111-1111-4111-8111-111111111111";
const auth = vi.hoisted(() => ({
  role: "admin",
  permissions: ["sentences.access"]
}));
vi.mock("@/lib/auth", () => ({
  useAuthStore: (
    select: (state: {
      profile: { id: string; role: string; permissions: string[] };
    }) => unknown
  ) =>
    select({
      profile: {
        id: "11111111-1111-4111-8111-111111111111",
        role: auth.role,
        permissions: auth.permissions
      }
    }),
  api: {
    sentences: {
      list: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      setVisibility: vi.fn(),
      publications: vi.fn(),
      rollback: vi.fn()
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
    created_by_admin_id: ownerId,
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
  auth.permissions = ["sentences.access"];
});

describe("独立多维例句库", () => {
  it.each([false, true])(
    "昵称与UUID不同的本人例句仍有编辑、发布和生命周期操作（下架=%s）",
    async (withdrawn) => {
      auth.permissions = [
        "sentences.access",
        "sentences.edit",
        "words.access",
        "sentences.publish",
        "sentences.withdraw",
        "sentences.restore",
        "sentences.rollback"
      ];
      const item = {
        ...fixture(),
        current_publication_id: "publication",
        withdrawn_at: withdrawn ? "2026-10-01T00:00:00Z" : null
      };
      vi.mocked(api.sentences.list).mockResolvedValue({
        items: [item],
        total: 1
      });
      show();
      await screen.findByText("A wonderful flower.");
      expect(screen.getByText(/^编\s*辑$/).closest("button")).toBeVisible();
      expect(screen.getByText(/^发\s*布$/).closest("button")).toBeVisible();
      expect(
        screen
          .getByText(withdrawn ? /^恢\s*复$/ : /^下\s*架$/)
          .closest("button")
      ).toBeVisible();
    }
  );
  it.each([true, false])(
    "历史回滚按真实创建者UUID，不按发布者或昵称（本人=%s）",
    async (own) => {
      auth.permissions = [
        "sentences.access",
        "sentences.edit",
        "words.access",
        "sentences.edit_others",
        "sentences.publish",
        "sentences.rollback"
      ];
      const item = {
        ...fixture(),
        created_by_admin_id: own
          ? ownerId
          : "22222222-2222-4222-8222-222222222222",
        current_publication_id: "publication"
      };
      vi.mocked(api.sentences.list).mockResolvedValue({
        items: [item],
        total: 1
      });
      vi.mocked(api.sentences.get).mockResolvedValue(item);
      vi.mocked(api.sentences.publications).mockResolvedValue([
        {
          id: "old-publication",
          sentence_id: item.id,
          publication_number: 1,
          source_revision: 1,
          snapshot: item.content,
          published_at: item.created_at,
          published_by_admin_id: own ? "other-publisher" : ownerId,
          created_by_admin_id: item.created_by_admin_id
        }
      ]);
      show();
      fireEvent.click(
        (await screen.findByText(/^历\s*史$/)).closest("button")!
      );
      await screen.findByText(/版本 1/);
      if (own) {
        fireEvent.click(screen.getByText("选择回退").closest("button")!);
        expect(
          screen.getByText("将所选历史发布为新版本").closest("button")
        ).toBeEnabled();
      } else {
        expect(screen.queryByText("选择回退")).toBeNull();
        expect(
          screen.getByText("将所选历史发布为新版本").closest("button")
        ).toBeDisabled();
      }
      expect(api.sentences.rollback).not.toHaveBeenCalled();
    }
  );
  it("编辑他人只扩展编辑，不扩展发布与生命周期", async () => {
    auth.permissions = [
      "sentences.access",
      "sentences.edit",
      "words.access",
      "sentences.edit_others",
      "sentences.publish",
      "sentences.withdraw",
      "sentences.restore",
      "sentences.rollback"
    ];
    const item = {
      ...fixture(),
      created_by_admin_id: "22222222-2222-4222-8222-222222222222",
      current_publication_id: "publication"
    };
    vi.mocked(api.sentences.list).mockResolvedValue({
      items: [item],
      total: 1
    });
    show();
    await screen.findByText("A wonderful flower.");
    expect(screen.getByText(/^编\s*辑$/).closest("button")).toBeVisible();
    expect(screen.queryByText(/^发\s*布$/)).toBeNull();
    expect(screen.queryByText(/^下\s*架$/)).toBeNull();
  });
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
