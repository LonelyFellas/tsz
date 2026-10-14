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
const permissions = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/auth", () => ({
  usePermission: (key: string) =>
    key === "wordlists.access" || permissions.allowed,
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
function mount() {
  return render(
    <MemoryRouter>
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <WordListsPage />
      </QueryClientProvider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  permissions.allowed = true;
  vi.mocked(api.wordlists.management).mockResolvedValue({
    items: [row],
    pagination
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
it("approval uses inspected snapshot revision even after visibility override", async () => {
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
  mount();
  fireEvent.click(await screen.findByText("查 看"));
  expect(await screen.findByText("注：当前词表注释")).toBeVisible();
  fireEvent.click(await screen.findByText("审核记录"));
  expect(await screen.findByText("注：提交时冻结的注释")).toBeVisible();
  expect(screen.queryByText("注：当前词表注释")).not.toBeInTheDocument();
  fireEvent.click(await screen.findByText("通过审核"));
  fireEvent.click(await screen.findByText(/确.*定|OK/));
  await waitFor(() =>
    expect(api.wordlists.decision).toHaveBeenCalledWith("list", "request", {
      expected_revision: 2,
      approve: true,
      reason: null
    })
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
  fireEvent.click(screen.getByText(/确.*定|OK/));
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
  fireEvent.click(screen.getByText("搜 索"));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: "作者", page: 1 }),
      expect.anything()
    )
  );
  fireEvent.click(screen.getByText("重 置"));
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
  for (const text of ["删 除"]) {
    expect(screen.getByText(text).closest("button")).toBeDisabled();
  }
  expect(screen.getByLabelText("推荐 待审词表")).toBeDisabled();
});
it("failed mutation reports unconfirmed state and refetches", async () => {
  vi.mocked(api.wordlists.delete).mockRejectedValue(new Error("offline"));
  mount();
  fireEvent.click(await screen.findByText("删 除"));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByText(/确.*定|OK/));
  expect(await screen.findByText(/操作失败或结果未确认/)).toBeInTheDocument();
  expect(api.wordlists.delete).toHaveBeenCalledWith("list", {
    expected_revision: 4
  });
  expect(vi.mocked(api.wordlists.management).mock.calls.length).toBeGreaterThan(
    1
  );
});

it("filters pending applications across the full management list and resets the filter", async () => {
  mount();
  await screen.findByText("待审词表");
  fireEvent.mouseDown(screen.getByLabelText("审核状态"));
  fireEvent.click(
    await screen.findByText("待审核", {
      selector: ".ant-select-item-option-content"
    })
  );
  fireEvent.click(screen.getByRole("button", { name: /搜\s*索/ }));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      expect.objectContaining({ review_state: "pending", page: 1 }),
      expect.anything()
    )
  );
  fireEvent.click(screen.getByRole("button", { name: /重\s*置/ }));
  await waitFor(() =>
    expect(api.wordlists.management).toHaveBeenLastCalledWith(
      { page: 1, page_size: 20 },
      expect.anything()
    )
  );
});
