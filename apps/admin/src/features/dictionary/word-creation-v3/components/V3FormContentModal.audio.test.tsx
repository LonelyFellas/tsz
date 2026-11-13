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
  SharedFormsStepContentV3
} from "@tsz/types";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { V3FormContentModal } from "./V3FormContentModal";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture
} from "../fixtures";
import { applyFormsStructure, expandFormContents } from "../sharedFormsModel";
import { createStableVariantIdFactory } from "../operations";

const speech = vi.hoisted(() => ({ generate: vi.fn(), resolve: vi.fn() }));
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
    listVoices: async () => [],
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
  source: "ipa" | "ups" | "spelling",
  emptySides: readonly ("uk" | "us")[] = [],
  distinguish = false
) {
  const pronunciation = pronunciationFixture({
    synthesis: {
      alphabet: source === "ups" ? "ups" : "ipa",
      ipa: "",
      ups: "",
      use_spelling: false,
      uk: {
        source,
        ipa: emptySides.includes("uk") ? "" : "sentə",
        ups: emptySides.includes("uk") ? "" : "S EH N T AX"
      },
      us: {
        source,
        ipa: emptySides.includes("us") ? "" : "sentɚ",
        ups: emptySides.includes("us") ? "" : "S EH N T ER"
      }
    }
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
  render(
    <App>
      <PronunciationPreviewProvider>
        <V3FormContentModal
          forms={forms}
          formId={form.id}
          issues={[]}
          retiredContentSlots={[]}
          stableVariantIds={createStableVariantIdFactory(
            expandFormContents(forms),
            []
          )}
          onCancel={vi.fn()}
          onConfirm={confirmed}
        />
      </PronunciationPreviewProvider>
    </App>
  );
  return { confirmed, forms };
}
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
