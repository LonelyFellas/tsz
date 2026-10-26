import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { ConfigProvider } from "antd";
import type { AdminDubbingAudioUpdate, AdminProfile } from "@tsz/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import {
  DubbingAudioUpdates,
  DubbingAudioUpdateSettings
} from "./DubbingAudioUpdates";

const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        {node}
      </ConfigProvider>
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
  expect(screen.getByText(/秒后可执行/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "撤销待更新" }));
  await screen.findByText("已撤销");
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

it("保存等待时间携带设置版本，失败保留输入", async () => {
  vi.spyOn(api.speech, "audioUpdateSettings").mockResolvedValue({
    wait_seconds: 60,
    enabled: false,
    revision: 4
  });
  const save = vi
    .spyOn(api.speech, "saveAudioUpdateSettings")
    .mockRejectedValue(new Error("conflict"));
  mount(<DubbingAudioUpdateSettings />);
  const input = await screen.findByLabelText("音频更新等待秒数");
  fireEvent.change(input, { target: { value: "90" } });
  fireEvent.click(screen.getByRole("button", { name: "保存更新设置" }));
  await screen.findByText(/设置保存失败或版本已变化/);
  expect(input).toHaveValue("90");
  expect(save).toHaveBeenCalledWith({
    wait_seconds: 90,
    enabled: false,
    base_revision: 4
  });
});
