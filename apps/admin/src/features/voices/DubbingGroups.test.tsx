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
  AdminDubbingGroupV3,
  AdminDubbingGroupsV3Response,
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
  accent: "us",
  gender: "male"
};
const queryKey = ["admin-dubbing-groups-v3", "groups-admin"];
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
    recommendations: {
      format: "paired",
      pairs: [
        {
          id: `${id}-pair`,
          name: `${name}推荐`,
          selected: true,
          uk: {
            id: `${id}-uk`,
            voice_alias: uk.alias,
            parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
          },
          us: {
            id: `${id}-us`,
            voice_alias: us.alias,
            parameters: {
              rate_percent: -20,
              pitch_semitones: 2,
              volume_percent: 80,
              style: null
            }
          }
        }
      ]
    }
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
    .getByText(`编辑${name}`, { exact: true })
    .closest(".dubbing-group") as HTMLElement;
}
function groupButton(panel: HTMLElement, name: string | RegExp) {
  return within(panel).getByRole("button", {
    name:
      typeof name === "string"
        ? new RegExp("^" + name.split("").join("\\s*") + "$")
        : name
  });
}
function edit(name: string) {
  const panel = card(name);
  fireEvent.click(groupButton(panel, `编辑${name}`));
  return panel;
}
beforeEach(() => {
  setPermissions(["words.access", "speech.generate", "speech.global_dubbing"]);
  vi.spyOn(api.speech, "groupsV3").mockResolvedValue(data());
  vi.spyOn(api.speech, "audioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "allAudioUpdates").mockResolvedValue({ updates: [] });
  vi.spyOn(api.speech, "audioUpdateSettings").mockResolvedValue({
    wait_seconds: 60,
    revision: 0
  });
  vi.spyOn(api.speech, "savePairedGroup").mockImplementation(
    async ({ group: input, base_revision }) => ({
      ...data(),
      revision: 4,
      groups: data().groups.map((g) =>
        g.id === input.id
          ? {
              ...input,
              revision: base_revision + 1,
              recommendations: { format: "paired", pairs: input.pairs }
            }
          : g
      )
    })
  );
  vi.spyOn(api.speech, "saveGroupOrder").mockImplementation(async (input) => ({
    ...data(),
    order_revision: 9,
    groups: input.group_ids.map((id) => data().groups.find((g) => g.id === id)!)
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
function pairs(response: AdminDubbingGroupsV3Response, index = 0) {
  const rec = response.groups[index]!.recommendations;
  if (rec.format !== "paired") throw new Error("fixture must be paired");
  return rec.pairs;
}
function selectVoice(name: string) {
  fireEvent.click(screen.getByRole("radio", { name }));
}

describe("v3 逐组草稿、整套身份与顺序", () => {
  it("A 草稿下完成 B 仅持久化 B，取消 A 不撤销 B 和既有任务", async () => {
    const { client } = mount();
    const oldTextResponse = {
      groups: [{ id: "legacy-text", uk: [], us: [] }],
      revision: 1
    };
    client.setQueryData(
      ["admin-dubbing-groups", "groups-admin"],
      oldTextResponse
    );
    const a = edit("A"),
      b = edit("B");
    fireEvent.change(within(a).getByLabelText("分组名称"), {
      target: { value: "A草稿" }
    });
    fireEvent.change(within(b).getByLabelText("分组名称"), {
      target: { value: "B已完成" }
    });
    fireEvent.click(groupButton(b, "完成"));
    await screen.findByText("本组配音已保存。");
    expect(api.speech.savePairedGroup).toHaveBeenCalledTimes(1);
    expect(api.speech.savePairedGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        group: expect.objectContaining({ id: "b", name: "B已完成" }),
        base_revision: 1
      }),
      false
    );
    expect(within(a).getByLabelText("分组名称")).toHaveValue("A草稿");
    expect(
      (client.getQueryData(queryKey) as AdminDubbingGroupsV3Response).groups[0]!
        .name
    ).toBe("A");
    fireEvent.click(groupButton(a, "取消"));
    await screen.findByText("编辑A");
    expect(screen.getByText("编辑B已完成")).toBeInTheDocument();
    expect(api.speech.saveGroup).not.toHaveBeenCalled();
    expect(
      client.getQueryData(["admin-dubbing-groups", "groups-admin"])
    ).toEqual(oldTextResponse);
  });
  it("单侧铅笔仅显示本侧两列，保存保持另一侧 ID／参数及本侧身份", async () => {
    mount();
    const panel = edit("A");
    fireEvent.click(
      within(panel).getByRole("button", { name: "修改英式 A推荐" })
    );
    expect(
      screen.getByRole("region", { name: "英式女声目录" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "美式男声目录" })
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("推荐语速"), {
      target: { value: "0.73" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存配音设置" }));
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    const input = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0];
    expect(input.group.pairs[0]!.uk).toEqual({
      ...pairs(data())[0]!.uk,
      parameters: { rate_percent: -27, pitch_semitones: 0, style: null }
    });
    expect(input.group.pairs[0]!.us).toEqual(pairs(data())[0]!.us);
  });
  it("新建整套不猜另一声，明确四列选择后仅回草稿", async () => {
    mount();
    const panel = edit("A");
    fireEvent.click(
      within(panel).getByRole("button", { name: "新增整套推荐" })
    );
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "新套" }
    });
    selectVoice("Sonia 女声");
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    await waitFor(() =>
      expect(
        screen.getByText("请明确选择美式音色，每套必须包含英美各一项。")
      ).toBeVisible()
    );
    selectVoice("Guy 男声");
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    const input = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0];
    expect(input.group.pairs).toHaveLength(2);
    const pair = input.group.pairs[1]!;
    expect(pair).toMatchObject({
      name: "新套",
      uk: { voice_alias: "sonia" },
      us: { voice_alias: "guy" }
    });
    expect(new Set([pair.id, pair.uk.id, pair.us.id]).size).toBe(3);
  });
  it("复制整套保留双侧完整参数，生成三个新 ID", async () => {
    mount();
    const panel = edit("A");
    fireEvent.click(
      within(panel).getByRole("button", { name: "复制整套 A推荐" })
    );
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    const input = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0];
    const [first, copy] = input.group.pairs;
    expect(copy!.uk.parameters).toEqual(first!.uk.parameters);
    expect(copy!.us.parameters).toEqual(first!.us.parameters);
    expect(
      new Set([
        first!.id,
        first!.uk.id,
        first!.us.id,
        copy!.id,
        copy!.uk.id,
        copy!.us.id
      ]).size
    ).toBe(6);
  });
  it("取消勾选不移动推荐，保存保留人工顺序及未选项", async () => {
    const initial = data();
    pairs(initial).push({
      ...structuredClone(pairs(initial)[0]!),
      id: "second",
      name: "第二套",
      uk: { ...pairs(initial)[0]!.uk, id: "second-uk" },
      us: { ...pairs(initial)[0]!.us, id: "second-us" }
    });
    mount(initial);
    const panel = edit("A");
    fireEvent.click(within(panel).getByLabelText("选用 A推荐"));
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    expect(
      vi
        .mocked(api.speech.savePairedGroup)
        .mock.calls[0]![0].group.pairs.map((p) => [p.id, p.selected])
    ).toEqual([
      ["a-pair", false],
      ["second", true]
    ]);
    expect(screen.queryByText("更多音色")).not.toBeInTheDocument();
  });
  it("组重排只提交服务器完整集合和 order_revision，排除新组与 A/B 内容草稿", async () => {
    const { client } = mount();
    const a = edit("A"),
      b = edit("B");
    fireEvent.change(within(a).getByLabelText("分组名称"), {
      target: { value: "A草稿" }
    });
    fireEvent.change(within(b).getByLabelText("分组名称"), {
      target: { value: "B草稿" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新增分组" }));
    expect(
      screen.getByRole("button", { name: "上移分组 新分组" })
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "上移分组 B草稿" }));
    await screen.findByText("分组顺序已保存，未完成内容仍保留在各组草稿。");
    expect(api.speech.saveGroupOrder).toHaveBeenCalledWith({
      group_ids: ["b", "a", "global"],
      base_revision: 8
    });
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    expect(within(a).getByLabelText("分组名称")).toHaveValue("A草稿");
    expect(within(b).getByLabelText("分组名称")).toHaveValue("B草稿");
    expect(
      (
        client.getQueryData(queryKey) as AdminDubbingGroupsV3Response
      ).groups.map((g) => g.name)
    ).toEqual(["B", "A", "全局常用"]);
  });
  it.each(["save", "order"])(
    "%s 409 保留全部草稿并允许重新载入",
    async (operation) => {
      const conflict = new HttpError(409, "conflict");
      if (operation === "save")
        vi.mocked(api.speech.savePairedGroup).mockRejectedValue(conflict);
      else vi.mocked(api.speech.saveGroupOrder).mockRejectedValue(conflict);
      mount();
      const a = edit("A"),
        b = edit("B");
      fireEvent.change(within(a).getByLabelText("分组名称"), {
        target: { value: "A草稿" }
      });
      fireEvent.change(within(b).getByLabelText("分组名称"), {
        target: { value: "B草稿" }
      });
      fireEvent.click(
        operation === "save"
          ? groupButton(b, "完成")
          : screen.getByRole("button", { name: "上移分组 B草稿" })
      );
      await screen.findByText(/全部草稿已保留/);
      expect(within(a).getByLabelText("分组名称")).toHaveValue("A草稿");
      expect(within(b).getByLabelText("分组名称")).toHaveValue("B草稿");
      fireEvent.click(screen.getByRole("button", { name: "重新载入" }));
      await waitFor(() => expect(api.speech.groupsV3).toHaveBeenCalled());
      expect(within(b).getByLabelText("分组名称")).toHaveValue("B草稿");
    }
  );
  it("保存期间旧 GET 不覆盖新结果，撤销权限仍可取消其他草稿", async () => {
    const late = deferred<AdminDubbingGroupsV3Response>(),
      save = deferred<AdminDubbingGroupsV3Response>();
    vi.mocked(api.speech.groupsV3).mockReturnValue(late.promise);
    vi.mocked(api.speech.savePairedGroup).mockReturnValue(save.promise);
    const { client } = mount();
    const a = edit("A"),
      b = edit("B");
    void client.refetchQueries({ queryKey });
    fireEvent.click(groupButton(a, "完成"));
    const fresh = data();
    fresh.revision = 9;
    fresh.groups[0]!.revision = 2;
    await act(async () => save.resolve(fresh));
    await screen.findByText("本组配音已保存。");
    await act(async () => late.resolve(data()));
    expect(client.getQueryData(queryKey)).toEqual(fresh);
    act(() => setPermissions(["words.access"]));
    expect(groupButton(b, "完成")).toBeDisabled();
    fireEvent.click(groupButton(b, "取消"));
    expect(
      screen.queryByRole("button", { name: "编辑B" })
    ).not.toBeInTheDocument();
  });
  it("全局固定末位不可排序、改名、删除，空套允许保存", async () => {
    const initial = data();
    initial.groups[2]!.recommendations = { format: "paired", pairs: [] };
    mount(initial);
    const panel = edit("全局常用");
    expect(within(panel).queryByLabelText("分组名称")).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText("删除分组")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /上移分组 全局/ })
    ).not.toBeInTheDocument();
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    expect(
      vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group.pairs
    ).toEqual([]);
  });
  it("所有历史侧项可见，拒绝未整理保存，人工补齐保留不等长及重复声音旧 ID", async () => {
    const initial = data(),
      old = pairs(initial)[0]!;
    initial.groups[0]!.recommendations = {
      format: "legacy",
      uk: [
        { ...old.uk, name: "旧一", selected: true },
        { ...old.uk, id: "old-uk-2", name: "旧二", selected: false }
      ],
      us: [{ ...old.us, name: "旧美", selected: true }]
    };
    mount(initial);
    const panel = edit("A");
    expect(within(panel).getByText("old-uk-2")).toBeVisible();
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText(/请先人工整理完整英美推荐套/);
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(
      within(panel).getByRole("button", { name: "人工配对／补齐" })
    );
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "人工第一套" }
    });
    for (const [side, text] of [
      ["英式", "旧二"],
      ["美式", "旧美"]
    ]) {
      fireEvent.mouseDown(screen.getByLabelText(`${side}历史版本`));
      fireEvent.click(
        await screen.findByText(new RegExp(text!), {
          selector: ".ant-select-item-option-content"
        })
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    expect(
      within(panel).getByRole("button", { name: "完成整理" })
    ).toBeDisabled();
    fireEvent.click(
      within(panel).getByRole("button", { name: "人工配对／补齐" })
    );
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "补齐套" }
    });
    fireEvent.mouseDown(screen.getByLabelText("英式历史版本"));
    fireEvent.click(
      await screen.findByText(/旧一/, {
        selector: ".ant-select-item-option-content"
      })
    );
    selectVoice("Guy 男声");
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    fireEvent.click(within(panel).getByRole("button", { name: "完成整理" }));
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    const result = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group
      .pairs;
    expect(result.map((p) => p.uk.id)).toEqual(["old-uk-2", "a-uk"]);
    expect(result[0]!.selected).toBe(false);
    expect(result[0]!.us).toEqual(old.us);
  });
  it("搜索与选声复用同一滚动容器和完整目录，不重排或挂载列", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...uk,
      alias: `uk-${i}`,
      display_name: `Female${i}`
    }));
    mount(data(), [...many, uk, us]);
    const panel = edit("A");
    fireEvent.click(
      within(panel).getByRole("button", { name: "新增整套推荐" })
    );
    const list = screen.getByLabelText("英式女声滚动列表");
    list.scrollTop = 170;
    expect(within(list).getAllByRole("radio")).toHaveLength(31);
    selectVoice("Female20 女声");
    fireEvent.change(screen.getByLabelText("搜索推荐音色"), {
      target: { value: "Female20" }
    });
    expect(screen.getByLabelText("英式女声滚动列表")).toBe(list);
    expect(list.scrollTop).toBe(170);
    fireEvent.change(screen.getByLabelText("搜索推荐音色"), {
      target: { value: "" }
    });
    expect(within(list).getAllByRole("radio")).toHaveLength(31);
    expect(list.scrollTop).toBe(170);
  });
  it("共享板块只提交当前组，API 失败保留参数、选用和另一组草稿", async () => {
    vi.mocked(api.speech.savePairedGroup).mockRejectedValueOnce(
      new Error("offline")
    );
    mount();
    const a = edit("A"),
      b = edit("B");
    fireEvent.change(within(a).getByLabelText("分组名称"), {
      target: { value: "A保留" }
    });
    fireEvent.mouseDown(within(b).getByLabelText("B 使用板块"));
    fireEvent.click(
      await screen.findByText("词形拼写", {
        selector: ".ant-select-item-option-content"
      })
    );
    fireEvent.click(within(b).getByLabelText("选用 B推荐"));
    fireEvent.click(groupButton(b, "完成"));
    await screen.findByText("保存失败，本组全部草稿已保留，请重试。");
    expect(within(b).getByLabelText("选用 B推荐")).not.toBeChecked();
    expect(within(a).getByLabelText("分组名称")).toHaveValue("A保留");
    const input = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0];
    expect(input.group.areas).toEqual(["example", "word"]);
    expect(input.group.pairs[0]!.selected).toBe(false);
    fireEvent.click(groupButton(b, "完成"));
    await screen.findByText("本组配音已保存。");
    expect(vi.mocked(api.speech.savePairedGroup).mock.calls[1]![0]).toEqual(
      input
    );
  });
  it("取消单侧参数修改不污染本组或另一组", async () => {
    mount();
    const panel = edit("A");
    fireEvent.click(
      within(panel).getByRole("button", { name: "修改英式 A推荐" })
    );
    fireEvent.change(screen.getByLabelText("推荐语速"), {
      target: { value: "0.73" }
    });
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: /^取?\s*消$/
      })
    );
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    expect(
      vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group.pairs
    ).toEqual(pairs(data()));
  });
  it("人工整理失效旧音色时可替换声音并保留原侧 ID", async () => {
    const initial = data();
    initial.groups[0]!.recommendations = {
      format: "legacy",
      uk: [
        {
          id: "old-disabled-side",
          name: "失效旧声",
          selected: false,
          voice_alias: "unavailable",
          parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
        }
      ],
      us: []
    };
    mount(initial);
    const panel = edit("A");
    fireEvent.click(
      within(panel).getByRole("button", { name: "人工配对／补齐" })
    );
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "明确替换" }
    });
    fireEvent.mouseDown(screen.getByLabelText("英式历史版本"));
    fireEvent.click(
      await screen.findByText(/失效旧声 ·/, {
        selector: ".ant-select-item-option-content"
      })
    );
    selectVoice("Sonia 女声");
    selectVoice("Guy 男声");
    fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
    fireEvent.click(within(panel).getByRole("button", { name: "完成整理" }));
    fireEvent.click(groupButton(panel, "完成"));
    await screen.findByText("本组配音已保存。");
    expect(
      vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group.pairs[0]
    ).toMatchObject({
      selected: false,
      uk: { id: "old-disabled-side", voice_alias: "sonia" }
    });
  });
});
