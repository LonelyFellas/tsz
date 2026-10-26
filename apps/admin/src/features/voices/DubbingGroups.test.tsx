import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import type {
  AdminDubbingGroup,
  AdminDubbingGroupsResponse,
  AdminProfile,
  AdminSpeechVoice
} from "@tsz/types";
import { App, ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { api, useAuthStore } from "@/lib/auth";
import { DubbingGroups } from "./DubbingGroups";
import { DubbingDrafts } from "./DubbingDrafts";

const uk: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  accent: "gb",
  gender: "female",
  is_common: true,
  capabilities: {
    styles: ["cheerful"],
    min_rate_percent: -50,
    max_rate_percent: 50,
    min_pitch_semitones: -10,
    max_pitch_semitones: 10
  }
};
const us: AdminSpeechVoice = {
  ...uk,
  alias: "guy",
  display_name: "Guy",
  locale: "en-US",
  accent: "us"
};
const queryKey = ["admin-dubbing-groups", "groups-admin"];
const clients: QueryClient[] = [];
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function group(
  id: string,
  name: string,
  areas: string[] = []
): AdminDubbingGroup {
  return {
    id,
    name,
    areas,
    revision: 1,
    is_global: false,
    uk: [
      {
        id: `${id}-uk`,
        name: `${name}英式`,
        voice_alias: uk.alias,
        selected: true,
        parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
      }
    ],
    us: [
      {
        id: `${id}-us`,
        name: `${name}美式`,
        voice_alias: us.alias,
        selected: true,
        parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
      }
    ]
  };
}
function data(): AdminDubbingGroupsResponse {
  return {
    revision: 3,
    groups: [
      { ...group("global", "全局常用"), is_global: true },
      group("a", "A", ["word"]),
      group("b", "B", ["example"])
    ]
  };
}
function setPermissions(permissions: AdminProfile["permissions"]) {
  useAuthStore.getState().setProfile({
    id: "groups-admin",
    phone: "13800138446",
    display_name: "分组管理员",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  return {
    promise: new Promise<T>((done) => {
      resolve = done;
    }),
    resolve: (value: T) => resolve(value)
  };
}
function mount(initial = data(), voices = [uk, us]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  clients.push(client);
  client.setQueryData(queryKey, initial);
  const onAudition = vi.fn(),
    onDirtyChange = vi.fn();
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DubbingDrafts>
          <DubbingGroups
            voices={voices}
            canAudition
            onAudition={onAudition}
            onInvalidatePreview={vi.fn()}
            onDirtyChange={onDirtyChange}
          />
        </DubbingDrafts>
      )
    }
  ]);
  routers.push(router);
  const view = render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <RouterProvider router={router} />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
  return { client, onAudition, onDirtyChange, ...view };
}
function card(name: string) {
  return screen
    .getByRole("button", { name: `编辑${name}` })
    .closest(".dubbing-group") as HTMLElement;
}
function edit(name: string) {
  const panel = card(name);
  fireEvent.click(within(panel).getByRole("button", { name: `编辑${name}` }));
  return panel;
}
beforeEach(() => {
  setPermissions(["words.access", "speech.generate", "speech.global_dubbing"]);
  vi.spyOn(api.speech, "groups").mockResolvedValue(data());
  vi.spyOn(api.speech, "audioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "allAudioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "audioUpdateSettings").mockResolvedValue({
    wait_seconds: 60,
    enabled: false,
    revision: 0
  });
  vi.spyOn(api.speech, "saveGroups");
  vi.spyOn(api.speech, "saveGroup").mockImplementation(
    async (group, base_revision) => ({
      revision: 4,
      groups: data().groups.map((item) =>
        item.id === group.id
          ? {
              ...group,
              revision: base_revision + 1,
              uk: [...group.uk].sort(
                (a, b) =>
                  Number(b.selected !== false) - Number(a.selected !== false)
              )
            }
          : item
      )
    })
  );
  vi.spyOn(api.speech, "deleteGroup").mockImplementation(async (id) => ({
    revision: 4,
    groups: data().groups.filter((group) => group.id !== id)
  }));
});
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});

describe("单组草稿与推荐", () => {
  it("A 有草稿时完成 B 只提交 B，取消 A 不影响已保存 B", async () => {
    const { client } = mount();
    const a = edit("A"),
      b = edit("B");
    fireEvent.change(within(a).getByLabelText("分组名称"), {
      target: { value: "A draft" }
    });
    fireEvent.change(within(b).getByLabelText("分组名称"), {
      target: { value: "B saved" }
    });
    fireEvent.click(within(b).getByRole("button", { name: "完成" }));
    await waitFor(() => expect(api.speech.saveGroup).toHaveBeenCalledOnce());
    expect(api.speech.saveGroup).toHaveBeenCalledWith(
      expect.objectContaining({ id: "b", name: "B saved" }),
      1,
      false
    );
    await screen.findByText("本组配音已保存。");
    expect(within(a).getByLabelText("分组名称")).toHaveValue("A draft");
    expect(
      client
        .getQueryData<AdminDubbingGroupsResponse>(queryKey)!
        .groups.find((group) => group.id === "a")!.name
    ).toBe("A");
    fireEvent.click(within(a).getByRole("button", { name: /取\s*消/ }));
    expect(screen.getByText("B saved", { exact: true })).toBeVisible();
    expect(screen.queryByDisplayValue("A draft")).toBeNull();
    expect(api.speech.saveGroups).not.toHaveBeenCalled();
  });
  it("取消勾选时行位置不变，完成后未选折叠且已选稳定前置", async () => {
    const initial = data();
    const a = initial.groups[1]!;
    a.uk.push({ ...a.uk[0]!, id: "second", name: "第二版本" });
    mount(initial);
    vi.mocked(api.speech.saveGroup).mockImplementation(
      async (group, revision) => ({
        ...initial,
        groups: initial.groups.map((item) =>
          item.id === group.id
            ? {
                ...group,
                revision: revision + 1,
                uk: [...group.uk].sort(
                  (a, b) =>
                    Number(b.selected !== false) - Number(a.selected !== false)
                )
              }
            : item
        )
      })
    );
    const panel = edit("A");
    fireEvent.click(within(panel).getByLabelText("选用 A英式"));
    expect(
      [...panel.querySelectorAll('input[type="checkbox"]')]
        .slice(0, 2)
        .map((input) => input.getAttribute("aria-label"))
    ).toEqual(["选用 A英式", "选用 第二版本"]);
    fireEvent.click(within(panel).getByRole("button", { name: "完成" }));
    await screen.findByText("本组配音已保存。");
    expect(within(panel).queryByLabelText("选用 A英式")).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "更多音色" }));
    expect(within(panel).getByLabelText("选用 A英式")).not.toBeChecked();
    expect(within(panel).getByLabelText("选用 第二版本")).toBeChecked();
  });
  it("拖动只重排当前组当前口音，取消丢弃顺序", () => {
    const initial = data();
    initial.groups[1]!.uk.push({
      ...initial.groups[1]!.uk[0]!,
      id: "second",
      name: "第二版本"
    });
    mount(initial);
    const panel = edit("A");
    const first = within(panel)
      .getByLabelText("选用 A英式")
      .closest(".dubbing-recommendation")!;
    const second = within(panel)
      .getByLabelText("选用 第二版本")
      .closest(".dubbing-recommendation")!;
    fireEvent.dragStart(second);
    fireEvent.dragOver(first);
    fireEvent.drop(first);
    expect(
      [...panel.querySelectorAll('input[type="checkbox"]')]
        .slice(0, 2)
        .map((node) => node.getAttribute("aria-label"))
    ).toEqual(["选用 第二版本", "选用 A英式"]);
    fireEvent.click(within(panel).getByRole("button", { name: /取\s*消/ }));
    const reopened = edit("A");
    expect(
      [...reopened.querySelectorAll('input[type="checkbox"]')]
        .slice(0, 2)
        .map((node) => node.getAttribute("aria-label"))
    ).toEqual(["选用 A英式", "选用 第二版本"]);
  });
  it("409 保留本组输入，其他组仍能取消", async () => {
    vi.mocked(api.speech.saveGroup).mockRejectedValue(
      new HttpError(409, "conflict")
    );
    mount();
    const panel = edit("A"),
      b = edit("B");
    fireEvent.change(within(panel).getByLabelText("分组名称"), {
      target: { value: "保留输入" }
    });
    fireEvent.click(within(panel).getByRole("button", { name: "完成" }));
    await screen.findByText(/本组已被修改或板块已被占用/);
    expect(within(panel).getByLabelText("分组名称")).toHaveValue("保留输入");
    fireEvent.click(within(b).getByRole("button", { name: /取\s*消/ }));
    expect(within(panel).getByLabelText("分组名称")).toHaveValue("保留输入");
  });
  it("全局常用不能改名或删除，允许两侧无推荐", async () => {
    const initial = data();
    initial.groups[0]!.uk = [];
    initial.groups[0]!.us = [];
    mount(initial);
    const panel = edit("全局常用");
    expect(within(panel).queryByLabelText("分组名称")).toBeNull();
    expect(
      within(panel).queryByRole("button", { name: "删除分组" })
    ).toBeNull();
    expect(within(panel).getByLabelText("全局常用 使用板块")).toBeDisabled();
    fireEvent.click(within(panel).getByRole("button", { name: "完成" }));
    await waitFor(() =>
      expect(api.speech.saveGroup).toHaveBeenCalledWith(
        expect.objectContaining({ is_global: true, uk: [], us: [] }),
        1,
        false
      )
    );
  });
  it("保存前验证声音参数，修复 0.73 后原样提交", async () => {
    mount();
    const panel = edit("A");
    const rate = within(panel).getAllByLabelText("推荐语速")[0]!;
    fireEvent.change(rate, { target: { value: "" } });
    fireEvent.click(within(panel).getByRole("button", { name: "完成" }));
    expect(api.speech.saveGroup).not.toHaveBeenCalled();
    fireEvent.change(rate, { target: { value: "0.73" } });
    fireEvent.click(within(panel).getByRole("button", { name: "完成" }));
    await waitFor(() => expect(api.speech.saveGroup).toHaveBeenCalled());
    expect(
      vi.mocked(api.speech.saveGroup).mock.calls[0]![0].uk[0]!.parameters
        .rate_percent
    ).toBe(-27);
  });
  it("取消后重新编辑使用已加载最新 revision，其他草稿保留", async () => {
    const { client } = mount();
    const panel = edit("A"),
      b = edit("B");
    const latest = data();
    latest.groups[1]!.revision = 4;
    await act(async () => {
      client.setQueryData(queryKey, latest);
    });
    fireEvent.click(within(panel).getByRole("button", { name: /取\s*消/ }));
    const next = edit("A");
    fireEvent.click(within(next).getByRole("button", { name: "完成" }));
    await waitFor(() => expect(api.speech.saveGroup).toHaveBeenCalled());
    expect(api.speech.saveGroup).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 4 }),
      4,
      false
    );
    expect(within(b).getByLabelText("分组名称")).toHaveValue("B");
  });
  it("保存期间旧 GET 不覆盖结果，撤销权限后仍可取消", async () => {
    const pending = deferred<AdminDubbingGroupsResponse>();
    const old = deferred<AdminDubbingGroupsResponse>();
    vi.mocked(api.speech.saveGroup).mockReturnValueOnce(pending.promise);
    vi.mocked(api.speech.groups).mockReturnValueOnce(old.promise);
    const { client } = mount();
    const panel = edit("A");
    fireEvent.click(within(panel).getByRole("button", { name: "完成" }));
    let refresh!: Promise<void>;
    act(() => {
      refresh = client.refetchQueries({ queryKey });
    });
    const saved = data();
    saved.groups[1]!.revision = 2;
    await act(async () => {
      pending.resolve(saved);
    });
    await screen.findByText("本组配音已保存。");
    await act(async () => {
      old.resolve(data());
      await refresh;
    });
    expect(client.getQueryData(queryKey)).toEqual(saved);
    const b = edit("B");
    act(() => setPermissions(["words.access"]));
    expect(within(b).getByRole("button", { name: "完成" })).toBeDisabled();
    fireEvent.click(within(b).getByRole("button", { name: /取\s*消/ }));
    expect(within(b).queryByLabelText("分组名称")).toBeNull();
  });
});
