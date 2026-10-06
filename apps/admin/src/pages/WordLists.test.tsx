import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { WordListsPage } from "./WordLists";
vi.mock("@/lib/auth", () => ({
  usePermission: () => true,
  useAuthStore: (selector: (s: unknown) => unknown) =>
    selector({ profile: { id: "admin", permission_version: 1 } }),
  api: {
    wordlists: {
      list: vi.fn(),
      reviews: vi.fn(),
      items: vi.fn(),
      decision: vi.fn()
    }
  }
}));
import { api } from "@/lib/auth";
it("approval binds the inspected review request and submitted revision", async () => {
  const list = {
    id: "list",
    owner_user_id: "author",
    owner_name: "作者",
    name: "待审词表",
    state: "pending" as const,
    revision: 4,
    item_count: 1,
    created_at: "",
    updated_at: ""
  };
  vi.mocked(api.wordlists.list).mockResolvedValue({
    items: [list],
    pagination: { page: 1, page_size: 50, total: 1, total_pages: 1 }
  });
  vi.mocked(api.wordlists.reviews).mockResolvedValue({
    withdraw_reason: null,
    items: [
      {
        id: "request",
        wordlist_id: "list",
        name: list.name,
        submitted_revision: 4,
        state: "pending",
        reason: null,
        created_at: "",
        decided_at: null
      }
    ]
  });
  vi.mocked(api.wordlists.items).mockResolvedValue({
    items: [],
    revision: 4,
    pagination: { page: 1, page_size: 50, total: 0, total_pages: 0 }
  });
  vi.mocked(api.wordlists.decision).mockResolvedValue({
    ...list,
    state: "published"
  });
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WordListsPage />
    </QueryClientProvider>
  );
  fireEvent.click(await screen.findByText("查看审核"));
  fireEvent.click(await screen.findByText("通过审核"));
  fireEvent.click(await screen.findByRole("button", { name: /确.*定|OK/ }));
  await waitFor(() =>
    expect(api.wordlists.decision).toHaveBeenCalledWith("list", "request", {
      expected_revision: 4,
      approve: true,
      reason: null
    })
  );
});
