import { App as AntApp, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import type { AdminWordlist } from "@tsz/types";
import { browserQueryDefaults } from "@tsz/shared";
import { WordListsPage } from "./WordLists";
import { ReviewsPage } from "./Reviews";
const permissions = vi.hoisted(() => ({ allowed: true, access: true }));
vi.mock("@/lib/auth", () => ({
  usePermission: (key: string) =>
    key === "wordlists.access" ? permissions.access : permissions.allowed,
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ profile: { id: "admin", permission_version: 1 } }),
  api: {
    wordlists: {
      management: vi.fn(),
      reviews: vi.fn(),
      items: vi.fn(),
      currentItems: vi.fn(),
      decision: vi.fn(),
      visibility: vi.fn(),
      recommend: vi.fn(),
      deleteImpact: vi.fn(),
      delete: vi.fn(),
      customAudio: vi.fn().mockResolvedValue({ items: [] }),
      reviewCustomAudio: vi.fn().mockResolvedValue({ items: [] }),
      customAudioUrl: vi.fn(),
      reviewCustomAudioUrl: vi.fn()
    }
  }
}));
import { api } from "@/lib/auth";
const pagination = { page: 1, page_size: 20, total: 1, total_pages: 1 };
const row: AdminWordlist = {
  wordlist: {
    id: "list",
    owner_user_id: "author",
    owner_name: "作者",
    name: "待审词表",
    state: "draft",
    revision: 4,
    item_count: 1,
    created_at: "2026-10-12T00:00:00Z",
    updated_at: "2026-10-12T00:00:00Z"
  },
  review_state: "pending",
  recommended: false,
  tip_amount: "5"
};
function mount(page = <WordListsPage />, client?: QueryClient) {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          client ??
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <ConfigProvider locale={zhCN} theme={{ token: { motion: false } }}>
          <AntApp>{page}</AntApp>
        </ConfigProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  permissions.allowed = true;
  permissions.access = true;
  vi.mocked(api.wordlists.management).mockResolvedValue({
    items: [row],
    pagination
  });
  vi.mocked(api.wordlists.deleteImpact).mockResolvedValue({
    active_run_count: 2,
    active_task_count: 1,
    affected_user_count: 1,
    blocked_task_count: 1
  });
  vi.mocked(api.wordlists.currentItems).mockResolvedValue({
    items: [],
    revision: 4,
    pagination
  });
  vi.mocked(api.wordlists.items).mockResolvedValue({
    items: [],
    revision: 2,
    pagination
  });
  vi.mocked(api.wordlists.reviews).mockResolvedValue({
    withdraw_reason: null,
    items: [
      {
        id: "request",
        wordlist_id: "list",
        name: "提交名称",
        submitted_revision: 2,
        state: "pending",
        reason: null,
        created_at: "",
        decided_at: null
      }
    ]
  });
});
it.each([
  [true, "是"],
  [false, "否"],
  [undefined, "—"]
] as const)(
  "management renders custom-word presence %s as %s",
  async (value, label) => {
    vi.mocked(api.wordlists.management).mockResolvedValue({
      items: [{ ...row, has_custom_words: value }],
      pagination
    });
    mount();
    const cells = (await screen.findByText(row.wordlist.name))
      .closest("tr")!
      .querySelectorAll("td");
    expect(cells[3]).toHaveTextContent(label);
    expect(api.wordlists.management).toHaveBeenCalledWith(
      expect.objectContaining({ include_stats: true }),
      expect.objectContaining({ signal: expect.anything() })
    );
    expect(api.wordlists.currentItems).not.toHaveBeenCalled();
    expect(api.wordlists.items).not.toHaveBeenCalled();
    expect(api.wordlists.reviews).not.toHaveBeenCalled();
  }
);
it.each([
  [0, 0, "0", "0"],
  [12, 7, "12", "7"],
  [undefined, undefined, "—", "—"]
] as const)(
  "management renders interaction counts %s/%s without an undefined question count",
  async (likes, favorites, likeLabel, favoriteLabel) => {
    vi.mocked(api.wordlists.management).mockResolvedValue({
      items: [{ ...row, like_count: likes, favorite_count: favorites }],
      pagination
    });
    mount();
    const cells = (await screen.findByText(row.wordlist.name))
      .closest("tr")!
      .querySelectorAll("td");
    expect(screen.queryAllByText("题量")).toHaveLength(0);
    expect(cells[4]).toHaveTextContent(likeLabel);
    expect(cells[5]).toHaveTextContent(favoriteLabel);
    expect(api.wordlists.currentItems).not.toHaveBeenCalled();
    expect(api.wordlists.items).not.toHaveBeenCalled();
  }
);
it("management statistics do not reuse a fresh review-page cache", async () => {
  const client = new QueryClient({
    defaultOptions: {
      queries: { ...browserQueryDefaults.queries, retry: false }
    }
  });
  const enriched = {
    ...row,
    has_custom_words: true,
    like_count: 2,
    favorite_count: 1
  };
  vi.mocked(api.wordlists.management).mockImplementation(async (query) => ({
    items: [query?.include_stats ? enriched : row],
    pagination
  }));
  const reviews = mount(<ReviewsPage />, client);
  await screen.findByText(row.wordlist.name);
  expect(api.wordlists.management).toHaveBeenCalledTimes(1);
  reviews.unmount();
  const management = mount(<WordListsPage />, client);
  await screen.findByText(row.wordlist.name);
  fireEvent.mouseDown(screen.getByLabelText("审核状态"));
  fireEvent.click(await screen.findByTitle("待审核"));
  fireEvent.click(screen.getByRole("button", { name: /搜\s*索/ }));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenCalledWith(
      expect.objectContaining({ review_state: "pending", include_stats: true }),
      expect.anything()
    )
  );
  const cells = (await screen.findByText(row.wordlist.name))
    .closest("tr")!
    .querySelectorAll("td");
  expect(cells[3]).toHaveTextContent("是");
  expect(cells[4]).toHaveTextContent("2");
  expect(cells[5]).toHaveTextContent("1");
  expect(api.wordlists.management).toHaveBeenCalledTimes(3);
  management.unmount();
  mount(<ReviewsPage />, client);
  await screen.findByText(row.wordlist.name);
  expect(api.wordlists.management).toHaveBeenCalledTimes(3);
});
it("management shows one row per review without loading word details or decision controls", async () => {
  vi.mocked(api.wordlists.deleteImpact).mockResolvedValue({
    active_run_count: 2,
    active_task_count: 1,
    affected_user_count: 1,
    blocked_task_count: 1
  });
  vi.mocked(api.wordlists.currentItems).mockResolvedValue({
    items: [
      {
        entry_id: "entry",
        position: 0,
        entry: null,
        author_note: "当前词表注释"
      }
    ],
    revision: 4,
    pagination
  });
  vi.mocked(api.wordlists.items).mockResolvedValue({
    items: [
      {
        entry_id: "entry",
        position: 0,
        entry: null,
        author_note: "提交时冻结的注释"
      }
    ],
    revision: 2,
    pagination
  });
  vi.mocked(api.wordlists.reviews).mockResolvedValue({
    withdraw_reason: null,
    items: [
      {
        id: "request",
        wordlist_id: "list",
        name: "提交名称",
        submitted_revision: 2,
        state: "pending",
        reason: null,
        created_at: "2026-10-12T00:00:00Z",
        decided_at: null
      },
      {
        id: "previous",
        wordlist_id: "list",
        name: "旧申请名称",
        reviewer_id: "reviewer",
        reviewer_name: "审核老师",
        submitted_revision: 1,
        state: "rejected",
        reason: "内容不完整",
        created_at: "2026-10-11T00:00:00Z",
        decided_at: "2026-10-11T01:00:00Z"
      }
    ]
  });
  mount();
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  expect(await screen.findByText("当前词表注释")).toBeVisible();
  fireEvent.click(await screen.findByText("审核记录"));
  expect(await screen.findByText("提交名称")).toBeVisible();
  expect(screen.getByText("已驳回")).toBeVisible();
  expect(screen.getByText("提交名称").closest("tr")).toHaveTextContent(
    "待审核"
  );
  expect(screen.getByText("旧申请名称").closest("tr")).toHaveTextContent(
    "内容不完整"
  );
  expect(screen.getByText("旧申请名称").closest("tr")).toHaveTextContent(
    "审核老师"
  );
  expect(screen.queryByText("提交时冻结的注释")).not.toBeInTheDocument();
  expect(api.wordlists.items).not.toHaveBeenCalled();
  expect(screen.queryByText(/第\s*\d+\s*版/)).not.toBeInTheDocument();
  expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  expect(screen.queryByText("当前词表注释")).not.toBeInTheDocument();

  expect(screen.queryByText("通过审核")).not.toBeInTheDocument();
  expect(screen.queryByText("驳回")).not.toBeInTheDocument();
  expect(api.wordlists.decision).not.toHaveBeenCalled();
});
it("review approval uses the submitted snapshot revision instead of the current revision", async () => {
  vi.mocked(api.wordlists.items).mockResolvedValue({
    items: [
      {
        entry_id: "entry",
        position: 0,
        entry: null,
        author_note: "提交时冻结的注释"
      }
    ],
    revision: 2,
    pagination
  });
  mount(<ReviewsPage />);
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  expect(await screen.findByText("提交时冻结的注释")).toBeVisible();
  expect(api.wordlists.currentItems).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByText("通过审核"));
  fireEvent.click(await screen.findByText(/^确\s*认$/));
  await waitFor(() =>
    expect(api.wordlists.decision).toHaveBeenCalledWith("list", "request", {
      expected_revision: 2,
      approve: true,
      reason: null
    })
  );
  expect(vi.mocked(api.wordlists.management).mock.calls.length).toBeGreaterThan(
    1
  );
});
it("user private lists have no creation, edit or direct publication controls", async () => {
  mount();
  expect(await screen.findByLabelText("推荐 待审词表")).toBeDisabled();
  for (const text of ["创建词表", "编 辑", "设为公开"]) {
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  }
});
it("published user lists can be hidden without changing review semantics", async () => {
  vi.mocked(api.wordlists.management).mockResolvedValue({
    items: [{ ...row, wordlist: { ...row.wordlist, state: "published" } }],
    pagination
  });
  mount();
  fireEvent.click(await screen.findByText("设为私密"));
  expect(await screen.findByText(/审核状态保持不变/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/^确\s*认$/));
  await waitFor(() =>
    expect(api.wordlists.visibility).toHaveBeenCalledWith("list", {
      expected_revision: 4,
      public: false
    })
  );
});
it("search commits filters and reset requests page one without stale query", async () => {
  mount();
  await screen.findByText("待审词表");
  fireEvent.change(screen.getByLabelText("搜索词表"), {
    target: { value: "作者" }
  });
  fireEvent.click(screen.getByRole("button", { name: /搜\s*索/ }));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "作者", page: 1 }),
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: /重\s*置$/ }));
  await waitFor(() =>
    expect(screen.getByLabelText("搜索词表")).toHaveValue("")
  );
  expect(api.wordlists.management).toHaveBeenLastCalledWith(
    { page: 1, page_size: 20, include_stats: true },
    expect.anything()
  );
});
it("read-only administrators cannot create, edit, publish, recommend or delete", async () => {
  permissions.allowed = false;
  mount();
  await screen.findByText("待审词表");
  expect(screen.getByLabelText("删除待审词表")).toBeDisabled();
  expect(screen.getByLabelText("推荐 待审词表")).toBeDisabled();
});
it("failed mutation reports unconfirmed state and refetches", async () => {
  vi.mocked(api.wordlists.delete).mockRejectedValue(new Error("offline"));
  mount();
  fireEvent.click(await screen.findByLabelText("删除待审词表"));
  const dialog = await screen.findByRole("dialog");
  expect(
    await within(dialog).findByText(/该词表当前不是公开状态/)
  ).toBeInTheDocument();
  fireEvent.click(within(dialog).getByText(/^确\s*认$/));
  expect(await screen.findByText(/操作失败或结果未确认/)).toBeInTheDocument();
  expect(api.wordlists.delete).toHaveBeenCalledWith("list", {
    expected_revision: 4
  });
  expect(vi.mocked(api.wordlists.management).mock.calls.length).toBeGreaterThan(
    1
  );
});

it("delete preview explains in-flight and blocked task impact", async () => {
  vi.mocked(api.wordlists.management).mockResolvedValue({
    items: [{ ...row, wordlist: { ...row.wordlist, state: "published" } }],
    pagination
  });
  mount();
  fireEvent.click(await screen.findByLabelText("删除待审词表"));
  const dialog = await screen.findByRole("dialog");
  expect(await within(dialog).findByText(/2 个进行中轮次/)).toBeInTheDocument();
  expect(
    within(dialog).getByText(/1 个引用该词表但没有可继续轮次的任务/)
  ).toBeInTheDocument();
  expect(api.wordlists.deleteImpact).toHaveBeenCalledWith("list");
});

it("non-public delete does not promise grace", async () => {
  mount();
  fireEvent.click(await screen.findByLabelText("删除待审词表"));
  const dialog = await screen.findByRole("dialog");
  expect(
    await within(dialog).findByText(/该词表当前不是公开状态/)
  ).toBeInTheDocument();
  expect(
    within(dialog).queryByText(/可在删除后继续完成/)
  ).not.toBeInTheDocument();
});

it("impact loading can be cancelled", async () => {
  vi.mocked(api.wordlists.deleteImpact).mockReturnValue(new Promise(() => {}));
  mount();
  fireEvent.click(await screen.findByLabelText("删除待审词表"));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: /取\s*消/ }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
});

it("delete impact failure is visible and does not strand the confirmation", async () => {
  vi.mocked(api.wordlists.deleteImpact).mockRejectedValue(new Error("offline"));
  mount();
  fireEvent.click(await screen.findByLabelText("删除待审词表"));
  const dialog = await screen.findByRole("dialog");
  expect(
    await within(dialog).findByText(/任务影响读取失败/)
  ).toBeInTheDocument();
  expect(within(dialog).getByText(/^确\s*认$/)).toBeEnabled();
});

it("review queue defaults to pending and filters on the server", async () => {
  mount(<ReviewsPage />);
  await screen.findByText("待审词表");
  expect(api.wordlists.management).toHaveBeenLastCalledWith(
    { page: 1, page_size: 20, review_state: "pending" },
    expect.anything()
  );
  fireEvent.mouseDown(screen.getByRole("combobox", { name: "审核状态" }));
  fireEvent.click(
    await screen.findByText("审核通过", {
      selector: ".ant-select-item-option-content"
    })
  );
  fireEvent.click(screen.getByRole("button", { name: /搜\s*索/ }));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      expect.objectContaining({ review_state: "approved", page: 1 }),
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: /重\s*置$/ }));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      { page: 1, page_size: 20, review_state: "pending" },
      expect.anything()
    )
  );
});

it("review readers cannot decide applications", async () => {
  permissions.allowed = false;
  mount(<ReviewsPage />);
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  expect(
    await screen.findByRole("radio", { name: /待审核.*提交名称/ })
  ).toBeChecked();
  expect(screen.queryByText("通过审核")).not.toBeInTheDocument();
  expect(screen.queryByText("驳回")).not.toBeInTheDocument();
});
it("rejection requires a reason and sends the inspected request revision", async () => {
  mount(<ReviewsPage />);
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  fireEvent.click(await screen.findByText(/^驳\s*回$/));
  const dialog = (await screen.findByText("驳回词表")).closest<HTMLElement>(
    '[role="dialog"]'
  )!;
  fireEvent.click(within(dialog).getByText(/^确\s*认$/));
  await waitFor(() => expect(screen.getByText("请填写驳回原因")).toBeVisible());
  expect(api.wordlists.decision).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("操作原因"), {
    target: { value: " 内容不完整 " }
  });
  fireEvent.click(within(dialog).getByText(/^确\s*认$/));
  await waitFor(() =>
    expect(api.wordlists.decision).toHaveBeenCalledWith("list", "request", {
      expected_revision: 2,
      approve: false,
      reason: "内容不完整"
    })
  );
});

it("review queue rejects direct access without wordlist read permission", async () => {
  permissions.access = false;
  mount(<ReviewsPage />);
  expect(await screen.findByText("未开通词表查看权限")).toBeVisible();
  expect(api.wordlists.management).not.toHaveBeenCalled();
});
it("completed review records remain readable without decision controls", async () => {
  vi.mocked(api.wordlists.reviews).mockResolvedValue({
    withdraw_reason: null,
    items: [
      {
        id: "request",
        wordlist_id: "list",
        name: "提交名称",
        submitted_revision: 2,
        state: "rejected",
        reason: "内容不完整",
        created_at: "",
        decided_at: "2026-10-17T08:30:00Z"
      },
      {
        id: "approved-request",
        wordlist_id: "list",
        name: "第一版提交名称",
        submitted_revision: 1,
        state: "approved",
        reason: null,
        created_at: "",
        decided_at: ""
      }
    ]
  });
  mount(<ReviewsPage />);
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  expect(await screen.findByText("审核意见：内容不完整")).toBeVisible();
  expect(
    await screen.findByText(
      `审核时间：${new Date("2026-10-17T08:30:00Z").toLocaleString("zh-CN")}`
    )
  ).toBeVisible();
  expect(screen.queryByText("通过审核")).not.toBeInTheDocument();
  expect(screen.queryByText("驳回")).not.toBeInTheDocument();
  expect(screen.getByRole("radio", { name: /已驳回.*提交名称/ })).toBeChecked();
  const approved = screen.getByRole("radio", {
    name: /已通过.*第一版提交名称/
  });
  expect(
    screen.queryByRole("button", { name: /已通过.*第一版提交名称/ })
  ).not.toBeInTheDocument();
  fireEvent.click(approved);
  expect(approved).toBeChecked();
  expect(
    await screen.findByRole("radio", { name: /已通过.*第一版提交名称/ })
  ).toBeChecked();
  await waitFor(() =>
    expect(api.wordlists.items).toHaveBeenLastCalledWith(
      "list",
      "approved-request",
      { page: 1, page_size: 20 },
      expect.anything()
    )
  );
  expect(api.wordlists.decision).not.toHaveBeenCalled();
});
it("failed review decision preserves the dialog and reports an unconfirmed result", async () => {
  vi.mocked(api.wordlists.decision).mockRejectedValue(new Error("conflict"));
  mount(<ReviewsPage />);
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  fireEvent.click(await screen.findByText("通过审核"));
  const dialog = (
    await screen.findByText("确认通过审核并公开")
  ).closest<HTMLElement>('[role="dialog"]')!;
  fireEvent.click(within(dialog).getByText(/^确\s*认$/));
  await waitFor(() =>
    expect(within(dialog).getByText(/旧审核不会覆盖已修改的内容/)).toBeVisible()
  );
});

it.each(["approve", "reject"] as const)(
  "returns to the last valid page after %s removes the only pending item on page two",
  async (decision) => {
    let decided = false;
    const remaining = Array.from({ length: 20 }, (_, i) => ({
      ...row,
      wordlist: {
        ...row.wordlist,
        id: `remaining-${i}`,
        name: `剩余词表${i + 1}`
      }
    }));
    vi.mocked(api.wordlists.management).mockImplementation(
      async (query = {}) => ({
        items: query.page === 2 ? (decided ? [] : [row]) : remaining,
        pagination: {
          page: query.page ?? 1,
          page_size: 20,
          total: decided ? 20 : 21,
          total_pages: decided ? 1 : 2
        }
      })
    );
    vi.mocked(api.wordlists.decision).mockImplementation(async () => {
      decided = true;
      return row.wordlist;
    });
    mount(<ReviewsPage />);
    await screen.findByText("剩余词表1");
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    await screen.findByText("待审词表");
    fireEvent.click(screen.getByText(/^查\s*看$/));
    fireEvent.click(
      await screen.findByText(decision === "approve" ? "通过审核" : /^驳\s*回$/)
    );
    if (decision === "reject") {
      fireEvent.change(screen.getByLabelText("操作原因"), {
        target: { value: "内容不完整" }
      });
    }
    fireEvent.click(screen.getByText(/^确\s*认$/));
    await waitFor(() => expect(api.wordlists.decision).toHaveBeenCalled());
    await waitFor(() =>
      expect(api.wordlists.management).toHaveBeenLastCalledWith(
        { page: 1, page_size: 20, review_state: "pending" },
        expect.anything()
      )
    );
    expect(await screen.findByText("剩余词表1")).toBeVisible();
    expect(screen.queryByText("待审词表")).not.toBeInTheDocument();
  }
);

it("keeps snapshot pagination scoped to the selected application and hides decisions on current content", async () => {
  const pending = (await api.wordlists.reviews("list")).items[0]!;
  vi.mocked(api.wordlists.reviews).mockResolvedValue({
    withdraw_reason: null,
    items: [
      pending,
      { ...pending, id: "old-request", name: "旧申请", state: "rejected" }
    ]
  });
  vi.mocked(api.wordlists.items).mockResolvedValue({
    items: [],
    revision: 2,
    pagination: { ...pagination, total: 21, total_pages: 2 }
  });
  mount(<ReviewsPage />);
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  await screen.findByText("暂无词项");
  const drawer = screen.getByRole("dialog");
  fireEvent.click(within(drawer).getByRole("button", { name: "下一页" }));
  await waitFor(() =>
    expect(api.wordlists.items).toHaveBeenLastCalledWith(
      "list",
      "request",
      { page: 2, page_size: 20 },
      expect.anything()
    )
  );
  fireEvent.click(
    within(drawer).getByRole("radio", { name: /已驳回.*旧申请/ })
  );
  await waitFor(() =>
    expect(api.wordlists.items).toHaveBeenLastCalledWith(
      "list",
      "old-request",
      { page: 1, page_size: 20 },
      expect.anything()
    )
  );
  expect(within(drawer).queryByText("通过审核")).not.toBeInTheDocument();
  fireEvent.click(
    within(drawer).getByRole("radio", { name: /待审核.*提交名称/ })
  );
  expect(await within(drawer).findByText("通过审核")).toBeVisible();
  fireEvent.click(within(drawer).getByRole("tab", { name: "当前内容" }));
  await waitFor(() => expect(api.wordlists.currentItems).toHaveBeenCalled());
  expect(within(drawer).queryByText("通过审核")).not.toBeInTheDocument();
  expect(within(drawer).queryByText("驳回")).not.toBeInTheDocument();
});

it.each([false, true])(
  "plays custom audio using the current or review signature route review=%s",
  async (review) => {
    const items = {
      revision: 4,
      pagination,
      items: [
        {
          item_id: "custom",
          entry_id: null,
          entry: null,
          position: 0,
          custom_word: { word: "phrase", definition: "释义" }
        }
      ]
    };
    vi.mocked(api.wordlists.currentItems).mockResolvedValue(items);
    vi.mocked(api.wordlists.items).mockResolvedValue(items);
    const status = {
      items: [
        {
          item_id: "custom",
          job_id: "job",
          word: "phrase",
          status: "ready" as const,
          locales: ["en-GB", "en-US"] as ("en-GB" | "en-US")[]
        }
      ]
    };
    vi.mocked(api.wordlists.customAudio).mockResolvedValue(status);
    vi.mocked(api.wordlists.reviewCustomAudio).mockResolvedValue(status);
    const sign = review
      ? api.wordlists.reviewCustomAudioUrl
      : api.wordlists.customAudioUrl;
    vi.mocked(sign).mockResolvedValue({
      url: "https://example.com/audio",
      expires_at: "2026-10-23T10:00:00Z",
      url_expires_in_seconds: 300
    });
    const play = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      "Audio",
      class {
        play = play;
        pause = vi.fn();
        onerror = null;
      }
    );
    try {
      mount(review ? <ReviewsPage /> : <WordListsPage />);
      fireEvent.click(await screen.findByText(/^查\s*看$/));
      await screen.findByRole("heading", { name: "phrase" });
      fireEvent.click(
        await screen.findByRole("button", { name: /播放英式语音/ })
      );
      await waitFor(() => expect(play).toHaveBeenCalledOnce());
      const args = vi.mocked(sign).mock.calls[0]!;
      expect(args[0]).toBe("list");
      expect(args[review ? 2 : 1]).toBe("custom");
      expect(args[review ? 3 : 2]).toBe("en-GB");
      if (review)
        expect(args[1]).toBe(vi.mocked(api.wordlists.items).mock.calls[0]![1]);
    } finally {
      vi.unstubAllGlobals();
    }
  }
);

it("reads custom and platform words with their own definitions and author notes", async () => {
  vi.mocked(api.wordlists.currentItems).mockResolvedValue({
    revision: 4,
    pagination: { ...pagination, total: 2 },
    items: [
      {
        item_id: "custom",
        entry_id: null,
        position: 0,
        entry: null,
        custom_word: {
          word: "a moment of clarity",
          definition: "恍然大悟\n思路突然清晰"
        },
        author_note: "自定义词的作者注"
      },
      {
        item_id: "platform",
        entry_id: "entry",
        position: 1,
        author_note: "平台词的作者注",
        entry: {
          entry_id: "entry",
          publication_id: "publication",
          label: "clarity",
          kind: "word",
          pos: [
            {
              pos_id: "noun",
              pos: "n.",
              label: "名词",
              grammar_structures: [],
              senses: [
                {
                  id: "sense",
                  sub_pos: "",
                  level: "",
                  definitions: [
                    {
                      id: "definition",
                      definition_mode: "unified",
                      level: "",
                      grammar_structure_id: null,
                      texts: [
                        {
                          dialect: "common",
                          content: {
                            version: 2,
                            text: "清晰；清楚",
                            annotations: []
                          }
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      }
    ]
  });
  mount();
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  const custom = (
    await screen.findByRole("heading", { name: "a moment of clarity" })
  ).closest("article")!;
  expect(within(custom).getByText("自定义词汇")).toBeVisible();
  expect(within(custom).getByText("恍然大悟 思路突然清晰")).toBeVisible();
  expect(within(custom).getByText("自定义词的作者注")).toBeVisible();
  const platform = screen
    .getByRole("heading", { name: /^clarity$/ })
    .closest("article")!;
  expect(within(platform).getByText("平台词汇")).toBeVisible();
  expect(within(platform).getByText("名词")).toBeVisible();
  expect(within(platform).getByText("清晰；清楚")).toBeVisible();
  expect(within(platform).getByText("平台词的作者注")).toBeVisible();
});

it("驳回提交等待期间锁定原因，失败后保留原输入", async () => {
  let fail!: (error: Error) => void;
  vi.mocked(api.wordlists.decision).mockReturnValueOnce(
    new Promise((_, reject) => {
      fail = reject;
    })
  );
  mount(<ReviewsPage />);
  fireEvent.click(await screen.findByText(/^查\s*看$/));
  fireEvent.click(await screen.findByText(/^驳\s*回$/));
  const reason = screen.getByLabelText("操作原因");
  fireEvent.change(reason, { target: { value: "保留的驳回原因" } });
  const dialog = reason.closest<HTMLElement>('[role="dialog"]')!;
  fireEvent.click(within(dialog).getByText(/^确\s*认$/));
  await waitFor(() => expect(api.wordlists.decision).toHaveBeenCalledTimes(1));
  expect(reason).toBeDisabled();
  fail(new Error("temporary failure"));
  await waitFor(() => expect(reason).toBeEnabled());
  expect(reason).toHaveValue("保留的驳回原因");
  expect(
    within(dialog).getByText(/旧审核不会覆盖已修改的内容/)
  ).toBeInTheDocument();
});
