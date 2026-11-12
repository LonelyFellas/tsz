import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import type { InterfaceLocale } from "@tsz/shared/i18n";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App } from "@tsz/ui/admin/overlays";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  AdminSpeechVoice,
  AdminDubbingRecommendation,
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
const initial: AdminDubbingRecommendation = {
  id: "uk",
  name: "自然朗读",
  selected: true,
  voice_alias: "sonia",
  parameters: {
    rate_percent: 0,
    pitch_semitones: 0,
    style: "cheerful",
    style_degree: 1.2,
    role: "Girl"
  }
};
const clients = [sonia, libby, aria];
function mount(voices = clients) {
  const onSave = vi.fn(),
    onCancel = vi.fn();
  const content = (locale: InterfaceLocale) => (
    <InterfaceI18nProvider locale={locale}>
      <App>
        <RecommendationEditor
          voices={voices}
          initial={initial}
          side="uk"
          disabled={false}
          onSave={onSave}
          onCancel={onCancel}
        />
      </App>
    </InterfaceI18nProvider>
  );
  const view = render(content("zh-Hans"));
  return {
    onSave,
    onCancel,
    changeLocale: (locale: InterfaceLocale) => view.rerender(content(locale)),
    ...view
  };
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
it("固定当前口音，候选支持键盘切换跳过不可用，单条保存保留身份", async () => {
  const { onSave } = mount([
    sonia,
    {
      ...libby,
      alias: "unavailable",
      display_name: "Unavailable",
      synthesis_available: false
    },
    libby,
    aria
  ]);
  expect(screen.queryByRole("radio", { name: "Aria 女声" })).toBeNull();
  expect(
    screen.getByRole("radio", { name: "Unavailable 女声" })
  ).toBeDisabled();
  const current = screen.getByRole("radio", { name: "Sonia 女声" });
  act(() => current.focus());
  fireEvent.keyDown(current, { key: "ArrowDown" });
  await waitFor(() =>
    expect(screen.getByRole("radio", { name: "Libby 女声" })).toBeChecked()
  );
  fireEvent.keyUp(screen.getByRole("radio", { name: "Libby 女声" }), {
    key: "ArrowDown"
  });
  fireEvent.click(screen.getByRole("button", { name: "保存到本组" }));
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "uk",
      voice_alias: "libby",
      name: "自然朗读",
      selected: true
    })
  );
  expect(onSave.mock.calls[0]![0]).not.toHaveProperty("us");
});
it("切换声音恢复各自参数、试听文本、手动SSML，取消不保存；迟到音频被丢弃", async () => {
  let complete!: (response: AdminSpeechPreviewResponse) => void;
  vi.spyOn(api.speech, "preview").mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      })
  );
  const { onSave, onCancel } = mount();
  fireEvent.change(screen.getByLabelText("合成语速"), {
    target: { value: "0.73" }
  });
  fireEvent.change(screen.getByLabelText("合成音量"), {
    target: { value: "65" }
  });
  fireEvent.change(screen.getByLabelText("本次试听文本"), {
    target: { value: "Sonia draft" }
  });
  fireEvent.click(screen.getByText("SSML", { exact: true }));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(
      "<speak>automatic</speak>"
    )
  );
  fireEvent.click(screen.getByLabelText("手动编辑 SSML"));
  fireEvent.change(screen.getByLabelText("SSML 原文"), {
    target: { value: "<speak>Sonia manual</speak>" }
  });
  fireEvent.click(screen.getByLabelText("试听当前参数"));
  const signal = vi.mocked(api.speech.preview).mock.calls[0]![1]!;
  fireEvent.click(screen.getByRole("radio", { name: "Libby 女声" }));
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
  expect(screen.getByLabelText("合成语速")).toHaveValue("1.00");
  fireEvent.change(screen.getByLabelText("合成语速"), {
    target: { value: "0.92" }
  });
  fireEvent.click(screen.getByRole("radio", { name: "Sonia 女声" }));
  expect(screen.getByLabelText("合成语速")).toHaveValue("0.73");
  expect(screen.getByLabelText("合成音量")).toHaveValue("65");
  expect(screen.getByLabelText("本次试听文本")).toHaveValue("Sonia draft");
  fireEvent.click(screen.getByText("SSML", { exact: true }));
  await waitFor(() =>
    expect(screen.getByLabelText("SSML 原文")).toHaveValue(
      "<speak>Sonia manual</speak>"
    )
  );
  fireEvent.click(screen.getByRole("button", { name: /^取消$/ }));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onSave).not.toHaveBeenCalled();
});
it("女男目录独立搜索并恢复滚动，搜索和调参不重置另一列", () => {
  mount([
    ...Array.from({ length: 25 }, (_, index) => ({
      ...sonia,
      alias: `female-${index}`,
      display_name: `Female${index}`
    })),
    sonia,
    { ...libby, alias: "male", display_name: "Male", gender: "male" }
  ]);
  const female = screen.getByLabelText("英式女声目录"),
    male = screen.getByLabelText("英式男声目录");
  female.scrollTop = 120;
  fireEvent.scroll(female);
  male.scrollTop = 60;
  fireEvent.scroll(male);
  fireEvent.change(screen.getByLabelText("搜索英式女声"), {
    target: { value: "Female20" }
  });
  expect(female.scrollTop).toBe(0);
  expect(male.scrollTop).toBe(60);
  fireEvent.click(screen.getByRole("radio", { name: "Female20 女声" }));
  fireEvent.change(screen.getByLabelText("合成语速"), {
    target: { value: "0.73" }
  });
  fireEvent.change(screen.getByLabelText("搜索英式女声"), {
    target: { value: "" }
  });
  expect(female.scrollTop).toBe(120);
  expect(male.scrollTop).toBe(60);
  expect(screen.getByRole("radio", { name: "Female20 女声" })).toBeChecked();
});
it("清空参数保持错误、重置只当前声音，切语言不丢输入或变更名称和ID", async () => {
  const { onSave, onCancel, changeLocale } = mount();
  const rate = screen.getByLabelText("合成语速") as HTMLInputElement;
  fireEvent.change(rate, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "保存到本组" }));
  expect(onSave).not.toHaveBeenCalled();
  expect(rate).toHaveValue("");
  fireEvent.change(rate, { target: { value: "0.73" } });
  fireEvent.change(screen.getByLabelText("合成音量"), {
    target: { value: "65" }
  });
  rate.focus();
  for (const locale of ["en-GB", "zh-Hant", "en-US", "zh-Hans"] as const) {
    changeLocale(locale);
    expect(rate).toHaveValue("0.73");
    expect(rate).toHaveFocus();
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  }
  fireEvent.click(screen.getByRole("button", { name: "保存到本组" }));
  expect(onSave).toHaveBeenCalledWith({
    ...initial,
    parameters: { ...initial.parameters, rate_percent: -27, volume_percent: 65 }
  });
});
it.each(["", " \t "])(
  "空名称 %j 保留既有默认命名行为且只保存当前条目",
  (name) => {
    const { onSave } = mount();
    fireEvent.change(screen.getByLabelText("推荐名称"), {
      target: { value: name }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存到本组" }));
    expect(onSave).toHaveBeenCalledWith({ ...initial, name: "未命名推荐" });
  }
);
