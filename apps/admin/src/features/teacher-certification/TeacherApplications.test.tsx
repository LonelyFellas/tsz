import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "antd";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { TeacherApplicationsPage } from "./TeacherApplications";
import { api, usePermission } from "@/lib/auth";

vi.mock("@/lib/auth", () => ({
  usePermission: vi.fn(),
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
  vi.mocked(usePermission).mockReturnValue(true);
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
  vi.mocked(usePermission).mockReturnValue(false);
  show();
  expect(screen.getByText("未开通教师认证查看权限")).toBeInTheDocument();
  expect(api.teacherCertification.list).not.toHaveBeenCalled();
});

it("审核授权不包含认证原件读取或资格撤销，原件组件不挂载、不请求", async () => {
  vi.mocked(usePermission).mockImplementation(
    (key) => key === "teacherapply.access" || key === "teacherapply.review"
  );
  vi.mocked(api.teacherCertification.detail).mockResolvedValue({
    application,
    files: [
      {
        id: "private-file",
        kind: "id_front",
        content_type: "image/png",
        size_bytes: 100
      }
    ]
  });
  show();
  await screen.findByText("李老师");
  fireEvent.click(screen.getByText("查看材料"));
  await screen.findByText("未开通认证原件查看权限");
  expect(screen.getByRole("button", { name: "通 过" })).toBeEnabled();
  expect(api.teacherCertification.file).not.toHaveBeenCalled();
  expect(screen.queryByText("撤销教师资格")).toBeNull();
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
