import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import type {
  AdminSpeechPreviewResponse,
  AdminSpeechVoice,
  AdminVoiceLibraryResponse,
  AdminProfile
} from "@tsz/types";
import { App, ConfigProvider } from "antd";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { HttpError } from "@tsz/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { VoiceLibrary } from "./VoiceLibrary";

const sonia: AdminSpeechVoice = {
  alias: "en-GB-SoniaNeural",
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
const guy: AdminSpeechVoice = {
  ...sonia,
  alias: "en-US-GuyNeural",
  display_name: "Guy",
  locale: "en-US",
  gender: "Male",
  is_common: false,
  capabilities: { ...sonia.capabilities, styles: [] }
};
const clients: QueryClient[] = [];
const routers: ReturnType<typeof createMemoryRouter>[] = [];
function setPermissions(permissions: AdminProfile["permissions"]) {
  useAuthStore.getState().setProfile({
    id: "voice-editor-admin",
    phone: "13800138000",
    display_name: "内容管理员",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions
  });
}
function mount(openLibrary = true) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  clients.push(client);
  const router = createMemoryRouter([{ path: "/", element: <VoiceLibrary /> }]);
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
  if (openLibrary && screen.queryByRole("tab", { name: "音色库" })) {
    fireEvent.click(screen.getByRole("tab", { name: "音色库" }));
  }
  return view;
}
function result(name: string): AdminSpeechPreviewResponse {
  return {
    cache_status: "generated",
    audio_url: `https://audio.example.test/${name}.wav`,
    expires_at: new Date(Date.now() + 600_000).toISOString(),
    url_expires_in_seconds: 600
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  setPermissions(["words.access", "speech.generate"]);
  vi.spyOn(api.speech, "voices").mockResolvedValue({ items: [sonia, guy] });
  vi.spyOn(api.speech, "preview").mockResolvedValue(result("sonia"));
  vi.spyOn(api.speech, "library").mockResolvedValue({
    items: [sonia, guy].map((voice) => ({
      voice_alias: voice.alias,
      description_zh: null,
      description_revision: 0,
      parameters: null,
      notes: "",
      personal_revision: 0
    }))
  });
  vi.spyOn(api.speech, "groups").mockResolvedValue({ groups: [], revision: 0 });
  vi.spyOn(api.speech, "saveSettings");
  vi.spyOn(api.speech, "saveDescription");
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  routers.splice(0).forEach((router) => router.dispose());
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});

describe("配音中心", () => {
  it("HD Flash资料提示真实限制，并禁用音量语速音调控件", async () => {
    vi.mocked(api.speech.voices).mockResolvedValue({
      items: [
        {
          ...sonia,
          capabilities: {
            ...sonia.capabilities,
            min_rate_percent: 0,
            max_rate_percent: 0,
            min_pitch_semitones: 0,
            max_pitch_semitones: 0,
            supports_volume_percent: false,
            supports_pause: false,
            supports_phoneme: false
          }
        }
      ]
    });
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    expect(screen.getByLabelText("合成音量")).toBeDisabled();
    expect(screen.getByLabelText("合成语速")).toBeDisabled();
    expect(screen.getByLabelText("音调")).toBeDisabled();
    expect(screen.getByText(/该模型仅支持原速/)).toBeVisible();
  });
  it("默认展示分组配音，再切换音色库查找声音", async () => {
    mount(false);
    expect(screen.getByRole("tab", { name: "分组配音" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    await screen.findByText("尚未设置分组推荐");
    expect(screen.queryByRole("searchbox", { name: "搜索音色" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "音色库" }));
    expect(await screen.findByLabelText("试听 Sonia")).toBeVisible();
  });

  it("清空音量后输入框与控件组关联表单错误", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    const input = screen.getByRole("spinbutton", { name: "合成音量" });
    expect(input).toHaveAttribute("aria-required", "true");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
    await screen.findByText("请输入 0 至 100 的整数");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("请输入 0 至 100 的整数");
    expect(
      screen.getByRole("group", { name: "音量" })
    ).toHaveAccessibleDescription("请输入 0 至 100 的整数");
    expect(api.speech.saveSettings).not.toHaveBeenCalled();
  });
  it("音量仅在本次页面保留，保存听感不保存试听参数，恢复默认清除旧音频", async () => {
    vi.mocked(api.speech.saveSettings).mockImplementation(
      async (alias, input) => ({
        voice_alias: alias,
        ...input,
        personal_revision: 1,
        description_zh: null,
        description_revision: 0
      })
    );
    mount();
    const open = await screen.findByLabelText("调整 Sonia 参数");
    fireEvent.click(open);
    const volume = screen.getByRole("spinbutton", { name: "合成音量" });
    expect(volume).toHaveValue("100");
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "恢复默认参数" })
      ).toBeDisabled()
    );
    fireEvent.change(volume, { target: { value: "65" } });
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "恢复默认参数" })).toBeEnabled()
    );
    expect(
      screen.getByRole("slider", { name: "合成音量滑块" })
    ).toHaveAttribute("aria-valuenow", "65");
    fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ volume_percent: 65 }),
        expect.any(AbortSignal)
      )
    );
    await screen.findByLabelText("Sonia 试听播放器");
    fireEvent.click(screen.getByRole("button", { name: "保存听感" }));
    await screen.findByText("听感已保存，仅你可见。");
    expect(api.speech.saveSettings).toHaveBeenLastCalledWith(
      sonia.alias,
      expect.objectContaining({
        parameters: null
      })
    );
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Close" })
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(open);
    expect(screen.getByRole("spinbutton", { name: "合成音量" })).toHaveValue(
      "65"
    );
    fireEvent.click(screen.getByRole("button", { name: "恢复默认参数" }));
    expect(screen.getByRole("spinbutton", { name: "合成音量" })).toHaveValue(
      "100"
    );
    fireEvent.change(screen.getByRole("spinbutton", { name: "合成音量" }), {
      target: { value: "0" }
    });
    expect(await screen.findByText("已静音")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenLastCalledWith(
        expect.objectContaining({ volume_percent: 0 }),
        expect.any(AbortSignal)
      )
    );
    await screen.findByLabelText("Sonia 试听播放器");
    fireEvent.click(screen.getByRole("button", { name: "恢复默认参数" }));
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  }, 15000);

  it("重新进入页面恢复默认试听参数，历史个人参数不被写回或清除", async () => {
    const saved = {
      voice_alias: sonia.alias,
      parameters: { rate_percent: -25, pitch_semitones: 2, style: "cheerful" },
      notes: "历史听感",
      personal_revision: 3,
      description_zh: null,
      description_revision: 0
    };
    vi.mocked(api.speech.library).mockResolvedValue({ items: [saved] });
    const first = mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.80" }
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    first.unmount();
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
    expect(screen.getByLabelText("我的听感")).toHaveValue("历史听感");
    expect(api.speech.saveSettings).not.toHaveBeenCalled();
  });

  it.each(["personal", "description"] as const)(
    "%s 保存完成后，保存期间发起的旧查询不能覆盖新设置",
    async (kind) => {
      setPermissions([
        "words.access",
        "speech.generate",
        "speech.global_dubbing"
      ]);
      const saved = {
        voice_alias: sonia.alias,
        parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
        notes: "清晰慢读",
        personal_revision: 2,
        description_zh: "自然清晰",
        description_revision: 2
      };
      const put = deferred<typeof saved>();
      const get = deferred<AdminVoiceLibraryResponse>();
      const method =
        kind === "personal"
          ? api.speech.saveSettings
          : api.speech.saveDescription;
      vi.mocked(method).mockImplementationOnce(() => put.promise);
      mount();
      fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
      const client = clients.at(-1)!;
      const queryKey = ["admin-speech-library", "voice-editor-admin"];
      const old = client.getQueryData<AdminVoiceLibraryResponse>(queryKey)!;
      if (kind === "personal") {
        fireEvent.change(screen.getByLabelText("合成语速"), {
          target: { value: "0.75" }
        });
        fireEvent.change(screen.getByLabelText("我的听感"), {
          target: { value: saved.notes }
        });
      } else {
        fireEvent.click(screen.getByRole("button", { name: /共享介绍/ }));
        fireEvent.change(screen.getByLabelText("中文介绍"), {
          target: { value: saved.description_zh }
        });
      }
      fireEvent.click(
        screen.getByText(kind === "personal" ? "保存听感" : "保存共享介绍")
      );
      await waitFor(() => expect(method).toHaveBeenCalledTimes(1));
      vi.mocked(api.speech.library).mockImplementationOnce(() => get.promise);
      act(() => {
        void client.refetchQueries({ queryKey, exact: true });
      });
      await waitFor(() => expect(api.speech.library).toHaveBeenCalledTimes(2));
      await act(async () => put.resolve(saved));
      await screen.findByText(
        kind === "personal"
          ? "听感已保存，仅你可见。"
          : "中文介绍已保存，所有有权查看音色的管理员可见。"
      );
      await act(async () => get.resolve(old));
      fireEvent.click(
        within(screen.getByRole("dialog")).getByLabelText("Close")
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      fireEvent.click(screen.getByLabelText("调整 Sonia 参数"));
      if (kind === "personal") {
        expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
        expect(screen.getByLabelText("我的听感")).toHaveValue(saved.notes);
      } else {
        fireEvent.click(screen.getByRole("button", { name: /共享介绍/ }));
        expect(screen.getByLabelText("中文介绍")).toHaveValue(
          saved.description_zh
        );
      }
    }
  );

  it.each(["personal", "description"] as const)(
    "%s 保存目录新增音色后，重新打开仍能读到保存值与版本",
    async (kind) => {
      setPermissions([
        "words.access",
        "speech.generate",
        "speech.global_dubbing"
      ]);
      vi.mocked(api.speech.library).mockResolvedValue({ items: [] });
      const saved = {
        voice_alias: sonia.alias,
        parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
        notes: "新音色笔记",
        personal_revision: 1,
        description_zh: "新音色介绍",
        description_revision: 1
      };
      const method =
        kind === "personal"
          ? api.speech.saveSettings
          : api.speech.saveDescription;
      vi.mocked(method).mockResolvedValue(saved);
      mount();
      fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
      if (kind === "personal") {
        fireEvent.change(screen.getByLabelText("合成语速"), {
          target: { value: "0.75" }
        });
        fireEvent.change(screen.getByLabelText("我的听感"), {
          target: { value: saved.notes }
        });
      } else {
        fireEvent.click(screen.getByRole("button", { name: /共享介绍/ }));
        fireEvent.change(screen.getByLabelText("中文介绍"), {
          target: { value: saved.description_zh }
        });
      }
      const saveLabel = kind === "personal" ? "保存听感" : "保存共享介绍";
      fireEvent.click(screen.getByText(saveLabel));
      await screen.findByText(
        kind === "personal"
          ? "听感已保存，仅你可见。"
          : "中文介绍已保存，所有有权查看音色的管理员可见。"
      );
      fireEvent.click(
        within(screen.getByRole("dialog")).getByLabelText("Close")
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
      fireEvent.click(screen.getByLabelText("调整 Sonia 参数"));
      if (kind === "personal") {
        expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
        expect(screen.getByLabelText("我的听感")).toHaveValue(saved.notes);
      } else {
        fireEvent.click(screen.getByRole("button", { name: /共享介绍/ }));
        expect(screen.getByLabelText("中文介绍")).toHaveValue(
          saved.description_zh
        );
      }
      fireEvent.click(screen.getByText(saveLabel));
      await waitFor(() =>
        expect(method).toHaveBeenLastCalledWith(
          sonia.alias,
          expect.objectContaining({ base_revision: 1 })
        )
      );
    }
  );

  it("历史个人参数仍可读取，但首次试听使用默认参数", async () => {
    const pending = deferred<AdminVoiceLibraryResponse>();
    vi.mocked(api.speech.library).mockImplementationOnce(() => pending.promise);
    mount();
    const button = await screen.findByLabelText("试听 Sonia");
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(api.speech.preview).not.toHaveBeenCalled();
    await act(async () =>
      pending.resolve({
        items: [
          {
            voice_alias: sonia.alias,
            parameters: {
              rate_percent: -25,
              pitch_semitones: 2,
              style: "cheerful"
            },
            notes: "",
            personal_revision: 1,
            description_zh: null,
            description_revision: 0
          }
        ]
      })
    );
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenCalledWith(
        expect.objectContaining({
          rate_percent: 0,
          pitch_semitones: 0
        }),
        expect.any(AbortSignal)
      )
    );
  });

  it("试听生成和播放时填写听感或介绍不会中断，调参才清除音频", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    const pending = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview).mockImplementationOnce(() => pending.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    fireEvent.click(screen.getByLabelText("试听当前参数"));
    await waitFor(() => expect(api.speech.preview).toHaveBeenCalledTimes(1));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    fireEvent.change(screen.getByLabelText("我的听感"), {
      target: { value: "等待试听" }
    });
    expect(signal.aborted).toBe(false);
    await act(async () => pending.resolve(result("sonia")));
    const audio = await screen.findByLabelText("Sonia 试听播放器");
    fireEvent.play(audio);
    vi.mocked(HTMLMediaElement.prototype.pause).mockClear();
    fireEvent.change(screen.getByLabelText("我的听感"), {
      target: { value: "声音清晰" }
    });
    fireEvent.click(screen.getByRole("button", { name: /共享介绍/ }));
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: "自然清晰" }
    });
    expect(screen.getByLabelText("Sonia 试听播放器")).toBe(audio);
    expect(HTMLMediaElement.prototype.pause).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  });

  it("刷新目录不覆盖本次试听参数，保存听感期间参数不可编辑", async () => {
    const info = {
      voice_alias: sonia.alias,
      parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
      notes: "",
      personal_revision: 1,
      description_revision: 0,
      description_zh: null
    };
    const pending = deferred<typeof info>();
    vi.mocked(api.speech.saveSettings).mockImplementationOnce(
      () => pending.promise
    );
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    fireEvent.click(screen.getByText("保存听感"));
    await waitFor(() => expect(api.speech.saveSettings).toHaveBeenCalled());
    expect(screen.getByLabelText("合成语速")).toBeDisabled();
    expect(screen.getByLabelText("音调")).toBeDisabled();
    await act(async () => pending.resolve(info));
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const latest = {
      ...info,
      personal_revision: 2,
      parameters: { ...info.parameters, rate_percent: 20 }
    };
    vi.mocked(api.speech.library).mockResolvedValue({ items: [latest] });
    fireEvent.click(screen.getByText("刷新音色"));
    await waitFor(() => expect(api.speech.library).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByLabelText("调整 Sonia 参数"));
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.75");
  }, 15000);

  it("关闭未保存听感时提示，重新载入期间不能切换音色", async () => {
    vi.mocked(api.speech.saveSettings).mockRejectedValue(
      new HttpError(409, "conflict")
    );
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    fireEvent.change(screen.getByLabelText("我的听感"), {
      target: { value: "不能丢失的笔记" }
    });
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    expect(
      await screen.findByText("关闭会丢弃尚未保存的听感或介绍。")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("继续编辑"));
    await waitFor(() =>
      expect(screen.queryByText("关闭会丢弃尚未保存的听感或介绍。")).toBeNull()
    );
    expect(screen.getByLabelText("我的听感")).toHaveValue("不能丢失的笔记");
    fireEvent.click(screen.getByText("保存听感"));
    const reload = await screen.findByText("重新载入设置");
    const pending = deferred<{ items: [] }>();
    vi.mocked(api.speech.library).mockImplementationOnce(() => pending.promise);
    fireEvent.click(reload);
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    expect(screen.getByLabelText("我的听感")).toHaveValue("不能丢失的笔记");
    expect(screen.getByLabelText("合成语速")).toBeDisabled();
    await act(async () => pending.resolve({ items: [] }));
  }, 15000);

  it("听感保存保留历史参数，重新打开读回，冲突保留输入且不覆盖版本", async () => {
    const saved = {
      voice_alias: sonia.alias,
      parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
      notes: "清晰慢读",
      personal_revision: 1,
      description_zh: null,
      description_revision: 0
    };
    vi.mocked(api.speech.library).mockResolvedValue({
      items: [{ ...saved, notes: "", personal_revision: 0 }]
    });
    vi.mocked(api.speech.saveSettings)
      .mockResolvedValueOnce(saved)
      .mockRejectedValueOnce(
        new HttpError(409, "conflict", [], "revision_conflict")
      );
    mount();
    const open = await screen.findByLabelText("调整 Sonia 参数");
    await waitFor(() => expect(open).toBeEnabled());
    fireEvent.click(open);
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(
      within(dialog).getByRole("spinbutton", { name: "合成语速" }),
      { target: { value: "0.75" } }
    );
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "我的听感" }),
      { target: { value: "清晰慢读" } }
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "保存听感" }));
    await screen.findByText("听感已保存，仅你可见。");
    expect(api.speech.saveSettings).toHaveBeenCalledWith(sonia.alias, {
      parameters: saved.parameters,
      notes: "清晰慢读",
      base_revision: 0
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    fireEvent.click(open);
    const reopened = await screen.findByRole("dialog");
    expect(
      within(reopened).getByRole("textbox", { name: "我的听感" })
    ).toHaveValue("清晰慢读");
    fireEvent.change(
      within(reopened).getByRole("textbox", { name: "我的听感" }),
      { target: { value: "我的新笔记" } }
    );
    fireEvent.click(within(reopened).getByRole("button", { name: "保存听感" }));
    await screen.findByText(
      "设置已在其他页面修改。当前输入已保留，请重新载入最新设置后再编辑。"
    );
    expect(
      within(reopened).getByRole("textbox", { name: "我的听感" })
    ).toHaveValue("我的新笔记");
    expect(api.speech.saveSettings).toHaveBeenLastCalledWith(
      sonia.alias,
      expect.objectContaining({ base_revision: 1 })
    );
    expect(
      within(reopened).queryByRole("button", { name: "保存共享介绍" })
    ).toBeNull();
  }, 15_000);

  it("从服务目录筛选，清空条件恢复完整列表", async () => {
    mount();
    await screen.findByLabelText("试听 Sonia");
    const list = screen.getByRole("list", { name: "音色列表" });
    expect(within(list).getByLabelText("试听 Sonia")).toBeVisible();
    expect(within(list).getByLabelText("试听 Guy")).toBeVisible();
    fireEvent.change(screen.getByLabelText("搜索音色"), {
      target: { value: "guy" }
    });
    expect(screen.queryByLabelText("试听 Sonia")).toBeNull();
    expect(screen.getByLabelText("试听 Guy")).toBeEnabled();
    fireEvent.click(screen.getByLabelText("只看常用"));
    expect(screen.getByText("未找到符合条件的数据")).toBeVisible();
    fireEvent.click(screen.getByText("清除筛选"));
    expect(screen.getByLabelText("试听 Sonia")).toBeVisible();
    expect(screen.getByLabelText("试听 Guy")).toBeVisible();
  }, 10_000);

  it("在后续页筛选或清空条件时回到第一页", async () => {
    vi.mocked(api.speech.voices).mockResolvedValue({
      items: Array.from({ length: 12 }, (_, index) => ({
        ...sonia,
        alias: `voice-${index + 1}`,
        display_name: `Voice ${index + 1}`
      }))
    });
    mount();
    await screen.findByLabelText("试听 Voice 1");
    fireEvent.click(screen.getByTitle("2"));
    expect(screen.getByLabelText("试听 Voice 11")).toBeVisible();
    expect(screen.queryByLabelText("试听 Voice 1")).toBeNull();
    fireEvent.change(screen.getByLabelText("搜索音色"), {
      target: { value: "Voice 12" }
    });
    expect(screen.getByLabelText("试听 Voice 12")).toBeVisible();
    fireEvent.click(screen.getByText("清除筛选"));
    expect(screen.getByLabelText("试听 Voice 1")).toBeVisible();
    expect(screen.queryByLabelText("试听 Voice 12")).toBeNull();
  });

  it("取消生成后，迟到的音频不会重新出现", async () => {
    const pending = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview).mockImplementationOnce(() => pending.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    fireEvent.click(screen.getByRole("button", { name: /取\s*消/ }));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(result("cancelled")));
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  });

  it("全局配音管理员可维护音色，但不自动获得试听权限", async () => {
    setPermissions(["speech.global_dubbing"]);
    mount();
    expect(await screen.findByLabelText("试听 Sonia")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("调整 Sonia 参数"));
    fireEvent.click(screen.getByRole("button", { name: /共享介绍/ }));
    expect(await screen.findByText("保存共享介绍")).toBeVisible();
  });

  it("介绍折叠后保留草稿，保存个人设置不会清除介绍修改", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    vi.mocked(api.speech.saveSettings).mockResolvedValue({
      voice_alias: sonia.alias,
      parameters: { rate_percent: 25, pitch_semitones: 0, style: null },
      notes: "",
      personal_revision: 1,
      description_zh: null,
      description_revision: 0
    });
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    const drawer = screen.getByRole("dialog");
    const description = within(drawer).getByRole("button", {
      name: /共享介绍/
    });
    fireEvent.click(description);
    fireEvent.change(screen.getByLabelText("中文介绍"), {
      target: { value: "清晰自然" }
    });
    fireEvent.click(description);
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "1.25" }
    });
    fireEvent.click(screen.getByText("保存听感"));
    await screen.findByText("听感已保存，仅你可见。");
    expect(api.speech.saveSettings).toHaveBeenCalledWith(
      sonia.alias,
      expect.objectContaining({ parameters: null })
    );
    expect(api.speech.saveDescription).not.toHaveBeenCalled();
    fireEvent.click(within(drawer).getByLabelText("Close"));
    await waitFor(() =>
      expect(screen.getByText("关闭会丢弃尚未保存的听感或介绍。")).toBeVisible()
    );
    fireEvent.click(screen.getByText("继续编辑"));
    fireEvent.click(description);
    expect(screen.getByLabelText("中文介绍")).toHaveValue("清晰自然");
  });

  it("加入推荐前校验参数，错误不会被弹窗遮住", async () => {
    setPermissions([
      "words.access",
      "speech.generate",
      "speech.global_dubbing"
    ]);
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "" }
    });
    fireEvent.click(screen.getByText("加入分组推荐"));
    expect(await screen.findByText("请输入 0.50 至 1.50 倍速")).toBeVisible();
    expect(
      screen.queryByRole("dialog", { name: "将 Sonia 加入分组推荐" })
    ).toBeNull();
  });

  it("目录访问和生成权限分别判断，无权限时不请求目录", async () => {
    setPermissions(["sentences.access"]);
    const view = mount();
    expect(await screen.findByLabelText("试听 Sonia")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("试听 Sonia"));
    expect(api.speech.preview).not.toHaveBeenCalled();
    view.unmount();
    vi.mocked(api.speech.voices).mockClear();
    setPermissions(["speech.generate"]);
    mount();
    expect(screen.getByText("无权限")).toBeVisible();
    expect(api.speech.voices).not.toHaveBeenCalled();
  });

  it("空白及超长文本不能生成，修改文本清除旧音频", async () => {
    mount();
    const button = await screen.findByLabelText("试听 Sonia");
    const text = screen.getByLabelText("共用试听文本");
    fireEvent.change(text, { target: { value: "   " } });
    expect(button).toBeDisabled();
    fireEvent.change(text, { target: { value: "a".repeat(501) } });
    expect(button).toBeDisabled();
    fireEvent.change(text, { target: { value: "Hello world." } });
    fireEvent.click(button);
    expect(await screen.findByLabelText("Sonia 试听播放器")).toHaveAttribute(
      "src",
      result("sonia").audio_url
    );
    expect(api.speech.preview).toHaveBeenCalledWith(
      {
        content: { version: 2, text: "Hello world.", annotations: [] },
        voice_alias: sonia.alias,
        rate_percent: 0,
        pitch_semitones: 0
      },
      expect.any(AbortSignal)
    );
    fireEvent.change(text, { target: { value: "Another sentence." } });
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  });

  it("快速切换音色时取消旧请求，迟到响应不能覆盖新声音", async () => {
    const first = deferred<AdminSpeechPreviewResponse>();
    const second = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview)
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    fireEvent.click(screen.getByLabelText("试听 Guy"));
    expect(signal.aborted).toBe(true);
    await act(async () => second.resolve(result("guy")));
    expect(await screen.findByLabelText("Guy 试听播放器")).toHaveAttribute(
      "src",
      result("guy").audio_url
    );
    await act(async () => first.resolve(result("old-sonia")));
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
    expect(screen.getByLabelText("Guy 试听播放器")).toHaveAttribute(
      "src",
      result("guy").audio_url
    );
  });

  it("调参按服务能力校验，原样提交百分比和半音，关闭后不留旧播放器", async () => {
    mount();
    fireEvent.click(await screen.findByLabelText("调整 Sonia 参数"));
    const drawer = await screen.findByRole("dialog");
    fireEvent.change(within(drawer).getByLabelText("合成语速"), {
      target: { value: "0.75" }
    });
    fireEvent.change(within(drawer).getByLabelText("音调"), {
      target: { value: "2" }
    });
    fireEvent.click(within(drawer).getByLabelText("试听当前参数"));
    await waitFor(() =>
      expect(api.speech.preview).toHaveBeenCalledWith(
        expect.objectContaining({ rate_percent: -25, pitch_semitones: 2 }),
        expect.any(AbortSignal)
      )
    );
    expect(
      await within(drawer).findByLabelText("Sonia 试听播放器")
    ).toBeVisible();
    fireEvent.change(within(drawer).getByLabelText("合成语速"), {
      target: { value: "" }
    });
    fireEvent.click(within(drawer).getByLabelText("试听当前参数"));
    await within(drawer).findByText("请输入 0.50 至 1.50 倍速");
    expect(api.speech.preview).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  });

  it("加载失败可重试，音频加载失败有恢复提示", async () => {
    vi.mocked(api.speech.voices).mockRejectedValueOnce(new Error("offline"));
    mount();
    expect(await screen.findByText("音色列表加载失败，请重试。")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    fireEvent.error(await screen.findByLabelText("Sonia 试听播放器"));
    expect(
      screen.getByText("音频加载失败或链接已过期，请重新生成试听。")
    ).toBeVisible();
  });

  it("生成中撤销权限会取消请求且不接纳迟到音频", async () => {
    const pending = deferred<AdminSpeechPreviewResponse>();
    vi.mocked(api.speech.preview).mockImplementationOnce(() => pending.promise);
    mount();
    fireEvent.click(await screen.findByLabelText("试听 Sonia"));
    const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
    act(() => setPermissions(["words.access"]));
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(result("old")));
    expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
    expect(screen.getByLabelText("试听 Sonia")).toBeDisabled();
  });
});
