import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import type {
  AdminDubbingGroupV3,
  AdminDubbingRecommendation,
  AdminDubbingGroupsV3Response,
  AdminProfile,
  AdminSpeechVoice
} from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { api, useAuthStore } from "@/lib/auth";
import { DubbingGroups } from "./DubbingGroups";
import { DubbingDrafts } from "./DubbingDrafts";

// 草稿用例保留真实配置表单；完整试听和媒体生命周期由对应试听、音色库用例验证。
vi.mock("./DubbingAudition", async (importOriginal) => {
  const original = await importOriginal<typeof import("./DubbingAudition")>();
  return { ...original, DubbingAudition: () => null };
});

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
  accent: "us",
  gender: "male"
};
const queryKey = ["admin-dubbing-groups-v3", "groups-admin"];
let stored = data();
const clients: QueryClient[] = [];
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function group(
  id: string,
  name: string,
  areas: string[] = []
): AdminDubbingGroupV3 {
  return {
    id,
    name,
    areas,
    revision: 1,
    is_global: false,
    uk: [
      {
        id: `${id}-uk`,
        name: `${name}推荐`,
        selected: true,
        voice_alias: uk.alias,
        parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
      }
    ],
    us: [
      {
        id: `${id}-us`,
        name: `${name}推荐`,
        selected: true,
        voice_alias: us.alias,
        parameters: {
          rate_percent: -20,
          pitch_semitones: 2,
          volume_percent: 80,
          style: null
        }
      }
    ]
  };
}
function data(): AdminDubbingGroupsV3Response {
  return {
    revision: 3,
    order_revision: 8,
    groups: [
      group("a", "A", ["word"]),
      group("b", "B", ["example"]),
      { ...group("global", "全局常用"), is_global: true }
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
  stored = structuredClone(initial);
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
      <App>
        <RouterProvider router={router} />
      </App>
    </QueryClientProvider>
  );
  return { client, router, onAudition, onDirtyChange, ...view };
}
function groupPanel(name: string) {
  const panel = screen.getByLabelText(`${name} 分组配置`);
  expect(panel).toBeVisible();
  return panel;
}
function button(name: string | RegExp, container?: HTMLElement) {
  const view = container ? within(container) : screen;
  // 按公开标签/文字定位，避免逐个计算整页按钮样式。
  const labelled = view
    .queryAllByLabelText(name)
    .filter((node) => node.matches('button, [role="button"]'));
  const matches = [
    ...new Set(
      (labelled.length ? labelled : view.getAllByText(name))
        .map((node) => node.closest<HTMLElement>('button, [role="button"]'))
        .filter(
          (node): node is HTMLElement =>
            !!node && !node.closest('[aria-hidden="true"], [hidden], [inert]')
        )
    )
  ];
  expect(matches).toHaveLength(1);
  return matches[0]!;
}
function closeDialog() {
  fireEvent.click(button(/^取\s*消$/, screen.getByRole("dialog")));
}
async function rename(name: string, next: string) {
  const panel = groupPanel(name);
  fireEvent.click(button("编辑分组", panel));
  fireEvent.change(screen.getByLabelText("分组名称"), {
    target: { value: next }
  });
  fireEvent.click(button("应用到本组", screen.getByRole("dialog")));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
beforeEach(() => {
  setPermissions(["words.access", "speech.generate", "speech.global_dubbing"]);
  vi.spyOn(api.speech, "groupsV3").mockImplementation(async () =>
    structuredClone(stored)
  );
  vi.spyOn(api.speech, "audioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "allAudioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "audioUpdateSettings").mockResolvedValue({
    wait_seconds: 60,
    revision: 0
  });
  vi.spyOn(api.speech, "saveIndependentGroup").mockImplementation(
    async ({ group: input, base_revision }) => {
      const next = { ...structuredClone(input), revision: base_revision + 1 };
      const exists = stored.groups.some((group) => group.id === input.id);
      stored = {
        ...stored,
        revision: stored.revision + 1,
        groups: exists
          ? stored.groups.map((group) => (group.id === input.id ? next : group))
          : [
              ...stored.groups.filter((group) => !group.is_global),
              next,
              ...stored.groups.filter((group) => group.is_global)
            ]
      };
      return structuredClone(stored);
    }
  );
  vi.spyOn(api.speech, "saveGroupOrder").mockImplementation(async (input) => ({
    ...stored,
    order_revision: stored.order_revision + 1,
    groups: input.group_ids.map((id) => stored.groups.find((g) => g.id === id)!)
  }));
  vi.spyOn(api.speech, "deleteGroupV3").mockImplementation(async (id) => ({
    ...data(),
    order_revision: 9,
    groups: data().groups.filter((g) => g.id !== id)
  }));
  vi.spyOn(api.speech, "saveGroup");
});
afterEach(() => {
  cleanup();
  routers.splice(0).forEach((r) => r.dispose());
  clients.splice(0).forEach((c) => c.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});
function side(panel: HTMLElement, accent: "英式" | "美式") {
  return within(panel).getByRole("table", {
    name: new RegExp(`${accent}推荐$`)
  });
}
function items(table: HTMLElement) {
  return [...table.querySelectorAll("tbody tr")].map((row) =>
    row.getAttribute("data-recommendation-id")
  );
}
function recommendationRow(table: HTMLElement, id: string) {
  return table.querySelector<HTMLElement>(`[data-recommendation-id="${id}"]`)!;
}
function dragRecommendation(
  source: HTMLElement,
  target: HTMLElement,
  after = false
) {
  const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
  fireEvent.dragStart(source, { dataTransfer });
  for (const type of ["dragOver", "drop"] as const) {
    const event = createEvent[type](target, { dataTransfer });
    Object.defineProperty(event, "clientY", { value: after ? 1 : -1 });
    fireEvent(target, event);
  }
  fireEvent.dragEnd(source, { dataTransfer });
}
function versions(item: AdminDubbingRecommendation, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...structuredClone(item),
    id: `${item.id}-${index}`,
    name: `${item.name}${index + 1}`,
    selected: index !== 1,
    parameters: { ...item.parameters, rate_percent: index * 5 }
  }));
}
async function complete(panel: HTMLElement) {
  fireEvent.click(button("完成", panel));
  await screen.findByText(/配音已保存。/);
  expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
  expect(within(panel).queryByRole("button", { name: "取消" })).toBeNull();
}
async function remove(name: string, table: HTMLElement) {
  fireEvent.click(button(name, table));
  fireEvent.click(screen.getByRole("button", { name: /^删除$/ }));
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
}

describe("按口音独立推荐与逐组草稿", () => {
  it("英式2项美式5项独立展示，单侧美式增删重排保存刷新不改变英式", async () => {
    const initial = data();
    initial.groups[0]!.uk = versions(initial.groups[0]!.uk[0]!, 2);
    initial.groups[0]!.us = versions(initial.groups[0]!.us[0]!, 5);
    const { client } = mount(initial);
    const panel = groupPanel("A");
    expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "取消" })).toBeNull();
    const british = structuredClone(initial.groups[0]!.uk);
    expect(items(side(panel, "英式"))).toEqual(british.map((item) => item.id));
    const american = side(panel, "美式");
    expect(items(american)).toHaveLength(5);
    expect(
      within(side(panel, "英式"))
        .getAllByRole("columnheader")
        .map((node) => node.textContent)
    ).toEqual(["选用", "顺序", "推荐名称", "音色", "语速", "音量", "操作"]);
    dragRecommendation(
      recommendationRow(american, "a-us-2"),
      recommendationRow(american, "a-us-1")
    );
    fireEvent.click(within(american).getByLabelText("选用美式 A推荐2"));
    fireEvent.click(button("复制美式 A推荐1", american));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "美式副本" }
    });
    fireEvent.click(button("保存到本组", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await remove("删除美式 A推荐4", american);
    await complete(panel);
    const request = vi.mocked(api.speech.saveIndependentGroup).mock
      .calls[0]![0];
    expect(request.group.uk).toEqual(british);
    expect(request.group.us.map((item) => item.name)).toEqual([
      "A推荐1",
      "A推荐3",
      "A推荐2",
      "A推荐5",
      "美式副本"
    ]);
    expect(request.group.us.at(-1)).toMatchObject({
      voice_alias: "guy",
      parameters: initial.groups[0]!.us[0]!.parameters
    });
    expect(request.group.us.at(-1)!.id).not.toBe(initial.groups[0]!.us[0]!.id);
    expect(request.group.us[2]!.selected).toBe(true);
    await act(async () => client.refetchQueries({ queryKey }));
    expect(
      client.getQueryData<AdminDubbingGroupsV3Response>(queryKey)!.groups[0]!.uk
    ).toEqual(british);
    expect(items(side(panel, "美式"))).toEqual(
      request.group.us.map((item) => item.id)
    );
  });
  it("整行拖动可前后插入，取消恢复顺序；键盘排序只更新本组草稿", async () => {
    const initial = data();
    initial.groups[0]!.us = versions(initial.groups[0]!.us[0]!, 3);
    mount(initial);
    const panel = groupPanel("A");
    const american = side(panel, "美式");
    const original = items(american);
    expect(
      within(american).queryByRole("button", { name: /上移|下移/ })
    ).toBeNull();
    const first = recommendationRow(american, original[0]!);
    expect(first).toHaveAttribute("draggable", "true");
    dragRecommendation(first, recommendationRow(american, original[2]!), true);
    expect(items(american)).toEqual([original[1], original[2], original[0]]);
    expect(api.speech.saveIndependentGroup).not.toHaveBeenCalled();
    expect(button("完成", panel)).toBeEnabled();
    dragRecommendation(first, recommendationRow(american, original[1]!));
    expect(items(american)).toEqual(original);
    fireEvent.click(button("取消", panel));
    expect(items(american)).toEqual(original);
    expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
    const handle = button("拖动排序美式 A推荐1", american);
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowDown" });
    expect(items(american)).toEqual([original[1], original[0], original[2]]);
    expect(handle).toHaveFocus();
    fireEvent.keyDown(within(american).getByLabelText("美式 2 推荐名称"), {
      key: "ArrowUp"
    });
    expect(items(american)).toEqual([original[1], original[0], original[2]]);
    fireEvent.click(button("取消", panel));
    expect(items(american)).toEqual(original);
    expect(api.speech.saveIndependentGroup).not.toHaveBeenCalled();
  });
  it("跨侧跨组、外部拖动、原位置及撤销权限后的拖动不产生草稿", () => {
    const initial = data();
    initial.groups[0]!.us = versions(initial.groups[0]!.us[0]!, 3);
    initial.groups[0]!.uk = versions(initial.groups[0]!.uk[0]!, 2);
    initial.groups[1]!.us = versions(initial.groups[1]!.us[0]!, 2);
    mount(initial);
    const panel = groupPanel("A");
    const american = side(panel, "美式");
    const original = items(american);
    const source = recommendationRow(american, original[0]!);
    const target = recommendationRow(american, original[1]!);
    dragRecommendation(
      source,
      recommendationRow(side(panel, "英式"), "a-uk-0")
    );
    dragRecommendation(
      source,
      recommendationRow(side(groupPanel("B"), "美式"), "b-us-0")
    );
    dragRecommendation(source, source);
    dragRecommendation(source, target);
    dragRecommendation(within(source).getByRole("textbox"), target, true);
    fireEvent.drop(target, { dataTransfer: { getData: () => original[0] } });
    expect(items(american)).toEqual(original);
    expect(items(side(panel, "英式"))).toEqual(["a-uk-0", "a-uk-1"]);
    expect(items(side(groupPanel("B"), "美式"))).toEqual(["b-us-0", "b-us-1"]);
    expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
    const dataTransfer = { setData: vi.fn(), setDragImage: vi.fn() };
    fireEvent.dragStart(source, { dataTransfer });
    act(() => setPermissions(["words.access"]));
    fireEvent.drop(target, { dataTransfer });
    fireEvent.dragEnd(source, { dataTransfer });
    expect(source).toHaveAttribute("draggable", "false");
    expect(items(american)).toEqual(original);
    expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
    expect(api.speech.saveIndependentGroup).not.toHaveBeenCalled();
  });
  it("一侧为空时可新增当前侧，取消抽屉不制造草稿，完成不补齐另一侧", async () => {
    const initial = data();
    initial.groups[0]!.uk = [];
    initial.groups[0]!.us = [];
    mount(initial);
    const panel = groupPanel("A");
    const british = within(panel).getByLabelText("A 英式");
    fireEvent.click(button("新增推荐", british));
    expect(screen.queryByRole("radio", { name: "Guy 男声" })).toBeNull();
    closeDialog();
    expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
    fireEvent.click(button("新增推荐", british));
    fireEvent.click(screen.getByRole("radio", { name: "Sonia 女声" }));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "英式慢速" }
    });
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    fireEvent.click(button("保存到本组", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await complete(panel);
    expect(api.speech.saveIndependentGroup).toHaveBeenCalledWith(
      {
        group: expect.objectContaining({
          uk: [
            expect.objectContaining({
              name: "英式慢速",
              parameters: expect.objectContaining({ rate_percent: -27 })
            })
          ],
          us: []
        }),
        base_revision: 1
      },
      false
    );
  });
  it("A有草稿时完成B只B落盘，取消A保留B与既有音频任务", async () => {
    mount();
    await rename("A", "A草稿");
    fireEvent.click(
      within(side(groupPanel("A草稿"), "美式")).getByLabelText("选用美式 A推荐")
    );
    await rename("B", "B已保存");
    await complete(groupPanel("B已保存"));
    expect(vi.mocked(api.speech.saveIndependentGroup).mock.calls).toHaveLength(
      1
    );
    expect(stored.groups[0]).toEqual(data().groups[0]);
    expect(stored.groups[1]!.name).toBe("B已保存");
    expect(within(groupPanel("A草稿")).getByText("未保存")).toBeVisible();
    const cancelTasks = vi.spyOn(api.speech, "cancelAudioUpdate");
    fireEvent.click(button("取消", groupPanel("A草稿")));
    await waitFor(() => expect(groupPanel("A")).toBeVisible());
    expect(
      within(groupPanel("B已保存")).queryByRole("button", { name: "完成" })
    ).toBeNull();
    expect(
      within(groupPanel("A")).queryByRole("button", { name: "取消" })
    ).toBeNull();
    expect(cancelTasks).not.toHaveBeenCalled();
  });
  it("单条修改和取消只处理当前推荐，保持身份、同侧其他参数和另一侧", async () => {
    const initial = data();
    initial.groups[0]!.uk = versions(initial.groups[0]!.uk[0]!, 2);
    mount(initial);
    const panel = groupPanel("A");
    fireEvent.click(button("修改英式 A推荐1", panel));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    closeDialog();
    expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
    fireEvent.click(button("修改英式 A推荐1", panel));
    expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.85" }
    });
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "新版" }
    });
    fireEvent.click(button("保存到本组", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await complete(panel);
    expect(stored.groups[0]!.uk).toEqual([
      {
        ...initial.groups[0]!.uk[0]!,
        name: "新版",
        parameters: {
          ...initial.groups[0]!.uk[0]!.parameters,
          rate_percent: -15,
          volume_percent: 100
        }
      },
      initial.groups[0]!.uk[1]!
    ]);
    expect(stored.groups[0]!.us).toEqual(initial.groups[0]!.us);
  });
  it("删除二次确认取消保留，单侧删空可保存；全局固定末位", async () => {
    mount();
    const panel = groupPanel("全局常用");
    expect(within(panel).queryByText("编辑分组")).toBeNull();
    expect(screen.queryByLabelText("上移分组 全局常用")).toBeNull();
    expect(
      [...document.querySelectorAll("[data-group-id]")].map((node) =>
        node.getAttribute("data-group-id")
      )
    ).toEqual(["a", "b", "global"]);
    fireEvent.click(button("删除美式 全局常用推荐", panel));
    fireEvent.click(screen.getByRole("button", { name: /^取消$/ }));
    expect(items(side(panel, "美式"))).toEqual(["global-us"]);
    expect(within(panel).queryByRole("button", { name: "完成" })).toBeNull();
    await remove("删除美式 全局常用推荐", panel);
    await complete(panel);
    expect(stored.groups[2]).toMatchObject({
      is_global: true,
      name: "全局常用",
      us: [],
      uk: data().groups[2]!.uk
    });
  });
  it("分组排序只提交持久化ID/order_revision，不夹带已有与新建组草稿", async () => {
    mount();
    await rename("A", "A草稿");
    fireEvent.click(button("新增分组"));
    fireEvent.change(screen.getByLabelText("分组名称"), {
      target: { value: "本地新组" }
    });
    fireEvent.click(button("应用到本组", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("上移分组 B"));
    await screen.findByText(/分组顺序已保存/);
    expect(api.speech.saveGroupOrder).toHaveBeenCalledWith({
      group_ids: ["b", "a", "global"],
      base_revision: 8
    });
    expect(api.speech.saveIndependentGroup).not.toHaveBeenCalled();
    expect(groupPanel("A草稿")).toHaveTextContent("未保存");
    expect(groupPanel("本地新组")).toHaveTextContent("未保存");
  });
  it("新建分组首次取消移除，删除请求失败保留表单和其他组草稿", async () => {
    mount();
    await rename("B", "B草稿");
    fireEvent.click(button("新增分组"));
    closeDialog();
    expect(screen.queryByLabelText("新分组 分组配置")).toBeNull();
    vi.mocked(api.speech.deleteGroupV3).mockRejectedValueOnce(
      new Error("network")
    );
    fireEvent.click(button("编辑分组", groupPanel("A")));
    fireEvent.change(screen.getByLabelText("分组名称"), {
      target: { value: "表单草稿" }
    });
    fireEvent.click(button("删除分组", screen.getByRole("dialog")));
    fireEvent.click(
      within(screen.getAllByRole("dialog").at(-1)!).getByRole("button", {
        name: "删除分组"
      })
    );
    await screen.findByText("删除失败，当前草稿保留。");
    expect(screen.getByLabelText("分组名称")).toHaveValue("表单草稿");
    expect(groupPanel("B草稿")).toHaveTextContent("未保存");
  });
  it("失败和409保留两侧草稿，重试发送原版本与参数；取消一组不清除另一组错误", async () => {
    mount();
    for (const name of ["A", "B"])
      fireEvent.click(
        within(side(groupPanel(name), "美式")).getByLabelText(
          `选用美式 ${name}推荐`
        )
      );
    vi.mocked(api.speech.saveIndependentGroup)
      .mockRejectedValueOnce(new Error("network"))
      .mockRejectedValueOnce(new HttpError(409, "conflict"));
    fireEvent.click(button("完成", groupPanel("A")));
    await screen.findByText(/保存失败，本组全部草稿/);
    const request = vi.mocked(api.speech.saveIndependentGroup).mock
      .calls[0]![0];
    fireEvent.click(button("完成", groupPanel("B")));
    await screen.findByText(/本组已被修改或名称已被使用/);
    fireEvent.click(button("取消", groupPanel("B")));
    expect(groupPanel("A")).toHaveTextContent("保存失败");
    await complete(groupPanel("A"));
    expect(
      vi.mocked(api.speech.saveIndependentGroup).mock.calls[2]![0]
    ).toEqual(request);
    expect(request.group.us[0]!.selected).toBe(false);
    expect(request.group.uk).toEqual(data().groups[0]!.uk);
  });
  it("保存中锁定操作，迟到GET不能覆盖完成结果；撤销写权限后可取消他组草稿", async () => {
    const late = deferred<AdminDubbingGroupsV3Response>(),
      saved = deferred<AdminDubbingGroupsV3Response>();
    vi.mocked(api.speech.groupsV3).mockReturnValue(late.promise);
    vi.mocked(api.speech.saveIndependentGroup).mockReturnValue(saved.promise);
    const { client } = mount();
    for (const name of ["A", "B"])
      fireEvent.click(
        within(side(groupPanel(name), "美式")).getByLabelText(
          `选用美式 ${name}推荐`
        )
      );
    void client.refetchQueries({ queryKey });
    fireEvent.click(button("完成", groupPanel("A")));
    expect(button("取消", groupPanel("A"))).toBeDisabled();
    expect(button("完成", groupPanel("B"))).toBeDisabled();
    const fresh = data();
    fresh.revision = 9;
    fresh.groups[0]!.revision = 2;
    fresh.groups[0]!.us[0]!.selected = false;
    await act(async () => saved.resolve(fresh));
    await screen.findByText(/配音已保存。/);
    await act(async () => late.resolve(data()));
    expect(client.getQueryData(queryKey)).toEqual(fresh);
    act(() => setPermissions(["words.access"]));
    expect(button("完成", groupPanel("B"))).toBeDisabled();
    fireEvent.click(button("取消", groupPanel("B")));
    expect(
      within(groupPanel("B")).queryByRole("button", { name: "完成" })
    ).toBeNull();
  });
  it("冲突取消后读取最新服务端配置，不取消已提交任务", async () => {
    mount();
    vi.mocked(api.speech.saveIndependentGroup).mockRejectedValueOnce(
      new HttpError(409, "conflict")
    );
    fireEvent.click(
      within(side(groupPanel("A"), "美式")).getByLabelText("选用美式 A推荐")
    );
    fireEvent.click(button("完成", groupPanel("A")));
    await screen.findByText(/本组已被修改或名称已被使用/);
    stored.groups[0]!.name = "远端A";
    stored.groups[0]!.revision = 2;
    fireEvent.click(button("取消", groupPanel("A")));
    await screen.findByLabelText("远端A 分组配置");
    expect(screen.queryByText(/本组已被修改或名称已被使用/)).toBeNull();
  });
  it("已有声音归属失配仍保留提示，允许取消选用而不必改声", async () => {
    mount(data(), [uk, { ...us, accent: "gb" }]);
    const panel = groupPanel("A");
    expect(button("试听美式 A推荐", panel)).toBeDisabled();
    expect(panel).toHaveTextContent("音色口音与美式推荐不符");
    fireEvent.click(
      within(side(panel, "美式")).getByLabelText("选用美式 A推荐")
    );
    await complete(panel);
    expect(stored.groups[0]!.us[0]).toEqual({
      ...data().groups[0]!.us[0]!,
      selected: false
    });
  });
  it("仅浏览/试听不制造草稿，无写权限不显示编辑操作，试听单独授权", () => {
    setPermissions(["words.access"]);
    const { onAudition } = mount();
    expect(within(groupPanel("A")).queryByText("新增推荐")).toBeNull();
    expect(screen.queryByLabelText("修改英式 A推荐")).toBeNull();
    fireEvent.click(button("试听英式 A推荐", groupPanel("A")));
    expect(onAudition).toHaveBeenCalledWith(uk, data().groups[0]!.uk[0]);
    expect(api.speech.saveIndependentGroup).not.toHaveBeenCalled();
  });
  it("预览读取已保存配置，已有草稿不混入", async () => {
    mount();
    fireEvent.change(
      within(side(groupPanel("A"), "英式")).getByLabelText("英式 1 推荐名称"),
      { target: { value: "未保存声音" } }
    );
    fireEvent.click(button("词库预览"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("A推荐");
    expect(dialog).not.toHaveTextContent("未保存声音");
    expect(
      within(dialog).getByRole("table", { name: "A 英式推荐" })
    ).toBeVisible();
    fireEvent.click(button("知道了", dialog));
    expect(groupPanel("A")).toHaveTextContent("未保存");
  });
});
