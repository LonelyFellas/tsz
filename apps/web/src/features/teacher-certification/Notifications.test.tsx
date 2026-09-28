import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { api } from "@/lib/request";
import { Notifications } from "./Notifications";

vi.mock("@/lib/request", () => ({
  api: {
    teacherCertification: { notifications: vi.fn(), readNotification: vi.fn() }
  }
}));
vi.mock("@/stores/user", () => ({
  useUserStore: (select: (state: unknown) => unknown) =>
    select({ user: { id: "student-1" } })
}));
const notification = {
  id: "n1",
  application_id: "old-application",
  kind: "teacher_rejected" as const,
  reason: "证件不清晰",
  created_at: "2026-09-28T00:00:00Z",
  read_at: null
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
      <Notifications />
    </QueryClientProvider>
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.teacherCertification.notifications).mockResolvedValue({
    items: [notification],
    total: 1,
    unread_count: 1
  });
});
it("displays the reason and links to the specific historical application", async () => {
  show();
  expect(await screen.findByText("证件不清晰")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看对应申请" })).toHaveAttribute(
    "href",
    "/account/teacher-applications/old-application"
  );
});
it("marks a notification read and refreshes the unread count", async () => {
  vi.mocked(api.teacherCertification.readNotification).mockResolvedValue({
    ...notification,
    read_at: "2026-09-28T01:00:00Z"
  });
  show();
  await screen.findByText("证件不清晰");
  vi.mocked(api.teacherCertification.notifications).mockResolvedValue({
    items: [{ ...notification, read_at: "2026-09-28T01:00:00Z" }],
    total: 1,
    unread_count: 0
  });
  fireEvent.click(screen.getByRole("button", { name: "标为已读" }));
  expect(await screen.findByText("暂无未读通知")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "标为已读" })
  ).not.toBeInTheDocument();
});
it("offers a retry after a failed request", async () => {
  vi.mocked(api.teacherCertification.notifications).mockRejectedValueOnce(
    new Error("连接失败")
  );
  show();
  expect(await screen.findByRole("alert")).toHaveTextContent("连接失败");
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("证件不清晰")).toBeInTheDocument();
});
