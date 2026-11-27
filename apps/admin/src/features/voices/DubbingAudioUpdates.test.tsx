import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";

import type { AdminDubbingAudioUpdate, AdminProfile } from "@tsz/types";
import { HttpError } from "@tsz/api-client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { DubbingAudioUpdates } from "./DubbingAudioUpdates";
import { dubbingGroupsKey } from "./dubbing-model";

const missingGroup = new HttpError(404, "Group not found", [], "not_found");
const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  clients.push(client);
  return {
    client,
    ...render(node, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      )
    })
  };
}
function update(state = "pending"): AdminDubbingAudioUpdate {
  return {
    id: "job",
    group_id: "group",
    group_name: "测试分组",
    group_revision: 3,
    state,
    due_at: new Date(Date.now() + 60000).toISOString(),
    total: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
    error_codes: []
  };
}
function setAccount(id = "update-admin") {
  useAuthStore.getState().setProfile({
    id,
    phone: "fixture",
    display_name: "测试",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions: ["speech.global_dubbing"]
  } satisfies AdminProfile);
}
beforeEach(() => setAccount());
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it.each(["pending", "running"])(
  "任务 %s 时分组消失，停止请求音频更新状态",
  async (state) => {
    vi.useFakeTimers();
    const read = vi
      .spyOn(api.speech, "audioUpdates")
      .mockResolvedValueOnce({ updates: [update(state)] })
      .mockRejectedValue(missingGroup);
    mount(<DubbingAudioUpdates groupId="group" revision={3} />);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(read).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(read).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();

    await act(async () => vi.advanceTimersByTimeAsync(12000));
    expect(read).toHaveBeenCalledTimes(2);
  }
);

it("初次查询返回 404 时停用自动请求，重新挂载后仍可手动重试", async () => {
  vi.useFakeTimers();
  const read = vi
    .spyOn(api.speech, "audioUpdates")
    .mockRejectedValueOnce(missingGroup)
    .mockResolvedValue({ updates: [update("completed")] });
  const status = <DubbingAudioUpdates groupId="group" revision={3} />;
  const view = mount(status);

  await act(async () => vi.advanceTimersByTimeAsync(12000));
  expect(read).toHaveBeenCalledTimes(1);
  view.rerender(<></>);
  view.rerender(status);
  await act(async () => vi.advanceTimersByTimeAsync(12000));
  expect(read).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  await act(async () => vi.advanceTimersByTimeAsync(1));
  expect(read).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
});

it.each([new TypeError("Network error"), new HttpError(503, "Unavailable")])(
  "运行中遇到 $message 时保留轮询恢复，正常结束后停止",
  async (error) => {
    vi.useFakeTimers();
    const read = vi
      .spyOn(api.speech, "audioUpdates")
      .mockResolvedValueOnce({ updates: [update("pending")] })
      .mockResolvedValueOnce({ updates: [update("running")] })
      .mockRejectedValueOnce(error)
      .mockResolvedValue({ updates: [update("completed")] });
    mount(<DubbingAudioUpdates groupId="group" revision={3} />);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(screen.getByText("等待更新")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText("生成中")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByRole("button", { name: "重试" })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(3000));
    expect(screen.queryByRole("button", { name: "重试" })).toBeNull();
    expect(screen.queryByText("生成中")).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(12000));
    expect(read).toHaveBeenCalledTimes(4);
  }
);

it.each([
  { accountId: "update-admin", groupId: "other-group" },
  { accountId: "other-admin", groupId: "group" }
])(
  "切到 $accountId/$groupId 后忽略旧请求迟到的 404",
  async ({ accountId, groupId }) => {
    let rejectOldRequest!: (error: HttpError) => void;
    const oldRequest = new Promise<never>((_, reject) => {
      rejectOldRequest = reject;
    });
    const read = vi
      .spyOn(api.speech, "audioUpdates")
      .mockReturnValueOnce(oldRequest)
      .mockResolvedValue({
        updates: [{ ...update("running"), group_id: groupId }]
      });
    const view = mount(<DubbingAudioUpdates groupId="group" revision={3} />);
    const originalList = dubbingGroupsKey("update-admin");
    const otherList = dubbingGroupsKey("other-admin");
    view.client.setQueryData(originalList, { groups: [] });
    view.client.setQueryData(otherList, { groups: [] });

    await act(async () => {
      setAccount(accountId);
      view.rerender(<DubbingAudioUpdates groupId={groupId} revision={3} />);
    });
    expect(read).toHaveBeenNthCalledWith(2, groupId, expect.any(AbortSignal));
    await screen.findByText("生成中");

    await act(async () => rejectOldRequest(missingGroup));
    expect(screen.getByText("生成中")).toBeInTheDocument();
    expect(view.client.getQueryState(originalList)?.isInvalidated).toBe(false);
    expect(view.client.getQueryState(otherList)?.isInvalidated).toBe(false);
  }
);

it("按服务端任务倒计时，撤销只调用任务接口并重新读取", async () => {
  const job = update();
  vi.spyOn(api.speech, "audioUpdates")
    .mockResolvedValueOnce({ updates: [job] })
    .mockResolvedValue({ updates: [{ ...job, state: "cancelled" }] });
  const cancel = vi
    .spyOn(api.speech, "cancelAudioUpdate")
    .mockResolvedValue(undefined);
  const save = vi.spyOn(api.speech, "saveGroup");
  mount(<DubbingAudioUpdates groupId="group" revision={3} />);
  await screen.findByText("等待更新");
  expect(screen.getByText(/秒后自动更新相关草稿音频/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "撤销待更新" }));
  await waitFor(() =>
    expect(screen.queryByText("等待更新")).not.toBeInTheDocument()
  );
  expect(cancel).toHaveBeenCalledWith("job");
  expect(save).not.toHaveBeenCalled();
});

it("重开读取持久失败状态，并仅重试失败项", async () => {
  const job = {
    ...update("partial"),
    total: 3,
    completed: 2,
    failed: 1,
    error_codes: ["forbidden"]
  };
  vi.spyOn(api.speech, "audioUpdates").mockResolvedValue({ updates: [job] });
  const retry = vi
    .spyOn(api.speech, "retryAudioUpdate")
    .mockResolvedValue(undefined);
  const view = mount(<DubbingAudioUpdates groupId="group" revision={3} />);
  await screen.findByText("部分成功");
  expect(
    screen.getByText(/提交账号缺少生成或目标内容编辑权限/)
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "撤销待更新" })
  ).not.toBeInTheDocument();
  view.unmount();
  mount(<DubbingAudioUpdates groupId="group" revision={3} />);
  await screen.findByText("部分成功");
  fireEvent.click(screen.getByRole("button", { name: "重试失败项" }));
  await waitFor(() => expect(retry).toHaveBeenCalledWith("job"));
});

it("完成后不保留历史状态，也不把更早的失败任务重新展示", async () => {
  vi.spyOn(api.speech, "audioUpdates")
    .mockResolvedValueOnce({ updates: [update("pending")] })
    .mockResolvedValue({
      updates: [update("completed"), { ...update("failed"), id: "older-job" }]
    });
  const view = mount(<DubbingAudioUpdates groupId="group" revision={3} />);
  await screen.findByText("等待更新");
  await act(async () =>
    clients
      .at(-1)!
      .refetchQueries({ queryKey: ["admin-dubbing-audio-updates"] })
  );
  await waitFor(() =>
    expect(screen.queryByText("等待更新")).not.toBeInTheDocument()
  );
  expect(view.container.textContent).toBe("");
  expect(
    screen.queryByRole("button", { name: "重试失败项" })
  ).not.toBeInTheDocument();
});

it("切语言保留任务计时与轮询身份，不自动撤销或重试", async () => {
  vi.useFakeTimers();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  clients.push(client);
  const job = update();
  client.setQueryData(
    ["admin-dubbing-audio-updates", "update-admin", "group", 3],
    { updates: [job] }
  );
  const read = vi
    .spyOn(api.speech, "audioUpdates")
    .mockResolvedValue({ updates: [job] });
  const cancel = vi
      .spyOn(api.speech, "cancelAudioUpdate")
      .mockResolvedValue(undefined),
    retry = vi
      .spyOn(api.speech, "retryAudioUpdate")
      .mockResolvedValue(undefined);
  const timers = vi.spyOn(window, "setInterval");
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <QueryClientProvider client={client}>
        <DubbingAudioUpdates groupId="group" revision={3} />
      </QueryClientProvider>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  try {
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    const count = timers.mock.calls.length;
    for (const locale of ["en-GB", "zh-Hant", "en-US"] as const) {
      await act(async () => view.rerender(content(locale)));
      expect(view.container.textContent).toContain("59");
      expect(timers).toHaveBeenCalledTimes(count);
      expect(read).not.toHaveBeenCalled();
      expect(cancel).not.toHaveBeenCalled();
      expect(retry).not.toHaveBeenCalled();
    }
  } finally {
    view.unmount();
    client.clear();
    vi.useRealTimers();
  }
});
