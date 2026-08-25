import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminWordListItemAny,
  AdminWordListQuery,
  AdminWordListItemV3
} from "@tsz/types";

const apiMocks = vi.hoisted(() => ({
  useArchiveWord: vi.fn(),
  useArchiveWordsBatch: vi.fn(),
  useRestoreWord: vi.fn(),
  useRestoreWordsBatch: vi.fn(),
  useWordList: vi.fn(),
  useWordStats: vi.fn()
}));

const dataSourceMocks = vi.hoisted(() => ({
  getAny: vi.fn()
}));

vi.mock("./api", () => ({
  ...apiMocks,
  useArchiveWordAny: apiMocks.useArchiveWord,
  useArchiveWordsBatchAny: apiMocks.useArchiveWordsBatch,
  useRestoreWordAny: apiMocks.useRestoreWord,
  useRestoreWordsBatchAny: apiMocks.useRestoreWordsBatch
}));

vi.mock("./dataSource", () => ({
  adminWordsAnyDataSource: {
    getAny: dataSourceMocks.getAny
  },
  adminWordsDataSourceCapabilities: {
    archive: true,
    batchArchive: true,
    dialectVariantSuggestions: true,
    phraseCreation: true
  }
}));

vi.mock("./part-of-speech/api", () => ({
  usePartOfSpeechCatalog: () => ({
    data: { catalog_version: 1, items: [] },
    isError: false,
    isPending: false,
    refetch: vi.fn()
  })
}));

import { SmartDictionary } from "./SmartDictionary";

function word(
  id: string,
  headword: string
): Extract<AdminWordListItemAny, { schema_version: 2 }> {
  return {
    schema_version: 2,
    id,
    headword,
    kind: "word",
    dialects: ["common"],
    headword_variants: [{ dialect: "common", headword }],
    gloss: "释义",
    pos_list: ["noun"],
    levels: ["A1"],
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    max_reachable_step: "basics",
    has_unpublished_changes: false,
    created_by_name: "Admin",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  };
}

function v3Word(id: string, label: string): AdminWordListItemV3 {
  return {
    schema_version: 3,
    id,
    kind: "word",
    presentation: {
      label,
      matched_surfaces: ["surface-not-used-as-label"],
      strategy_version: "future_strategy_9"
    },
    gloss: "V3 释义",
    pos_list: ["noun"],
    levels: ["X9"],
    status: "draft",
    revision: 3,
    lifecycle_revision: 2,
    max_reachable_step: "forms",
    has_unpublished_changes: false,
    created_by_name: "Admin",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
}

function matchViewport(width: number) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches:
      !query.includes("min-width") || Number(query.match(/\d+/)?.[0]) <= width,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

function archivedWord(
  id: string,
  headword: string
): Extract<AdminWordListItemAny, { schema_version: 2 }> {
  return { ...word(id, headword), status: "archived" };
}

function idleMutation() {
  return {
    isPending: false,
    variables: undefined,
    mutate: vi.fn(),
    mutateAsync: vi.fn()
  };
}

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dataSourceMocks.getAny.mockReset().mockResolvedValue(undefined);
  for (const hook of [
    apiMocks.useArchiveWord,
    apiMocks.useArchiveWordsBatch,
    apiMocks.useRestoreWord,
    apiMocks.useRestoreWordsBatch
  ]) {
    hook.mockReturnValue(idleMutation());
  }
  apiMocks.useWordStats.mockReturnValue({
    data: { total: 21, today: 1, month: 2 }
  });
  apiMocks.useWordList.mockImplementation((query: AdminWordListQuery) => ({
    data: {
      words: [
        query.page === 2 ? word("word-2", "second") : word("word-1", "first")
      ],
      page: { page: query.page ?? 1, page_size: 20, total: 21 }
    },
    error: null,
    isError: false,
    isPending: false,
    refetch: vi.fn()
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SmartDictionary", () => {
  it("同页混合展示 V2 phrase 与 V3，V3 只使用 presentation.label 且可进入独立路由", () => {
    matchViewport(1440);
    const legacy = {
      ...word("v2-phrase", "legacy phrase"),
      kind: "phrase" as const,
      dialects: ["uk" as const]
    };
    const current = v3Word("v3-entry-12345678", "服务端 V3 展示名");
    const reportUnknownPresentationStrategy = vi.fn();
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [legacy, current],
        page: { page: 1, page_size: 20, total: 2 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary
            reportUnknownPresentationStrategy={
              reportUnknownPresentationStrategy
            }
          />
        </AntApp>
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.getByText("legacy phrase")).toBeVisible();
    expect(screen.getByText("BrE")).toBeVisible();
    expect(screen.getByText("服务端 V3 展示名")).toBeVisible();
    expect(screen.queryByText("surface-not-used-as-label")).toBeNull();
    expect(reportUnknownPresentationStrategy).toHaveBeenCalledTimes(1);
    expect(reportUnknownPresentationStrategy).toHaveBeenCalledWith({
      entry_id: "v3-entry-12345678",
      strategy_version: "future_strategy_9"
    });
    const v3Row = screen.getByText("服务端 V3 展示名").closest("tr")!;
    expect(v3Row.querySelectorAll("td")[3]).toHaveTextContent("-");
    expect(v3Row).toHaveTextContent("X9");
    fireEvent.click(v3Row.querySelector("td:last-child button")!);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/words/v3-entry-12345678/v3/wizard/forms"
    );
  });

  it("unknown schema 解码失败时 fail closed 显示列表错误，不渲染猜测数据", () => {
    const refetch = vi.fn();
    apiMocks.useWordList.mockReturnValue({
      data: undefined,
      error: new Error("unsupported schema_version: 9"),
      isError: true,
      isPending: false,
      refetch
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    expect(screen.getByText("词条列表加载失败")).toBeVisible();
    expect(screen.getByText("unsupported schema_version: 9")).toBeVisible();
    expect(screen.queryByText("服务端 V3 展示名")).toBeNull();
  });

  it("同名词条保留两行并按各自 ID 查看和归档", async () => {
    matchViewport(1440);
    const first: AdminWordListItemAny = {
      ...word("01a00492-d889-71e0-a9a3-e053a0a093e6", "workspace"),
      dialects: ["common"],
      gloss: "工作空间"
    };
    const second: AdminWordListItemAny = {
      ...word("01a00492-d889-71e0-a9a3-e053a0a093e7", "workspace"),
      kind: "phrase" as const,
      dialects: ["uk"],
      gloss: "协作空间"
    };
    const mutateAsync = vi.fn().mockResolvedValue({ word: second });
    apiMocks.useArchiveWord.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [first, second],
        page: { page: 1, page_size: 20, total: 2 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
        <LocationProbe />
      </MemoryRouter>
    );

    expect(screen.getAllByText("workspace")).toHaveLength(2);
    expect(screen.getByText("a0a093e6")).toBeVisible();
    expect(screen.getByText("a0a093e7")).toBeVisible();
    expect(screen.getByText("工作空间")).toBeVisible();
    expect(screen.getByText("协作空间")).toBeVisible();
    expect(screen.getByText("BrE")).toBeVisible();

    // 操作按钮在可及性树中必须能区分行:同名词条靠短 ID 分辨。
    const secondRow = screen.getByText("a0a093e7").closest("tr")!;
    const secondActions = secondRow.querySelectorAll<HTMLButtonElement>(
      "td:last-child button"
    );
    expect(secondActions[0]!.getAttribute("aria-label")).toBe(
      "继续创建「workspace」a0a093e7"
    );
    expect(secondActions[1]!.getAttribute("aria-label")).toBe(
      "归档「workspace」a0a093e7"
    );
    fireEvent.click(secondActions[1]!);
    fireEvent.click(
      (await screen.findAllByText("归 档", { exact: true }))
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ wordId: second.id })
      )
    );

    const firstRow = screen.getByText("a0a093e6").closest("tr")!;
    fireEvent.click(firstRow.querySelector("td:last-child button")!);
    expect(screen.getByTestId("location")).toHaveTextContent(first.id);
  });

  it("手机宽度只保留完整的词汇与操作列", () => {
    matchViewport(390);
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent?.trim())).toEqual([
      "",
      "词汇",
      "操作"
    ]);
    expect(screen.getByText("继续创建").closest("button")).toBeEnabled();
    expect(
      screen
        .getAllByText("归 档", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => item?.classList.contains("ant-btn-link"))
    ).toBeEnabled();
  });

  it("创建人长名称单行省略并可通过键盘触发 Tooltip，空值显示占位", () => {
    matchViewport(1440);
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...word("long", "long-headword"),
            created_by_name: "非常非常长的创建人名称"
          },
          { ...word("empty", "empty-creator"), created_by_name: "" }
        ],
        page: { page: 1, page_size: 20, total: 2 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    const creator = screen.getByText("非常非常长的创建人名称");
    expect(creator).toHaveAttribute("tabindex", "0");
    expect(creator.closest("td")).toHaveClass("ant-table-cell-ellipsis");
    expect(screen.getByText("-")).not.toHaveAttribute("tabindex");
  });

  it("从重复检测入口进入时自动定位归档词条", () => {
    render(
      <MemoryRouter initialEntries={["/words?keyword=center&status=archived"]}>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    expect(apiMocks.useWordList).toHaveBeenCalledWith({
      page: 1,
      page_size: 20,
      q: "center",
      status: "archived"
    });
    expect(screen.getByLabelText("关键字")).toHaveValue("center");
    expect(screen.getByText("已归档")).toBeInTheDocument();
  });

  it("深链筛选重置后同步清空表单、查询与 URL", async () => {
    render(
      <MemoryRouter initialEntries={["/words?keyword=center&status=archived"]}>
        <AntApp>
          <SmartDictionary />
        </AntApp>
        <LocationProbe />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /重置/ }));

    await waitFor(() => {
      expect(apiMocks.useWordList).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 20
      });
      expect(screen.getByLabelText("关键字")).toHaveValue("");
      expect(screen.queryByText("已归档")).toBeNull();
      expect(screen.getByTestId("location")).toHaveTextContent("/words");
    });
  });

  it("翻页时保留完整批量选择", async () => {
    const { container } = render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    expect(screen.getByText("first")).toBeInTheDocument();
    const firstRowCheckbox = container.querySelector(
      "tbody input[type='checkbox']"
    );
    expect(firstRowCheckbox).not.toBeNull();
    fireEvent.click(firstRowCheckbox!);
    const batchButton = screen.getByText("归 档(1)").closest("button");
    expect(batchButton).not.toBeNull();

    fireEvent.click(container.querySelector(".ant-pagination-item-2")!);

    await waitFor(() => {
      expect(screen.getByText("second")).toBeInTheDocument();
      expect(screen.getByText("归 档(1)")).toBeInTheDocument();
    });
    expect(batchButton).not.toBeDisabled();
  });

  it("HTTP 环境单条归档可降级生成幂等键，连续确认只发一次", async () => {
    let resolveArchive!: (value: unknown) => void;
    const mutateAsync = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveArchive = resolve;
        })
    );
    apiMocks.useArchiveWord.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    vi.stubGlobal("crypto", {
      randomUUID: undefined,
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.fill(0);
        bytes[15] = 1;
        return bytes;
      })
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    const rowArchive = screen
      .getAllByText("归 档", { exact: true })
      .map((item) => item.closest("button"))
      .find((item) => item?.classList.contains("ant-btn-link"))!;
    fireEvent.click(rowArchive);
    await screen.findAllByText("归档「first」？");
    const confirm = screen
      .getAllByText("归 档", { exact: true })
      .map((item) => item.closest("button"))
      .find((item) => item?.closest(".ant-modal"))!;
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      wordId: "word-1",
      idempotencyKey: "00000000-0000-4000-8000-000000000001",
      input: { base_revision: 1, base_lifecycle_revision: 1 }
    });
    await act(async () => resolveArchive({ word: word("word-1", "first") }));
  });

  it("批量归档失败保留选择，再次确认成功后清空选择", async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValueOnce(new Error("引用冲突"))
      .mockResolvedValueOnce({ words: [], affected: 1 });
    apiMocks.useArchiveWordsBatch.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    const { container } = render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    fireEvent.click(
      container.querySelector("tbody input[type='checkbox']") as Element
    );

    fireEvent.click(screen.getByText("归 档(1)"));
    fireEvent.click(
      (await screen.findAllByText("归 档", { exact: true }))
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );
    expect(await screen.findByText("引用冲突")).toBeInTheDocument();
    expect(screen.getByText("归 档(1)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("归 档(1)"));
    fireEvent.click(
      (await screen.findAllByText("归 档", { exact: true }))
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[0]![0].input).toEqual({
      entries: [
        {
          id: "word-1",
          base_revision: 1,
          base_lifecycle_revision: 1
        }
      ]
    });
    await waitFor(() => expect(screen.queryByText("归 档(1)")).toBeNull());
  });

  it("archived 筛选结果仅提供恢复操作，单条恢复携带双 revision", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({
      word: archivedWord("word-1", "first")
    });
    apiMocks.useRestoreWord.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [archivedWord("word-1", "first")],
        page: { page: 1, page_size: 20, total: 1 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    expect(
      screen
        .queryAllByText("归 档", { exact: true })
        .map((item) => item.closest("button"))
        .some((item) => item?.classList.contains("ant-btn-link"))
    ).toBe(false);
    const rowRestore = screen
      .getAllByText("恢 复", { exact: true })
      .map((item) => item.closest("button"))
      .find((item) => item?.classList.contains("ant-btn-link"))!;
    expect(rowRestore.getAttribute("aria-label")).toBe("恢复「first」word-1");
    expect(
      rowRestore
        .closest("td")!
        .querySelector("button")!
        .getAttribute("aria-label")
    ).toBe("查看「first」word-1");
    fireEvent.click(rowRestore);
    await screen.findAllByText("恢复「first」？");
    fireEvent.click(
      screen
        .getAllByText("恢 复", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        wordId: "word-1",
        input: { base_revision: 1, base_lifecycle_revision: 1 }
      })
    );
  });

  it("恢复 A 的 getAny 返回 B 时 fail closed 且不调用 restoreAny", async () => {
    const mutateAsync = vi.fn();
    apiMocks.useRestoreWord.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [archivedWord("word-1", "first")],
        page: { page: 1, page_size: 20, total: 1 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    dataSourceMocks.getAny.mockResolvedValueOnce({
      word: archivedWord("word-2", "second")
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    const rowRestore = screen
      .getAllByText("恢 复", { exact: true })
      .map((item) => item.closest("button"))
      .find((item) => item?.classList.contains("ant-btn-link"))!;
    fireEvent.click(rowRestore);
    await screen.findAllByText("恢复「first」？");
    fireEvent.click(
      screen
        .getAllByText("恢 复", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );

    expect(
      await screen.findByText("词条响应格式与当前客户端契约不一致，请稍后重试")
    ).toBeInTheDocument();
    expect(dataSourceMocks.getAny).toHaveBeenCalledWith("word-1");
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("恢复响应未知时用同一 key 和精确双 revision 重试", async () => {
    const mutateAsync = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network result unknown"))
      .mockResolvedValueOnce({ word: archivedWord("word-1", "first") });
    apiMocks.useRestoreWord.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...archivedWord("word-1", "first"),
            revision: 7,
            lifecycle_revision: 4
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    const restoreOnce = async () => {
      const rowRestore = screen
        .getAllByText("恢 复", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => item?.classList.contains("ant-btn-link"))!;
      fireEvent.click(rowRestore);
      fireEvent.click(
        (await screen.findAllByText("恢 复", { exact: true }))
          .map((item) => item.closest("button"))
          .find((item) => item?.closest(".ant-modal"))!
      );
    };
    await restoreOnce();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    await restoreOnce();
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    expect(mutateAsync.mock.calls[1]![0]).toEqual(
      mutateAsync.mock.calls[0]![0]
    );
    expect(mutateAsync.mock.calls[1]![0].input).toEqual({
      base_revision: 7,
      base_lifecycle_revision: 4
    });
  });

  it("批量恢复提交完整稳定 selection 与每条双 revision", async () => {
    const first = {
      ...archivedWord("word-1", "first"),
      revision: 7,
      lifecycle_revision: 3
    };
    const second = {
      ...archivedWord("word-2", "second"),
      revision: 11,
      lifecycle_revision: 5
    };
    const mutateAsync = vi.fn().mockResolvedValue({
      words: [first, second],
      affected: 2
    });
    apiMocks.useRestoreWordsBatch.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [first, second],
        page: { page: 1, page_size: 20, total: 2 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    const firstCheckbox = screen
      .getByText("first")
      .closest("tr")!
      .querySelector("input[type='checkbox']")!;
    const secondCheckbox = screen
      .getByText("second")
      .closest("tr")!
      .querySelector("input[type='checkbox']")!;
    fireEvent.click(firstCheckbox);
    await screen.findByText("恢 复(1)");
    fireEvent.click(secondCheckbox);

    fireEvent.click(await screen.findByText("恢 复(2)"));
    fireEvent.click(
      (await screen.findAllByText("恢 复", { exact: true }))
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]![0].input).toEqual({
      entries: [
        { id: "word-1", base_revision: 7, base_lifecycle_revision: 3 },
        { id: "word-2", base_revision: 11, base_lifecycle_revision: 5 }
      ]
    });
  });

  it("批量预取期间 selection 变化会失效旧 attempt 且不发送隐藏恢复", async () => {
    const first = archivedWord("word-1", "first");
    let resolveGet!: (value: unknown) => void;
    dataSourceMocks.getAny.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGet = resolve;
        })
    );
    const mutateAsync = vi.fn();
    apiMocks.useRestoreWordsBatch.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [first],
        page: { page: 1, page_size: 20, total: 1 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    const { container } = render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    const checkbox = container.querySelector("tbody input[type='checkbox']")!;
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("恢 复(1)"));
    fireEvent.click(
      (await screen.findAllByText("恢 复", { exact: true }))
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );
    await waitFor(() =>
      expect(dataSourceMocks.getAny).toHaveBeenCalledTimes(1)
    );

    fireEvent.click(checkbox);
    await act(async () => resolveGet({ word: first }));
    await waitFor(() => expect(screen.queryByText("恢 复(1)")).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("恢复前需要确认同名公开范围")).toBeNull();
  });
});
