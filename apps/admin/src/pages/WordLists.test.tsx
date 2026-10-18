import { AdminThemeProvider } from "@/mui-theme";
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
      delete: vi.fn()
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
function mount(page = <WordListsPage />) {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <AdminThemeProvider>{page}</AdminThemeProvider>
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
  fireEvent.click(await screen.findByText(/^确认$/));
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
  fireEvent.click(screen.getByText(/^确认$/));
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
  fireEvent.click(screen.getByRole("button", { name: /重\s*置/ }));
  await waitFor(() =>
    expect(screen.getByLabelText("搜索词表")).toHaveValue("")
  );
  expect(api.wordlists.management).toHaveBeenLastCalledWith(
    { page: 1, page_size: 20 },
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
  fireEvent.click(within(dialog).getByText(/^确认$/));
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
  expect(within(dialog).getByText(/^确认$/)).toBeEnabled();
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
      selector: '[role="option"]'
    })
  );
  fireEvent.click(screen.getByRole("button", { name: /搜\s*索/ }));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      expect.objectContaining({ review_state: "approved", page: 1 }),
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: /重\s*置/ }));
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
  fireEvent.click(await screen.findByText("驳回"));
  const dialog = (await screen.findByText("驳回词表")).closest<HTMLElement>(
    '[role="dialog"]'
  )!;
  fireEvent.click(within(dialog).getByText(/^确认$/));
  await waitFor(() => expect(screen.getByText("请填写驳回原因")).toBeVisible());
  expect(api.wordlists.decision).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("操作原因"), {
    target: { value: " 内容不完整 " }
  });
  fireEvent.click(within(dialog).getByText(/^确认$/));
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
        decided_at: ""
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
  fireEvent.click(within(dialog).getByText(/^确认$/));
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
      await screen.findByText(decision === "approve" ? "通过审核" : "驳回")
    );
    if (decision === "reject") {
      fireEvent.change(screen.getByLabelText("操作原因"), {
        target: { value: "内容不完整" }
      });
    }
    fireEvent.click(screen.getByText(/^确认$/));
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
  const drawer = screen.getByRole("dialog", { name: "待审词表" });
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
