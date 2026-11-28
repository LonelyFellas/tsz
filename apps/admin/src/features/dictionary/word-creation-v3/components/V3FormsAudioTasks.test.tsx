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
  AudioAssetV3,
  GenerateVoiceAudioRequest,
  RichTextV2,
  SharedFormsStepContentV3,
  VoiceSettingV3
} from "@tsz/types";
import { V3FormsAudioTasks } from "./V3FormsAudioTasks";
import { FormsStep } from "@/features/lexicon-next/FormsStep";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "@tsz/ui/admin/overlays";
import { formsFixture } from "../fixtures";
import { applyFormsStructure } from "../sharedFormsModel";
import { isSharedForms, primaryRegionalVariant } from "@tsz/shared";
import { partOfSpeechCatalogFixture } from "../../word-creation/partOfSpeech.test.helper";
vi.mock("../../dataSource", () => ({
  partOfSpeechDataSource: { catalog: async () => partOfSpeechCatalogFixture }
}));
import { VoiceSaveContext } from "../voiceSaveContext";

const speech = vi.hoisted(() => ({
  generate: vi.fn(),
  resolve: vi.fn(),
  synthesize: vi.fn(),
  catalog: vi.fn()
}));
vi.mock("@/lib/auth", async (original) => {
  const actual = await original<typeof import("@/lib/auth")>();
  return {
    ...actual,
    usePermission: () => true,
    api: {
      ...actual.api,
      speech: {
        ...actual.api.speech,
        generateAudio: speech.generate,
        resolve: speech.resolve
      }
    }
  };
});
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
async function applyAudioTasks() {
  await waitFor(() => expect(tasks.size).toBeGreaterThan(0));
  await act(async () => {
    for (const wait of [...tasks.values()]) await wait();
  });
}
function Host({
  initial = fixture(),
  paused = false,
  onAudioTaskRetry,
  rowOnly = false
}: {
  initial?: SharedFormsStepContentV3;
  paused?: boolean;
  onAudioTaskRetry?: () => void;
  rowOnly?: boolean;
}) {
  const [forms, setForms] = useState(initial);
  return (
    <>
      <VoiceSaveContext.Provider
        value={{ save: async () => true, audioTasks: tasks }}
      >
        <V3FormsAudioTasks
          forms={forms}
          paused={paused}
          rowOnly={rowOnly}
          onChange={setForms}
          onAudioTaskRetry={onAudioTaskRetry}
        />
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
      label: setting.voice_id,
      locale: setting.locale,
      gender: "female",
      styles: []
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

it.each([
  { rowOnly: false, withStaleVoice: false },
  { rowOnly: true, withStaleVoice: false },
  { rowOnly: false, withStaleVoice: true },
  { rowOnly: true, withStaleVoice: true }
])(
  "独立英美词形只解析各自口音（弹窗任务=$rowOnly，异侧旧音色=$withStaleVoice）",
  async ({ rowOnly, withStaleVoice }) => {
    const forms = fixture();
    const content = forms.contents[0]!;
    const regions = content.regional_variants;
    if (regions.mode !== "common") throw new Error("expected common fixture");
    const variant = (side: "uk" | "us", spelling: string) => ({
      ...regions.common,
      id: side,
      spelling,
      pronunciations: [
        {
          ...regions.common.pronunciations[0]!,
          id: `pronunciation-${side}`,
          dict_phonetic: spelling,
          synthesis: {
            ...regions.common.pronunciations[0]!.synthesis!,
            uk: { ipa: "", ups: "" },
            us: { ipa: "", ups: "" }
          },
          voice_profile: {
            dubbing: {
              area: "word" as const,
              uk: { mode: "local" as const },
              us: { mode: "local" as const }
            },
            voices: [
              {
                ...voices[side === "uk" ? 0 : 1]!,
                ...(withStaleVoice
                  ? {
                      accent: side === "uk" ? ("gb" as const) : ("us" as const)
                    }
                  : {})
              },
              ...(withStaleVoice
                ? [
                    {
                      voice_id: `stale-${side}`,
                      accent: side === "uk" ? ("us" as const) : ("gb" as const),
                      enabled: true,
                      rate_percent: 0
                    }
                  ]
                : [])
            ]
          }
        }
      ]
    });
    content.dialect_rules.spelling_mode = "distinguish";
    content.regional_variants = {
      mode: "uk_us",
      uk: variant("uk", "colour"),
      us: variant("us", "color")
    };
    speech.catalog.mockRejectedValue(new Error("目录暂不可用"));
    speech.resolve.mockImplementation(async ({ profile, accent }) => {
      const selected = profile.voices.filter(
        (setting: VoiceSettingV3) =>
          setting.enabled &&
          setting.locale === (accent === "gb" ? "en-GB" : "en-US")
      );
      if (!selected.length) throw new Error("此口音未配置音色");
      return { voices: selected };
    });
    render(<Host initial={forms} rowOnly={rowOnly} />);
    await applyAudioTasks();

    expect(speech.catalog).toHaveBeenCalledTimes(withStaleVoice ? 0 : 1);
    expect(
      speech.resolve.mock.calls.map(([{ content, accent }]) => [
        content.text,
        accent
      ])
    ).toEqual([
      ["colour", "gb"],
      ["color", "us"]
    ]);
    expect(speech.generate).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("saved-forms")).toHaveTextContent(
      "formal-row-en-GB"
    );
    expect(screen.getByTestId("saved-forms")).toHaveTextContent(
      "formal-row-en-US"
    );
    expect(screen.queryByText("此口音未配置音色")).toBeNull();
  }
);

it.each([
  { name: "单侧启用并复用资产", enabled: [true, false], accents: ["gb"] },
  { name: "双侧启用且都可用", enabled: [true, true], accents: ["gb", "us"] },
  {
    name: "必需美式不可用",
    enabled: [true, true],
    accents: ["gb", "us"],
    unavailable: true
  },
  { name: "显式局部池未启用配音", enabled: [false, false], accents: [] }
])("共享词形逐侧解析 · $name", async ({ enabled, accents, unavailable }) => {
  const forms = fixture();
  const regions = forms.contents[0]!.regional_variants;
  if (regions.mode !== "common") throw new Error("expected common fixture");
  const row = regions.common.pronunciations[0]!;
  const profile = {
    dubbing: {
      area: "word" as const,
      uk: { mode: "local" as const },
      us: { mode: "local" as const }
    },
    voices: [
      { ...voices[0]!, enabled: enabled[0]!, audio_asset_id: "stored-uk" },
      { ...voices[1]!, enabled: enabled[1]! }
    ]
  };
  row.voice_profile = profile;
  speech.resolve.mockImplementation(async ({ accent }) => {
    const selected = profile.voices.filter(
      (voice) =>
        voice.enabled && voice.locale === (accent === "gb" ? "en-GB" : "en-US")
    );
    if (!selected.length || (accent === "us" && unavailable))
      throw new Error("当前口音不可用");
    return { voices: selected };
  });
  render(<Host initial={forms} rowOnly />);
  await act(async () => {
    expect(await [...tasks.values()][0]!()).toBe(!unavailable);
  });
  expect(speech.resolve.mock.calls.map(([{ accent }]) => accent)).toEqual(
    accents
  );
  const requiresNewAsset = enabled[1] && !unavailable;
  expect(speech.generate).toHaveBeenCalledTimes(requiresNewAsset ? 1 : 0);
  if (requiresNewAsset)
    expect(speech.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        setting: expect.objectContaining({ locale: "en-US" })
      })
    );
  const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
    .contents[0].regional_variants.common.pronunciations[0].voice_profile;
  expect(saved).toEqual(
    requiresNewAsset
      ? {
          ...profile,
          voices: [
            profile.voices[0],
            { ...profile.voices[1], audio_asset_id: "formal-row-en-US" }
          ]
        }
      : profile
  );
  if (unavailable) expect(screen.getByText("当前口音不可用")).toBeVisible();
  else expect(screen.queryByText("当前口音不可用")).toBeNull();
});

function legacyRecording(
  locale: "en-GB" | "en-US",
  isDefault = true
): AudioAssetV3 {
  return {
    id: `recording-${locale}`,
    locale,
    gender: "female",
    content_type: "audio/mpeg",
    size_bytes: 10,
    original_name: "recording.mp3",
    created_at: "2026-11-28T00:00:00Z",
    is_default: isDefault
  };
}

it.each([
  { rowOnly: false, isDefault: true },
  { rowOnly: true, isDefault: true },
  { rowOnly: false, isDefault: false }
])(
  "共享旧词形按录音默认状态限定配音口音（弹窗任务=$rowOnly，默认录音=$isDefault）",
  async ({ rowOnly, isDefault }) => {
    const forms = fixture();
    const regions = forms.contents[0]!.regional_variants;
    if (regions.mode !== "common") throw new Error("expected common fixture");
    const row = regions.common.pronunciations[0]!;
    delete row.synthesis;
    const recording = legacyRecording("en-US", isDefault);
    row.audio_assets = [recording];
    const cachedUs = {
      ...voices[1]!,
      voice_id: "synthetic-delisted-voice",
      accent: "us" as const,
      audio_asset_id: "cached-us-tts"
    };
    row.voice_profile = {
      dubbing: { area: "word", uk: { mode: "inherit" }, us: { mode: "local" } },
      voices: [cachedUs]
    };
    const british = {
      ...voices[0]!,
      voice_id: "en-gb-sonianeural",
      accent: "gb" as const
    };
    speech.resolve.mockImplementation(async ({ accent }) => {
      if (accent === "us") throw new Error("当前口音没有合格音色");
      return { voices: [british] };
    });

    render(<Host initial={forms} rowOnly={rowOnly} />);
    const results: boolean[] = [];
    await act(async () => {
      for (const wait of [...tasks.values()]) results.push(await wait());
    });

    expect
      .soft(speech.resolve.mock.calls.map(([{ accent }]) => accent))
      .toEqual(isDefault ? ["gb"] : ["gb", "us"]);
    expect.soft(results).toEqual([isDefault]);
    if (isDefault) {
      expect
        .soft(speech.generate)
        .toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ setting: british })
        );
      expect(
        screen.queryByText("当前口音没有合格音色")
      ).not.toBeInTheDocument();
    } else {
      expect(speech.generate).not.toHaveBeenCalled();
      expect(screen.getByText("当前口音没有合格音色")).toBeVisible();
    }
    const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
      .contents[0].regional_variants.common.pronunciations[0];
    expect(saved.audio_assets).toEqual([recording]);
    expect(saved.voice_profile.dubbing.us).toEqual({ mode: "local" });
    expect(saved.voice_profile.voices).toContainEqual(cachedUs);
  }
);

it("双侧默认录音保留录音并在修改音标后移除过期的合成资产引用", async () => {
  const initial = fixture();
  const row = primaryRegionalVariant(
    initial.contents[0]!.regional_variants,
    "uk"
  ).pronunciations[0]!;
  delete row.synthesis;
  const cachedUs = {
    ...voices[1]!,
    accent: "us" as const,
    audio_asset_id: "old-us-tts"
  };
  const recordings = [legacyRecording("en-GB"), legacyRecording("en-US")];
  row.audio_assets = recordings;
  row.voice_profile = {
    dubbing: { area: "word", uk: { mode: "inherit" }, us: { mode: "local" } },
    voices: [cachedUs]
  };
  function Draft() {
    const [forms, setForms] = useState(initial);
    const updatePhonetic = () => {
      const next = structuredClone(forms);
      const variant = primaryRegionalVariant(
        next.contents[0]!.regional_variants,
        "uk"
      );
      variant.pronunciations[0]!.dict_phonetic = "hɛˈləʊ";
      setForms(next);
    };
    return (
      <VoiceSaveContext.Provider
        value={{ save: async () => true, audioTasks: tasks }}
      >
        <V3FormsAudioTasks
          forms={forms}
          paused={false}
          rowOnly
          onChange={setForms}
        />
        <button onClick={updatePhonetic}>修改字典音标</button>
        <output data-testid="saved-forms">{JSON.stringify(forms)}</output>
      </VoiceSaveContext.Provider>
    );
  }
  render(<Draft />);
  fireEvent.click(screen.getByRole("button", { name: "修改字典音标" }));
  await applyAudioTasks();
  const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
    .contents[0].regional_variants.common.pronunciations[0];
  expect(saved.audio_assets).toEqual(recordings);
  expect(saved.voice_profile.voices[0]).toMatchObject({
    voice_id: cachedUs.voice_id,
    enabled: true
  });
  expect(saved.voice_profile.voices[0]).not.toHaveProperty("audio_asset_id");
  expect(speech.resolve).not.toHaveBeenCalled();
  expect(speech.generate).not.toHaveBeenCalled();
});

it("共享旧词形已有英美默认录音时仍生成已选的补充地区音色", async () => {
  const forms = fixture();
  const row = primaryRegionalVariant(forms.contents[0]!.regional_variants, "uk")
    .pronunciations[0]!;
  delete row.synthesis;
  const other: VoiceSettingV3 = {
    ...voices[0]!,
    voice_id: "en-in-neerjaneural",
    locale: "en-IN",
    accent: "none"
  };
  row.voice_profile = { voices: [other] };
  row.audio_assets = [legacyRecording("en-GB"), legacyRecording("en-US")];
  render(<Host initial={forms} rowOnly />);
  await applyAudioTasks();
  expect(speech.resolve).not.toHaveBeenCalled();
  expect(speech.generate).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ setting: other })
  );
  const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
    .contents[0].regional_variants.common.pronunciations[0];
  expect(saved.voice_profile.voices[0].audio_asset_id).toBe("formal-row-en-IN");
  expect(saved.audio_assets).toEqual(row.audio_assets);
});

it.each([
  { dialect: "common", catalogUnavailable: false },
  { dialect: "uk", catalogUnavailable: false },
  { dialect: "uk", catalogUnavailable: true }
] as const)(
  "缺少已存口音时解析人工归类的 $dialect 词形（目录故障=$catalogUnavailable）",
  async ({ dialect, catalogUnavailable }) => {
    const forms = fixture();
    const content = forms.contents[0]!;
    const regions = content.regional_variants;
    if (regions.mode !== "common") throw new Error("expected common fixture");
    const row = regions.common.pronunciations[0]!;
    const reassigned = { ...voices[1]!, voice_id: "reassigned" };
    row.voice_profile = {
      dubbing: { area: "word", uk: { mode: "local" }, us: { mode: "local" } },
      voices: [reassigned]
    };
    if (dialect === "uk") {
      content.dialect_rules.spelling_mode = "distinguish";
      content.regional_variants = {
        mode: "uk_us",
        uk: regions.common,
        us: { ...regions.common, id: "empty-us", pronunciations: [] }
      };
    }
    if (catalogUnavailable)
      speech.catalog.mockRejectedValue(new Error("目录暂不可用"));
    else
      speech.catalog.mockResolvedValue([
        { id: reassigned.voice_id, locale: "en-US", accent: "gb" }
      ]);
    speech.resolve.mockImplementation(async ({ profile, accent }) => {
      if (
        accent !== "gb" ||
        profile.voices[0].locale !== "en-US" ||
        (!catalogUnavailable && profile.voices[0].accent !== "gb")
      )
        throw new Error("口音未配置");
      return { voices: [{ ...reassigned, accent: "gb" }] };
    });
    render(<Host initial={forms} rowOnly />);
    await applyAudioTasks();
    expect(speech.resolve.mock.calls.map(([{ accent }]) => accent)).toEqual([
      "gb"
    ]);
    expect(speech.generate).toHaveBeenCalledOnce();
    expect(speech.generate).toHaveBeenCalledWith(
      expect.objectContaining({ setting: { ...reassigned, accent: "gb" } })
    );
  }
);

it("共享词形按旧地区解析失败后，重试读取恢复的目录并生成有效口音", async () => {
  const forms = fixture();
  const regions = forms.contents[0]!.regional_variants;
  if (regions.mode !== "common") throw new Error("expected common fixture");
  const reassigned = { ...voices[1]!, voice_id: "reassigned" };
  regions.common.pronunciations[0]!.voice_profile = {
    dubbing: { area: "word", uk: { mode: "local" }, us: { mode: "local" } },
    voices: [reassigned]
  };
  speech.catalog.mockRejectedValueOnce(new Error("目录暂不可用"));
  speech.catalog.mockResolvedValue([
    { id: reassigned.voice_id, locale: "en-US", accent: "gb" }
  ]);
  speech.resolve.mockImplementation(async ({ accent }) => {
    if (accent !== "gb") throw new Error("旧口音不可用");
    return { voices: [{ ...reassigned, accent: "gb" }] };
  });
  render(<Host initial={forms} rowOnly />);
  await applyAudioTasks();
  expect(screen.getByText("旧口音不可用")).toBeVisible();
  expect(speech.generate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重试生成音频" }));
  await waitFor(() => expect(speech.generate).toHaveBeenCalledOnce());
  expect(speech.resolve.mock.calls.map(([{ accent }]) => accent)).toEqual([
    "us",
    "gb"
  ]);
  expect(speech.catalog).toHaveBeenCalledTimes(2);
});

it.each(["missing", "none", "stored-none"] as const)(
  "历史音色的目录归类为 %s 时保留已解析的英式音频",
  async (catalogAccent) => {
    const forms = fixture();
    const regions = forms.contents[0]!.regional_variants;
    if (regions.mode !== "common") throw new Error("expected common fixture");
    const { locale: _locale, ...unknown } = voices[1]!;
    const disabledAccent =
      catalogAccent === "stored-none"
        ? { ...unknown, accent: "none" as const }
        : unknown;
    const british = { ...voices[0]!, accent: "gb" as const };
    const profile = {
      dubbing: {
        area: "word" as const,
        uk: { mode: "local" as const },
        us: { mode: "local" as const }
      },
      voices: [british, disabledAccent]
    };
    regions.common.pronunciations[0]!.voice_profile = profile;
    if (catalogAccent === "stored-none")
      speech.catalog.mockRejectedValue(new Error("目录暂不可用"));
    else
      speech.catalog.mockResolvedValue(
        catalogAccent === "none"
          ? [{ id: unknown.voice_id, locale: "en-US", accent: "none" }]
          : []
      );
    speech.resolve.mockImplementation(async ({ accent }) => {
      if (accent === "us") throw new Error("历史音色不可用");
      return { voices: [british] };
    });
    render(<Host initial={forms} rowOnly />);
    await applyAudioTasks();
    if (catalogAccent === "stored-none")
      expect(speech.catalog).not.toHaveBeenCalled();
    expect(speech.resolve.mock.calls.map(([{ accent }]) => accent)).toEqual(
      catalogAccent === "missing" ? ["gb", "us"] : ["gb"]
    );
    expect(speech.generate).toHaveBeenCalledOnce();
    expect(speech.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        setting: expect.objectContaining({ locale: "en-GB" })
      })
    );
    expect(screen.queryByText("历史音色不可用")).toBeNull();
    const saved = JSON.parse(screen.getByTestId("saved-forms").textContent!)
      .contents[0].regional_variants.common.pronunciations[0].voice_profile;
    expect(saved.voices[1]).toEqual(
      catalogAccent === "none"
        ? { ...unknown, locale: "en-US", accent: "none" }
        : disabledAccent
    );
  }
);

it.each([
  { alphabet: "ipa", explicitUs: false },
  { alphabet: "ups", explicitUs: false },
  { alphabet: "ups", explicitUs: true }
] as const)(
  "共享词形校验 $alphabet 的原生音色（显式选用美式=$explicitUs）",
  async ({ alphabet, explicitUs }) => {
    const forms = fixture();
    const regions = forms.contents[0]!.regional_variants;
    if (regions.mode !== "common") throw new Error("expected common fixture");
    const row = regions.common.pronunciations[0]!;
    row.synthesis!.alphabet = alphabet;
    row.synthesis!.uk!.ups = "HH AH L OW";
    row.synthesis!.us!.ups = "HH EH L OW";
    if (explicitUs) row.synthesis!.us!.source = alphabet;
    row.voice_profile = {
      dubbing: {
        area: "word",
        uk: { mode: "local" },
        us: { mode: "local" }
      },
      voices: [
        { ...voices[0]!, audio_asset_id: "stored-uk" },
        { ...voices[1]!, accent: "gb", audio_asset_id: "stored-assigned-uk" }
      ]
    };
    speech.resolve.mockImplementation(async ({ profile, accent, source }) => {
      const selected = profile.voices.filter(
        (voice: VoiceSettingV3) =>
          voice.enabled &&
          (voice.accent ?? (voice.locale === "en-GB" ? "gb" : "us")) ===
            accent &&
          (!source || source.phoneme_locale === voice.locale)
      );
      if (!selected.length) throw new Error("此口音无原生音色");
      return { voices: selected };
    });
    render(<Host initial={forms} />);
    const results: boolean[] = [];
    await act(async () => {
      for (const wait of [...tasks.values()]) results.push(await wait());
    });
    expect(results.includes(false)).toBe(explicitUs);
    expect(speech.resolve.mock.calls.map(([{ accent }]) => accent)).toEqual(
      explicitUs ? ["gb", "us"] : ["gb", "gb"]
    );
    if (explicitUs) expect(screen.getByText("此口音无原生音色")).toBeVisible();
    expect(speech.generate).toHaveBeenCalledOnce();
    expect(speech.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({
          kind: "phoneme",
          alphabet,
          phoneme_locale: "en-GB"
        }),
        setting: expect.objectContaining({ locale: "en-GB" })
      }),
      expect.any(AbortSignal)
    );
  }
);

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
    regions.common.spelling = "give up";
    const withPause = (duration_ms: number): RichTextV2 => ({
      version: 2,
      text: regions.common.spelling,
      annotations: [{ type: "pause", at: 4, duration_ms }]
    });
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
      content: withPause(250),
      content_by_accent: { uk: withPause(10), us: withPause(500) },
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
    for (const [locale, duration] of [
      ["en-GB", 10],
      ["en-US", 500]
    ] as const) {
      expect(speech.generate).toHaveBeenCalledWith(
        expect.objectContaining({
          source: { kind: "text", content: withPause(duration) },
          setting: expect.objectContaining({ locale })
        })
      );
    }
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

it("词典带入的已选音标等待保存，英美资产同时回写共享内容", async () => {
  render(<Host />);
  expect(speech.generate).not.toHaveBeenCalled();
  await applyAudioTasks();
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

it("内容弹窗打开时暂停汇总表任务，关闭后仍等待保存补齐配音", async () => {
  const view = render(<Host paused />);
  expect(speech.generate).not.toHaveBeenCalled();
  view.rerender(<Host paused={false} />);
  expect(speech.generate).not.toHaveBeenCalled();
  await applyAudioTasks();
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(4));
});

it.each([false, true])(
  "旧勾选缺少地区时快速保存也等待地区解析和正式音频（弹窗任务=%s）",
  async (rowOnly) => {
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
    render(<Host initial={forms} rowOnly={rowOnly} />);
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
    expect(speech.generate).toHaveBeenCalledTimes(rowOnly ? 2 : 4);
    expect(screen.getByTestId("saved-forms")).toHaveTextContent(
      "formal-row-en-US"
    );
  }
);

it("旧配置的目录加载失败保留草稿、阻止保存，重试后继续生成", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  variant.common.pronunciations[0]!.voice_profile = {
    voices: voices.map(({ locale: _locale, ...setting }) => setting)
  };
  speech.catalog.mockRejectedValue(new Error("目录暂不可用"));
  const retryNotified = vi.fn();
  render(<Host initial={forms} onAudioTaskRetry={retryNotified} />);
  expect(await screen.findAllByText("目录暂不可用")).not.toHaveLength(0);
  expect(await tasks.get("forms:audio-catalog")!()).toBe(false);
  expect(speech.generate).not.toHaveBeenCalled();
  speech.catalog.mockResolvedValue(
    voices.map((setting) => ({ id: setting.voice_id, locale: setting.locale }))
  );
  for (const retry of screen.getAllByRole("button", { name: "重试生成音频" }))
    fireEvent.click(retry);
  expect(retryNotified).toHaveBeenCalled();
  await applyAudioTasks();
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
  expect(speech.generate).not.toHaveBeenCalled();
  await applyAudioTasks();
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

it("缺少音标配置时按默认词形拼写来源生成音频", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  const row = variant.common.pronunciations[0]!;
  delete row.synthesis;
  delete row.voice_profile;
  variant.common.spelling_speech = {
    content: { version: 2, text: "hello", annotations: [] },
    voice_profile: { voices }
  };
  render(<Host initial={forms} />);

  expect(speech.generate).not.toHaveBeenCalled();
  await applyAudioTasks();
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(2));
  expect(speech.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        kind: "text",
        content: { version: 2, text: "hello", annotations: [] }
      }
    })
  );
});

it("缺少音标但已有行级音色时保留旧行级音频来源", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  delete variant.common.pronunciations[0]!.synthesis;
  render(<Host initial={forms} />);

  await applyAudioTasks();
  await waitFor(() => expect(speech.generate).toHaveBeenCalledTimes(2));
  expect(speech.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        kind: "text",
        content: { version: 2, text: "heˈləʊ", annotations: [] }
      }
    })
  );
  expect(
    JSON.parse(screen.getByTestId("saved-forms").textContent!).contents[0]
      .regional_variants.common.spelling_speech
  ).toBeUndefined();
});

it("旧行级空配音配置按词形继承推荐并完成正式音频", async () => {
  const forms = fixture();
  const variant = forms.contents[0]!.regional_variants;
  if (variant.mode !== "common") throw new Error("expected common fixture");
  variant.common.pronunciations[0]!.voice_profile = { voices: [] };
  speech.resolve.mockImplementation(async ({ accent }) => ({
    voices: [voices[accent === "gb" ? 0 : 1]!]
  }));
  render(<Host initial={forms} />);

  await applyAudioTasks();

  expect(speech.resolve).toHaveBeenCalledWith(
    expect.objectContaining({
      accent: "gb",
      profile: expect.objectContaining({
        dubbing: {
          area: "word",
          uk: { mode: "inherit" },
          us: { mode: "inherit" }
        }
      })
    })
  );
  expect(speech.generate).toHaveBeenCalledWith(
    expect.objectContaining({
      source: {
        kind: "text",
        content: { version: 2, text: "heˈləʊ", annotations: [] }
      }
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
  await applyAudioTasks();
  expect(await screen.findAllByText("解析暂不可用")).not.toHaveLength(0);
  for (const wait of tasks.values()) expect(await wait()).toBe(false);
  expect(speech.generate).not.toHaveBeenCalled();
  expect(
    JSON.parse(screen.getByTestId("saved-forms").textContent!).contents[0]
      .regional_variants.common.spelling_speech
  ).toEqual(variants.common.spelling_speech);
});

it("部分显式来源的拼写侧解析失败时保留配置并阻止保存", async () => {
  const forms = fixture();
  const variants = forms.contents[0]!.regional_variants;
  if (variants.mode !== "common") throw new Error("expected common fixture");
  const variant = variants.common;
  variant.spelling_speech = {
    content: { version: 2, text: "hello", annotations: [] },
    voice_profile: { voices: [{ ...voices[0]!, audio_asset_id: "stored-uk" }] }
  };
  const row = variant.pronunciations[0]!;
  delete row.voice_profile;
  row.synthesis!.use_spelling = true;
  row.synthesis!.uk = { source: "ipa", ipa: "", ups: "" };
  row.synthesis!.us = { ipa: "", ups: "" };
  speech.resolve.mockRejectedValue(new Error("美式拼写解析失败"));
  render(<Host initial={forms} />);
  await applyAudioTasks();
  expect(await screen.findByText("美式拼写解析失败")).toBeVisible();
  for (const wait of [...tasks.values()]) expect(await wait()).toBe(false);
  expect(speech.generate).not.toHaveBeenCalled();
  expect(JSON.parse(screen.getByTestId("saved-forms").textContent!)).toEqual(
    forms
  );
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
  expect(speech.resolve.mock.calls.map(([{ accent }]) => accent)).toEqual([
    "gb"
  ]);
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
  expect(speech.generate).not.toHaveBeenCalled();
  await applyAudioTasks();
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
    expect(speech.generate).not.toHaveBeenCalled();
    await applyAudioTasks();
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

it("智能词库 Step 2 不因词性变化注册自动音频任务并保留原内容", async () => {
  const assigned = applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture()
  );
  if (!isSharedForms(assigned)) throw new Error("shared fixture required");
  const target = primaryRegionalVariant(
    assigned.contents[0]!.regional_variants,
    "uk"
  ).pronunciations[0]!;
  target.voice_profile = { voices };
  target.synthesis = primaryRegionalVariant(
    fixture().contents[0]!.regional_variants,
    "uk"
  ).pronunciations[0]!.synthesis;
  const unassigned = { ...assigned, pos: [] };
  const original = structuredClone(unassigned);
  const changed = vi.fn();
  function Step({ forms }: { forms: SharedFormsStepContentV3 }) {
    return (
      <QueryClientProvider client={client}>
        <App>
          <VoiceSaveContext.Provider
            value={{ save: async () => true, audioTasks: tasks }}
          >
            <FormsStep
              value={forms}
              kind="word"
              locale="en-GB"
              issues={[]}
              onChange={changed}
              registerLeaveGuard={vi.fn()}
            />
          </VoiceSaveContext.Provider>
        </App>
      </QueryClientProvider>
    );
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  const view = render(<Step forms={unassigned} />);
  await screen.findByRole("button", { name: "添加词性" });
  expect(tasks.size).toBe(0);
  expect(speech.generate).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(unassigned).toEqual(original);
  view.rerender(<Step forms={assigned} />);
  await act(async () => {});
  expect(tasks.size).toBe(0);
  expect(speech.generate).not.toHaveBeenCalled();
  view.rerender(<Step forms={unassigned} />);
  expect(tasks.size).toBe(0);
  expect(unassigned).toEqual(original);
  view.unmount();
});
