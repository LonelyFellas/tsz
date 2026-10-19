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

it("shows wordlist likes and tips with author links and exact amounts", async () => {
  vi.mocked(api.teacherCertification.notifications).mockResolvedValue({
    items: [
      {
        ...notification,
        id: "like",
        application_id: null,
        reason: null,
        kind: "wordlist_liked",
        actor_name: "小明",
        wordlist_id: "list-1",
        wordlist_name: "四级词汇"
      },
      {
        ...notification,
        id: "tip",
        application_id: null,
        reason: null,
        kind: "wordlist_tipped",
        actor_name: "小红",
        wordlist_id: "list-1",
        wordlist_name: "四级词汇",
        amount: "9007199254740993"
      }
    ],
    total: 2,
    unread_count: 2
  });
  show();
  expect(await screen.findByText("词表收到点赞")).toBeInTheDocument();
  expect(
    screen.getByText("小明赞了你的词表「四级词汇」。")
  ).toBeInTheDocument();
  expect(
    screen.getByText(/小红向你的词表.*9,007,199,254,740,993/)
  ).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "查看词表" })[0]).toHaveAttribute(
    "href",
    "/account/wordlists/list-1"
  );
  expect(screen.getByRole("link", { name: "查看收币记录" })).toHaveAttribute(
    "href",
    "/account/wordlist-tips"
  );
  expect(
    screen.queryByRole("link", { name: "查看对应申请" })
  ).not.toBeInTheDocument();
});

it("shows deleted-source notice and links to learning tasks", async () => {
  vi.mocked(api.teacherCertification.notifications).mockResolvedValue({
    items: [
      {
        ...notification,
        application_id: null,
        kind: "wordlist_deleted",
        reason:
          "词表「四级词汇」已被删除。已开始的学习轮次可在 2026-10-25 12:00（北京时间）前完成。"
      }
    ],
    total: 1,
    unread_count: 1
  });
  show();
  expect(await screen.findByText("使用中的词表已删除")).toBeInTheDocument();
  expect(screen.getByText(/可在 2026-10-25 12:00/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "查看学习任务" })).toHaveAttribute(
    "href",
    "/student/practice"
  );
  expect(
    screen.queryByRole("link", { name: "查看词表" })
  ).not.toBeInTheDocument();
});

it("keeps deleted wordlist notifications readable without a broken wordlist link", async () => {
  vi.mocked(api.teacherCertification.notifications).mockResolvedValue({
    items: [
      {
        ...notification,
        application_id: null,
        reason: null,
        kind: "wordlist_tipped",
        amount: "7"
      }
    ],
    total: 1,
    unread_count: 1
  });
  show();
  expect(
    await screen.findByText(/账号已注销向你的词表（已删除）投了/)
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("link", { name: "查看词表" })
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "查看收币记录" })
  ).toBeInTheDocument();
});
