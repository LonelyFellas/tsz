import { App, ConfigProvider } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { V3SynthesisInputs } from "./V3SynthesisInputs";

const speech = vi.hoisted(() => ({ synthesize: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { VOICE_PREVIEW: true } }));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "us" })
}));
vi.mock("../../voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {
    listVoices: async () => [
      { id: "en-gb-sonia", locale: "en-GB", gender: "female", label: "Sonia" },
      { id: "en-us-aria", locale: "en-US", gender: "female", label: "Aria" }
    ],
    synthesize: speech.synthesize
  },
  adminAudioUploadAdapter: {},
  voicePreviewIsMock: false
}));

beforeEach(() => {
  speech.synthesize.mockReset().mockResolvedValue({
    audioUrl: "/test-audio.mp3",
    expiresAt: new Date(Date.now() + 60000).toISOString(),
    cached: false
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});
function Harness({
  dialect,
  legacy = false,
  profiled = false,
  legacyPhrase = false
}: {
  dialect: Dialect;
  legacy?: boolean;
  profiled?: boolean;
  legacyPhrase?: boolean;
}) {
  const [pronunciation, setPronunciation] = useState<WordPronunciationV3>({
    id: "p",
    dict_phonetic: "fɑː",
    actual_pron: "fɑː",
    style: "normal",
    synthesis: legacyPhrase
      ? { alphabet: "ups", ipa: "", ups: "F AA R AX W EY", ups_locale: "en-US" }
      : legacy
        ? {
            alphabet: "ipa",
            use_spelling: false,
            ipa: "fɑː",
            ipa_locale: "en-GB",
            ups: ""
          }
        : {
            alphabet: "ipa",
            use_spelling: !profiled,
            ipa: "",
            ups: "",
            uk: { ipa: "fɑː", ups: "F AA" },
            us: { ipa: "fɑɹ", ups: "F AA R" }
          },
    ...(profiled
      ? {
          voice_profile: {
            voices: [
              { voice_id: "en-gb-sonia", enabled: true, rate_percent: -10 }
            ]
          }
        }
      : {})
  });
  return (
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <PronunciationPreviewProvider>
          <V3SynthesisInputs
            pronunciation={pronunciation}
            synthesisEditable
            spelling={legacyPhrase ? "far away" : "far"}
            dialect={dialect}
            index={0}
            issues={[]}
            onChange={(patch) =>
              setPronunciation((value) => ({ ...value, ...patch }))
            }
          />
        </PronunciationPreviewProvider>
      </App>
    </ConfigProvider>
  );
}

describe("双口音真实试听控件", () => {
  it.each(["common", "uk", "us"] as const)(
    "%s 词形的四个候选分别发送对应音素和口音，不受全局来源影响",
    async (dialect) => {
      render(<Harness dialect={dialect} />);
      for (const source of ["词形拼写", "Azure IPA", "Azure UPS"]) {
        fireEvent.click(screen.getByRole("radio", { name: source }));
        for (const [accent, alphabet, voiceId, phoneme] of [
          ["英式", "IPA", "en-gb-sonia", "fɑː"],
          ["美式", "IPA", "en-us-aria", "fɑɹ"],
          ["英式", "UPS", "en-gb-sonia", "F AA"],
          ["美式", "UPS", "en-us-aria", "F AA R"]
        ] as const) {
          const play = screen.getByLabelText(
            `第 1 条发音 ${accent} Azure ${alphabet} 最终读音 播放语音`
          );
          await waitFor(() => expect(play).toBeEnabled());
          fireEvent.click(play);
          await waitFor(() =>
            expect(speech.synthesize).toHaveBeenLastCalledWith(
              {
                language: "en",
                voiceId,
                ratePercent: 0,
                content: {
                  version: 2,
                  text: "far",
                  annotations: [
                    {
                      type: "phoneme",
                      start: 0,
                      end: 3,
                      alphabet: alphabet.toLowerCase(),
                      phoneme
                    }
                  ]
                }
              },
              { signal: expect.any(AbortSignal) }
            )
          );
        }
      }
    }
  );
  it("明确英式词形也能补选美式音色，设置试听使用美式候选而不覆盖英式音色", async () => {
    render(<Harness dialect="uk" profiled />);
    const american = screen.getByLabelText(
      "第 1 条发音 美式 Azure IPA 最终读音 播放语音"
    );
    await waitFor(() => expect(american).toBeDisabled());
    fireEvent.click(screen.getByLabelText("第 1 条发音发音设置与真人录音"));
    expect(
      await screen.findByRole("checkbox", { name: "启用 Sonia" })
    ).toBeChecked();
    const aria = await screen.findByRole("checkbox", { name: "启用 Aria" });
    fireEvent.click(aria);
    fireEvent.click(screen.getByLabelText("试听 Aria"));
    await waitFor(() =>
      expect(speech.synthesize).toHaveBeenLastCalledWith(
        {
          language: "en",
          voiceId: "en-us-aria",
          ratePercent: 0,
          content: {
            version: 2,
            text: "far",
            annotations: [
              {
                type: "phoneme",
                start: 0,
                end: 3,
                alphabet: "ipa",
                phoneme: "fɑɹ"
              }
            ]
          }
        },
        { signal: expect.any(AbortSignal) }
      )
    );
    fireEvent.click(screen.getByLabelText("完成第 1 条发音设置"));
    await waitFor(() => expect(american).toBeEnabled());
    expect(
      screen.getByLabelText("第 1 条发音 英式 Azure IPA 最终读音 播放语音")
    ).toBeEnabled();
    expect(screen.getByRole("radio", { name: "Azure IPA" })).toBeChecked();
  });
  it("设置试听缺少对应口音时不借用另一侧音素", async () => {
    render(<Harness dialect="common" legacy />);
    fireEvent.click(screen.getByLabelText("第 1 条发音发音设置与真人录音"));
    fireEvent.click(await screen.findByLabelText("试听 Aria"));
    await waitFor(() =>
      expect(screen.getAllByText(/当前为美式/).length).toBeGreaterThan(0)
    );
    expect(speech.synthesize).not.toHaveBeenCalled();
  });
  it("缺省来源的旧 UPS 短语仍可按整段音素试听", async () => {
    render(<Harness dialect="common" legacyPhrase />);
    const play = screen.getByLabelText(
      "第 1 条发音 美式 Azure UPS 最终读音 播放语音"
    );
    await waitFor(() => expect(play).toBeEnabled());
    fireEvent.click(play);
    await waitFor(() =>
      expect(speech.synthesize).toHaveBeenLastCalledWith(
        {
          language: "en",
          voiceId: "en-us-aria",
          ratePercent: 0,
          content: {
            version: 2,
            text: "far away",
            annotations: [
              {
                type: "phoneme",
                start: 0,
                end: 8,
                alphabet: "ups",
                phoneme: "F AA R AX W EY"
              }
            ]
          }
        },
        { signal: expect.any(AbortSignal) }
      )
    );
  });
  it("已标记英式的历史输入只显示在英式，美式留空且不可借用试听", async () => {
    render(<Harness dialect="common" legacy />);
    expect(screen.getByLabelText("第 1 条发音的英式 Azure IPA")).toHaveValue(
      "fɑː"
    );
    expect(screen.getByLabelText("第 1 条发音的美式 Azure IPA")).toHaveValue(
      ""
    );
    await waitFor(() =>
      expect(
        screen.getByLabelText("第 1 条发音 英式 Azure IPA 最终读音 播放语音")
      ).toBeEnabled()
    );
    expect(
      screen.getByLabelText("第 1 条发音 美式 Azure IPA 最终读音 播放语音")
    ).toBeDisabled();
  });
});
