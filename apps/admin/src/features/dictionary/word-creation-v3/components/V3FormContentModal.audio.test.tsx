import { App } from "@tsz/ui/admin/overlays";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  GenerateVoiceAudioRequest,
  RichTextV2,
  VoiceSettingV3,
  SharedFormsStepContentV3,
  WordPronunciationV3
} from "@tsz/types";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { V3FormContentModal } from "./V3FormContentModal";
import { VoiceSaveContext } from "../voiceSaveContext";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture
} from "../fixtures";
import { applyFormsStructure, expandFormContents } from "../sharedFormsModel";
import { createStableVariantIdFactory } from "../operations";

const speech = vi.hoisted(() => ({
  catalog: vi.fn(),
  generate: vi.fn(),
  resolve: vi.fn()
}));
vi.mock("@/lib/auth", () => ({
  usePermission: () => true,
  api: { speech: { generateAudio: speech.generate, resolve: speech.resolve } }
}));
vi.mock("@/lib/env", () => ({
  env: {
    VOICE_EDITOR: true,
    VOICE_PREVIEW: true,
    AZURE_PRONUNCIATION_INPUTS: true,
    VOICE_AUDIO_UPLOAD: false
  }
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "uk" })
}));
vi.mock("../../voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {
    listVoices: speech.catalog,
    resolveVoices: speech.resolve,
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
  loadAdminVoiceRecommendations: async () => [],
  voicePreviewIsMock: false
}));
beforeEach(() => {
  speech.catalog.mockReset().mockResolvedValue([]);
  speech.generate
    .mockReset()
    .mockImplementation(async (input: GenerateVoiceAudioRequest) => ({
      asset: {
        id: `formal-${input.source.kind === "phoneme" ? input.source.phoneme_locale : input.setting.locale}`
      }
    }));
  speech.resolve
    .mockReset()
    .mockImplementation(async ({ accent }: { accent: string }) => ({
      voices: [
        {
          voice_id: accent === "gb" ? "sonia" : "aria",
          locale: accent === "gb" ? "en-GB" : "en-US",
          enabled: true,
          rate_percent: 0
        }
      ]
    }));
});
function setup(
  source: "ipa" | "ups" | "spelling" | undefined,
  emptySides: readonly ("uk" | "us")[] = [],
  distinguish = false,
  options: {
    loadCatalogOnMount?: boolean;
    save?: () => Promise<boolean>;
    saveAudio?: () => Promise<boolean>;
    onRequestAudioGeneration?: () => void;
    pronunciation?: Partial<WordPronunciationV3>;
  } = {}
) {
  const pronunciation = pronunciationFixture({
    synthesis: {
      alphabet: source === "ups" ? "ups" : "ipa",
      ipa: "",
      ups: "",
      use_spelling: false,
      uk: {
        ...(source ? { source } : {}),
        ipa: emptySides.includes("uk") ? "" : "sentə",
        ups: emptySides.includes("uk") ? "" : "S EH N T AX"
      },
      us: {
        ...(source ? { source } : {}),
        ipa: emptySides.includes("us") ? "" : "sentɚ",
        ups: emptySides.includes("us") ? "" : "S EH N T ER"
      }
    },
    ...options.pronunciation
  });
  const form = distinguish
    ? ukUsFormFixture({
        uk: { pronunciations: [pronunciation] },
        us: {
          pronunciations: [
            {
              ...structuredClone(pronunciation),
              id: "00000000-0000-4000-8000-000000000999"
            }
          ]
        }
      })
    : commonFormFixture({ pronunciations: [pronunciation] });
  const forms = applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture({ forms: [form] })
  ) as SharedFormsStepContentV3;
  const confirmed = vi.fn();
  const applied = vi.fn();
  const modal = (
    <V3FormContentModal
      forms={forms}
      formId={form.id}
      issues={[]}
      retiredContentSlots={[]}
      stableVariantIds={createStableVariantIdFactory(
        expandFormContents(forms),
        []
      )}
      loadCatalogOnMount={options.loadCatalogOnMount}
      onRequestAudioGeneration={options.onRequestAudioGeneration}
      onApply={options.save ? applied : undefined}
      onCancel={vi.fn()}
      onConfirm={confirmed}
    />
  );
  render(
    <App>
      <PronunciationPreviewProvider>
        {options.save ? (
          <VoiceSaveContext.Provider
            value={{
              save: options.save,
              saveAudio: options.saveAudio
            }}
          >
            {modal}
          </VoiceSaveContext.Provider>
        ) : (
          modal
        )}
      </PronunciationPreviewProvider>
    </App>
  );
  return { applied, confirmed, forms };
}

it("智能词库应用草稿先保存文本，再请求异步正式音频", async () => {
  const order: string[] = [];
  const save = vi.fn(async () => {
    order.push("text");
    return true;
  });
  const requestAudio = vi.fn(() => order.push("audio-requested"));
  const { applied, confirmed } = setup("ipa", [], false, {
    loadCatalogOnMount: false,
    save,
    saveAudio: vi.fn(async () => true),
    onRequestAudioGeneration: requestAudio
  });
  fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
  await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith(undefined, {
    allowContentSave: true,
    skipAudioTasks: true
  });
  expect(applied).toHaveBeenCalledOnce();
  expect(requestAudio).toHaveBeenCalledOnce();
  expect(order).toEqual(["text", "audio-requested"]);
  expect(speech.generate).not.toHaveBeenCalled();
});
it.each([
  ["ipa", false],
  ["ups", false],
  ["spelling", false],
  ["ipa", true]
] as const)(
  "应用草稿自动补齐两侧 %s 音频（分栏=%s），无需打开设置或点击播放",
  async (source, distinguish) => {
    const { confirmed } = setup(source, [], distinguish);
    await act(async () => {});
    expect(speech.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
    expect(speech.generate).toHaveBeenCalledTimes(2);
    const result = confirmed.mock.calls[0]![0] as SharedFormsStepContentV3;
    const regions = result.contents[0]!.regional_variants;
    if (regions.mode !== "common" && regions.mode !== "uk_us")
      throw new Error("fixture");
    for (const side of ["uk", "us"] as const) {
      const variant =
        regions.mode === "common" ? regions.common : regions[side];
      const profile =
        source === "spelling"
          ? variant.spelling_speech!.voice_profile
          : variant.pronunciations[0]!.synthesis![side]![`${source}_speech`]!
              .voice_profile;
      expect(
        profile.voices.find(
          (voice) => voice.locale === (side === "uk" ? "en-GB" : "en-US")
        )!.audio_asset_id
      ).toBe(`formal-${side === "uk" ? "en-GB" : "en-US"}`);
    }
  }
);

it.each([
  { emptySides: [] },
  { emptySides: ["uk"] },
  { emptySides: ["uk", "us"] }
] as const)(
  "默认 IPA 首次应用只生成已填口音，空侧 $emptySides 跳过且不生成拼写语音",
  async ({ emptySides }) => {
    const { confirmed } = setup(undefined, emptySides);
    await act(async () => {});
    expect(speech.generate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
    expect(speech.generate).toHaveBeenCalledTimes(2 - emptySides.length);
    for (const [input] of speech.generate.mock.calls) {
      expect(input.source).toMatchObject({ kind: "phoneme", alphabet: "ipa" });
    }
  }
);

it.each([
  { alphabet: "ipa", retry: false },
  { alphabet: "ups", retry: false },
  { alphabet: "ipa", retry: true }
] as const)(
  "弹窗按目录口音判断历史 $alphabet 候选并保留显式无配音（目录重试=$retry）",
  async ({ alphabet, retry }) => {
    const catalog = [{ id: "reassigned", locale: "en-US", accent: "gb" }];
    if (retry) speech.catalog.mockRejectedValue(new Error("目录暂不可用"));
    else speech.catalog.mockResolvedValue(catalog);
    speech.resolve.mockImplementation(async ({ source }) => {
      if (source) throw new Error("此口音无原生音色");
      return { voices: [] };
    });
    const { confirmed } = setup(undefined, [], false, {
      pronunciation: {
        voice_profile: {
          dubbing: {
            area: "word",
            uk: { mode: "local" },
            us: { mode: "local" }
          },
          voices: [
            {
              voice_id: "reassigned",
              locale: "en-US",
              enabled: true,
              rate_percent: 0
            }
          ]
        },
        synthesis: {
          alphabet,
          ipa: "",
          ups: "",
          uk: { source: "none", ipa: "", ups: "" },
          us: { ipa: "sentɚ", ups: "S EH N T ER" }
        }
      }
    });
    const apply = () =>
      fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    apply();
    if (retry) {
      const problem = await screen.findByText("此口音无原生音色");
      expect(confirmed).not.toHaveBeenCalled();
      speech.catalog.mockResolvedValue(catalog);
      fireEvent.click(screen.getByRole("button", { name: "重试生成音频" }));
      await waitFor(() => expect(problem).not.toBeInTheDocument());
      apply();
    }
    await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
    expect(speech.catalog).toHaveBeenCalled();
    expect(
      speech.resolve.mock.calls.filter(([input]) => input.source)
    ).toHaveLength(retry ? 1 : 0);
    expect(speech.generate).not.toHaveBeenCalled();
    const saved =
      confirmed.mock.calls[0]![0].contents[0].regional_variants.common;
    expect(saved.pronunciations[0].synthesis.uk.source).toBe("none");
    expect(
      saved.pronunciations[0].synthesis.us[`${alphabet}_speech`]
    ).toBeUndefined();
  }
);

it("生成失败保留弹窗和输入，再次应用自动重试并复用请求身份", async () => {
  speech.generate.mockRejectedValueOnce(new Error("Azure unavailable"));
  const { confirmed } = setup("ipa");
  fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
  await screen.findByText("Azure unavailable");
  expect(confirmed).not.toHaveBeenCalled();
  expect(screen.getByLabelText("第 1 条发音的英式 Azure IPA")).toHaveValue(
    "sentə"
  );
  const request = speech.generate.mock.calls[0]![0].request_id;
  fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
  await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
  expect(speech.generate.mock.calls[1]![0].request_id).toBe(request);
});

it.each(["ipa", "ups"] as const)(
  "%s 为空的口音跳过生成，保留空值并继续应用另一侧音频",
  async (source) => {
    const { confirmed } = setup(source, ["uk"]);
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
    expect(speech.generate).toHaveBeenCalledTimes(1);
    expect(speech.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        source: expect.objectContaining({ phoneme_locale: "en-US" })
      }),
      expect.anything()
    );
    const regions = confirmed.mock.calls[0]![0].contents[0].regional_variants;
    expect(regions.common.pronunciations[0].synthesis.uk[source]).toBe("");
    expect(
      regions.common.pronunciations[0].synthesis.uk[`${source}_speech`]
    ).toBeUndefined();
    expect(
      regions.common.pronunciations[0].synthesis.us[`${source}_speech`]
        .voice_profile.voices[0].audio_asset_id
    ).toBe("formal-en-US");
  }
);

it("两侧 IPA 都为空时原样应用，不生成语音或修改草稿", async () => {
  const { confirmed, forms } = setup("ipa", ["uk", "us"]);
  fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
  await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
  expect(confirmed).toHaveBeenCalledWith(forms);
  expect(speech.generate).not.toHaveBeenCalled();
});

it.each(["ipa", "ups"] as const)(
  "已生成 %s 清空后可应用，提交草稿不携带旧配音绑定或再次生成",
  async (source) => {
    const { confirmed } = setup(source);
    if (source === "ups")
      fireEvent.click(screen.getByLabelText("展开第 1 条发音的 UPS"));
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledOnce());
    const generated = speech.generate.mock.calls.length;
    for (const side of ["英式", "美式"]) {
      fireEvent.change(
        screen.getByLabelText(
          `第 1 条发音的${side} Azure ${source.toUpperCase()}`
        ),
        { target: { value: "" } }
      );
    }
    fireEvent.click(screen.getByRole("button", { name: "确认，应用到草稿" }));
    await waitFor(() => expect(confirmed).toHaveBeenCalledTimes(2));
    const regions = confirmed.mock.calls[1]![0].contents[0].regional_variants;
    for (const side of ["uk", "us"] as const) {
      expect(regions.common.pronunciations[0].synthesis[side][source]).toBe("");
      expect(
        regions.common.pronunciations[0].synthesis[side][`${source}_speech`]
      ).toBeUndefined();
    }
    expect(speech.generate).toHaveBeenCalledTimes(generated);
  }
);
