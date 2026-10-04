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
  legacy = false
}: {
  dialect: Dialect;
  legacy?: boolean;
}) {
  const [pronunciation, setPronunciation] = useState<WordPronunciationV3>({
    id: "p",
    dict_phonetic: "fɑː",
    actual_pron: "fɑː",
    style: "normal",
    synthesis: legacy
      ? {
          alphabet: "ipa",
          use_spelling: false,
          ipa: "fɑː",
          ipa_locale: "en-GB",
          ups: ""
        }
      : {
          alphabet: "ipa",
          use_spelling: true,
          ipa: "",
          ups: "",
          uk: { ipa: "fɑː", ups: "F AA" },
          us: { ipa: "fɑɹ", ups: "F AA R" }
        }
  });
  return (
    <ConfigProvider theme={{ token: { motion: false } }}>
      <App>
        <PronunciationPreviewProvider>
          <V3SynthesisInputs
            pronunciation={pronunciation}
            synthesisEditable
            spelling="far"
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
