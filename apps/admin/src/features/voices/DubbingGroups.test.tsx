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
  fireEvent.click(
    button(`配置${name.startsWith("Guy") ? "美式" : "英式"}声音`)
  );
  fireEvent.click(
    within(
      screen.getByLabelText(
        `${name.startsWith("Guy") ? "美式" : "英式"}音色滚动列表`
      )
    ).getByRole("radio", { name })
  );
}

describe("分组工作台与逐组草稿", () => {
  it("多组表格按优先级同时展示，全局兜底固定末位；保存 B 不提交 A", async () => {
    const { client } = mount();
    expect(
      screen.getByRole("region", { name: "全局常用 分组配置" })
    ).toBeVisible();
    expect(
      screen
        .getAllByRole("region")
        .map((node) => node.getAttribute("aria-label"))
    ).toEqual(["A 分组配置", "B 分组配置", "全局常用 分组配置"]);
    for (const name of ["A", "B", "全局常用"]) {
      expect(
        screen.getByRole("table", { name: `${name}英美推荐` })
      ).toBeVisible();
    }
    expect(screen.getByLabelText("上移分组 A")).toBeDisabled();
    expect(screen.getByLabelText("下移分组 B")).toBeDisabled();
    await rename("A", "A草稿");
    await rename("B", "B已完成");
    fireEvent.click(button("保存当前组", groupPanel("B已完成")));
    await screen.findByText(/配音已保存。/);
    expect(api.speech.savePairedGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        group: expect.objectContaining({ id: "b", name: "B已完成" }),
        base_revision: 1
      }),
      false
    );
    expect(
      (client.getQueryData(queryKey) as AdminDubbingGroupsV3Response).groups[0]!
        .name
    ).toBe("A");
    fireEvent.click(button("取消修改", groupPanel("A草稿")));
    expect(screen.getByLabelText("A 分组配置")).toBeVisible();
    expect(api.speech.saveGroup).not.toHaveBeenCalled();
  });
  it("删除推荐须二次确认，取消保留原套，确认只修改本组草稿", async () => {
    mount();
    const a = groupPanel("A"),
      b = groupPanel("B");
    fireEvent.click(button("移除推荐 A推荐", a));
    await waitFor(() =>
      expect(screen.getByText("删除推荐「A推荐」？")).toBeVisible()
    );
    expect(within(a).getByLabelText("推荐名称 1")).toHaveValue("A推荐");
    expect(button("保存当前组", a)).toBeDisabled();
    fireEvent.click(button(/^取\s*消$/, screen.getByRole("tooltip")));
    await waitFor(() =>
      expect(screen.queryByText("删除推荐「A推荐」？")).toBeNull()
    );
    expect(within(a).getByLabelText("推荐名称 1")).toHaveValue("A推荐");
    expect(button("保存当前组", a)).toBeDisabled();
    fireEvent.click(button("移除推荐 A推荐", a));
    fireEvent.click(button(/^删\s*除$/, screen.getByRole("tooltip")));
    expect(within(a).queryByLabelText("推荐名称 1")).toBeNull();
    expect(button("保存当前组", a)).toBeEnabled();
    expect(within(b).getByLabelText("推荐名称 1")).toHaveValue("B推荐");
    expect(button("保存当前组", b)).toBeDisabled();
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
  });
  it("单侧抽屉只调整本侧，应用后仍须保存当前组，保留双侧身份", async () => {
    mount();
    const panel = groupPanel("A");
    fireEvent.click(button("修改英式 A推荐", panel));
    expect(screen.getByRole("dialog", { name: /英式声音/ })).toBeVisible();
    expect(screen.getByLabelText("英式音色")).toBeInTheDocument();
    expect(screen.queryByLabelText("美式音色")).toBeNull();
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    fireEvent.change(screen.getByLabelText("合成音量"), {
      target: { value: "65" }
    });
    fireEvent.click(button("保存到本组", screen.getByRole("dialog")));
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    const input = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0];
    expect(input.group.pairs[0]!.uk).toEqual({
      ...pairs(data())[0]!.uk,
      parameters: {
        rate_percent: -27,
        pitch_semitones: 0,
        style: null,
        volume_percent: 65
      }
    });
    expect(input.group.pairs[0]!.us).toEqual(pairs(data())[0]!.us);
  });
  it("打开或取消声音抽屉不制造草稿，取消参数不污染原配置", () => {
    mount();
    const panel = groupPanel("A");
    fireEvent.click(button("修改英式 A推荐", panel));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    closeDialog();
    expect(button("保存当前组", panel)).toBeDisabled();
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
  });
  it("推荐弹窗取消或关闭、跨组编辑及取消当前组，都保留其他组已应用的草稿", async () => {
    mount();
    const a = groupPanel("A");
    fireEvent.change(within(a).getByLabelText("推荐名称 1"), {
      target: { value: "A推荐草稿" }
    });
    fireEvent.click(button("修改英式 A推荐草稿", a));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    fireEvent.click(button("保存到本组", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.change(
      within(groupPanel("全局常用")).getByLabelText("推荐名称 1"),
      {
        target: { value: "全局推荐草稿" }
      }
    );
    const b = groupPanel("B");
    fireEvent.change(within(b).getByLabelText("推荐名称 1"), {
      target: { value: "B推荐草稿" }
    });
    fireEvent.click(button("新增推荐", b));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "取消的新推荐" }
    });
    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("复制整套 B推荐草稿", b));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "关闭的复制推荐" }
    });
    fireEvent.click(button("Close", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(
      within(b).getAllByRole("textbox", { name: /推荐名称/ })
    ).toHaveLength(1);
    fireEvent.click(button("修改美式 B推荐草稿", b));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.90" }
    });
    fireEvent.click(button("Close", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(b.textContent).toContain("0.80");
    fireEvent.click(button("取消修改", b));
    expect(within(b).getByLabelText("推荐名称 1")).toHaveValue("B推荐");
    expect(within(groupPanel("A")).getByLabelText("推荐名称 1")).toHaveValue(
      "A推荐草稿"
    );
    expect(a.textContent).toContain("0.73");
    expect(
      within(groupPanel("全局常用")).getByLabelText("推荐名称 1")
    ).toHaveValue("全局推荐草稿");
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
  });
  it("离开确认的关闭和继续编辑都保留各组草稿", async () => {
    const { router } = mount();
    await rename("A", "A草稿");
    await rename("B", "B草稿");
    for (const action of ["Close", "继续编辑"]) {
      await act(() => router.navigate("/elsewhere"));
      const dialog = screen.getByRole("dialog", {
        name: "分组还有未保存的修改"
      });
      fireEvent.click(button(action, dialog));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(router.state.location.pathname).toBe("/");
      expect(button("保存当前组", groupPanel("A草稿"))).toBeEnabled();
      expect(button("保存当前组", groupPanel("B草稿"))).toBeEnabled();
    }
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
  });
  it("完整英美套须人工选齐；复制保留参数但生成新的套及侧身份", async () => {
    mount();
    const panel = groupPanel("A");
    fireEvent.click(button("新增推荐", panel));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "新套" }
    });
    selectVoice("Sonia 女声");
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    await waitFor(() =>
      expect(
        screen.getByText("请明确选择美式音色，每套必须包含英美各一项。")
      ).toBeVisible()
    );
    selectVoice("Guy 男声");
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    fireEvent.click(button("复制整套 A推荐", panel));
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    const result = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group
      .pairs;
    expect(result).toHaveLength(3);
    const copied = result[2]!;
    expect(copied.id).not.toBe(result[0]!.id);
    expect(copied.uk.id).not.toBe(result[0]!.uk.id);
    expect(copied.us.id).not.toBe(result[0]!.us.id);
    expect(copied.uk.parameters).toEqual(result[0]!.uk.parameters);
    expect(copied.us.parameters).toEqual(result[0]!.us.parameters);
  });
  it("手动顺序与未选项保存后不被自动重排", async () => {
    const initial = data();
    const rec = pairs(initial);
    rec.push({
      ...structuredClone(rec[0]!),
      id: "second",
      name: "第二套",
      selected: false,
      uk: { ...rec[0]!.uk, id: "second-uk" },
      us: { ...rec[0]!.us, id: "second-us" }
    });
    mount(initial);
    const panel = groupPanel("A");
    fireEvent.click(button("上移推荐 第二套", panel));
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    expect(
      vi
        .mocked(api.speech.savePairedGroup)
        .mock.calls[0]![0].group.pairs.map((p) => [p.name, p.selected])
    ).toEqual([
      ["第二套", false],
      ["A推荐", true]
    ]);
  });
  it("首次新建取消仍移除新组，保留其他组的草稿", async () => {
    mount();
    await rename("A", "A草稿");
    fireEvent.click(button("新增分组"));
    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByLabelText("新分组 分组配置")).toBeNull();
    expect(screen.getByLabelText("A草稿 分组配置")).toBeVisible();
  });
  it.each(["cancel", "failure"])(
    "删除分组 %s 后仍保留编辑表单和其他组草稿",
    async (action) => {
      if (action === "failure")
        vi.mocked(api.speech.deleteGroupV3).mockRejectedValueOnce(
          new Error("删除失败")
        );
      mount();
      await rename("A", "A草稿");
      fireEvent.click(button("编辑分组", groupPanel("B")));
      fireEvent.change(screen.getByLabelText("分组名称"), {
        target: { value: "B尚未应用" }
      });
      fireEvent.click(button("删除分组", screen.getByRole("dialog")));
      const confirmation = screen
        .getByText("删除「B」？", { selector: ".ant-modal-confirm-title" })
        .closest<HTMLElement>('[role="dialog"]')!;
      fireEvent.click(
        button(action === "cancel" ? /^取\s*消$/ : "删除分组", confirmation)
      );
      await waitFor(() =>
        expect(
          screen.queryByText("删除「B」？", {
            selector: ".ant-modal-confirm-title"
          })
        ).toBeNull()
      );
      expect(screen.getByLabelText("分组名称")).toHaveValue("B尚未应用");
      fireEvent.click(button("应用到本组", screen.getByRole("dialog")));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByLabelText("B尚未应用 分组配置")).toBeVisible();
      expect(screen.getByLabelText("A草稿 分组配置")).toBeVisible();
      if (action === "cancel")
        expect(api.speech.deleteGroupV3).not.toHaveBeenCalled();
    }
  );
  it("删除成功才关闭编辑表单，其他分组草稿继续保留", async () => {
    mount();
    await rename("A", "A草稿");
    fireEvent.click(button("编辑分组", groupPanel("B")));
    fireEvent.change(screen.getByLabelText("分组名称"), {
      target: { value: "B未应用修改" }
    });
    fireEvent.click(button("删除分组", screen.getByRole("dialog")));
    const confirmation = screen
      .getByText("删除「B」？", { selector: ".ant-modal-confirm-title" })
      .closest<HTMLElement>('[role="dialog"]')!;
    fireEvent.click(button("删除分组", confirmation));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.speech.deleteGroupV3).toHaveBeenCalledWith("b", 1);
    expect(button("保存当前组", groupPanel("A草稿"))).toBeEnabled();
    expect(screen.queryByLabelText("B 分组配置")).toBeNull();
  });
  it.each(["cancel", "close"])(
    "未保存分组重新编辑分组后 %s 只取消本次表单，不删除整组草稿",
    async (action) => {
      mount();
      fireEvent.click(button("新增分组"));
      fireEvent.change(screen.getByLabelText("分组名称"), {
        target: { value: "未保存分组" }
      });
      fireEvent.click(button("应用到本组", screen.getByRole("dialog")));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      fireEvent.click(button("新增推荐", groupPanel("未保存分组")));
      fireEvent.change(screen.getByLabelText("推荐名称"), {
        target: { value: "保留推荐" }
      });
      selectVoice("Sonia 女声");
      selectVoice("Guy 男声");
      fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      fireEvent.click(button("编辑分组", groupPanel("未保存分组")));
      fireEvent.change(screen.getByLabelText("分组名称"), {
        target: { value: "不要应用的名称" }
      });
      if (action === "cancel") closeDialog();
      else fireEvent.click(button("Close", screen.getByRole("dialog")));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      expect(screen.getByLabelText("未保存分组 分组配置")).toBeVisible();
      const panel = groupPanel("未保存分组");
      expect(within(panel).getByLabelText("推荐名称 1")).toHaveValue(
        "保留推荐"
      );
      expect(button("保存当前组", panel)).toBeEnabled();
      expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    }
  );
  it("新增分组取消后消失；排序只提交已持久化 ID，不夹带任何组草稿", async () => {
    mount();
    await rename("A", "A草稿");
    fireEvent.click(button("新增分组"));
    fireEvent.change(screen.getByLabelText("分组名称"), {
      target: { value: "临时组" }
    });
    fireEvent.click(button("应用到本组", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByLabelText("上移分组 临时组")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("上移分组 B"));
    await screen.findByText("分组顺序已保存，未完成内容仍保留在各组草稿。");
    expect(api.speech.saveGroupOrder).toHaveBeenCalledWith({
      group_ids: ["b", "a", "global"],
      base_revision: 8
    });
    fireEvent.click(button("取消修改", groupPanel("临时组")));
    expect(screen.queryByLabelText("临时组 分组配置")).toBeNull();
    expect(screen.getByLabelText("A草稿 分组配置")).toBeVisible();
  });
  it.each(["save", "order"])(
    "%s 的真实版本冲突保留各组草稿与参数",
    async (command) => {
      const conflict = new HttpError(409, "conflict");
      if (command === "save")
        vi.mocked(api.speech.savePairedGroup).mockRejectedValueOnce(conflict);
      else vi.mocked(api.speech.saveGroupOrder).mockRejectedValueOnce(conflict);
      mount();
      await rename("A", "A保留");
      const b = groupPanel("B");
      fireEvent.click(within(b).getByLabelText("选用 B推荐"));
      if (command === "save") fireEvent.click(button("保存当前组", b));
      else {
        fireEvent.click(screen.getByLabelText("上移分组 B"));
      }
      await screen.findByText(
        command === "save"
          ? /本组已被修改或名称已被使用/
          : /分组集合或顺序已变化/
      );
      expect(screen.getByLabelText("A保留 分组配置")).toBeVisible();
      expect(within(b).getByLabelText("选用 B推荐")).not.toBeChecked();
      expect(button("保存当前组", b)).toBeEnabled();
    }
  );
  it("API 失败保留共享板块、参数与选用，重试发送同一个当前组", async () => {
    vi.mocked(api.speech.savePairedGroup).mockRejectedValueOnce(
      new Error("offline")
    );
    mount();
    await rename("A", "A草稿");
    const b = groupPanel("B");
    fireEvent.click(button("编辑分组", b));
    fireEvent.mouseDown(screen.getByLabelText("使用板块"));
    fireEvent.click(
      await screen.findByText("词形拼写", {
        selector: ".ant-select-item-option-content"
      })
    );
    fireEvent.click(button("应用到本组", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(within(b).getByLabelText("选用 B推荐"));
    fireEvent.click(button("保存当前组", b));
    await within(b).findByText("保存失败，本组全部草稿已保留，请重试。");
    const input = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0];
    expect(input.group.areas).toEqual(["example", "word"]);
    expect(input.group.pairs[0]!.selected).toBe(false);
    fireEvent.click(button("保存当前组", b));
    await screen.findByText(/配音已保存。/);
    expect(vi.mocked(api.speech.savePairedGroup).mock.calls[1]![0]).toEqual(
      input
    );
    expect(screen.getByLabelText("A草稿 分组配置")).toBeVisible();
  });
  it("各组保存校验错误独立显示，取消一组不清除另一组的错误", async () => {
    mount();
    const a = groupPanel("A"),
      b = groupPanel("B");
    for (const panel of [a, b]) {
      fireEvent.change(within(panel).getByLabelText("推荐名称 1"), {
        target: { value: "" }
      });
      fireEvent.click(button("保存当前组", panel));
      expect(within(panel).getByText("请填写推荐名称。")).toBeVisible();
    }
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(button("取消修改", a));
    expect(within(a).queryByText("请填写推荐名称。")).toBeNull();
    expect(within(b).getByText("请填写推荐名称。")).toBeVisible();
    fireEvent.change(within(b).getByLabelText("推荐名称 1"), {
      target: { value: "B推荐" }
    });
    fireEvent.click(button("保存当前组", b));
    await screen.findByText(/配音已保存。/);
    expect(within(b).queryByText("请填写推荐名称。")).toBeNull();
  });
  it("保存时取消旧分组 GET，迟到结果不能覆盖新配置；撤销权限仍能取消草稿", async () => {
    const late = deferred<AdminDubbingGroupsV3Response>();
    const saved = deferred<AdminDubbingGroupsV3Response>();
    vi.mocked(api.speech.groupsV3).mockReturnValue(late.promise);
    vi.mocked(api.speech.savePairedGroup).mockReturnValue(saved.promise);
    const { client } = mount();
    const a = groupPanel("A");
    fireEvent.click(within(a).getByLabelText("选用 A推荐"));
    const b = groupPanel("B");
    fireEvent.click(within(b).getByLabelText("选用 B推荐"));
    void client.refetchQueries({ queryKey });
    fireEvent.click(button("保存当前组", groupPanel("A")));
    const fresh = data();
    fresh.revision = 9;
    fresh.groups[0]!.revision = 2;
    await act(async () => saved.resolve(fresh));
    await screen.findByText(/配音已保存。/);
    await act(async () => late.resolve(data()));
    expect(client.getQueryData(queryKey)).toEqual(fresh);
    act(() => setPermissions(["words.access"]));
    groupPanel("B");
    expect(button("保存当前组", b)).toBeDisabled();
    fireEvent.click(button("取消修改", b));
    expect(within(b).queryByRole("button", { name: "保存当前组" })).toBeNull();
  });
  it("保存后无 observer 的旧文本 GET 也不能被再次复用", async () => {
    const { client } = mount();
    const key = ["admin-dubbing-groups", "groups-admin"];
    const stale = {
      groups: [{ id: "before-save", uk: [], us: [] }],
      revision: 1
    };
    const fresh = {
      groups: [{ id: "after-save", uk: [], us: [] }],
      revision: 2
    };
    const late = deferred<typeof stale>(),
      aborted = vi.fn();
    const oldGet = client
      .fetchQuery({
        queryKey: key,
        queryFn: ({ signal }) => {
          signal.addEventListener("abort", aborted);
          return late.promise;
        }
      })
      .catch(() => undefined);
    const panel = groupPanel("A");
    fireEvent.click(within(panel).getByLabelText("选用 A推荐"));
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    await act(async () => late.resolve(stale));
    await oldGet;
    const reload = vi.fn().mockResolvedValue(fresh);
    expect(
      await client.fetchQuery({
        queryKey: key,
        queryFn: reload,
        staleTime: 60000
      })
    ).toEqual(fresh);
    expect(aborted).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });
  it("冲突后取消会重新读取服务器最新配置并清除过期提示", async () => {
    const fresh = data();
    fresh.groups[0]!.revision = 2;
    fresh.groups[0]!.name = "远端A";
    vi.mocked(api.speech.savePairedGroup).mockRejectedValueOnce(
      new HttpError(409, "conflict")
    );
    vi.mocked(api.speech.groupsV3).mockResolvedValue(fresh);
    mount();
    const panel = groupPanel("A");
    fireEvent.click(within(panel).getByLabelText("选用 A推荐"));
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/本组已被修改或名称已被使用/);
    fireEvent.click(button("取消修改", panel));
    await screen.findByLabelText("远端A 分组配置");
    expect(screen.queryByText(/本组已被修改或名称已被使用/)).toBeNull();
  });
  it("全局不能改名、删除、绑定板块或排序，清空推荐可保存", async () => {
    mount();
    const panel = groupPanel("全局常用");
    expect(
      within(panel).queryByRole("button", { name: "编辑分组" })
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /删除分组/ })).toBeNull();
    expect(screen.queryByLabelText("上移分组 全局常用")).toBeNull();
    fireEvent.click(button("移除推荐 全局常用推荐", panel));
    fireEvent.click(button(/^删\s*除$/, screen.getByRole("tooltip")));
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    expect(
      vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group
    ).toMatchObject({
      name: "全局常用",
      is_global: true,
      areas: [],
      pairs: []
    });
  });
  it("简单旧声音需要明确确认，确认前不产生草稿或写入，确认后保留原身份及参数", async () => {
    const initial = data(),
      old = pairs(initial, 2)[0]!;
    initial.groups[2]!.recommendations = {
      format: "legacy",
      uk: [{ ...old.uk, name: "原英式", selected: true }],
      us: [{ ...old.us, name: "原美式", selected: true }]
    };
    mount(initial);
    const panel = groupPanel("全局常用");
    expect(within(panel).queryByText(old.uk.id)).toBeNull();
    fireEvent.click(button("核对声音", panel));
    expect(button("确认组合", screen.getByRole("dialog"))).toBeDisabled();
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("原有声音推荐名称"), {
      target: { value: "取消的组合名称" }
    });
    fireEvent.click(button("暂不整理", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(button("保存当前组", panel)).toBeDisabled();
    fireEvent.click(button("核对声音", panel));
    expect(screen.getByLabelText("原有声音推荐名称")).toHaveValue("自然朗读");
    fireEvent.click(screen.getByLabelText("确认将这两个声音组成同一套推荐"));
    fireEvent.click(button("确认组合", screen.getByRole("dialog")));
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    expect(
      vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group.pairs[0]
    ).toMatchObject({ selected: true, uk: old.uk, us: old.us });
  });
  it("不等长历史与同声多版本逐套人工整理，不丢未选或重复身份", async () => {
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
    const panel = groupPanel("A");
    fireEvent.click(button("核对声音", panel));
    fireEvent.click(button("新增一套组合", screen.getByRole("dialog")));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "人工第一套" }
    });
    for (const [side, text] of [
      ["英式", "旧二"],
      ["美式", "旧美"]
    ]) {
      fireEvent.mouseDown(screen.getByLabelText(`选择${side}原有声音`));
      fireEvent.click(
        await screen.findByText(new RegExp(text!), {
          selector: ".ant-select-item-option-content"
        })
      );
    }
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    expect(button("确认全部组合", screen.getByRole("dialog"))).toBeDisabled();
    closeDialog();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await rename("B", "B草稿");
    groupPanel("A");
    fireEvent.click(button("核对声音", panel));
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByText("人工第一套")
      ).toBeVisible()
    );
    fireEvent.click(button("新增一套组合", screen.getByRole("dialog")));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "关闭的未完成组合" }
    });
    fireEvent.click(button("Close", screen.getByRole("dialog")));
    await waitFor(() =>
      expect(
        within(screen.getByRole("dialog")).getByText("人工第一套")
      ).toBeVisible()
    );
    fireEvent.click(button("新增一套组合", screen.getByRole("dialog")));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "补齐套" }
    });
    fireEvent.mouseDown(screen.getByLabelText("选择英式原有声音"));
    fireEvent.click(
      await screen.findByText(/旧一/, {
        selector: ".ant-select-item-option-content"
      })
    );
    selectVoice("Guy 男声");
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    fireEvent.click(button("确认全部组合", screen.getByRole("dialog")));
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    const result = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group
      .pairs;
    expect(result.map((p) => p.uk.id)).toEqual(["old-uk-2", "a-uk"]);
    expect(result[0]!.selected).toBe(false);
    expect(result[0]!.us).toEqual(old.us);
  }, 15000);
  it("目录搜索保留容器并回到结果顶部，清空恢复当前口音目录", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...uk,
      alias: `uk-${i}`,
      display_name: `Female${i}`
    }));
    mount(data(), [...many, uk, us]);
    fireEvent.click(button("新增推荐", groupPanel("A")));
    const list = screen.getByLabelText("英式音色滚动列表");
    list.scrollTop = 170;
    selectVoice("Female20 女声");
    fireEvent.change(screen.getByLabelText("搜索推荐音色"), {
      target: { value: "Female20" }
    });
    expect(screen.getByLabelText("英式音色滚动列表")).toBe(list);
    expect(list.scrollTop).toBe(0);
    fireEvent.change(screen.getByLabelText("搜索推荐音色"), {
      target: { value: "" }
    });
    expect(within(list).getAllByRole("radio")).toHaveLength(31);
  }, 15000);
  it("英美卡片驱动当前目录及调参，切换和筛选保留两侧选择与精确参数", async () => {
    mount();
    const panel = groupPanel("A");
    fireEvent.click(button("新增推荐", panel));
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: "双侧独立参数" }
    });
    selectVoice("Sonia 女声");
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    fireEvent.change(screen.getByLabelText("合成音量"), {
      target: { value: "65" }
    });
    selectVoice("Guy 男声");
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.85" }
    });
    fireEvent.change(screen.getByLabelText("合成音量"), {
      target: { value: "80" }
    });
    fireEvent.change(screen.getByLabelText("搜索推荐音色"), {
      target: { value: "不存在的音色" }
    });
    await waitFor(() =>
      expect(
        screen.getByText("没有符合条件的音色，请调整搜索或筛选")
      ).toBeVisible()
    );
    fireEvent.click(button("配置英式声音"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.73");
    expect(screen.getByLabelText("合成音量")).toHaveValue("65");
    expect(screen.getByRole("radio", { name: "Sonia 女声" })).toBeChecked();
    fireEvent.click(screen.getByRole("radio", { name: "男声" }));
    expect(screen.queryByRole("radio", { name: "Sonia 女声" })).toBeNull();
    fireEvent.click(button("配置美式声音"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.85");
    expect(screen.getByLabelText("合成音量")).toHaveValue("80");
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    expect(
      vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group.pairs[1]
    ).toMatchObject({
      name: "双侧独立参数",
      uk: {
        voice_alias: "sonia",
        parameters: { rate_percent: -27, volume_percent: 65 }
      },
      us: {
        voice_alias: "guy",
        parameters: { rate_percent: -15, volume_percent: 80 }
      }
    });
  });
  it("声音试听与写权限独立，无编辑权限的页面不会提供写入口", () => {
    setPermissions(["words.access", "speech.generate"]);
    const { onAudition } = mount();
    const panel = groupPanel("A");
    expect(screen.queryByRole("button", { name: "新增分组" })).toBeNull();
    expect(
      within(panel).queryByRole("button", { name: "保存当前组" })
    ).toBeNull();
    expect(within(panel).getByLabelText("选用 A推荐")).toBeDisabled();
    fireEvent.click(button("试听英式 A推荐", panel));
    expect(onAudition).toHaveBeenCalledWith(
      uk,
      expect.objectContaining({ voice_alias: uk.alias })
    );
  });
  it("共用调参表单清空不会伪造默认值，重置只作用当前侧并同步草稿", async () => {
    mount();
    const panel = groupPanel("A");
    fireEvent.click(button("复制整套 A推荐", panel));
    fireEvent.change(screen.getByLabelText("合成音量"), {
      target: { value: "" }
    });
    expect(screen.getByLabelText("合成音量")).toHaveValue("");
    expect(button("配置英式声音").textContent).not.toContain("NaN");
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    await screen.findByText(/音量需为 0 到 100 之间的整数/);
    expect(api.speech.savePairedGroup).not.toHaveBeenCalled();
    fireEvent.click(button("恢复默认参数", screen.getByRole("dialog")));
    expect(screen.getByLabelText("合成音量")).toHaveValue("100");
    expect(screen.queryByText(/音量需为 0 到 100 之间的整数/)).toBeNull();
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    fireEvent.change(screen.getByLabelText("音调"), { target: { value: "2" } });
    fireEvent.click(button("配置美式声音"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.80");
    expect(screen.getByLabelText("合成音量")).toHaveValue("80");
    fireEvent.click(button("配置英式声音"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.73");
    expect(screen.getByLabelText("音调")).toHaveValue("2");
    fireEvent.click(button("保存整套推荐", screen.getByRole("dialog")));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(button("保存当前组", panel));
    await screen.findByText(/配音已保存。/);
    const saved = vi.mocked(api.speech.savePairedGroup).mock.calls[0]![0].group
      .pairs[1]!;
    expect(saved.uk.parameters).toMatchObject({
      rate_percent: -27,
      pitch_semitones: 2,
      volume_percent: 100
    });
    expect(saved.us.parameters).toEqual(pairs(data())[0]!.us.parameters);
  });
  it("词库预览读取已保存配置，有适用组不展示全局，无适用组展示全局", async () => {
    mount();
    fireEvent.click(button("词库预览"));
    const dialog = screen.getByRole("dialog");
    await waitFor(() =>
      expect(
        within(dialog).getByRole("region", { name: "A 词库推荐预览" })
      ).toBeVisible()
    );
    expect(
      within(dialog).queryByRole("region", { name: "全局常用 词库推荐预览" })
    ).toBeNull();
    fireEvent.mouseDown(within(dialog).getByLabelText("预览内容板块"));
    fireEvent.click(
      await screen.findByText("词性的语法结构", {
        selector: ".ant-select-item-option-content"
      })
    );
    expect(
      within(dialog).getByRole("region", { name: "全局常用 词库推荐预览" })
    ).toBeVisible();
  });
});
