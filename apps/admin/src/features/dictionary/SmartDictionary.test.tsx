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
  useCreateWord: vi.fn(),
  useDeleteWord: vi.fn(),
  usePublishWord: vi.fn(),
  useRestoreWord: vi.fn(),
  useRestoreWordsBatch: vi.fn(),
  useWordList: vi.fn(),
  useWordStats: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  env: { WORD_CREATION_WIZARD: true }
}));

vi.mock("./api", () => apiMocks);

vi.mock("./dataSource", () => ({
  adminWordsDataSourceCapabilities: {
    archive: true,
    batchArchive: true,
    dialectVariantSuggestions: true,
    legacyEntryCreation: false,
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
  return <span data-testid="location">{useLocation().search}</span>;
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const hook of [
    apiMocks.useArchiveWord,
    apiMocks.useArchiveWordsBatch,
    apiMocks.useCreateWord,
    apiMocks.useDeleteWord,
    apiMocks.usePublishWord,
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
      expect(screen.getByTestId("location")).toHaveTextContent("");
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
