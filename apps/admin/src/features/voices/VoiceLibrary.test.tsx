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
  AdminProfile
} from "@tsz/types";
import { App, ConfigProvider } from "antd";
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
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  clients.push(client);
  return render(
    <QueryClientProvider client={client}>
      <ConfigProvider theme={{ token: { motion: false } }}>
        <App>
          <VoiceLibrary />
        </App>
      </ConfigProvider>
    </QueryClientProvider>
  );
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
  vi.spyOn(api.speech, "saveSettings");
  vi.spyOn(api.speech, "saveDescription");
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});

describe("音色库", () => {
  it("刷新后重新打开采用服务端新参数，保存中参数不可编辑", async () => {
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
      target: { value: "-25" }
    });
    fireEvent.click(screen.getByText("保存个人参数与听感"));
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
    expect(screen.getByLabelText("合成语速")).toHaveValue("20");
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
      await screen.findByText("关闭会丢弃当前参数、听感或介绍的修改。")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByText("继续编辑"));
    await waitFor(() =>
      expect(
        screen.queryByText("关闭会丢弃当前参数、听感或介绍的修改。")
      ).toBeNull()
    );
    expect(screen.getByLabelText("我的听感")).toHaveValue("不能丢失的笔记");
    fireEvent.click(screen.getByText("保存个人参数与听感"));
    const reload = await screen.findByText("重新载入设置");
    const pending = deferred<{ items: [] }>();
    vi.mocked(api.speech.library).mockImplementationOnce(() => pending.promise);
    fireEvent.click(reload);
    fireEvent.click(within(screen.getByRole("dialog")).getByLabelText("Close"));
    expect(screen.getByLabelText("我的听感")).toHaveValue("不能丢失的笔记");
    expect(screen.getByLabelText("合成语速")).toBeDisabled();
    await act(async () => pending.resolve({ items: [] }));
  }, 15000);

  it("个人设置保存并重新打开读回，冲突保留输入且不覆盖版本", async () => {
    const saved = {
      voice_alias: sonia.alias,
      parameters: { rate_percent: -25, pitch_semitones: 0, style: null },
      notes: "清晰慢读",
      personal_revision: 1,
      description_zh: null,
      description_revision: 0
    };
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
      { target: { value: "-25" } }
    );
    fireEvent.change(
      within(dialog).getByRole("textbox", { name: "我的听感" }),
      { target: { value: "清晰慢读" } }
    );
    fireEvent.click(
      within(dialog).getByRole("button", { name: "保存个人参数与听感" })
    );
    await screen.findByText("个人参数与听感已保存，仅你可见。");
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
    fireEvent.click(
      within(reopened).getByRole("button", { name: "保存个人参数与听感" })
    );
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
    expect(screen.getByRole("region", { name: "女声音色" })).toBeVisible();
    expect(screen.getByRole("region", { name: "男声音色" })).toBeVisible();
    fireEvent.change(screen.getByLabelText("搜索音色"), {
      target: { value: "guy" }
    });
    expect(screen.queryByLabelText("试听 Sonia")).toBeNull();
    expect(screen.getByLabelText("试听 Guy")).toBeEnabled();
    fireEvent.click(screen.getByLabelText("只看常用"));
    expect(screen.getByText("没有匹配的音色，请调整筛选条件。")).toBeVisible();
    fireEvent.click(screen.getByText("清除筛选"));
    expect(screen.getByLabelText("试听 Sonia")).toBeVisible();
    expect(screen.getByLabelText("试听 Guy")).toBeVisible();
  }, 10_000);

  it("全局配音管理员可维护音色，但不自动获得试听权限", async () => {
    setPermissions(["speech.global_dubbing"]);
    mount();
    expect(await screen.findByLabelText("试听 Sonia")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("调整 Sonia 参数"));
    expect(await screen.findByText("保存共享介绍")).toBeVisible();
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
      target: { value: "-25" }
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
    await within(drawer).findByText("请输入 -50 至 50 的整数");
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
