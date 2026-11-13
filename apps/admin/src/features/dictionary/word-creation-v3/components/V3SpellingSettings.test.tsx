import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { App } from "@tsz/ui/admin/overlays";
import type {
  DialectRulesV3,
  DraftFormsStepContentV3,
  WordConcreteFormV3,
  VoiceProfileV3
} from "@tsz/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import { regionalVariants } from "@tsz/shared";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  UUIDS
} from "../fixtures";
import { updatePronunciation, updateSpellingVoiceProfile } from "../operations";
import { VoiceSaveContext } from "../voiceSaveContext";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({
  env: {
    VOICE_EDITOR: true,
    AZURE_PRONUNCIATION_INPUTS: true,
    VOICE_PREVIEW: false
  }
}));
vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  usePermission: () => true
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "uk" })
}));
vi.mock("../../voice-editor/dataSource", () => ({
  loadAdminVoiceRecommendations: vi.fn().mockResolvedValue([]),
  adminVoicePreviewAdapter: {},
  adminAudioUploadAdapter: {},
  voicePreviewIsMock: false
}));
vi.mock("@tsz/voice-editor/editor", () => ({
  VoiceEditor: (props: VoiceEditorProps) => {
    const {
      value,
      voiceProfile,
      audioAssets,
      locale,
      contextLabel,
      onVoiceProfileChange,
      onChange,
      renderActions
    } = props;
    return (
      <div
        data-testid="settings-editor"
        data-locale={locale}
        data-text-readonly={String(props.textReadOnly)}
      >
        <output data-testid="settings-profile">
          {JSON.stringify(voiceProfile)}
        </output>
        <output data-testid="settings-content">{JSON.stringify(value)}</output>
        <button
          onClick={() =>
            onVoiceProfileChange?.({
              ...voiceProfile,
              voices: [
                ...(voiceProfile?.voices ?? []).filter(
                  (item) => item.locale !== locale
                ),
                {
                  voice_id: locale === "en-GB" ? "new-uk" : "new-us",
                  locale,
                  enabled: true,
                  rate_percent: -20
                }
              ]
            })
          }
        >
          更换当前音色
        </button>
        <button
          onClick={() =>
            onChange({
              version: 2,
              text: value.text,
              annotations: [{ type: "pause", at: 3, duration_ms: 250 }]
            })
          }
        >
          添加停顿
        </button>
        {renderActions?.(
          true,
          () => true,
          () => ({ value, voiceProfile, audioAssets: audioAssets ?? undefined })
        )}
        {props.afterText}
        <span>{contextLabel}</span>
      </div>
    );
  }
}));

const profile: VoiceProfileV3 = {
  voices: [
    {
      voice_id: "original-uk",
      locale: "en-GB",
      enabled: true,
      rate_percent: 0,
      audio_asset_id: "old-uk"
    },
    {
      voice_id: "original-us",
      locale: "en-US",
      enabled: true,
      rate_percent: 0,
      audio_asset_id: "old-us"
    }
  ]
};
function setupForm(
  mode: "common" | "unified" | "distinguish"
): WordConcreteFormV3 {
  const pronunciations = [
    pronunciationFixture({
      synthesis: {
        alphabet: "ipa",
        ipa: "",
        ups: "",
        uk: { source: "none", ipa: "", ups: "" },
        us: { source: "spelling", ipa: "", ups: "" }
      }
    }),
    pronunciationFixture({ id: UUIDS.pronunciation_2 })
  ];
  const form =
    mode === "common"
      ? commonFormFixture({ pronunciations })
      : ukUsFormFixture({
          us: { spelling: mode === "unified" ? "centre" : "center" }
        });
  for (const variant of regionalVariants(form.regional_variants))
    variant.spelling_speech = {
      content: { version: 2, text: variant.spelling, annotations: [] },
      voice_profile: structuredClone(profile)
    };
  return form;
}
function Host({
  form,
  mode = "common"
}: {
  form: WordConcreteFormV3;
  mode?: "common" | "unified" | "distinguish";
}) {
  const rules: DialectRulesV3 = {
    spelling_mode: mode === "distinguish" ? "distinguish" : "unified",
    phonetic_mode: mode === "common" ? "unified" : "distinguish"
  };
  const [content, setContent] = useState(() =>
    formsFixture({ forms: [form], dialect_rules: rules })
  );
  return (
    <App>
      <PronunciationPreviewProvider>
        <VoiceSaveContext.Provider value={{ save }}>
          <V3ConcreteFormRow
            content={content}
            form={content.pos[0]!.forms[0]!}
            dialectRules={rules}
            issues={[]}
            membershipCount={1}
            idFactory={() => crypto.randomUUID()}
            onChange={setContent}
            presentation="content"
          />
          <button
            onClick={() => {
              const owner = regionalVariants(
                content.pos[0]!.forms[0]!.regional_variants
              )[0]!;
              const next = updateSpellingVoiceProfile(content, [owner.id], {
                voices: profile.voices.map((voice) =>
                  voice.locale === "en-US"
                    ? {
                        ...voice,
                        rate_percent: 35,
                        audio_asset_id: "concurrent-us"
                      }
                    : voice
                )
              });
              setContent(
                updatePronunciation(next, owner.pronunciations.at(-1)!.id, {
                  actual_pron: "concurrent-reading"
                })
              );
            }}
          >
            模拟另一侧与读法更新
          </button>
          <output data-testid="draft">{JSON.stringify(content)}</output>
        </VoiceSaveContext.Provider>
      </PronunciationPreviewProvider>
    </App>
  );
}
function draft(): DraftFormsStepContentV3 {
  return JSON.parse(screen.getByTestId("draft").textContent!);
}
function owners() {
  return regionalVariants(draft().pos[0]!.forms[0]!.regional_variants);
}
beforeEach(() => save.mockReset().mockResolvedValue(true));

it("非活动拼写入口不切来源，取消不写回；多个读法打开同一所有者并保留并发更新", async () => {
  render(<Host form={setupForm("common")} />);
  const before = draft();
  const entries = screen.getAllByRole("button", {
    name: "英式词形拼写配音设置"
  });
  fireEvent.click(entries[0]!);
  const editor = await screen.findByTestId("settings-editor");
  expect(editor).toHaveAttribute("data-locale", "en-GB");
  expect(editor).toHaveAttribute("data-text-readonly", "true");
  expect(screen.getByText("此拼写的配音设置由 2 个读法共用。")).toBeVisible();
  fireEvent.click(screen.getByText("更换当前音色"));
  fireEvent.click(screen.getByRole("button", { name: /^取消.*编辑$/ }));
  expect(draft()).toEqual(before);
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(entries[1]!);
  await screen.findByTestId("settings-editor");
  fireEvent.click(screen.getByText("更换当前音色"));
  fireEvent.click(screen.getByText("模拟另一侧与读法更新"));
  expect(
    JSON.parse(screen.getByTestId("settings-profile").textContent!).voices
  ).toContainEqual(expect.objectContaining({ voice_id: "new-uk" }));
  fireEvent.click(screen.getByRole("button", { name: /^保存.*修改$/ }));
  await waitFor(() =>
    expect(screen.queryByTestId("settings-editor")).not.toBeInTheDocument()
  );
  expect(save).toHaveBeenCalledWith("word");
  const [owner] = owners();
  expect(owner!.spelling_speech!.voice_profile.voices).toEqual([
    expect.objectContaining({
      voice_id: "original-us",
      rate_percent: 35,
      audio_asset_id: "concurrent-us"
    }),
    expect.objectContaining({ voice_id: "new-uk", rate_percent: -20 })
  ]);
  expect(owner!.pronunciations[0]!.synthesis!.uk!.source).toBe("none");
  expect(owner!.pronunciations[1]!.actual_pron).toBe("concurrent-reading");
  expect(owner!.pronunciations.every((row) => !row.voice_profile)).toBe(true);
  fireEvent.click(
    screen.getAllByRole("button", { name: "英式词形拼写配音设置" })[0]!
  );
  await screen.findByTestId("settings-editor");
  expect(screen.getByTestId("settings-profile")).toHaveTextContent("new-uk");
});

it.each(["unified", "distinguish"] as const)(
  "%s 拼写按 ID 回写到正确所有者，不覆盖其他口音或音素配置",
  async (mode) => {
    const form = setupForm(mode);
    const regions = regionalVariants(form.regional_variants);
    regions[0]!.pronunciations[0]!.synthesis = {
      alphabet: "ipa",
      ipa: "kæt",
      ups: "",
      uk: {
        ipa: "kæt",
        ups: "",
        source: "ipa",
        ipa_speech: {
          content: { version: 2, text: "centre", annotations: [] },
          voice_profile: profile
        }
      }
    };
    render(<Host form={form} mode={mode} />);
    const before = owners();
    fireEvent.click(
      screen.getByRole("button", { name: "美式词形拼写配音设置" })
    );
    await screen.findByTestId("settings-editor");
    expect(screen.getByTestId("settings-content")).toHaveTextContent(
      mode === "distinguish" ? "center" : "centre"
    );
    fireEvent.click(screen.getByText("更换当前音色"));
    fireEvent.click(screen.getByRole("button", { name: /^保存.*修改$/ }));
    await waitFor(() =>
      expect(screen.queryByTestId("settings-editor")).not.toBeInTheDocument()
    );
    const after = owners();
    expect(after[1]!.spelling_speech!.voice_profile.voices).toContainEqual(
      expect.objectContaining({ voice_id: "new-us" })
    );
    expect(after[1]!.spelling_speech!.voice_profile.voices).toContainEqual(
      profile.voices[0]
    );
    expect(after[0]!.pronunciations).toEqual(before[0]!.pronunciations);
    if (mode === "distinguish") expect(after[0]).toEqual(before[0]);
    else expect(after[0]!.spelling_speech).toEqual(after[1]!.spelling_speech);
  }
);

it("保存失败保留设置输入，重试沿用宿主保存；共享停顿使另一侧旧音频失效", async () => {
  save.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  render(<Host form={setupForm("common")} />);
  fireEvent.click(
    screen.getAllByRole("button", { name: "英式词形拼写配音设置" })[0]!
  );
  await screen.findByTestId("settings-editor");
  fireEvent.click(screen.getByText("更换当前音色"));
  fireEvent.click(screen.getByText("添加停顿"));
  fireEvent.click(screen.getByRole("button", { name: /^保存.*修改$/ }));
  await screen.findByRole("alert");
  expect(screen.getByTestId("settings-profile")).toHaveTextContent("new-uk");
  expect(screen.getByTestId("settings-content")).toHaveTextContent("pause");
  fireEvent.click(screen.getByRole("button", { name: /^保存.*修改$/ }));
  await waitFor(() =>
    expect(screen.queryByTestId("settings-editor")).not.toBeInTheDocument()
  );
  expect(save).toHaveBeenCalledTimes(2);
  const speech = owners()[0]!.spelling_speech!;
  expect(speech.content.annotations).toEqual([
    expect.objectContaining({ type: "pause", duration_ms: 250 })
  ]);
  expect(
    speech.voice_profile.voices.find((voice) => voice.locale === "en-US")
  ).not.toHaveProperty("audio_asset_id");
});

it("同名的多个美式拼写按稳定 ID 定位，不覆盖相邻拼写", async () => {
  const form = setupForm("distinguish");
  if (form.regional_variants.mode !== "uk_us") throw Error();
  const { uk, us } = form.regional_variants;
  const second = structuredClone(us);
  second.id = UUIDS.common_variant_2;
  second.pronunciations[0]!.id = UUIDS.pronunciation;
  form.regional_variants = { mode: "uk_us_many", uk: [uk], us: [us, second] };
  render(<Host form={form} mode="distinguish" />);
  const before = owners();
  fireEvent.click(
    screen.getAllByRole("button", { name: "美式词形拼写配音设置" })[1]!
  );
  await screen.findByTestId("settings-editor");
  fireEvent.click(screen.getByText("更换当前音色"));
  fireEvent.click(screen.getByRole("button", { name: /^保存.*修改$/ }));
  await waitFor(() =>
    expect(screen.queryByTestId("settings-editor")).not.toBeInTheDocument()
  );
  const after = owners();
  expect(after.slice(0, 2)).toEqual(before.slice(0, 2));
  expect(after[2]!.id).toBe(second.id);
  expect(after[2]!.spelling_speech!.voice_profile.voices).toContainEqual(
    expect.objectContaining({ voice_id: "new-us" })
  );
});
