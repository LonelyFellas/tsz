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
import type { AdminWordListItem, AdminWordListQuery } from "@tsz/types";

const apiMocks = vi.hoisted(() => ({
  useArchiveWord: vi.fn(),
  useArchiveWordsBatch: vi.fn(),
  useRestoreWord: vi.fn(),
  useRestoreWordsBatch: vi.fn(),
  useWordList: vi.fn(),
  useWordStats: vi.fn()
}));

vi.mock("./api", () => apiMocks);

vi.mock("./dataSource", () => ({
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

function word(id: string, headword: string): AdminWordListItem {
  return {
    schema_version: 2,
    id,
    headword,
    kind: "word",
    dialects: ["common"],
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

function archivedWord(id: string, headword: string): AdminWordListItem {
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
  it("同名词条保留两行并按各自 ID 查看和归档", async () => {
    matchViewport(1440);
    const first: AdminWordListItem = {
      ...word("01a00492-d889-71e0-a9a3-e053a0a093e6", "workspace"),
      dialects: ["common"],
      gloss: "工作空间"
    };
    const second: AdminWordListItem = {
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

    const secondRow = screen.getByText("a0a093e7").closest("tr")!;
    fireEvent.click(secondRow.querySelectorAll("td:last-child button")[1]!);
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

  it("翻页时清空当前页的批量选择", async () => {
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
      expect(screen.queryByText("归 档(1)")).toBeNull();
    });
    expect(batchButton).toBeDisabled();
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
});
