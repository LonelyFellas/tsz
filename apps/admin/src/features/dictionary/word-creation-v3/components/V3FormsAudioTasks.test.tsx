import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  GenerateVoiceAudioRequest,
  RichTextV2,
  SharedFormsStepContentV3,
  VoiceSettingV3
} from "@tsz/types";
import { V3FormsAudioTasks } from "./V3FormsAudioTasks";
import { VoiceSaveContext } from "../voiceSaveContext";

const speech = vi.hoisted(() => ({
  generate: vi.fn(),
  resolve: vi.fn(),
  synthesize: vi.fn(),
  catalog: vi.fn()
}));
vi.mock("@/lib/auth", () => ({
  usePermission: () => true,
  api: { speech: { generateAudio: speech.generate, resolve: speech.resolve } }
}));
vi.mock("@/lib/env", () => ({ env: { VOICE_PREVIEW: true } }));
vi.mock("../../voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {
    listVoices: speech.catalog,
    synthesize: speech.synthesize,
    resolveVoices: async (input: {
      profile: { voices: VoiceSettingV3[] };
      accent: string;
    }) => speech.resolve(input),
    generateAudio: async (input: {
      content: RichTextV2;
      setting: VoiceSettingV3;
    }) =>
      (
        await speech.generate({
          source: { kind: "text", content: input.content },
          setting: input.setting
        })
      ).asset
  },
  adminAudioUploadAdapter: {},
  loadAdminVoiceRecommendations: vi.fn(),
  voicePreviewIsMock: false
}));
const voices: VoiceSettingV3[] = (["en-GB", "en-US"] as const).map(
  (locale) => ({
    voice_id: locale,
    version_id: locale,
    locale,
    enabled: true,
    rate_percent: 0
  })
);
function fixture(): SharedFormsStepContentV3 {
  return {
    forms_format: "shared_v1",
    pos: [],
    contents: [
      {
        id: "content",
        dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
        regional_variants: {
          mode: "common",
          common: {
            id: "variant",
            origin: "manual",
            spelling: "hello",
            pronunciations: [
              {
                id: "pronunciation",
                dict_phonetic: "heˈləʊ",
                actual_pron: "heˈləʊ",
                style: "normal",
                voice_profile: { voices },
                synthesis: {
                  alphabet: "ipa",
                  use_spelling: false,
                  ipa: "",
                  ups: "",
                  uk: { ipa: "heˈləʊ", ups: "" },
                  us: { ipa: "hɛˈloʊ", ups: "" }
                }
              }
            ]
          }
        }
      }
    ]
  };
}
const tasks = new Map<string, () => Promise<boolean>>();
function Host({ initial = fixture(), paused = false }) {
  const [forms, setForms] = useState(initial);
  return (
    <>
      <VoiceSaveContext.Provider
        value={{ save: async () => true, audioTasks: tasks }}
      >
        <V3FormsAudioTasks forms={forms} paused={paused} onChange={setForms} />
      </VoiceSaveContext.Provider>
      <output data-testid="saved-forms">{JSON.stringify(forms)}</output>
    </>
  );
}
beforeEach(() => {
  tasks.clear();
  speech.catalog.mockReset().mockResolvedValue(
    voices.map((setting) => ({
      id: setting.voice_id,
      locale: setting.locale
    }))
  );
  speech.generate
    .mockReset()
    .mockImplementation(async (input: GenerateVoiceAudioRequest) => ({
      asset: {
        id: `formal-${input.source.kind === "phoneme" ? "phoneme" : input.source.content.text === "hello" ? "spelling" : "row"}-${input.setting.locale}`
      }
    }));
  speech.resolve
    .mockReset()
    .mockImplementation(
      async ({
        profile,
        accent
      }: {
        profile: { voices: VoiceSettingV3[] };
        accent: string;
      }) => ({
        voices: profile.voices
          .map((setting) => ({
            ...setting,
            locale:
              setting.locale ??
              voices.find((voice) => voice.voice_id === setting.voice_id)
                ?.locale
          }))
          .filter(
            (setting) =>
              setting.locale === (accent === "gb" ? "en-GB" : "en-US")
          )
      })
    );
  speech.synthesize.mockReset();
});

it("未配置音标只在保存时生成当前推荐并保留继承，浏览不生成", async () => {
  const initial = fixture();
  const regions = initial.contents[0]!.regional_variants;
  if (regions.mode !== "common") throw new Error("fixture must be common");
  delete regions.common.pronunciations[0]!.voice_profile;
  speech.resolve.mockImplementation(async ({ accent }) => ({
    voices: [
      {
        ...voices[accent === "gb" ? 0 : 1]!,
        rate_percent: -25,
        volume_percent: 80
      }
    ]
  }));
  render(<Host initial={initial} />);
  await act(async () => {});
  expect(speech.generate).not.toHaveBeenCalled();
  await act(async () => {
    for (const wait of [...tasks.values()]) expect(await wait()).toBe(true);
  });
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(2));
  const row = JSON.parse(screen.getByTestId("saved-forms").textContent!)
    .contents[0].regional_variants.common.pronunciations[0];
  for (const side of ["uk", "us"]) {
    expect(row.synthesis[side].ipa_speech.voice_profile).toMatchObject({
      dubbing: {
        area: "azure",
        uk: { mode: "inherit" },
        us: { mode: "inherit" }
      },
      voices: [
        expect.objectContaining({
          rate_percent: -25,
          volume_percent: 80,
          audio_asset_id: expect.any(String)
        })
      ]
    });
  }
});

it.each([false, true])(
  "缺省拼写保存完整继承声音，默认录音及播放选择原样保留（逐侧来源=%s）",
  async (explicitSources) => {
    const initial = fixture();
    const regions = initial.contents[0]!.regional_variants;
    if (regions.mode !== "common") throw new Error("fixture must be common");
    const row = regions.common.pronunciations[0]!;
    delete row.voice_profile;
    row.synthesis!.use_spelling = !explicitSources;
    if (explicitSources) {
      row.synthesis!.uk!.source = "spelling";
      row.synthesis!.us!.source = "spelling";
    }
    const recording = {
      id: "recording-uk",
      locale: "en-GB" as const,
      gender: "female" as const,
      content_type: "audio/mpeg",
      size_bytes: 10,
      original_name: "recording.mp3",
      created_at: "2026-11-12T00:00:00Z",
      is_default: true
    };
    regions.common.spelling_speech = {
      content: { version: 2, text: "hello", annotations: [] },
      voice_profile: { voices: [] },
      audio_assets: [recording]
    };
    speech.resolve.mockImplementation(async ({ accent }) => ({
      voices: [{ ...voices[accent === "gb" ? 0 : 1]!, rate_percent: -25 }]
    }));
    render(<Host initial={initial} />);
    await act(async () => {});
    expect(speech.generate).not.toHaveBeenCalled();
    await act(async () => {
      for (const wait of [...tasks.values()]) expect(await wait()).toBe(true);
    });
    expect(speech.generate).toHaveBeenCalledTimes(2);
    expect(speech.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ accent: "us" })
    );
    expect(speech.resolve).toHaveBeenCalledWith(
      expect.objectContaining({ accent: "gb" })
    );
    const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
      .contents[0].regional_variants.common.spelling_speech;
    expect(saved.audio_assets).toEqual([recording]);
    expect(saved.voice_profile).toMatchObject({
      dubbing: {
        area: "word",
        uk: { mode: "inherit" },
        us: { mode: "inherit" }
      },
      voices: [
        expect.objectContaining({ locale: "en-GB", rate_percent: -25 }),
        expect.objectContaining({ locale: "en-US", rate_percent: -25 })
      ]
    });
  }
);

it("词典带入的已选音标在不打开弹窗、不试听时生成，英美资产同时回写共享内容", async () => {
  render(<Host />);
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(4));
  await waitFor(() => {
    const row = JSON.parse(screen.getByTestId("saved-forms").textContent!)
      .contents[0].regional_variants.common.pronunciations[0];
    expect(
      row.voice_profile.voices.map(
        (setting: VoiceSettingV3) => setting.audio_asset_id
      )
    ).toEqual(["formal-row-en-GB", "formal-row-en-US"]);
    expect(
      row.synthesis.uk.ipa_speech.voice_profile.voices[0].audio_asset_id
    ).toBe("formal-phoneme-en-GB");
    expect(
      row.synthesis.us.ipa_speech.voice_profile.voices[0].audio_asset_id
    ).toBe("formal-phoneme-en-US");
  });
  expect(speech.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: expect.objectContaining({
        kind: "phoneme",
        phoneme_locale: "en-GB",
        phoneme: "heˈləʊ"
      })
    }),
    expect.any(AbortSignal)
  );
  expect(screen.queryByRole("button", { name: /TTS/ })).toBeNull();
  expect(speech.synthesize).not.toHaveBeenCalled();
});

it("内容弹窗打开时暂停汇总表任务，关闭后自动继续缺失配音", async () => {
  const view = render(<Host paused />);
  expect(speech.generate).not.toHaveBeenCalled();
  view.rerender(<Host paused={false} />);
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(4));
});

it("旧勾选缺少地区时先读取目录，快速保存也等待地区解析和正式音频", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  variant.common.pronunciations[0]!.voice_profile = {
    voices: voices.map(({ locale: _locale, ...setting }) => setting)
  };
  let finish!: (value: unknown) => void;
  speech.catalog.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  render(<Host initial={forms} />);
  expect(speech.generate).not.toHaveBeenCalled();
  const waiting = tasks.get("forms:audio-catalog")!();
  await act(async () => {
    finish(
      voices.map((setting) => ({
        id: setting.voice_id,
        locale: setting.locale
      }))
    );
    expect(await waiting).toBe(true);
  });
  expect(speech.generate).toHaveBeenCalledTimes(4);
  expect(screen.getByTestId("saved-forms")).toHaveTextContent(
    "formal-phoneme-en-US"
  );
});

it("旧配置的目录加载失败保留草稿、阻止保存，重试后继续生成", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  variant.common.pronunciations[0]!.voice_profile = {
    voices: voices.map(({ locale: _locale, ...setting }) => setting)
  };
  speech.catalog.mockRejectedValue(new Error("目录暂不可用"));
  render(<Host initial={forms} />);
  expect(await screen.findAllByText("目录暂不可用")).not.toHaveLength(0);
  expect(await tasks.get("forms:audio-catalog")!()).toBe(false);
  expect(speech.generate).not.toHaveBeenCalled();
  speech.catalog.mockResolvedValue(
    voices.map((setting) => ({ id: setting.voice_id, locale: setting.locale }))
  );
  for (const retry of screen.getAllByRole("button", { name: "重试生成音频" }))
    fireEvent.click(retry);
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(4));
  expect(screen.getByTestId("saved-forms")).toHaveTextContent(
    "formal-phoneme-en-US"
  );
});

it("词形拼写来源只补缺失的已选音频，不生成未启用的音标来源", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  variant.common.pronunciations[0]!.synthesis!.use_spelling = true;
  variant.common.spelling_speech = {
    content: { version: 2, text: "hello", annotations: [] },
    voice_profile: {
      voices: [{ ...voices[0]!, audio_asset_id: "existing-uk" }, voices[1]!]
    }
  };
  render(<Host initial={forms} />);
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(3));
  expect(speech.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        kind: "text",
        content: { version: 2, text: "hello", annotations: [] }
      },
      setting: expect.objectContaining({ locale: "en-US" })
    })
  );
});

it.each([false, true])(
  "显式来源下未启用的拼写口音不生成，活动美式=%s",
  async (activeUs) => {
    const forms = fixture();
    const variants = forms.contents[0]!.regional_variants;
    if (variants.mode !== "common") throw new Error("expected common fixture");
    const variant = variants.common;
    variant.spelling_speech = {
      content: { version: 2, text: "hello", annotations: [] },
      voice_profile: {
        voices: voices.map(({ locale: _locale, ...voice }) => voice)
      }
    };
    const row = variant.pronunciations[0]!;
    row.synthesis!.uk!.source = "none";
    row.synthesis!.us!.source = activeUs ? "spelling" : "none";
    row.voice_profile = {
      voices: voices.map(({ locale: _locale, ...voice }) => voice)
    };
    render(<Host initial={forms} />);
    await act(async () => {
      for (const wait of [...tasks.values()]) expect(await wait()).toBe(true);
    });
    expect(speech.generate).toHaveBeenCalledTimes(activeUs ? 1 : 0);
    expect(speech.catalog).not.toHaveBeenCalled();
    if (activeUs)
      expect(speech.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          source: expect.objectContaining({ kind: "text" }),
          setting: expect.objectContaining({ locale: "en-US" })
        })
      );
    const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
      .contents[0].regional_variants.common;
    expect(
      saved.spelling_speech.voice_profile.voices[0].audio_asset_id
    ).toBeUndefined();
    expect(saved.pronunciations[0].synthesis.uk.source).toBe("none");
  }
);

it("显式拼写来源的历史音色解析失败时不兜底生成未知口音", async () => {
  const forms = fixture();
  const variants = forms.contents[0]!.regional_variants;
  if (variants.mode !== "common") throw new Error("expected common fixture");
  variants.common.spelling_speech = {
    content: { version: 2, text: "hello", annotations: [] },
    voice_profile: {
      voices: voices.map(({ locale: _locale, ...voice }) => voice)
    }
  };
  const row = variants.common.pronunciations[0]!;
  row.synthesis!.uk!.source = "none";
  row.synthesis!.us!.source = "spelling";
  speech.resolve.mockRejectedValue(new Error("解析暂不可用"));
  render(<Host initial={forms} />);
  expect(await screen.findAllByText("解析暂不可用")).not.toHaveLength(0);
  for (const wait of tasks.values()) expect(await wait()).toBe(false);
  expect(speech.generate).not.toHaveBeenCalled();
  expect(
    JSON.parse(screen.getByTestId("saved-forms").textContent!).contents[0]
      .regional_variants.common.spelling_speech
  ).toEqual(variants.common.spelling_speech);
});

it("无显式来源的旧拼写单侧池不要求缺少音色的另一侧解析成功", async () => {
  const forms = fixture();
  const variants = forms.contents[0]!.regional_variants;
  if (variants.mode !== "common") throw new Error("expected common fixture");
  const profile = { voices: [{ ...voices[0]!, audio_asset_id: "legacy-uk" }] };
  variants.common.spelling_speech = {
    content: { version: 2, text: "hello", annotations: [] },
    voice_profile: profile
  };
  const row = variants.common.pronunciations[0]!;
  delete row.voice_profile;
  row.synthesis!.use_spelling = true;
  speech.resolve.mockImplementation(async ({ accent }) => {
    if (accent === "us") throw new Error("此口音未配置音色");
    return { voices: profile.voices };
  });
  render(<Host initial={forms} />);
  await act(async () => {
    for (const wait of [...tasks.values()]) expect(await wait()).toBe(true);
  });
  expect(speech.generate).not.toHaveBeenCalled();
  expect(screen.queryByText("此口音未配置音色")).toBeNull();
  const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
    .contents[0].regional_variants.common.spelling_speech;
  expect(saved.voice_profile).toEqual(profile);
});

it("旧行级配音和当前音标来源分别生成，未选拼写保持原配置且不生成", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  variant.common.spelling_speech = {
    content: { version: 2, text: "hello", annotations: [] },
    voice_profile: { voices }
  };
  render(<Host initial={forms} />);
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(4));
  await waitFor(() => {
    const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
      .contents[0].regional_variants.common;
    const row = saved.pronunciations[0];
    const owners = [
      { voice_profile: row.voice_profile },
      row.synthesis.uk.ipa_speech,
      row.synthesis.us.ipa_speech
    ];
    for (const owner of owners) {
      for (const setting of owner.voice_profile.voices as VoiceSettingV3[])
        if (setting.enabled) expect(setting.audio_asset_id).toBeTruthy();
    }
    expect(saved.spelling_speech).toEqual(variant.common.spelling_speech);
    expect(row.voice_profile.voices[0].audio_asset_id).toBe("formal-row-en-GB");
    expect(
      row.synthesis.uk.ipa_speech.voice_profile.voices[0].audio_asset_id
    ).toBe("formal-phoneme-en-GB");
  });
});

it.each(["none", "upload"] as const)(
  "汇总页英式%s、美式UPS时只生成美式当前来源，保留英式缓存",
  async (source) => {
    const forms = fixture();
    const variants = forms.contents[0]!.regional_variants;
    if (variants.mode !== "common") throw new Error("expected common fixture");
    const row = variants.common.pronunciations[0]!;
    row.synthesis!.use_spelling = true;
    row.synthesis!.uk!.source = source;
    row.synthesis!.us = {
      ...row.synthesis!.us!,
      source: "ups",
      ups: "H EH L OW"
    };
    const british = structuredClone(row.voice_profile!.voices[0]!);
    render(<Host initial={forms} />);
    await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("saved-forms")).toHaveTextContent(
        "formal-phoneme-en-US"
      )
    );
    expect(
      speech.generate.mock.calls.every(
        (call) =>
          (call[0] as GenerateVoiceAudioRequest).setting.locale === "en-US"
      )
    ).toBe(true);
    expect(speech.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ kind: "phoneme", alphabet: "ups" })
      }),
      expect.any(AbortSignal)
    );
    const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
      .contents[0].regional_variants.common.pronunciations[0];
    expect(saved.voice_profile.voices[0]).toEqual(british);
    expect(saved.synthesis.uk).toEqual(row.synthesis!.uk);
    expect(saved.synthesis.us.source).toBe("ups");
  }
);
