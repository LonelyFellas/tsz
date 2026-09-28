import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "antd";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TeacherApplicationsPage } from "./TeacherApplications";
import { api, useIsSuperAdmin } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  useIsSuperAdmin: vi.fn(),
  useAuthStore: (select: (state: unknown) => unknown) =>
    select({ profile: { id: "admin-1" } }),
  api: {
    teacherCertification: {
      list: vi.fn(),
      detail: vi.fn(),
      review: vi.fn(),
      file: vi.fn(),
      revoke: vi.fn()
    }
  }
}));
const application = {
  id: "application-1",
  user_id: "user-1",
  real_name: "李老师",
  contact: "teacher@example.test",
  statement: "申请任教",
  status: "pending" as const,
  submitted_at: "2026-09-28T00:00:00Z",
  reviewed_at: null,
  review_reason: null,
  revoked_at: null,
  revoke_reason: null
};
const show = () =>
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false }
          }
        })
      }
    >
      <App>
        <TeacherApplicationsPage />
      </App>
    </QueryClientProvider>
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useIsSuperAdmin).mockReturnValue(true);
  vi.mocked(api.teacherCertification.list).mockResolvedValue({
    items: [application],
    total: 1
  });
  vi.mocked(api.teacherCertification.detail).mockResolvedValue({
    application,
    files: []
  });
});

it("does not request applications for an ordinary admin", () => {
  vi.mocked(useIsSuperAdmin).mockReturnValue(false);
  show();
  expect(
    screen.getByText("仅超级管理员可查看认证材料与审核")
  ).toBeInTheDocument();
  expect(api.teacherCertification.list).not.toHaveBeenCalled();
});

it("lets a super admin read an application and requires a rejection reason", async () => {
  show();
  await screen.findByText("李老师");
  fireEvent.click(screen.getByText("查看材料"));
  await screen.findByText("申请任教");
  fireEvent.click(screen.getByRole("button", { name: "驳 回" }));
  fireEvent.click(screen.getByRole("button", { name: "确认驳回" }));
  expect(await screen.findByText("请填写驳回原因")).toBeInTheDocument();
  expect(api.teacherCertification.review).not.toHaveBeenCalled();
});
