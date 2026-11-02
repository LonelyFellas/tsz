import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App, ConfigProvider } from "antd";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  AdminSpeechVoice,
  AdminDubbingRecommendationPair,
  AdminSpeechPreviewResponse
} from "@tsz/types";
import { RecommendationEditor } from "./RecommendationEditor";
import { api, useAuthStore } from "@/lib/auth";

// 此处验证抽屉调度和草稿隔离；完整富文本标注由试听、音色库集成用例验证。
vi.mock("./VoiceTrialEditor", () => ({
  VoiceTrialEditor: ({
    source,
    onChange
  }: {
    source: { content: { text: string } };
    onChange: (source: unknown) => void;
  }) => (
    <textarea
      aria-label="本次试听文本"
      value={source.content.text}
      onChange={(event) =>
        onChange({
          ...source,
          content: { ...source.content, text: event.target.value }
        })
      }
    />
  )
}));
const sonia: AdminSpeechVoice = {
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
  },
  capability_evidence: {
    provider_voice_id: "en-GB-SoniaNeural",
    locale: "en-GB",
    gender: "female",
    model: "neural",
    styles: ["cheerful"],
    supported_locales: ["en-GB"],
    roles: ["Girl"],
    supports_style_degree: true,
    source_url: "fixture",
    checked_at: "2026-11-02"
  }
};
const libby = { ...sonia, alias: "libby", display_name: "Libby" };
const aria: AdminSpeechVoice = {
  ...sonia,
  alias: "aria",
  display_name: "Aria",
  locale: "en-US",
  accent: "us"
};
const initial: AdminDubbingRecommendationPair = {
  id: "pair",
  name: "自然朗读",
  selected: true,
  uk: {
    id: "uk",
    voice_alias: "sonia",
    parameters: {
      rate_percent: 0,
      pitch_semitones: 0,
      style: "cheerful",
      style_degree: 1.2,
      role: "Girl"
    }
  },
  us: {
    id: "us",
    voice_alias: "aria",
    parameters: {
      rate_percent: 0,
      pitch_semitones: 0,
      style: "cheerful",
      style_degree: 1.1,
      role: "Girl"
    }
  }
};
function mount(side?: "uk") {
  const onSave = vi.fn();
  render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <RecommendationEditor
          voices={[sonia, libby, aria]}
          initial={initial}
          side={side}
          disabled={false}
          onSave={onSave}
          onCancel={vi.fn()}
        />
      </App>
    </ConfigProvider>
  );
  return onSave;
}
async function selectUK(name: string, side?: "uk") {
  if (side) {
    fireEvent.mouseDown(screen.getByLabelText("英式音色"));
    fireEvent.click(
      await screen.findByText(name, {
        selector: ".ant-select-item-option-content"
      })
    );
  } else fireEvent.click(screen.getByRole("radio", { name: `${name} 女声` }));
}
beforeEach(() => {
  useAuthStore.getState().setProfile({
    id: "drawer-test-admin",
    phone: "fixture",
    display_name: "测试",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "fixture",
    permissions: ["words.access", "speech.generate", "speech.global_dubbing"]
  });
  vi.spyOn(api.speech, "renderSsml").mockResolvedValue({
    ssml: "<speak>automatic</speak>"
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});
it("高级参数收展、英美往返及试听均保留参数与各自文本、格式", async () => {
  vi.spyOn(api.speech, "preview").mockResolvedValue({
    audio_url: "https://audio.example.test/current.wav",
    cache_status: "generated",
    expires_at: "2099-01-01",
    url_expires_in_seconds: 600
  });
  const onSave = mount();
  fireEvent.change(screen.getByLabelText("合成语速"), {
    target: { value: "0.73" }
  });
  fireEvent.change(screen.getByLabelText("合成音量"), {
    target: { value: "65" }
  });
  fireEvent.click(screen.getByText("高级参数", { exact: true }));
  fireEvent.change(
    await screen.findByRole("spinbutton", { name: "风格强度" }),
    { target: { value: "1.40" } }
  );
  fireEvent.change(screen.getByLabelText("本次试听文本"), {
    target: { value: "UK draft" }
  });
  fireEvent.click(screen.getByText("高级参数", { exact: true }));
  fireEvent.click(screen.getByText("高级参数", { exact: true }));
  expect(await screen.findByLabelText("风格强度")).toHaveValue("1.40");
  fireEvent.mouseDown(screen.getByLabelText("试听输出格式"));
  fireEvent.click(
    await screen.findByText("WAV", {
      selector: ".ant-select-item-option-content"
    })
  );
  fireEvent.click(screen.getByRole("button", { name: "配置美式声音" }));
  expect(
    screen.getByLabelText("试听输出格式").closest(".ant-select")
  ).toHaveTextContent("MP3");
  fireEvent.change(screen.getByLabelText("合成语速"), {
    target: { value: "0.85" }
  });
  fireEvent.change(screen.getByLabelText("本次试听文本"), {
    target: { value: "US draft" }
  });
  fireEvent.click(screen.getByRole("button", { name: "配置英式声音" }));
  expect(screen.getByLabelText("合成语速")).toHaveValue("0.73");
  expect(screen.getByLabelText("合成音量")).toHaveValue("65");
  expect(screen.getByLabelText("本次试听文本")).toHaveValue("UK draft");
  expect(screen.getByLabelText("风格强度")).toHaveValue("1.40");
  expect(
    screen.getByLabelText("试听输出格式").closest(".ant-select")
  ).toHaveTextContent("WAV");
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  await screen.findByLabelText("Sonia 试听播放器");
  expect(api.speech.preview).toHaveBeenCalledWith(
    expect.objectContaining({
      voice_alias: "sonia",
      content: { version: 2, text: "UK draft", annotations: [] },
      output_format: "wav",
      rate_percent: -27,
      volume_percent: 65,
      style_degree: 1.4,
      role: "Girl"
    }),
    expect.any(AbortSignal)
  );
  expect(screen.getByLabelText("合成语速")).toHaveValue("0.73");
  fireEvent.click(screen.getByRole("button", { name: "保存整套推荐" }));
  await waitFor(() =>
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        uk: expect.objectContaining({
          id: "uk",
          parameters: expect.objectContaining({
            rate_percent: -27,
            volume_percent: 65,
            style_degree: 1.4
          })
        }),
        us: expect.objectContaining({
          id: "us",
          parameters: expect.objectContaining({
            rate_percent: -15,
            style_degree: 1.1
          })
        })
      })
    )
  );
});
it.each([undefined, "uk"] as const)(
  "%s 编辑中，同侧换声音再返回不丢已调参数和试听文本",
  async (side) => {
    mount(side);
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.73" }
    });
    fireEvent.change(screen.getByLabelText("合成音量"), {
      target: { value: "65" }
    });
    fireEvent.change(screen.getByLabelText("本次试听文本"), {
      target: { value: "Sonia draft" }
    });
    await selectUK("Libby", side);
    expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
    fireEvent.change(screen.getByLabelText("合成语速"), {
      target: { value: "0.92" }
    });
    fireEvent.change(screen.getByLabelText("本次试听文本"), {
      target: { value: "Libby draft" }
    });
    await selectUK("Sonia", side);
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.73");
    expect(screen.getByLabelText("合成音量")).toHaveValue("65");
    expect(screen.getByLabelText("本次试听文本")).toHaveValue("Sonia draft");
    await selectUK("Libby", side);
    expect(screen.getByLabelText("合成语速")).toHaveValue("0.92");
    expect(screen.getByLabelText("本次试听文本")).toHaveValue("Libby draft");
  }
);
it("英美切换保留手动 SSML 草稿，切回可继续编辑", async () => {
  mount();
  fireEvent.click(screen.getByText("SSML", { exact: true }));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(
      "<speak>automatic</speak>"
    )
  );
  fireEvent.click(screen.getByLabelText("手动编辑 SSML"));
  fireEvent.change(screen.getByLabelText("SSML 原文"), {
    target: { value: "<speak>UK manual</speak>" }
  });
  fireEvent.click(screen.getByRole("button", { name: "配置美式声音" }));
  fireEvent.click(screen.getByText("SSML", { exact: true }));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(
      "<speak>automatic</speak>"
    )
  );
  fireEvent.click(screen.getByLabelText("手动编辑 SSML"));
  fireEvent.change(screen.getByLabelText("SSML 原文"), {
    target: { value: "<speak>US manual</speak>" }
  });
  fireEvent.click(screen.getByRole("button", { name: "配置英式声音" }));
  fireEvent.click(screen.getByText("SSML", { exact: true }));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(
      "<speak>UK manual</speak>"
    )
  );
  expect(screen.getByLabelText("手动编辑 SSML")).toBeChecked();
});
it("生成中切换英美会取消旧请求，迟到结果不能回到新侧", async () => {
  let complete!: (value: AdminSpeechPreviewResponse) => void;
  vi.spyOn(api.speech, "preview").mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  mount();
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
  fireEvent.click(screen.getByRole("button", { name: "配置美式声音" }));
  expect(signal.aborted).toBe(true);
  await act(async () =>
    complete({
      audio_url: "https://audio.example.test/old.mp3",
      cache_status: "generated",
      expires_at: "2099-01-01",
      url_expires_in_seconds: 600
    })
  );
  expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  expect(screen.getByRole("button", { name: "配置美式声音" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});
