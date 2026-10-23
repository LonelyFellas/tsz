import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { AdminDubbingGroupsResponse, AdminSpeechVoice } from "@tsz/types";
import { App, ConfigProvider } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { AddRecommendation } from "./AddRecommendation";

const voice: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  gender: "Female",
  is_common: true,
  capabilities: {
    styles: [],
    min_rate_percent: -50,
    max_rate_percent: 50,
    min_pitch_semitones: -10,
    max_pitch_semitones: 10
  }
};
const parameters = { rate_percent: -25, pitch_semitones: 0, style: null };
const queryKey = ["admin-dubbing-groups", "groups-admin"];
const clients: QueryClient[] = [];
const initial: AdminDubbingGroupsResponse = {
  revision: 1,
  groups: [
    {
      id: "group-one",
      name: "发音推荐",
      areas: ["word"],
      uk: [
        { id: "uk-one", name: "英式日常", voice_alias: voice.alias, parameters }
      ],
      us: [{ id: "us-one", name: "美式日常", voice_alias: "guy", parameters }]
    }
  ]
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  clients.push(client);
  client.setQueryData(queryKey, structuredClone(initial));
  render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <AddRecommendation
            voice={voice}
            readParameters={async () => parameters}
            onBusyChange={vi.fn()}
            onClose={vi.fn()}
          />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
  return client;
}
async function add() {
  fireEvent.mouseDown(screen.getByLabelText("推荐分组"));
  fireEvent.click(await screen.findByText("发音推荐"));
  fireEvent.click(screen.getByRole("button", { name: "确认加入推荐" }));
  await waitFor(() => expect(api.speech.saveGroups).toHaveBeenCalledOnce());
}
beforeEach(() => {
  useAuthStore.getState().setProfile({
    id: "groups-admin",
    phone: "13800000000",
    display_name: "分组管理员",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions: ["words.access", "speech.generate", "speech.global_dubbing"]
  });
  vi.spyOn(api.speech, "groups").mockResolvedValue(structuredClone(initial));
  vi.spyOn(api.speech, "saveGroups").mockImplementation(async (input) => ({
    groups: input.groups,
    revision: input.base_revision + 1
  }));
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});

describe("加入推荐的缓存一致性", () => {
  it("保存期间启动的旧 GET 不会覆盖刚加入的推荐", async () => {
    const pendingSave = deferred<AdminDubbingGroupsResponse>();
    const staleRead = deferred<AdminDubbingGroupsResponse>();
    vi.mocked(api.speech.saveGroups).mockReturnValueOnce(pendingSave.promise);
    vi.mocked(api.speech.groups).mockReturnValueOnce(staleRead.promise);
    const client = mount();
    await add();
    let refresh!: Promise<void>;
    act(() => {
      refresh = client.refetchQueries({ queryKey, exact: true });
    });
    expect(api.speech.groups).toHaveBeenCalledOnce();
    const saved = {
      groups: vi.mocked(api.speech.saveGroups).mock.calls[0]![0].groups,
      revision: 2
    };
    await act(async () => {
      pendingSave.resolve(saved);
    });
    await screen.findByText(
      "已加入分组推荐。后续修改个人参数不会改变这份推荐。"
    );
    await act(async () => {
      staleRead.resolve(structuredClone(initial));
      await refresh;
    });
    expect(client.getQueryData(queryKey)).toEqual(saved);
    expect(saved.groups[0]!.uk).toHaveLength(2);
    expect(saved.groups[0]!.uk[1]!.parameters).toEqual(parameters);
  });

  it("取消 GET 后再次核验账户再更新缓存", async () => {
    const client = mount();
    const cancelling = deferred<void>();
    const cancel = vi
      .spyOn(client, "cancelQueries")
      .mockReturnValueOnce(cancelling.promise);
    await add();
    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith({ queryKey, exact: true })
    );
    act(() => {
      useAuthStore.getState().setProfile(null);
    });
    await act(async () => {
      cancelling.resolve();
    });
    expect(client.getQueryData(queryKey)).toEqual(initial);
    expect(
      screen.queryByText("已加入分组推荐。后续修改个人参数不会改变这份推荐。")
    ).not.toBeInTheDocument();
  });
});
