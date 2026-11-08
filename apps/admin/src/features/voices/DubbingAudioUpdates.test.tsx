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
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { DubbingAudioUpdates } from "./DubbingAudioUpdates";

const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <>{node}</>
    </QueryClientProvider>
  );
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
beforeEach(() => {
  useAuthStore.getState().setProfile({
    id: "update-admin",
    phone: "fixture",
    display_name: "测试",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions: ["speech.global_dubbing"]
  } as AdminProfile);
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});

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
