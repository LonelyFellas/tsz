import { HttpError } from "@tsz/api-client";
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it, vi } from "vitest";
import type { LearningTaskDetail, User } from "@tsz/types";
import { renderWithProviders } from "@/test/render";
import { useUserStore } from "@/stores/user";
import { StudentHome } from "./StudentHome";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  plansList: vi.fn(),
  me: vi.fn(),
  save: vi.fn()
}));
vi.mock("@/lib/request", () => ({
  api: {
    learning: { list: mocks.list },
    learningPlans: { list: mocks.plansList },
    auth: { me: mocks.me, updateLearningSettings: mocks.save }
  }
}));
vi.mock("@/features/home/components/AccountMenu", () => ({
  AccountMenu: () => <button>账户</button>
}));

const user: User = {
  id: "student-a",
  display_name: "同学",
  phone: "13800138000",
  roles: ["student"],
  avatar_url: "",
  active_role: "student"
};
const detail: LearningTaskDetail = {
  task: {
    id: "task-a",
    name: "日常英语",
    task_type: "daily",
    wordlist_ids: ["words"],
    daily_question_count: 20,
    ends_at: null,
    state: "active",
    revision: 1,
    created_at: "2026-10-13T00:00:00Z"
  },
  server_time: "2026-10-13T00:00:00Z",
  business_day: "2026-10-13",
  timezone: "Asia/Shanghai",
  current_run: {
    id: "run-a",
    task_id: "task-a",
    task_type: "daily",
    state: "active",
    question_type: "definition_spelling",
    task_revision: 1,
    business_day: "2026-10-13",
    expires_at: null,
    started_at: "2026-10-13T00:00:00Z",
    server_time: "2026-10-13T00:00:00Z",
    settings: { cefr_level: "A2", english_variant: "BrE" },
    target_count: 20,
    answered_count: 12,
    correct_count: 8,
    generation_version: "v1",
    grading_version: "v1",
    completion_id: null
  }
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.plansList.mockRejectedValue(new HttpError(404, "API missing"));
  useUserStore.setState({ user, hydrated: true, onboarded: true });
  mocks.list.mockResolvedValue({
    items: [detail],
    pagination: { total: 1, total_pages: 1 }
  });
  mocks.me.mockResolvedValue({
    user,
    active_role: "student",
    onboarded: true,
    learning_settings: { cefr_level: "A2", english_variant: "BrE" }
  });
  mocks.save.mockResolvedValue({
    onboarded: true,
    learning_settings: { cefr_level: "A2", english_variant: "AmE" }
  });
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  });
});

it("展示真实轮次进度并链接既有练习，不创建新轮次", async () => {
  renderWithProviders(<StudentHome />);
  expect(
    await screen.findByRole("heading", { name: "日常英语" })
  ).toBeInTheDocument();
  expect(
    screen.getByRole("progressbar", { name: "本轮答题进度" })
  ).toHaveAttribute("value", "12");
  expect(screen.getByRole("link", { name: "继续练习" })).toHaveAttribute(
    "href",
    "/student/practice/run-a"
  );
});

it("读取失败可重试，成功后的空态才提供创建任务入口", async () => {
  mocks.list.mockRejectedValueOnce(new Error("offline"));
  renderWithProviders(<StudentHome />);
  expect(await screen.findByRole("alert")).toHaveTextContent("读取失败");
  expect(
    screen.queryByRole("link", { name: "创建学习任务" })
  ).not.toBeInTheDocument();
  mocks.list.mockResolvedValue({
    items: [],
    pagination: { total: 0, total_pages: 0 }
  });
  fireEvent.click(screen.getByRole("button", { name: "重新读取" }));
  expect(
    await screen.findByRole("link", { name: "创建学习任务" })
  ).toHaveAttribute("href", "/student/tasks/new");
});

it("重新读取失败时不沿用缓存任务的副标题", async () => {
  const view = renderWithProviders(<StudentHome />);
  await screen.findByRole("heading", { name: "日常英语" });
  expect(screen.getByText("每日任务 · 1 个词表")).toBeInTheDocument();
  mocks.list.mockRejectedValueOnce(new Error("offline"));
  view.rerender(<StudentHome key="remount" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("读取失败");
  expect(screen.queryByText("每日任务 · 1 个词表")).not.toBeInTheDocument();
  expect(screen.getByText("学习首页")).toBeInTheDocument();
});

it.each(["expired", "invalidated", "cancelled"] as const)(
  "%s 轮次不提供继续练习",
  async (state) => {
    mocks.list.mockResolvedValue({
      items: [{ ...detail, current_run: { ...detail.current_run, state } }]
    });
    renderWithProviders(<StudentHome />);
    expect(
      await screen.findByRole("link", { name: "查看任务" })
    ).toHaveAttribute("href", "/student/tasks/task-a");
    expect(
      screen.queryByRole("link", { name: "继续练习" })
    ).not.toBeInTheDocument();
  }
);

it("左右面板互斥，Esc 关闭后返回触发器，外部点击关闭", async () => {
  const actions = userEvent.setup();
  renderWithProviders(<StudentHome />);
  await screen.findByText("日常英语");
  await actions.click(screen.getByRole("button", { name: "学习菜单" }));
  const menu = screen.getByRole("dialog", { name: "学习菜单" });
  expect(within(menu).getByRole("link", { name: "我的词表" })).toHaveAttribute(
    "href",
    "/account/wordlists"
  );
  await actions.click(screen.getByRole("button", { name: "偏好设置" }));
  expect(
    screen.queryByRole("dialog", { name: "学习菜单" })
  ).not.toBeInTheDocument();
  expect(screen.getByRole("dialog", { name: "偏好设置" })).toBeInTheDocument();
  await actions.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  );
  expect(screen.getByRole("button", { name: "偏好设置" })).toHaveFocus();
  await actions.click(screen.getByRole("button", { name: "学习菜单" }));
  await actions.click(
    screen.getByRole("heading", { name: "从这里，继续积累。" })
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("保存偏好保留固定难度，失败保留选择并支持重试，重新打开读取服务端结果", async () => {
  const actions = userEvent.setup();
  mocks.save.mockRejectedValueOnce(new Error("offline"));
  renderWithProviders(<StudentHome />);
  await actions.click(screen.getByRole("button", { name: "偏好设置" }));
  await actions.click(await screen.findByRole("radio", { name: "美式英语" }));
  await actions.click(screen.getByRole("button", { name: "保存偏好" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.getByRole("radio", { name: "美式英语" })).toBeChecked();
  await actions.click(screen.getByRole("button", { name: "保存偏好" }));
  await screen.findByText("英美偏好已保存");
  expect(mocks.save).toHaveBeenLastCalledWith({
    cefr_level: "A2",
    english_variant: "AmE"
  });
  mocks.me.mockResolvedValue({
    user,
    onboarded: true,
    learning_settings: { cefr_level: "A2", english_variant: "AmE" }
  });
  await actions.click(screen.getByRole("button", { name: "关闭偏好设置" }));
  await actions.click(screen.getByRole("button", { name: "偏好设置" }));
  await waitFor(() => expect(mocks.me).toHaveBeenCalledTimes(2));
  expect(await screen.findByRole("radio", { name: "美式英语" })).toBeChecked();
});

it("切换账号后关闭旧浮层并读取新账号任务，迟到的保存不覆盖新账号偏好", async () => {
  let finish!: (value: unknown) => void;
  mocks.save.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const actions = userEvent.setup();
  renderWithProviders(<StudentHome />);
  await actions.click(screen.getByRole("button", { name: "偏好设置" }));
  await actions.click(await screen.findByRole("radio", { name: "美式英语" }));
  await actions.click(screen.getByRole("button", { name: "保存偏好" }));
  expect(screen.getByRole("button", { name: "保存中…" })).toBeDisabled();
  mocks.list.mockResolvedValue({ items: [] });
  const nextUser = { ...user, id: "student-b" };
  mocks.me.mockResolvedValue({
    user: nextUser,
    onboarded: true,
    learning_settings: { cefr_level: "B1", english_variant: "BrE" }
  });
  act(() => useUserStore.setState({ user: nextUser }));
  await screen.findByRole("link", { name: "创建学习任务" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () =>
    finish({
      onboarded: true,
      learning_settings: { cefr_level: "A2", english_variant: "AmE" }
    })
  );
  await actions.click(screen.getByRole("button", { name: "偏好设置" }));
  expect(await screen.findByRole("radio", { name: "英式英语" })).toBeChecked();
  expect(screen.getByText(/当前难度：B1/)).toBeInTheDocument();
  expect(screen.queryByText("日常英语")).not.toBeInTheDocument();
});

it("覆盖计划的每日完成不冒充整轮完成，跨日无 run 的整轮完成仍可进入详情", async () => {
  const plan = {
    ...detail,
    mode: "coverage_v1",
    status: "today_completed",
    can_start: false,
    current_cycle: {
      id: "cycle",
      state: "active",
      covered_count: 20,
      total_count: 35
    }
  };
  mocks.plansList.mockResolvedValue({
    items: [
      { ...plan, current_run: { ...detail.current_run, state: "completed" } }
    ],
    pagination: { total: 1, total_pages: 1 }
  });
  const view = renderWithProviders(<StudentHome />);
  await screen.findByText("今日已完成");
  expect(screen.queryByText("本轮已完成")).not.toBeInTheDocument();
  mocks.plansList.mockResolvedValue({
    items: [
      {
        ...plan,
        status: "cycle_completed",
        current_run: null,
        current_cycle: {
          ...plan.current_cycle,
          state: "completed",
          covered_count: 35
        }
      }
    ],
    pagination: { total: 1, total_pages: 1 }
  });
  view.rerender(<StudentHome key="next-day" />);
  await screen.findByText("本轮已完成");
  expect(screen.getByRole("link", { name: "查看任务" })).toHaveAttribute(
    "href",
    "/student/tasks/task-a"
  );
});
