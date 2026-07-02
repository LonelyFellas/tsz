import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { AdminWord } from "@tsz/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WordEditor } from "./WordEditor";

// 词条编辑整页表单的集成冒烟:mock 掉 api.words(@/lib/auth),验证
// 「按 :wordId 加载整棵树 → 分区渲染 → 保存时带乐观锁基准整树上送」的主链路。
vi.mock("@/lib/auth", () => ({
  api: {
    words: {
      get: vi.fn(),
      saveContent: vi.fn(),
      publish: vi.fn()
    }
  }
}));

import { api } from "@/lib/auth";

const mockGet = vi.mocked(api.words.get);
const mockSave = vi.mocked(api.words.saveContent);

// antd Button 会在两个汉字之间插入空格(「保 存」),用忽略空白的匹配器找按钮文本。
const btnText = (label: string) => (content: string) =>
  content.replace(/\s/g, "") === label;

/** 后端草稿壳 + 一点内容:uk/us 双方言,一个动词词性。 */
function draftWord(): AdminWord {
  return {
    id: "w-1",
    kind: "word",
    headword: "centre",
    frequency: "2.300000",
    dialect_mode: "distinguish",
    dialects: ["uk", "us"],
    status: "draft",
    created_by: "a-1",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T10:00:00Z",
    sense_groups: [],
    pos: [
      {
        id: "p-1",
        pos: "verb",
        forms: [],
        grammar_structures: [],
        senses: []
      }
    ]
  };
}

function renderEditor() {
  // retry 关掉:加载失败用例要立即落入错误态,而非默认三次重试后超时。
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  });
  return render(
    <MemoryRouter initialEntries={["/words/w-1/edit"]}>
      <QueryClientProvider client={client}>
        <AntApp>
          <Routes>
            <Route path="/words/:wordId/edit" element={<WordEditor />} />
          </Routes>
        </AntApp>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGet.mockResolvedValue({ word: draftWord() });
});

describe("WordEditor", () => {
  it("按路由 wordId 加载词条,渲染面包屑、状态与各分区小节", async () => {
    renderEditor();
    await waitFor(() => expect(mockGet).toHaveBeenCalledWith("w-1"));
    expect(await screen.findByText("单词「centre」")).toBeInTheDocument();
    expect(screen.getByText("草稿")).toBeInTheDocument();
    // headword 只读展示。
    expect(screen.getByDisplayValue("centre")).toBeDisabled();
    for (const title of [
      "基础信息",
      "语义区间",
      "基本词性",
      "词形变化",
      "语法结构",
      "多维词义"
    ]) {
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    }
    // 底部操作栏。
    expect(screen.getByText(btnText("提交"))).toBeInTheDocument();
    expect(screen.getByText(btnText("保存"))).toBeInTheDocument();
  });

  it("加载失败时给出错误提示与返回入口", async () => {
    mockGet.mockRejectedValue(new Error("word not found"));
    renderEditor();
    expect(await screen.findByText("词条加载失败")).toBeInTheDocument();
    expect(screen.getByText("word not found")).toBeInTheDocument();
    expect(screen.getByText("返回列表")).toBeInTheDocument();
  });

  it("保存:整树上送且 base_updated_at 取加载时的 updated_at,成功后基准更新", async () => {
    const saved = { ...draftWord(), updated_at: "2026-07-01T11:00:00Z" };
    // 保存成功会失效缓存触发详情重取:真实后端此时已返回新树,mock 跟上,
    // 否则旧 updated_at 会把乐观锁基准倒回去。
    mockSave.mockImplementation(async () => {
      mockGet.mockResolvedValue({ word: saved });
      return { word: saved };
    });
    renderEditor();
    await screen.findByText("单词「centre」");

    fireEvent.click(screen.getByText(btnText("保存")));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));

    const [wordId, input] = mockSave.mock.calls[0]!;
    expect(wordId).toBe("w-1");
    expect(input.base_updated_at).toBe("2026-07-01T10:00:00Z");
    expect(input.dialect_mode).toBe("distinguish");
    expect(input.dialects).toEqual(["uk", "us"]);
    // 服务端 pos 节点 id 原样带回(D15)。
    expect(input.pos[0]!.id).toBe("p-1");
    expect(await screen.findByText("已保存")).toBeInTheDocument();

    // 再次保存:乐观锁基准应已换成上次响应的 updated_at。
    fireEvent.click(screen.getByText(btnText("保存")));
    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(2));
    expect(mockSave.mock.calls[1]![1].base_updated_at).toBe(
      "2026-07-01T11:00:00Z"
    );
  });

  it("切到「无需分方言」后词形变化回退到单一默认块,仍有原形行", async () => {
    renderEditor();
    await screen.findByText("单词「centre」");
    fireEvent.click(screen.getByRole("radio", { name: "无需分方言" }));
    await waitFor(() =>
      expect(screen.getAllByDisplayValue("原形").length).toBeGreaterThan(0)
    );
  });
});
