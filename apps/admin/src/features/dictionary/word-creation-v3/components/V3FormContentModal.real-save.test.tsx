import { InterfaceI18nProvider } from "@tsz/shared/i18n/react";
import { App } from "@tsz/ui/admin/overlays";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import type { SharedFormsStepContentV3 } from "@tsz/types";
import { ContentEditPermissions } from "../../contentEditPermissions";
import { SpeechSettingsProvider } from "../speechSettingsContext";
import { V3ReferenceGuardProvider } from "../referenceGuardContext";
import { buildReferenceIndex } from "../referenceGuard";
import { VoiceSaveContext, type VoiceSaveOptions } from "../voiceSaveContext";
import { applyFormsStructure, expandFormContents } from "../sharedFormsModel";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture
} from "../fixtures";
import { createStableVariantIdFactory } from "../operations";
import { V3FormContentModal } from "./V3FormContentModal";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";

const speech = vi.hoisted(() => ({
  generateAudio: vi.fn(),
  resolve: vi.fn(),
  recommendations: vi.fn()
}));

vi.mock("@/lib/env", () => ({
  env: {
    VOICE_EDITOR: true,
    VOICE_PREVIEW: false,
    VOICE_AUDIO_UPLOAD: false,
    AZURE_PRONUNCIATION_INPUTS: true
  }
}));
vi.mock("@/lib/auth", () => ({
  usePermission: () => true,
  api: { speech: { generateAudio: speech.generateAudio } }
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "uk" })
}));
vi.mock("../../voice-editor/dataSource", () => ({
  loadAdminVoiceRecommendations: speech.recommendations,
  adminVoicePreviewAdapter: {
    listVoices: async () => [
      {
        id: "en-gb-sonia",
        locale: "en-GB",
        gender: "female",
        label: "Sonia",
        styles: [],
        supportsRate: true,
        supportsPitch: true,
        isDefault: true
      }
    ],
    synthesize: vi.fn(),
    resolveAudio: vi.fn(),
    resolveVoices: speech.resolve
  },
  adminAudioUploadAdapter: { upload: vi.fn() },
  voicePreviewIsMock: false
}));
vi.mock("@tsz/voice-editor/editor", () => ({
  VoiceEditor: ({
    value,
    contextLabel,
    onChange,
    onVoiceProfileChange,
    renderActions
  }: VoiceEditorProps) => (
    <div>
      <textarea
        aria-label={contextLabel}
        value={value.text}
        onChange={(event) =>
          onChange({ version: 2, text: event.target.value, annotations: [] })
        }
      />
      <button
        aria-label="设置最新配音资产"
        onClick={() =>
          onVoiceProfileChange?.({
            voices: [
              {
                voice_id: "en-gb-sonia",
                enabled: true,
                rate_percent: 0,
                audio_asset_id: "new-audio"
              }
            ]
          })
        }
      />
      {renderActions?.(true)}
    </div>
  )
}));

function initialForms(): SharedFormsStepContentV3 {
  return applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture({
      forms: [
        commonFormFixture({
          spelling: "fictions",
          pronunciations: [
            pronunciationFixture({
              dict_phonetic: "ˈfɪkʃnz",
              actual_pron: "ˈfɪkʃənz",
              synthesis: {
                alphabet: "ipa",
                ipa: "ˈfɪkʃnz",
                ups: "F IH K SH N Z",
                use_spelling: false,
                uk: { ipa: "ˈfɪkʃnz", ups: "F IH K SH N Z" },
                us: { ipa: "ˈfɪkʃnz", ups: "F IH K SH N Z" }
              }
            })
          ]
        })
      ]
    })
  ) as SharedFormsStepContentV3;
}

function Host({
  forms,
  saved,
  saveOptions
}: {
  forms: SharedFormsStepContentV3;
  saved: (next: SharedFormsStepContentV3, options?: VoiceSaveOptions) => void;
  saveOptions: (options?: VoiceSaveOptions) => void;
}) {
  const [current, setCurrent] = useState(forms);
  const currentRef = useRef(current);
  const formId = forms.pos[0]!.forms[0]!.id;
  const stableVariantIds = createStableVariantIdFactory(
    expandFormContents(forms),
    []
  );
  return (
    <App>
      <InterfaceI18nProvider>
        <ContentEditPermissions.Provider
          value={{ edit: true, associate: true }}
        >
          <PronunciationPreviewProvider>
            <V3ReferenceGuardProvider
              value={{
                index: buildReferenceIndex(undefined, "loaded"),
                openReference: () => undefined,
                refresh: () => undefined,
                registerNavigator: () => undefined
              }}
            >
              <SpeechSettingsProvider>
                <VoiceSaveContext.Provider
                  value={{
                    save: async (_area, options) => {
                      saveOptions(options);
                      saved(currentRef.current, options);
                      return true;
                    }
                  }}
                >
                  <V3FormContentModal
                    forms={current}
                    formId={formId}
                    issues={[]}
                    stableVariantIds={stableVariantIds}
                    retiredContentSlots={[]}
                    onCancel={() => undefined}
                    onConfirm={() => undefined}
                    onApply={(next) => {
                      currentRef.current = next;
                      setCurrent(next);
                    }}
                  />
                </VoiceSaveContext.Provider>
              </SpeechSettingsProvider>
            </V3ReferenceGuardProvider>
          </PronunciationPreviewProvider>
        </ContentEditPermissions.Provider>
      </InterfaceI18nProvider>
    </App>
  );
}

beforeEach(() => {
  speech.generateAudio.mockReset().mockResolvedValue({
    asset: { id: "new-audio" }
  });
  speech.resolve.mockReset().mockImplementation(async () => ({ voices: [] }));
  speech.recommendations.mockReset().mockResolvedValue([]);
});

it("真实词形抽屉保存实际发音使用最新 editor 快照", async () => {
  const forms = initialForms();
  let saved!: SharedFormsStepContentV3;
  render(
    <Host
      forms={forms}
      saved={(next) => {
        saved = next;
      }}
      saveOptions={() => undefined}
    />
  );
  fireEvent.click(screen.getByLabelText("打开第 1 条发音的实际发音编辑器"));
  const input = await screen.findByLabelText("第 1 条发音的实际发音");
  fireEvent.change(input, { target: { value: "ˈfɪkʃənz changed" } });
  fireEvent.click(screen.getByLabelText("保存第 1 条发音的实际发音修改"));
  await waitFor(() => expect(saved).toBeDefined());
  const content = saved.contents[0]!;
  expect(JSON.stringify(content)).toContain("ˈfɪkʃənz changed");
});

it("真实 Azure IPA 设置保存先回写音频资产再提交最新 editor", async () => {
  const forms = initialForms();
  let saved!: SharedFormsStepContentV3;
  let options: VoiceSaveOptions | undefined;
  render(
    <Host
      forms={forms}
      saved={(next) => {
        saved = next;
      }}
      saveOptions={(next) => {
        options = next;
      }}
    />
  );
  fireEvent.change(screen.getByLabelText("第 1 条发音的英式 Azure IPA"), {
    target: { value: "ˈfɪkʃnz changed" }
  });
  fireEvent.click(screen.getByRole("radio", { name: "英式 Azure IPA" }));
  fireEvent.click(
    screen.getByLabelText("打开第 1 条发音 英式 Azure IPA TTS 设置器")
  );
  const input = await screen.findByLabelText(
    "第 1 条发音 英式 Azure IPA音标编辑"
  );
  const save = screen.getByLabelText("保存第 1 条发音 英式 Azure IPA修改");
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.change(input, { target: { value: "ˈfɪkʃnz changed" } });
  fireEvent.click(screen.getByLabelText("设置最新配音资产"));
  fireEvent.click(save);
  await waitFor(() => expect(saved).toBeDefined());
  expect(options).toEqual({ allowContentSave: true, skipAudioTasks: true });
  expect(JSON.stringify(saved)).toContain('"audio_asset_id":"new-audio"');
  expect(JSON.stringify(saved)).toContain("ˈfɪkʃnz changed");
});
