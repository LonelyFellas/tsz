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
  AdminDubbingGroupsResponse,
  AdminDubbingRecommendation,
  AdminProfile,
  AdminSpeechVoice
} from "@tsz/types";
import { App, ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { DubbingGroups } from "./DubbingGroups";

const uk: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  gender: "Female",
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
  locale: "en-US"
};
const queryKey = ["admin-dubbing-groups", "groups-admin"];
const clients: QueryClient[] = [];
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function groupData(): AdminDubbingGroupsResponse {
  return {
    revision: 1,
    groups: [
      {
        id: "group-one",
        name: "发音推荐",
        areas: ["word"],
        uk: [
          {
            id: "uk-one",
            name: "英式日常",
            voice_alias: uk.alias,
            parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
          }
        ],
        us: [
          {
            id: "us-one",
            name: "美式日常",
            voice_alias: us.alias,
            parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
          }
        ]
      }
    ]
  };
}
function setPermissions(permissions: AdminProfile["permissions"]) {
  useAuthStore.getState().setProfile({
    id: "groups-admin",
    phone: "13800000000",
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
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function mount(data = groupData(), voices = [uk, us]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } }
  });
  clients.push(client);
  client.setQueryData(queryKey, data);
  const onAudition = vi.fn();
  const onDirtyChange = vi.fn();
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <DubbingGroups
          voices={voices}
          canAudition
          onAudition={onAudition}
          onInvalidatePreview={vi.fn()}
          onDirtyChange={onDirtyChange}
        />
      )
    }
  ]);
  routers.push(router);
  render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <RouterProvider router={router} />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
  return { client, onAudition, onDirtyChange };
}
beforeEach(() => {
  setPermissions(["words.access", "speech.generate", "speech.global_dubbing"]);
  vi.spyOn(api.speech, "groups").mockResolvedValue(groupData());
  vi.spyOn(api.speech, "saveGroups").mockImplementation(async (input) => ({
    groups: input.groups,
    revision: input.base_revision + 1
  }));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  routers.splice(0).forEach((router) => router.dispose());
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});

describe("分组草稿与并发保存", () => {
  it("清空草稿后创建初始分组仍使用开始编辑时的 revision", async () => {
    const { client } = mount();
    fireEvent.click(screen.getByRole("button", { name: /编辑分组/ }));
    fireEvent.click(screen.getByRole("button", { name: "删除分组" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "删除分组"
      })
    );
    await screen.findByText("尚未设置分组推荐");
    vi.useFakeTimers();
    await act(async () => {
      client.setQueryData(queryKey, { ...groupData(), revision: 9 });
      await vi.runOnlyPendingTimersAsync();
    });
    vi.useRealTimers();
    fireEvent.click(screen.getByRole("button", { name: /创建三个初始分组/ }));
    fireEvent.click(screen.getByRole("button", { name: /保存分组配音/ }));
    await waitFor(() =>
      expect(api.speech.saveGroups).toHaveBeenCalledWith(
        expect.objectContaining({ base_revision: 1 })
      )
    );
  });

  it("保存期间启动的 GET 不会在保存成功后覆盖缓存", async () => {
    const pendingSave = deferred<AdminDubbingGroupsResponse>();
    const staleRead = deferred<AdminDubbingGroupsResponse>();
    vi.mocked(api.speech.saveGroups).mockReturnValueOnce(pendingSave.promise);
    vi.mocked(api.speech.groups).mockReturnValueOnce(staleRead.promise);
    const { client } = mount();
    fireEvent.click(screen.getByRole("button", { name: /编辑分组/ }));
    fireEvent.change(screen.getByLabelText("分组名称"), {
      target: { value: "已更新名称" }
    });
    fireEvent.click(screen.getByRole("button", { name: /保存分组配音/ }));
    let refresh!: Promise<void>;
    act(() => {
      refresh = client.refetchQueries({ queryKey, exact: true });
    });
    expect(api.speech.groups).toHaveBeenCalledOnce();
    const saved = groupData();
    saved.revision = 2;
    saved.groups[0]!.name = "已更新名称";
    await act(async () => {
      pendingSave.resolve(saved);
    });
    await screen.findByText("分组配音已保存。");
    await act(async () => {
      staleRead.resolve(groupData());
      await refresh;
    });
    expect(client.getQueryData(queryKey)).toEqual(saved);
    expect(screen.getByText("已更新名称")).toBeVisible();
  });

  it("取消旧 GET 期间切换账户不会写回旧账户缓存", async () => {
    const { client } = mount();
    const cancelling = deferred<void>();
    const cancel = vi
      .spyOn(client, "cancelQueries")
      .mockReturnValueOnce(cancelling.promise);
    fireEvent.click(screen.getByRole("button", { name: /编辑分组/ }));
    fireEvent.click(screen.getByRole("button", { name: /保存分组配音/ }));
    await waitFor(() =>
      expect(cancel).toHaveBeenCalledWith({ queryKey, exact: true })
    );
    act(() => {
      useAuthStore.getState().setProfile(null);
    });
    await act(async () => {
      cancelling.resolve();
    });
    expect(client.getQueryData(queryKey)).toEqual(groupData());
    expect(screen.queryByText("分组配音已保存。")).not.toBeInTheDocument();
  });

  it("编辑权限撤销后仍可取消草稿并恢复离开页面", async () => {
    const { onDirtyChange } = mount();
    fireEvent.click(screen.getByRole("button", { name: /编辑分组/ }));
    act(() => setPermissions(["words.access"]));
    const save = screen.queryByRole("button", { name: /保存分组配音/ });
    if (save) expect(save).toBeDisabled();
    const add = screen.queryByRole("button", { name: /新增分组/ });
    if (add) expect(add).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "取消编辑" }));
    fireEvent.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "放弃并重新载入"
      })
    );
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(false));
    expect(api.speech.saveGroups).not.toHaveBeenCalled();
  });

  it("空态可直接创建一个自定义分组", () => {
    mount({ groups: [], revision: 4 });
    fireEvent.click(screen.getByRole("button", { name: /新增分组/ }));
    expect(screen.getAllByLabelText("分组名称")).toHaveLength(1);
    expect(screen.getByLabelText("分组名称")).toHaveValue("新分组");
    expect(
      screen.getByRole("region", { name: "新分组 英式推荐" })
    ).toBeVisible();
    expect(
      screen.getByRole("region", { name: "新分组 美式推荐" })
    ).toBeVisible();
    expect(api.speech.saveGroups).not.toHaveBeenCalled();
  });
});

const invalidRecommendations: {
  name: string;
  update: (item: AdminDubbingRecommendation) => void;
  message: RegExp;
}[] = [
  {
    name: "音色不存在",
    update: (item) => {
      item.voice_alias = "retired";
    },
    message: /音色.*不可用.*重新选择/
  },
  {
    name: "口音不匹配",
    update: (item) => {
      item.voice_alias = us.alias;
    },
    message: /口音.*不符.*重新选择/
  },
  {
    name: "语速超出能力",
    update: (item) => {
      item.parameters.rate_percent = 60;
    },
    message: /语速.*0.50.*1.50/
  },
  {
    name: "音调超出能力",
    update: (item) => {
      item.parameters.pitch_semitones = 11;
    },
    message: /音调.*-10.*10/
  },
  {
    name: "语速不是整数百分比",
    update: (item) => {
      item.parameters.rate_percent = 0.5;
    },
    message: /语速/
  },
  {
    name: "音调不是整数",
    update: (item) => {
      item.parameters.pitch_semitones = 0.5;
    },
    message: /音调/
  },
  {
    name: "风格不受支持",
    update: (item) => {
      item.parameters.style = "sad";
    },
    message: /风格.*不支持.*自然/
  }
];
describe("分组推荐能力校验", () => {
  it("固定参数音色的遗留越界值仍可修复到唯一有效值", () => {
    const data = groupData();
    data.groups[0]!.uk[0]!.parameters = {
      rate_percent: 20,
      pitch_semitones: 3,
      style: null
    };
    const fixed = {
      ...uk,
      capabilities: {
        ...uk.capabilities,
        min_rate_percent: 0,
        max_rate_percent: 0,
        min_pitch_semitones: 0,
        max_pitch_semitones: 0
      }
    };
    mount(data, [fixed, us]);
    fireEvent.click(screen.getByRole("button", { name: /编辑分组/ }));
    const region = screen.getByRole("region", { name: "发音推荐 英式推荐" });
    expect(within(region).getByLabelText("推荐语速")).toBeEnabled();
    fireEvent.change(within(region).getByLabelText("推荐语速"), {
      target: { value: "1.00" }
    });
    expect(within(region).getByLabelText("推荐语速")).toBeDisabled();
    expect(within(region).getByLabelText("推荐音调")).toBeEnabled();
    fireEvent.change(within(region).getByLabelText("推荐音调"), {
      target: { value: "0" }
    });
    expect(within(region).getByLabelText("推荐音调")).toBeDisabled();
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(region).getByRole("button", { name: "试听" })).toBeEnabled();
  });

  it.each(invalidRecommendations)(
    "$name 时阻止试听和保存并在对应推荐展示修复提示",
    async ({ update, message }) => {
      const data = groupData();
      update(data.groups[0]!.uk[0]!);
      const { onAudition } = mount(data);
      const region = screen.getByRole("region", { name: "发音推荐 英式推荐" });
      expect(
        within(region).getByRole("button", { name: "试听" })
      ).toBeDisabled();
      fireEvent.click(within(region).getByRole("button", { name: "试听" }));
      expect(onAudition).not.toHaveBeenCalled();
      const issue = within(region).getByRole("alert");
      expect(issue).toHaveTextContent("发音推荐");
      expect(issue).toHaveTextContent("英式");
      expect(issue).toHaveTextContent("英式日常");
      expect(issue).toHaveTextContent(message);
      fireEvent.click(screen.getByRole("button", { name: /编辑分组/ }));
      fireEvent.click(screen.getByRole("button", { name: /保存分组配音/ }));
      await act(async () => {});
      expect(api.speech.saveGroups).not.toHaveBeenCalled();
    }
  );

  it("修复推荐语速后可恢复试听并保存后端百分比参数", async () => {
    const data = groupData();
    data.groups[0]!.uk[0]!.parameters.rate_percent = 60;
    const { onAudition } = mount(data);
    fireEvent.click(screen.getByRole("button", { name: /编辑分组/ }));
    const region = screen.getByRole("region", { name: "发音推荐 英式推荐" });
    expect(within(region).getByRole("button", { name: "试听" })).toBeDisabled();
    fireEvent.change(within(region).getByLabelText("推荐语速"), {
      target: { value: "0.75" }
    });
    expect(within(region).queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: "试听" }));
    expect(onAudition).toHaveBeenCalledWith(
      uk,
      expect.objectContaining({
        parameters: { rate_percent: -25, pitch_semitones: 0, style: null }
      })
    );
    fireEvent.click(screen.getByRole("button", { name: /保存分组配音/ }));
    await waitFor(() => expect(api.speech.saveGroups).toHaveBeenCalled());
    expect(
      vi.mocked(api.speech.saveGroups).mock.calls[0]![0].groups[0]!.uk[0]!
        .parameters.rate_percent
    ).toBe(-25);
  });
});
