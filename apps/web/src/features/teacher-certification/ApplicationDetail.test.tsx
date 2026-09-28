import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api } from "@/lib/request";
import { ApplicationDetail } from "./ApplicationDetail";

vi.mock("@/lib/request", () => ({
  api: { teacherCertification: { detail: vi.fn(), file: vi.fn() } }
}));
vi.mock("@/stores/user", () => ({
  useUserStore: (select: (state: unknown) => unknown) =>
    select({ user: { id: "student-1" } })
}));
it("shows the selected historical application and its rejection reason", async () => {
  vi.mocked(api.teacherCertification.detail).mockImplementation(async (id) => ({
    application: {
      id,
      user_id: "student-1",
      real_name: "李老师",
      contact: "teacher@example.test",
      statement: "历史认证说明",
      status: "rejected",
      submitted_at: "2026-09-28T00:00:00Z",
      reviewed_at: null,
      review_reason: `请补充材料 ${id}`,
      revoked_at: null,
      revoke_reason: null
    },
    files: []
  }));
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <ApplicationDetail id="old-application" />
    </QueryClientProvider>
  );
  expect(
    await screen.findByText("请补充材料 old-application")
  ).toBeInTheDocument();
  expect(screen.getByText("历史认证说明")).toBeInTheDocument();
  expect(screen.getByText("已驳回")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
});
