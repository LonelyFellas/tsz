import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";

import type {
  AdminSpeechPreviewResponse,
  AdminSpeechVoice,
  AdminVoiceParameters
} from "@tsz/types";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, useAuthStore } from "@/lib/auth";
import { DubbingAudition } from "./DubbingAudition";
import { newVoiceTrial } from "./voice-trial";

const voice: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  accent: "gb",
  gender: "female",
  is_common: true,
  capabilities: {
    min_rate_percent: -50,
    max_rate_percent: 50,
    min_pitch_semitones: -10,
    max_pitch_semitones: 10,
    styles: ["cheerful"]
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
    checked_at: "2026-11-01"
  }
};
const parameters: AdminVoiceParameters = {
  rate_percent: -27,
  pitch_semitones: 2,
  volume_percent: 65,
  style: "cheerful",
  style_degree: 1.3,
  role: "Girl"
};
const result: AdminSpeechPreviewResponse = {
  audio_url: "https://audio.example.test/preview.mp3",
  cache_status: "generated",
  expires_at: "2099-01-01T00:00:00Z",
  url_expires_in_seconds: 600
};
function mount(params = parameters, target = voice) {
  return render(
    <DubbingAudition
      voice={target}
      parameters={params}
      originalVoice={voice}
      originalParameters={{
        rate_percent: 0,
        pitch_semitones: 0,
        style: null
      }}
      side="uk"
    />
  );
}
beforeEach(() => {
  useAuthStore.getState().setProfile({
    id: "dubbing-audition-admin",
    phone: "fixture",
    display_name: "测试",
    role: "admin",
    preferences: { dialect: "uk" },
    permission_version: 1,
    catalog_version: "test",
    permissions: ["words.access", "speech.generate"]
  });
  vi.spyOn(api.speech, "preview").mockResolvedValue(result);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  useAuthStore.getState().setProfile(null);
  vi.restoreAllMocks();
});
it("当前设置试听提交精确参数及本次文本，原设置试听独立使用原参数", async () => {
  mount();
  fireEvent.change(screen.getByLabelText("本次试听文本"), {
    target: { value: "A new sentence." }
  });
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  await screen.findByLabelText("Sonia 试听播放器");
  expect(api.speech.preview).toHaveBeenCalledWith(
    {
      content: { version: 2, text: "A new sentence.", annotations: [] },
      voice_alias: "sonia",
      ...parameters
    },
    expect.any(AbortSignal)
  );
  fireEvent.click(screen.getByRole("button", { name: "试听原参数" }));
  await waitFor(() => expect(api.speech.preview).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.speech.preview).mock.calls[1]![0]).toMatchObject({
    rate_percent: 0,
    pitch_semitones: 0,
    voice_alias: "sonia"
  });
  expect(vi.mocked(api.speech.preview).mock.calls[1]![0]).not.toHaveProperty(
    "style_degree"
  );
});
it("换参数会取消请求，迟到结果不能成为新设置的试听", async () => {
  let resolve!: (value: AdminSpeechPreviewResponse) => void;
  vi.mocked(api.speech.preview).mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
  view.rerender(
    <DubbingAudition
      voice={voice}
      parameters={{ ...parameters, rate_percent: -20 }}
      side="uk"
    />
  );
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(result));
  expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
});
it("同值渲染不作废音频，改字和关闭会停止音频或取消请求", async () => {
  const view = mount();
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  const player = await screen.findByLabelText("Sonia 试听播放器");
  view.rerender(
    <DubbingAudition voice={voice} parameters={{ ...parameters }} side="uk" />
  );
  expect(screen.getByLabelText("Sonia 试听播放器")).toBe(player);
  fireEvent.change(screen.getByLabelText("本次试听文本"), {
    target: { value: "Changed." }
  });
  expect(screen.queryByLabelText("Sonia 试听播放器")).toBeNull();
  expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  const signal = vi.mocked(api.speech.preview).mock.calls.at(-1)![1]!;
  view.unmount();
  expect(signal.aborted).toBe(true);
});
it("不支持的参数保留在输入配置中，合成时不发送；权限不足或空文本不能生成", async () => {
  const locked = {
    ...voice,
    capability_evidence: undefined,
    capabilities: {
      styles: [],
      min_rate_percent: 0,
      max_rate_percent: 0,
      min_pitch_semitones: 0,
      max_pitch_semitones: 0,
      supports_volume_percent: false
    }
  };
  const view = mount(parameters, locked);
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  await screen.findByLabelText("Sonia 试听播放器");
  expect(vi.mocked(api.speech.preview).mock.calls[0]![0]).toEqual({
    content: {
      version: 2,
      text: "Please record the interview before the meeting starts.",
      annotations: []
    },
    voice_alias: "sonia"
  });
  expect(parameters).toMatchObject({
    rate_percent: -27,
    volume_percent: 65,
    style_degree: 1.3
  });
  fireEvent.change(screen.getByLabelText("本次试听文本"), {
    target: { value: "   " }
  });
  expect(screen.getByRole("button", { name: "试听当前参数" })).toBeDisabled();
  view.unmount();
  useAuthStore.getState().setProfile({
    ...useAuthStore.getState().profile!,
    permissions: ["words.access"]
  });
  mount();
  expect(screen.getByRole("button", { name: "试听当前参数" })).toBeDisabled();
});

it("分组使用共用标注与输出格式，富文本和 WAV 原样传入试听", async () => {
  const source = newVoiceTrial("record");
  source.output_format = "wav";
  source.content.annotations.push({
    type: "phoneme",
    start: 0,
    end: 6,
    alphabet: "ipa",
    phoneme: "rɪˈkɔːd"
  });
  render(
    <DubbingAudition
      voice={voice}
      parameters={parameters}
      side="uk"
      source={source}
      onSourceChange={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "试听当前参数" }));
  await screen.findByLabelText("Sonia 试听播放器");
  expect(api.speech.preview).toHaveBeenCalledWith(
    expect.objectContaining({
      content: source.content,
      output_format: "wav",
      rate_percent: -27,
      volume_percent: 65,
      style_degree: 1.3,
      role: "Girl"
    }),
    expect.any(AbortSignal)
  );
});
it("分组的 SSML 使用当前侧全部参数，折叠仍保留原文", async () => {
  const ssml =
    '<speak version="1.0" xml:lang="en-GB"><voice name="en-GB-SoniaNeural">record</voice></speak>';
  vi.spyOn(api.speech, "renderSsml").mockResolvedValue({ ssml });
  mount();
  fireEvent.click(screen.getByText("SSML"));
  await waitFor(() =>
    expect(api.speech.renderSsml).toHaveBeenCalledWith(
      expect.objectContaining({
        setting: expect.objectContaining({
          voice_id: "sonia",
          rate_percent: -27,
          volume_percent: 65,
          style_degree: 1.3,
          role: "Girl"
        })
      }),
      expect.any(AbortSignal)
    )
  );
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(ssml)
  );
  fireEvent.click(screen.getByText("SSML"));
  fireEvent.click(screen.getByText("SSML"));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(ssml)
  );
});
it("原声音不支持当前标注时明确提示，不提交不兼容的对比试听", async () => {
  const source = newVoiceTrial("record");
  source.content.annotations.push({
    type: "phoneme",
    start: 0,
    end: 6,
    alphabet: "ipa",
    phoneme: "rɪˈkɔːd"
  });
  render(
    <DubbingAudition
      voice={voice}
      parameters={parameters}
      originalVoice={{
        ...voice,
        capability_evidence: undefined,
        capabilities: { ...voice.capabilities, supports_phoneme: false }
      }}
      originalParameters={parameters}
      side="uk"
      source={source}
      onSourceChange={vi.fn()}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: "试听原参数" }));
  expect(
    await screen.findByText(/当前音色暂未开放指定音标或关联单词读法/)
  ).toBeVisible();
  expect(api.speech.preview).not.toHaveBeenCalled();
});
