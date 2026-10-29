import {
  act,
  fireEvent,
  render as testingLibraryRender,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { App as AntApp, ConfigProvider } from "antd";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdminWordListItemAny,
  AdminWordListQuery,
  AdminWordListItemV3
} from "@tsz/types";

const apiMocks = vi.hoisted(() => ({
  useArchiveWord: vi.fn(),
  useArchiveWordsBatch: vi.fn(),
  useDeleteWordDraft: vi.fn(),
  useDeleteWordBatch: vi.fn(),
  useRestoreWord: vi.fn(),
  useRestoreWordsBatch: vi.fn(),
  useWordList: vi.fn(),
  useWordStats: vi.fn(),
  useWordCreators: vi.fn()
}));

const catalogMocks = vi.hoisted(() => ({
  items: [] as Array<Record<string, unknown>>
}));

const dataSourceMocks = vi.hoisted(() => ({
  get: vi.fn(),
  archiveImpact: vi.fn()
}));

const authMocks = vi.hoisted(() => ({
  profile: { id: "admin-1", role: "super_admin" } as {
    id: string;
    role: string;
    permissions?: string[];
  } | null
}));

vi.mock("./api", () => ({
  ...apiMocks,
  useArchiveWord: apiMocks.useArchiveWord,
  useArchiveWordsBatch: apiMocks.useArchiveWordsBatch,
  useRestoreWord: apiMocks.useRestoreWord,
  useRestoreWordsBatch: apiMocks.useRestoreWordsBatch
}));

vi.mock("./dataSource", () => ({
  adminWordsDataSource: {
    get: dataSourceMocks.get,
    archiveImpact: dataSourceMocks.archiveImpact
  },
  adminWordsDataSourceCapabilities: {
    archive: true,
    batchArchive: true,
    permanentDelete: true,
    batchPermanentDelete: true,
    dialectVariantSuggestions: true,
    phraseCreation: true
  }
}));

vi.mock("@/lib/auth", () => ({
  useAuthStore: (selector: (state: unknown) => unknown) =>
    selector({ profile: authMocks.profile })
}));

vi.mock("./part-of-speech/api", () => ({
  usePartOfSpeechCatalog: () => ({
    data: { catalog_version: 1, items: catalogMocks.items },
    isError: false,
    isPending: false,
    refetch: vi.fn()
  })
}));

vi.mock("./BatchPublicationModal", () => ({
  BatchPublicationModal: ({
    rows,
    onClose,
    onPublished
  }: {
    rows: AdminWordListItemAny[];
    onClose: () => void;
    onPublished: () => void;
  }) => (
    <div data-testid="batch-audio-review">
      {rows.map((row) => (
        <span key={row.id}>{`${row.id}:${row.revision}`}</span>
      ))}
      <button onClick={onClose}>关闭批次审听</button>
      <button onClick={onPublished}>完成批次发布</button>
    </div>
  )
}));

import { SmartDictionary } from "./SmartDictionary";

function render(ui: Parameters<typeof testingLibraryRender>[0]) {
  return testingLibraryRender(ui, {
    wrapper: ({ children }) => (
      <ConfigProvider theme={{ token: { motion: false } }}>
        {children}
      </ConfigProvider>
    )
  });
}

/** 列表默认行：产品只剩 V3，默认 fixture 就按 V3 出。 */
function word(id: string, headword: string): AdminWordListItemV3 {
  return {
    annotation_visible: false,
    schema_version: 3,
    id,
    kind: "word",
    presentation: {
      label: headword,
      matched_surfaces: [headword],
      strategy_version: "surface_summary_v1"
    },
    dialects: ["common"],
    gloss: "释义",
    pos_list: ["noun"],
    levels: ["A1"],
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    annotation: null,
    annotation_revision: 1,
    max_reachable_step: "basics",
    has_unpublished_changes: false,
    created_by_name: "Admin",
    created_by: "admin-1",
    reference_summary: { total: 0, previews: [], truncated: false },
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z"
  };
}

function v3Word(
  id: string,
  label: string,
  strategyVersion = "future_strategy_9"
): AdminWordListItemV3 {
  return {
    annotation_visible: false,
    schema_version: 3,
    id,
    kind: "word",
    presentation: {
      label,
      matched_surfaces: ["surface-not-used-as-label"],
      strategy_version: strategyVersion
    },
    dialects: ["uk", "us"],
    gloss: "V3 释义",
    pos_list: ["noun"],
    levels: ["X9"],
    status: "draft",
    revision: 3,
    lifecycle_revision: 2,
    annotation: null,
    annotation_revision: 1,
    max_reachable_step: "forms",
    has_unpublished_changes: false,
    created_by_name: "Admin",
    created_by: "admin-1",
    reference_summary: { total: 0, previews: [], truncated: false },
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

function archivedWord(id: string, headword: string): AdminWordListItemV3 {
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

async function openRowActions(
  name: string,
  scope: HTMLElement = document.body
) {
  const trigger = within(scope).getByLabelText(`更多操作「${name}」`);
  fireEvent.mouseEnter(trigger);
  return waitFor(() => {
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const menu = document.querySelector<HTMLElement>(
      '.word-list-action-menu:not(.ant-dropdown-hidden) [role="menu"]'
    );
    expect(menu).toBeVisible();
    return within(menu!);
  });
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

function HistoryProbe() {
  const navigate = useNavigate();
  return (
    <button data-testid="history-back" onClick={() => navigate(-1)}>
      back
    </button>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dataSourceMocks.get.mockReset().mockResolvedValue(undefined);
  dataSourceMocks.archiveImpact
    .mockReset()
    .mockResolvedValue({ wordlist_count: 0, active_run_count: 0 });
  authMocks.profile = { id: "admin-1", role: "super_admin" };
  catalogMocks.items = [];
  for (const hook of [
    apiMocks.useArchiveWord,
    apiMocks.useArchiveWordsBatch,
    apiMocks.useDeleteWordDraft,
    apiMocks.useDeleteWordBatch,
    apiMocks.useRestoreWord,
    apiMocks.useRestoreWordsBatch
  ]) {
    hook.mockReturnValue(idleMutation());
  }
  apiMocks.useWordCreators.mockReturnValue({
    data: [
      { id: "01991111-2222-7333-8444-555566667777", display_name: "甲管理员" }
    ],
    isPending: false,
    isError: false,
    refetch: vi.fn()
  });
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
  it("主搜索常驻，更多筛选按顺序展开且收起后保留创建人条件", async () => {
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
          <LocationProbe />
        </MemoryRouter>
      </AntApp>
    );
    const headword = screen.getByLabelText("词条");
    expect(headword).toBeVisible();
    expect(screen.getByLabelText("词义")).toBeVisible();
    const toggle = screen.getByRole("button", { name: /更多筛选/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    const panel = document.getElementById(
      toggle.getAttribute("aria-controls")!
    )!;
    expect(
      Array.from(panel.querySelectorAll("label")).map(
        (label) => label.textContent
      )
    ).toEqual([
      "词条类型",
      "基本词性",
      "词义难度",
      "词条状态",
      "创建人",
      "创建时间"
    ]);
    fireEvent.change(headword, { target: { value: "alpha" } });
    fireEvent.mouseDown(
      screen.getByLabelText("创建人").closest(".ant-select")!
    );
    fireEvent.click(await screen.findByText("甲管理员"));
    fireEvent.click(screen.getByRole("button", { name: /收起筛选/ }));
    expect(panel).not.toBeVisible();
    fireEvent.submit(headword.closest("form")!);
    await waitFor(() =>
      expect(apiMocks.useWordList).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 20,
        headword: "alpha",
        created_by: "01991111-2222-7333-8444-555566667777"
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId("location").textContent).toContain(
        "created_by=01991111-2222-7333-8444-555566667777"
      )
    );
    expect(panel).not.toBeVisible();
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(screen.getByRole("button", { name: /重置/ }));
    await waitFor(() =>
      expect(apiMocks.useWordList).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 20
      })
    );
    expect(screen.getByLabelText("词条")).toHaveValue("");
  });

  it.each([false, true])(
    "创建人加载失败时仍可单独清除已有条件，保留其他筛选（有缓存：%s）",
    async (hasCachedCreators) => {
      const refetch = vi.fn();
      apiMocks.useWordCreators.mockReturnValue({
        data: hasCachedCreators
          ? [
              {
                id: "01991111-2222-7333-8444-555566667777",
                display_name: "甲管理员"
              }
            ]
          : undefined,
        isPending: false,
        isError: true,
        refetch
      });
      render(
        <AntApp>
          <MemoryRouter
            initialEntries={[
              "/words?headword=alpha&gloss=测试&status=published&created_by=01991111-2222-7333-8444-555566667777"
            ]}
          >
            <SmartDictionary />
            <LocationProbe />
          </MemoryRouter>
        </AntApp>
      );
      const creator = screen.getByLabelText("创建人");
      expect(creator).not.toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "重新加载创建人" }));
      expect(refetch).toHaveBeenCalledOnce();
      fireEvent.click(
        creator.closest(".ant-select")!.querySelector(".ant-select-clear")!
      );
      fireEvent.submit(screen.getByLabelText("词条").closest("form")!);
      await waitFor(() => {
        expect(apiMocks.useWordList).toHaveBeenLastCalledWith({
          page: 1,
          page_size: 20,
          headword: "alpha",
          gloss: "测试",
          status: "published"
        });
        expect(screen.getByTestId("location").textContent).not.toContain(
          "created_by="
        );
      });
      expect(screen.getByLabelText("词条")).toHaveValue("alpha");
      expect(screen.getByLabelText("词义")).toHaveValue("测试");
    }
  );

  it("词名保留完整上标和编辑入口，悬停不显示气泡", async () => {
    const annotated = {
      ...v3Word("entry", "center"),
      annotation_visible: true,
      annotation: "00123456789012345678"
    };
    apiMocks.useWordList.mockReturnValue({
      data: { words: [annotated], page: { page: 1, page_size: 20, total: 1 } },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter initialEntries={["/words?keyword=center"]}>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    const annotation = screen.getByText("00123456789012345678");
    expect(annotation.tagName).toBe("SUP");
    await act(async () => {
      fireEvent.mouseEnter(annotation.parentElement!);
      await new Promise((resolve) => setTimeout(resolve, 200));
    });
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(annotation.previousElementSibling).toHaveTextContent("center");
    const actions = await openRowActions("center");
    expect(
      actions.getByRole("menuitem", { name: "编辑标注「center」" })
    ).toBeVisible();
  });

  it("服务端标志隐藏上标，刷新可恢复且不依据当前页数量", async () => {
    const item = {
      ...v3Word("entry", "center"),
      annotation: "007",
      annotation_visible: false
    };
    const list = () => ({
      data: { words: [item], page: { page: 1, page_size: 20, total: 1 } },
      isPending: false,
      isError: false
    });
    apiMocks.useWordList.mockImplementation(list);
    const view = () => (
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    const rendered = render(view());
    expect(screen.queryByText("007")).not.toBeInTheDocument();
    // 入口跟着角标走：没角标就没得改，否则会出现「能改一个看不见的标注」。
    const actions = await openRowActions("center");
    expect(
      actions.queryByRole("menuitem", { name: "编辑标注「center」" })
    ).not.toBeInTheDocument();
    item.annotation_visible = true;
    rendered.rerender(view());
    expect(screen.getByText("007").tagName).toBe("SUP");
    expect(
      actions.getByRole("menuitem", { name: "编辑标注「center」" })
    ).toBeVisible();
    expect(item.annotation).toBe("007");
  });

  it("重复原型的未标注词条提供列表编辑入口", async () => {
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [{ ...v3Word("entry", "center"), annotation_visible: true }],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    const actions = await openRowActions("center");
    expect(
      actions.getByRole("menuitem", { name: "编辑标注「center」" })
    ).toBeVisible();
  });

  it("普通管理员可见他人词条角标，但不给标注编辑入口", async () => {
    authMocks.profile = { id: "admin-1", role: "admin" };
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...v3Word("entry", "center"),
            annotation_visible: true,
            annotation: "007",
            created_by: "admin-2",
            created_by_name: "别人"
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    // 角标是「这张列表里还有没有同词面的另一行」，与归属无关，一律显示；
    // 能不能改才看归属。
    expect(screen.getByText("007").tagName).toBe("SUP");
    const actions = await openRowActions("center");
    expect(
      actions.queryByRole("menuitem", { name: "编辑标注「center」" })
    ).not.toBeInTheDocument();
  });

  it("普通管理员的草稿行入口为查看，归档菜单说明禁用原因且不发请求", async () => {
    authMocks.profile = { id: "admin-1", role: "admin" };
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [{ ...v3Word("entry", "center"), created_by: "admin-2" }],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    expect(screen.getByLabelText("查看「center」")).toBeVisible();
    expect(screen.queryByLabelText("继续创建「center」")).toBeNull();
    const actions = await openRowActions("center");
    const archive = actions
      .getByLabelText("移入垃圾桶「center」")
      .closest('[role="menuitem"]')!;
    expect(archive).toHaveAttribute("aria-disabled", "true");
    expect(archive).toHaveTextContent(/^移入垃圾桶$/);
    fireEvent.mouseEnter(actions.getByLabelText("移入垃圾桶「center」"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "需要相应的归档或恢复权限；普通管理员仅可操作本人词条"
    );
    fireEvent.click(archive);
    expect(dataSourceMocks.archiveImpact).not.toHaveBeenCalled();
    expect(apiMocks.useArchiveWord().mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.queryByText("移入垃圾桶「center」？")
    ).not.toBeInTheDocument();
  });

  it("更多操作无需点击即可悬停展开，继续创建保留直接入口", async () => {
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [v3Word("entry", "center")],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    expect(screen.getByLabelText("继续创建「center」")).toBeVisible();
    const trigger = screen.getByLabelText("更多操作「center」");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByLabelText("移入垃圾桶「center」")).toBeNull();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    const actions = await openRowActions("center");
    const archive = actions
      .getByLabelText("移入垃圾桶「center」")
      .closest('[role="menuitem"]')!;
    expect(archive).not.toHaveAttribute("aria-disabled", "true");
    expect(archive).toHaveTextContent(/^移入垃圾桶$/);
    fireEvent.click(archive);
    expect(
      (await screen.findAllByText("移入垃圾桶「center」？")).at(-1)
    ).toBeInTheDocument();
    expect(dataSourceMocks.archiveImpact).toHaveBeenCalledWith({
      entries: [{ id: "entry", base_revision: 3, base_lifecycle_revision: 2 }]
    });
  });

  it("普通管理员不能编辑已发布词条，无发布权不能归档", async () => {
    authMocks.profile = { id: "admin-1", role: "admin" };
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...v3Word("entry", "center"),
            created_by: "admin-2",
            status: "published",
            published_revision: 3
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    const actions = await openRowActions("center");
    expect(
      actions
        .getByLabelText("移入垃圾桶「center」")
        .closest('[role="menuitem"]')!
    ).toHaveAttribute("aria-disabled", "true");
  });

  it("普通管理员归档按钮按独立归档权限显示，不借编辑或发布权限", async () => {
    authMocks.profile = {
      id: "admin-1",
      role: "admin",
      permissions: ["words.access", "words.archive"]
    };
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...v3Word("entry", "center"),
            status: "published",
            published_revision: 3
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    const actions = await openRowActions("center");
    const archive = actions
      .getByLabelText("移入垃圾桶「center」")
      .closest('[role="menuitem"]')!;
    expect(archive).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByLabelText("编辑「center」")).toBeNull();
    expect(archive).toHaveTextContent(/^移入垃圾桶$/);
    expect(archive).not.toHaveTextContent("仅有读取权限");
  });

  it("超管对他人创建的词条也有标注编辑入口", async () => {
    authMocks.profile = { id: "admin-9", role: "super_admin" };
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...v3Word("entry", "center"),
            annotation_visible: true,
            annotation: "007",
            created_by: "admin-2"
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    const actions = await openRowActions("center");
    expect(
      actions.getByRole("menuitem", { name: "编辑标注「center」" })
    ).toBeVisible();
  });

  it("拿不到当前管理员身份时不给标注编辑入口", async () => {
    authMocks.profile = null;
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...v3Word("entry", "center"),
            annotation_visible: true,
            annotation: "007"
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );
    expect(screen.getByText("007").tagName).toBe("SUP");
    const actions = await openRowActions("center");
    expect(
      actions.queryByRole("menuitem", { name: "编辑标注「center」" })
    ).not.toBeInTheDocument();
  });

  it("同页展示短语与单词，V3 只使用 presentation.label 且可进入独立路由", () => {
    matchViewport(1440);
    const legacy = {
      ...v3Word(
        "01a042f8-6c7d-7401-beca-ac149624e7c1",
        "短语展示名",
        "surface_summary_v1"
      ),
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

    expect(screen.getByText("短语展示名")).toBeVisible();
    expect(screen.queryByText("BrE")).toBeNull();
    expect(screen.getByText("服务端 V3 展示名")).toBeVisible();
    expect(screen.queryByText("surface-not-used-as-label")).toBeNull();
    expect(reportUnknownPresentationStrategy).toHaveBeenCalledTimes(1);
    expect(reportUnknownPresentationStrategy).toHaveBeenCalledWith({
      entry_id: "v3-entry-12345678",
      strategy_version: "future_strategy_9"
    });
    const v3Row = screen.getByText("服务端 V3 展示名").closest("tr")!;
    expect(v3Row.querySelectorAll("[data-spelling-dialect]")).toHaveLength(0);
    expect(v3Row).toHaveTextContent("X9");
    fireEvent.click(v3Row.querySelector("td:last-child button")!);
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/words/v3-entry-12345678/v3/wizard/forms"
    );
  });

  it.each([undefined, "trash"] as const)(
    "列表 %s 使用结构化名称并保留每侧标注、圆点及行操作",
    async (mode) => {
      matchViewport(1440);
      const row: AdminWordListItemV3 = {
        ...word("regional", "legacy label"),
        status: mode === "trash" ? "archived" : "draft",
        annotation: "义项",
        annotation_visible: true,
        name_variants: [
          { text: "cosy", dialects: ["uk"] },
          { text: "cozy", dialects: ["us"] },
          { text: "same", dialects: ["uk", "us"] }
        ]
      };
      apiMocks.useWordList.mockReturnValue({
        data: { words: [row], page: { page: 1, page_size: 20, total: 1 } },
        isPending: false,
        isError: false
      });
      render(
        <MemoryRouter>
          <AntApp>
            <SmartDictionary mode={mode} />
          </AntApp>
        </MemoryRouter>
      );
      const cells = screen
        .getByText("cosy")
        .closest("tr")!
        .querySelectorAll("td");
      const names = [...cells[1]!.querySelectorAll(".word-list-name")];
      expect(
        names.map((name) => name.querySelector(".tsz-words")?.textContent)
      ).toEqual(["cosy", "cozy", "same"]);
      expect(
        names.map((name) =>
          [...name.querySelectorAll("[data-spelling-dialect]")].map((dot) =>
            dot.getAttribute("data-spelling-dialect")
          )
        )
      ).toEqual([["uk"], ["us"], ["uk", "us"]]);
      expect(
        names.map((name) => name.querySelector("sup")?.textContent)
      ).toEqual(["义项", "义项", "义项"]);
      expect(cells[cells.length - 1]!.querySelector("button")).toBeEnabled();
      expect(screen.queryByText("legacy label")).toBeNull();
      const action = mode === "trash" ? "永久删除" : "移入垃圾桶";
      const actions = await openRowActions("cosy / cozy / same");
      fireEvent.click(
        actions
          .getByLabelText(`${action}「cosy / cozy / same」`)
          .closest('[role="menuitem"]')!
      );
      expect(
        (await screen.findAllByText(`${action}「cosy / cozy / same」？`)).at(-1)
      ).toBeInTheDocument();
      expect(screen.queryByText(`${action}「legacy label」？`)).toBeNull();
    }
  );

  it("通用拼写不加点，基本词性显示英文缩写且只斜体字母", () => {
    matchViewport(1440);
    catalogMocks.items = [
      {
        id: "pos-adjective",
        code: "adjective",
        abbreviation: "adj.",
        sort_order: 1,
        sub_parts: []
      },
      {
        id: "pos-noun",
        code: "noun",
        abbreviation: "n.",
        sort_order: 2,
        sub_parts: []
      }
    ];
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...word("entry", "hot"),
            name_variants: [{ text: "hot", dialects: ["common", "uk", "us"] }],
            pos_list: ["adjective", "noun", "unknown-pos"]
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );

    const cells = screen.getByText("hot").closest("tr")!.querySelectorAll("td");
    expect(cells[1]!.querySelectorAll("[data-spelling-dialect]")).toHaveLength(
      0
    );
    // 点号不在斜体里；目录里没有的编码原样显示、不斜体。
    expect(cells[4]).toHaveTextContent("adj.n.unknown-pos");
    expect(
      [...cells[4]!.querySelectorAll("i")].map((node) => node.textContent)
    ).toEqual(["adj", "n"]);
  });

  it("鼠标移到基本词性缩写上浮层显示正式中文，目录里没有的编码不出浮层", async () => {
    matchViewport(1440);
    catalogMocks.items = [
      {
        id: "pos-adverb",
        code: "adverb",
        name_zh: "副词",
        // 与正式中文刻意不同，防止误用简洁显示。
        short_name_zh: "副",
        abbreviation: "adv.",
        sort_order: 1,
        sub_parts: []
      }
    ];
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...word("entry", "fast"),
            pos_list: ["unknown-pos", "adverb"]
          }
        ],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      isError: false
    });
    render(
      <AntApp>
        <MemoryRouter>
          <SmartDictionary />
        </MemoryRouter>
      </AntApp>
    );

    // 先悬停未知编码：它若也挂了浮层，会与下面等到的那个一起出现。
    fireEvent.mouseEnter(screen.getByText("unknown-pos"));
    fireEvent.mouseEnter(screen.getByText("adv").closest(".ant-tag")!);
    expect(await screen.findByRole("tooltip")).toHaveTextContent(/^副词$/);
    expect(document.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
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

  it("三条列表显示服务端 label 与统计，不暴露内部 ID 或 strategy code", () => {
    matchViewport(1440);
    const emptyV3 = v3Word(
      "01a042f8-6c7d-7401-beca-ac149624e7b1",
      "未命名词条 · 01a042f8",
      "short_uuid_v1"
    );
    const nativeV3 = v3Word(
      "01a042f8-6c7d-7401-beca-ac149624e7b2",
      "native surface",
      "surface_summary_v1"
    );
    const migratedV3 = v3Word(
      "01a042f8-6c7d-7401-beca-ac149624e7b3",
      "legacy bridge",
      "legacy_headwords_v1"
    );
    const rows = [emptyV3, nativeV3, migratedV3];
    const reportUnknownPresentationStrategy = vi.fn();
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: rows,
        page: { page: 1, page_size: 20, total: 3 }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    apiMocks.useWordStats.mockReturnValue({
      data: { total: 3, today: 2, month: 4 }
    });

    const { container } = render(
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

    expect(
      container.querySelectorAll(".ant-table-tbody > tr.ant-table-row")
    ).toHaveLength(3);
    expect(screen.getByText("累计智能词条:").parentElement).toHaveTextContent(
      "累计智能词条:3"
    );
    expect(screen.getByText("今日创编:").parentElement).toHaveTextContent(
      "今日创编:2"
    );
    expect(screen.getByText("本月创编:").parentElement).toHaveTextContent(
      "本月创编:4"
    );
    for (const label of [
      "未命名词条 · 01a042f8",
      "native surface",
      "legacy bridge"
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
    expect(reportUnknownPresentationStrategy).not.toHaveBeenCalled();
    const userFacingAttributes = Array.from(
      container.querySelectorAll<HTMLElement>("[aria-label], [title]")
    )
      .flatMap((element) => [
        element.getAttribute("aria-label"),
        element.getAttribute("title")
      ])
      .filter((value): value is string => value !== null)
      .join(" ");
    for (const row of rows) {
      expect(container).not.toHaveTextContent(row.id);
      expect(container).not.toHaveTextContent(row.id.slice(-8));
      expect(userFacingAttributes).not.toContain(row.id);
      expect(userFacingAttributes).not.toContain(row.id.slice(-8));
    }
    expect(container.innerHTML).not.toContain("short_uuid_v1");
    expect(container.innerHTML).not.toContain("surface_summary_v1");
    expect(container.innerHTML).not.toContain("legacy_headwords_v1");

    fireEvent.click(
      screen
        .getByText("未命名词条 · 01a042f8")
        .closest("tr")!
        .querySelector("td:last-child button")!
    );
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${emptyV3.id}/v3/wizard/forms`
    );
  });

  it("同名词条保留两行并按内部 ID 操作，但可见内容与可访问名称不暴露 ID", async () => {
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
    expect(screen.queryByText("a0a093e6")).toBeNull();
    expect(screen.queryByText("a0a093e7")).toBeNull();
    expect(screen.getByText("工作空间")).toBeVisible();
    expect(screen.getByText("协作空间")).toBeVisible();
    expect(screen.queryByText("BrE")).toBeNull();

    const secondRow = screen.getByText("协作空间").closest("tr")!;
    expect(
      within(secondRow).getByLabelText("继续创建「workspace」")
    ).toBeEnabled();
    const actions = await openRowActions("workspace", secondRow);
    // 未标注的行不提供标注入口（入口与角标同源）。
    expect(
      actions.queryByRole("menuitem", { name: "编辑标注「workspace」" })
    ).toBeNull();
    const trashAction = actions
      .getByLabelText("移入垃圾桶「workspace」")
      .closest('[role="menuitem"]')!;
    expect(trashAction.querySelector(".anticon-delete")).not.toBeNull();
    fireEvent.click(trashAction);
    fireEvent.click(
      (await screen.findAllByText("移入垃圾桶", { exact: true }))
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );
    await waitFor(() =>
      expect(mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ wordId: second.id })
      )
    );

    const firstRow = screen.getByText("工作空间").closest("tr")!;
    fireEvent.click(firstRow.querySelector("td:last-child button")!);
    expect(screen.getByTestId("location")).toHaveTextContent(first.id);
  });

  it("手机宽度只保留完整的词条与操作列", async () => {
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
      "词条名称",
      "操作"
    ]);
    expect(screen.getByText("继续创建").closest("button")).toBeEnabled();
    const actions = await openRowActions("first");
    expect(
      actions
        .getByLabelText("移入垃圾桶「first」")
        .closest('[role="menuitem"]')!
    ).not.toHaveAttribute("aria-disabled", "true");
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
    const creatorIndex = screen
      .getAllByRole("columnheader")
      .findIndex((header) => header.textContent === "创建人");
    const emptyRow = screen.getByText("empty-creator").closest("tr")!;
    const creatorPlaceholder = emptyRow.children[creatorIndex]!;
    expect(creatorPlaceholder).toHaveTextContent(/^-$/);
    expect(creatorPlaceholder.querySelector("[tabindex]")).toBeNull();
  });

  it("最后更新人独立于创建人，旧接口缺少姓名时不冒用创建人", async () => {
    matchViewport(1440);
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...word("collaborative", "collaborative"),
            created_by_name: "张老师",
            updated_by_name: "李老师"
          },
          { ...word("legacy", "legacy"), created_by_name: "王老师" }
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

    const headers = screen.getAllByRole("columnheader");
    const updaterIndex = headers.findIndex(
      (header) => header.textContent === "最后更新人"
    );
    const updatedRow = screen.getByText("collaborative").closest("tr")!;
    const legacyRow = screen.getByText("legacy").closest("tr")!;
    expect(updatedRow.children[updaterIndex]).toHaveTextContent("李老师");
    expect(updatedRow).toHaveTextContent("张老师");
    expect(legacyRow.children[updaterIndex]).toHaveTextContent(/^-$/);
    expect(legacyRow).toHaveTextContent("王老师");
    fireEvent.focus(screen.getByText("李老师"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent("李老师");
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
    expect(screen.getByLabelText("词条")).toHaveValue("center");
    expect(screen.getByText("垃圾桶")).toBeInTheDocument();
  });

  it("从深链恢复准确页码、每页数量和筛选查询", () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/words?keyword=center&status=published&page=3&page_size=50"
        ]}
      >
        <AntApp>
          <SmartDictionary />
        </AntApp>
        <LocationProbe />
      </MemoryRouter>
    );

    expect(apiMocks.useWordList).toHaveBeenCalledWith({
      page: 3,
      page_size: 50,
      q: "center",
      status: "published"
    });
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/words?keyword=center&status=published&page=3&page_size=50"
    );
  });

  it("用户分页与修改每页数量会写入 URL，并保留高级筛选的收起状态", async () => {
    apiMocks.useWordList.mockImplementation((query: AdminWordListQuery) => ({
      data: {
        words: [word("word-1", "first")],
        page: {
          page: query.page ?? 1,
          page_size: query.page_size ?? 20,
          total: 101
        }
      },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    }));
    const { container } = render(
      <MemoryRouter initialEntries={["/words?keyword=center&status=published"]}>
        <AntApp>
          <SmartDictionary />
        </AntApp>
        <LocationProbe />
      </MemoryRouter>
    );
    const toggle = screen.getByRole("button", { name: /收起筛选/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(container.querySelector(".ant-pagination-item-2")!);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words?keyword=center&status=published&page=2"
      )
    );
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.mouseDown(screen.getByRole("combobox", { name: "Page Size" }));
    const sizeOptions = await screen.findAllByRole("option");
    fireEvent.click(
      sizeOptions.find((option) => option.textContent?.includes("50"))!
    );
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words?keyword=center&status=published&page_size=50"
      );
      expect(apiMocks.useWordList).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 50,
        q: "center",
        status: "published"
      });
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
  });

  it("用户连续修改筛选后，后退逐步恢复上一筛选状态", async () => {
    render(
      <MemoryRouter initialEntries={["/words"]}>
        <AntApp>
          <SmartDictionary />
        </AntApp>
        <LocationProbe />
        <HistoryProbe />
      </MemoryRouter>
    );

    let keyword = screen.getByLabelText("词条");
    fireEvent.change(keyword, { target: { value: "center" } });
    fireEvent.submit(keyword.closest("form")!);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words?headword=center"
      )
    );
    await waitFor(() =>
      expect(screen.getByLabelText("词条")).toHaveValue("center")
    );
    keyword = screen.getByLabelText("词条");

    fireEvent.change(keyword, { target: { value: "harbour" } });
    expect(keyword).toHaveValue("harbour");
    fireEvent.submit(keyword.closest("form")!);
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words?headword=harbour"
      )
    );

    fireEvent.click(screen.getByTestId("history-back"));
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words?headword=center"
      );
      expect(screen.getByLabelText("词条")).toHaveValue("center");
      expect(apiMocks.useWordList).toHaveBeenLastCalledWith({
        page: 1,
        page_size: 20,
        headword: "center"
      });
    });
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
      expect(screen.getByLabelText("词条")).toHaveValue("");
      expect(screen.queryByText("垃圾桶")).toBeNull();
      expect(screen.getByTestId("location")).toHaveTextContent("/words");
    });
  });

  it("翻页保留选择和版本，集中审听关闭后保留选择、发布后清空", async () => {
    const { container } = render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    expect(screen.getByText("first")).toBeInTheDocument();
    expect(screen.queryByText("发布所选")).not.toBeInTheDocument();
    const firstRowCheckbox = container.querySelector(
      "tbody input[type='checkbox']"
    );
    expect(firstRowCheckbox).not.toBeNull();
    fireEvent.click(firstRowCheckbox!);
    const batchButton = screen.getByText("移入垃圾桶(1)").closest("button");
    expect(batchButton).not.toBeNull();
    expect(batchButton!.querySelector(".anticon-delete")).not.toBeNull();

    fireEvent.click(container.querySelector(".ant-pagination-item-2")!);

    await waitFor(() => {
      expect(screen.getByText("second")).toBeInTheDocument();
      expect(screen.getByText("移入垃圾桶(1)")).toBeInTheDocument();
    });
    expect(batchButton).not.toBeDisabled();
    expect(screen.queryByText("发布所选")).not.toBeInTheDocument();
    fireEvent.click(container.querySelector("tbody input[type='checkbox']")!);
    fireEvent.click(screen.getByRole("button", { name: "批量审听与发布(2)" }));
    expect(screen.getByTestId("batch-audio-review")).toHaveTextContent(
      "word-1:1word-2:1"
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭批次审听" }));
    expect(screen.queryByTestId("batch-audio-review")).toBeNull();
    expect(
      screen.getByRole("button", { name: "批量审听与发布(2)" })
    ).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "批量审听与发布(2)" }));
    fireEvent.click(screen.getByRole("button", { name: "完成批次发布" }));
    expect(screen.queryByTestId("batch-audio-review")).toBeNull();
    expect(
      screen.getByRole("button", { name: "批量审听与发布" })
    ).toBeDisabled();
  });

  it("混选无发布权限的归属词条时禁止打开批次审听", () => {
    authMocks.profile = {
      id: "admin-1",
      role: "admin",
      permissions: ["words.access", "words.publish"]
    };
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          word("own", "own"),
          { ...word("other", "other"), created_by: "admin-2" }
        ],
        page: { page: 1, page_size: 20, total: 2 }
      },
      isPending: false,
      isError: false,
      refetch: vi.fn()
    });
    const { container } = render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    fireEvent.click(container.querySelector("thead input[type='checkbox']")!);
    expect(
      screen.getByRole("button", { name: "批量审听与发布(2)" })
    ).toBeDisabled();
    expect(screen.queryByTestId("batch-audio-review")).toBeNull();
  });

  it("超过后端50词条批次上限时禁止打开批次审听", () => {
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: Array.from({ length: 51 }, (_, index) =>
          word(`word-${index}`, `word${index}`)
        ),
        page: { page: 1, page_size: 100, total: 51 }
      },
      isPending: false,
      isError: false,
      refetch: vi.fn()
    });
    const { container } = render(
      <MemoryRouter initialEntries={["/words?page_size=100"]}>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    fireEvent.click(container.querySelector("thead input[type='checkbox']")!);
    expect(
      screen.getByRole("button", { name: "批量审听与发布(51)" })
    ).toBeDisabled();
    expect(screen.queryByTestId("batch-audio-review")).toBeNull();
  });

  it("旧后端影响查询 404 时禁止归档，重试后显示影响并允许确认", async () => {
    const { HttpError } = await import("@tsz/api-client");
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ word: word("word-1", "first") });
    apiMocks.useArchiveWord.mockReturnValue({ ...idleMutation(), mutateAsync });
    let resolve!: (value: unknown) => void;
    dataSourceMocks.archiveImpact
      .mockRejectedValueOnce(new HttpError(404, "not found"))
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          })
      );
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    const actions = await openRowActions("first");
    fireEvent.click(
      actions
        .getByLabelText("移入垃圾桶「first」")
        .closest('[role="menuitem"]')!
    );
    await screen.findByText(/无法读取影响/);
    const confirm = screen
      .getAllByText("移入垃圾桶", { exact: true })
      .map((item) => item.closest("button"))
      .find((item) => item?.closest(".ant-modal"))!;
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mutateAsync).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText(/^重\s*试$/, { exact: true }));
    expect(confirm).toBeDisabled();
    await act(async () => resolve({ wordlist_count: 3, active_run_count: 2 }));
    await screen.findByText(/将使 3 张词表中的引用不可用，可能影响 2 轮/);
    expect(confirm).toBeEnabled();
    expect(dataSourceMocks.archiveImpact).toHaveBeenLastCalledWith({
      entries: [{ id: "word-1", base_revision: 1, base_lifecycle_revision: 1 }]
    });
    fireEvent.click(confirm);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledOnce());
  });

  it("影响预检版本冲突后刷新列表，重新确认使用新版本", async () => {
    const { HttpError } = await import("@tsz/api-client");
    let revision = 1;
    const refetch = vi.fn(async () => {
      revision = 2;
    });
    apiMocks.useWordList.mockImplementation(() => ({
      data: {
        words: [{ ...word("word-1", "first"), revision }],
        page: { page: 1, page_size: 20, total: 1 }
      },
      isPending: false,
      refetch
    }));
    dataSourceMocks.archiveImpact.mockRejectedValueOnce(
      new HttpError(409, "conflict", [], "revision_conflict")
    );
    const mutateAsync = vi.fn();
    apiMocks.useArchiveWord.mockReturnValue({ ...idleMutation(), mutateAsync });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    const actions = await openRowActions("first");
    fireEvent.click(
      actions
        .getByLabelText("移入垃圾桶「first」")
        .closest('[role="menuitem"]')!
    );
    await screen.findByText(/词条已发生变化/);
    expect(screen.queryByText(/^重\s*试$/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("刷新列表并重新确认"));
    await waitFor(() => expect(refetch).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    const refreshedActions = await openRowActions("first");
    fireEvent.click(
      refreshedActions
        .getByLabelText("移入垃圾桶「first」")
        .closest('[role="menuitem"]')!
    );
    await screen.findByText(/将使 0 张词表/);
    expect(dataSourceMocks.archiveImpact).toHaveBeenLastCalledWith({
      entries: [{ id: "word-1", base_revision: 2, base_lifecycle_revision: 1 }]
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("影响预检权限拒绝显示原因且不提供无效重试", async () => {
    const { HttpError } = await import("@tsz/api-client");
    dataSourceMocks.archiveImpact.mockRejectedValueOnce(
      new HttpError(403, "没有归档权限")
    );
    const mutateAsync = vi.fn();
    apiMocks.useArchiveWord.mockReturnValue({ ...idleMutation(), mutateAsync });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    const actions = await openRowActions("first");
    fireEvent.click(
      actions
        .getByLabelText("移入垃圾桶「first」")
        .closest('[role="menuitem"]')!
    );
    await screen.findByText("没有归档权限");
    expect(screen.queryByText(/^重\s*试$/)).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("取消影响查询后晚到的结果不会归档", async () => {
    let resolve!: (value: unknown) => void;
    dataSourceMocks.archiveImpact.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const mutateAsync = vi.fn();
    apiMocks.useArchiveWord.mockReturnValue({ ...idleMutation(), mutateAsync });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );
    const actions = await openRowActions("first");
    fireEvent.click(
      actions
        .getByLabelText("移入垃圾桶「first」")
        .closest('[role="menuitem"]')!
    );
    await screen.findByText("正在检查词表和练习的影响…");
    fireEvent.click(screen.getByText(/取\s*消/, { exact: true }));
    await act(async () => resolve({ wordlist_count: 3, active_run_count: 2 }));
    await waitFor(() =>
      expect(screen.queryByText(/将使 3 张词表/)).not.toBeInTheDocument()
    );
    expect(mutateAsync).not.toHaveBeenCalled();
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

    const actions = await openRowActions("first");
    const rowArchive = actions
      .getByLabelText("移入垃圾桶「first」")
      .closest('[role="menuitem"]')!;
    fireEvent.click(rowArchive);
    await screen.findAllByText("移入垃圾桶「first」？");
    const confirm = screen
      .getAllByText("移入垃圾桶", { exact: true })
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

  it.each(["archive", "delete"] as const)(
    "%s 请求 pending 时菜单项禁用并显示进度，重复点击不再执行",
    async (action) => {
      const mutateAsync = vi.fn();
      const mutation = {
        ...idleMutation(),
        isPending: true,
        variables: { wordId: "word-1" },
        mutateAsync
      };
      const deleting = action === "delete";
      (deleting
        ? apiMocks.useDeleteWordDraft
        : apiMocks.useArchiveWord
      ).mockReturnValue(mutation);
      apiMocks.useWordList.mockReturnValue({
        data: {
          words: [
            deleting ? archivedWord("word-1", "first") : word("word-1", "first")
          ],
          page: { page: 1, page_size: 20, total: 1 }
        },
        isPending: false,
        isError: false
      });
      render(
        <MemoryRouter>
          <AntApp>
            <SmartDictionary />
          </AntApp>
        </MemoryRouter>
      );

      const actions = await openRowActions("first");
      const label = deleting ? "永久删除" : "移入垃圾桶";
      const item = actions
        .getByLabelText(`${label}「first」`)
        .closest<HTMLElement>('[role="menuitem"]')!;
      expect(item).toHaveAttribute("aria-disabled", "true");
      expect(within(item).getByRole("img", { name: "loading" })).toBeVisible();
      fireEvent.click(item);
      fireEvent.click(item);
      expect(mutateAsync).not.toHaveBeenCalled();
      expect(dataSourceMocks.archiveImpact).not.toHaveBeenCalled();
      expect(screen.queryByText(`${label}「first」？`)).not.toBeInTheDocument();
    }
  );

  it("批量归档失败保留选择，再次确认成功后清空选择", async () => {
    let resolveImpact!: (impact: {
      wordlist_count: number;
      active_run_count: number;
    }) => void;
    dataSourceMocks.archiveImpact.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveImpact = resolve;
        })
    );
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

    fireEvent.click(screen.getByText("移入垃圾桶(1)"));
    const confirm = (await screen.findAllByText("移入垃圾桶", { exact: true }))
      .map((item) => item.closest("button"))
      .find((item) => item?.closest(".ant-modal"))!;
    expect(confirm).toBeDisabled();
    fireEvent.click(confirm);
    expect(mutateAsync).not.toHaveBeenCalled();
    await act(async () =>
      resolveImpact({ wordlist_count: 0, active_run_count: 0 })
    );
    await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm);
    expect(await screen.findByText("引用冲突")).toBeInTheDocument();
    expect(screen.getByText("移入垃圾桶(1)")).toBeInTheDocument();

    fireEvent.click(screen.getByText("移入垃圾桶(1)"));
    const retryConfirm = (
      await screen.findAllByText("移入垃圾桶", { exact: true })
    )
      .map((item) => item.closest("button"))
      .filter((item) => item?.closest(".ant-modal"))
      .at(-1)!;
    await waitFor(() => expect(retryConfirm).toBeEnabled());
    fireEvent.click(retryConfirm);
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
    await waitFor(() => expect(screen.queryByText("移入垃圾桶(1)")).toBeNull());
  });

  it("归档行恢复优先且保留查看路由，单条恢复携带双 revision", async () => {
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
        <LocationProbe />
      </MemoryRouter>
    );

    const rowRestore = screen.getByLabelText("恢复「first」");
    const rowActions = rowRestore.closest("td")!;
    expect(
      [...rowActions.querySelectorAll("button")].map((button) =>
        button.getAttribute("aria-label")
      )
    ).toEqual(["恢复「first」", "查看「first」", "更多操作「first」"]);
    expect(rowRestore).toHaveTextContent(/^恢复$/);
    const actions = await openRowActions("first");
    expect(actions.queryByLabelText("移入垃圾桶「first」")).toBeNull();
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
    fireEvent.click(within(rowActions).getByLabelText("查看「first」"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/words/word-1/v3/wizard/basics"
    );
  });

  it("引用列显示计数，点击展开被谁引用", async () => {
    matchViewport(1440);
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...archivedWord("word-1", "referenced"),
            reference_summary: {
              total: 7,
              previews: [
                {
                  source_word_id: "src-1",
                  source_headword: "holiday",
                  source_status: "published",
                  source_kind: "relation"
                },
                {
                  source_word_id: "src-2",
                  source_headword: "take off",
                  source_status: "draft",
                  source_kind: "phrase_component"
                }
              ],
              truncated: true
            }
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

    const trigger = screen.getByLabelText("查看「referenced」的 7 处关联");
    fireEvent.click(trigger);

    await screen.findByText("以下内容关联了此词条");
    expect(screen.getByText("holiday")).toBeInTheDocument();
    expect(screen.getByText("take off")).toBeInTheDocument();
    // 来源类型要能区分「被短语当成分」和「被设为关联词」。
    expect(screen.getByText(/关联词/)).toBeInTheDocument();
    expect(screen.getByText(/短语成分/)).toBeInTheDocument();
    expect(screen.getByText(/共 7 条，仅显示前 2 条/)).toBeInTheDocument();
  });

  it("被引用的词条不可永久删除，且说明原因", async () => {
    matchViewport(1440);
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          {
            ...archivedWord("word-1", "referenced"),
            reference_summary: {
              total: 1,
              previews: [
                {
                  source_word_id: "src-1",
                  source_headword: "holiday",
                  source_status: "draft",
                  source_kind: "relation"
                }
              ],
              truncated: false
            }
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

    const actions = await openRowActions("referenced");
    const deletion = actions
      .getByLabelText("永久删除「referenced」")
      .closest('[role="menuitem"]')!;
    expect(deletion).toHaveAttribute("aria-disabled", "true");
    expect(deletion).toHaveTextContent(/^永久删除$/);
    fireEvent.mouseEnter(actions.getByLabelText("永久删除「referenced」"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "该词条与其他内容存在关联，解除所有关联后才能删除"
    );
    fireEvent.click(deletion);
    expect(apiMocks.useDeleteWordDraft().mutateAsync).not.toHaveBeenCalled();
    expect(
      screen.queryByText("永久删除「referenced」？")
    ).not.toBeInTheDocument();
  });

  it("垃圾桶模式固定归档、去掉状态筛选与创建入口", () => {
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
          <SmartDictionary mode="trash" />
        </AntApp>
      </MemoryRouter>
    );

    expect(screen.getByText("垃圾桶")).toBeInTheDocument();
    expect(screen.queryByLabelText("词条状态")).toBeNull();
    expect(screen.queryByText("创建词条")).toBeNull();
    // 垃圾桶里全是归档词条，批量动作恒为恢复，不该出现「移入垃圾桶」。
    expect(screen.queryByText("移入垃圾桶")).toBeNull();
    expect(
      screen
        .getAllByText("恢 复", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => !item?.classList.contains("ant-btn-link"))
    ).toBeTruthy();
    // 即使 URL 上没带 status，也必须只查归档。
    expect(apiMocks.useWordList).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" })
    );
  });

  it("垃圾桶模式忽略 URL 上残留的其他状态", () => {
    apiMocks.useWordList.mockReturnValue({
      data: { words: [], page: { page: 1, page_size: 20, total: 0 } },
      error: null,
      isError: false,
      isPending: false,
      refetch: vi.fn()
    });
    render(
      <MemoryRouter initialEntries={["/words/trash?status=draft"]}>
        <AntApp>
          <SmartDictionary mode="trash" />
        </AntApp>
      </MemoryRouter>
    );

    expect(apiMocks.useWordList).toHaveBeenCalledWith(
      expect.objectContaining({ status: "archived" })
    );
  });

  it("默认模式保留状态筛选与创建入口", () => {
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [word("word-1", "first")],
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

    expect(screen.getByText("智能词库")).toBeInTheDocument();
    expect(screen.getByLabelText("词条状态")).toBeInTheDocument();
    expect(screen.getByText("创建词条")).toBeInTheDocument();
  });

  it("垃圾桶行提供永久删除，确认后携带双 revision 调用", async () => {
    const mutateAsync = vi.fn().mockResolvedValue(undefined);
    apiMocks.useDeleteWordDraft.mockReturnValue({
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

    const actions = await openRowActions("first");
    const rowDelete = actions
      .getByLabelText("永久删除「first」")
      .closest('[role="menuitem"]')!;
    expect(rowDelete).not.toHaveAttribute("aria-disabled", "true");
    fireEvent.click(rowDelete);

    await screen.findAllByText("永久删除「first」？");
    fireEvent.click(
      screen
        .getAllByText("永久删除", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      wordId: "word-1",
      baseRevision: 1,
      baseLifecycleRevision: 1
    });
  });

  it("非垃圾桶行不出现永久删除入口", async () => {
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [word("word-1", "first")],
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

    const actions = await openRowActions("first");
    expect(actions.queryByLabelText("永久删除「first」")).toBeNull();
  });

  it("普通管理员对垃圾桶词条置灰永久删除且点击不发请求", async () => {
    authMocks.profile = { id: "admin-1", role: "admin" };
    const mutateAsync = vi.fn();
    apiMocks.useDeleteWordDraft.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [{ ...archivedWord("word-1", "first"), created_by: "admin-2" }],
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

    const actions = await openRowActions("first");
    const rowDelete = actions
      .getByLabelText("永久删除「first」")
      .closest('[role="menuitem"]')!;
    expect(rowDelete).toHaveAttribute("aria-disabled", "true");
    fireEvent.mouseEnter(actions.getByLabelText("永久删除「first」"));
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
      "当前账号仅有读取权限"
    );
    fireEvent.click(rowDelete);
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("永久删除「first」？")).not.toBeInTheDocument();
  });

  it("超管可以永久删除他人创建的垃圾桶词条", async () => {
    authMocks.profile = { id: "admin-9", role: "super_admin" };
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [{ ...archivedWord("word-1", "first"), created_by: "admin-2" }],
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

    const actions = await openRowActions("first");
    expect(
      actions.getByLabelText("永久删除「first」").closest('[role="menuitem"]')!
    ).not.toHaveAttribute("aria-disabled", "true");
  });

  it("批量永久删除提交每条双 revision，成功后清空选择", async () => {
    const mutateAsync = vi.fn().mockResolvedValue({ affected: 2 });
    apiMocks.useDeleteWordBatch.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          archivedWord("word-1", "first"),
          archivedWord("word-2", "second")
        ],
        page: { page: 1, page_size: 20, total: 2 }
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

    // 表头全选：逐个点行内 checkbox 时，第二次点击拿到的仍是未 flush 的受控 selectedRowKeys。
    fireEvent.click(container.querySelector("thead input[type='checkbox']")!);
    fireEvent.click(screen.getByText("永久删除(2)").closest("button")!);
    await screen.findAllByText("永久删除选中的 2 个词条？");
    fireEvent.click(
      screen
        .getAllByText("永久删除", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          entries: [
            { id: "word-1", base_revision: 1, base_lifecycle_revision: 1 },
            { id: "word-2", base_revision: 1, base_lifecycle_revision: 1 }
          ]
        }
      })
    );
    await waitFor(() => expect(screen.queryByText("永久删除(2)")).toBeNull());
  });

  it("普通管理员选择自己的和他人的词条都不能批量删除", async () => {
    authMocks.profile = { id: "admin-1", role: "admin" };
    const mutateAsync = vi.fn();
    apiMocks.useDeleteWordBatch.mockReturnValue({
      ...idleMutation(),
      mutateAsync
    });
    apiMocks.useWordList.mockReturnValue({
      data: {
        words: [
          archivedWord("word-1", "first"),
          { ...archivedWord("word-2", "second"), created_by: "admin-2" }
        ],
        page: { page: 1, page_size: 20, total: 2 }
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

    // 表头全选：逐个点行内 checkbox 时，第二次点击拿到的仍是未 flush 的受控 selectedRowKeys。
    fireEvent.click(container.querySelector("thead input[type='checkbox']")!);
    fireEvent.click(screen.getByText("永久删除(2)").closest("button")!);

    expect(screen.getByText("永久删除(2)").closest("button")).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("后端拒绝越权时给出与「不可删」不同的提示", async () => {
    const mutateAsync = vi.fn().mockRejectedValue(
      Object.assign(new Error("forbidden"), {
        code: "entry_delete_forbidden"
      })
    );
    apiMocks.useDeleteWordDraft.mockReturnValue({
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

    const actions = await openRowActions("first");
    fireEvent.click(
      actions.getByLabelText("永久删除「first」").closest('[role="menuitem"]')!
    );
    await screen.findAllByText("永久删除「first」？");
    fireEvent.click(
      screen
        .getAllByText("永久删除", { exact: true })
        .map((item) => item.closest("button"))
        .find((item) => item?.closest(".ant-modal"))!
    );

    await screen.findByText("只能永久删除自己创建的词条");
  });

  it("恢复 A 的 get 返回 B 时 fail closed 且不调用 restore", async () => {
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
    dataSourceMocks.get.mockResolvedValueOnce({
      word: archivedWord("word-2", "second")
    });
    render(
      <MemoryRouter>
        <AntApp>
          <SmartDictionary />
        </AntApp>
      </MemoryRouter>
    );

    const rowRestore = screen.getByLabelText("恢复「first」");
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
    expect(dataSourceMocks.get).toHaveBeenCalledWith("word-1");
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
      const rowRestore = screen.getByLabelText("恢复「first」");
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
    dataSourceMocks.get.mockImplementationOnce(
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
    await waitFor(() => expect(dataSourceMocks.get).toHaveBeenCalledTimes(1));

    fireEvent.click(checkbox);
    await act(async () => resolveGet({ word: first }));
    await waitFor(() => expect(screen.queryByText("恢 复(1)")).toBeNull());
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.queryByText("恢复前需要确认同名公开范围")).toBeNull();
  });
});
