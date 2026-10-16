import { App, ConfigProvider } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dialect, WordPronunciationV3 } from "@tsz/types";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { V3SynthesisInputs } from "./V3SynthesisInputs";

const speech = vi.hoisted(() => ({ synthesize: vi.fn() }));
vi.mock("@/lib/auth", () => ({ usePermission: () => true }));
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
  legacyPhrase = false,
  settingsPhrase = false
}: {
  dialect: Dialect;
  legacy?: boolean;
  profiled?: boolean;
  legacyPhrase?: boolean;
  settingsPhrase?: boolean;
}) {
  const [pronunciation, setPronunciation] = useState<WordPronunciationV3>({
    id: "p",
    dict_phonetic: "fɑː",
    actual_pron: "fɑː",
    style: "normal",
    synthesis: settingsPhrase
      ? {
          alphabet: "ipa",
          use_spelling: false,
          ipa: "",
          ups: "",
          uk: {
            ipa: "fɑː ə.ˈweɪ",
            ups: "F AA lng AX . S1 W EY",
            ups_words: [
              { text: "far", phoneme: "F AA lng" },
              { text: "away", phoneme: "AX . S1 W EY" }
            ]
          },
          us: {
            ipa: "fɑɹ ə.ˈweɪ",
            ups: "F AA R AX . S1 W EY",
            ups_words: [
              { text: "far", phoneme: "F AA R" },
              { text: "away", phoneme: "AX . S1 W EY" }
            ]
          }
        }
      : legacyPhrase
        ? {
            alphabet: "ups",
            ipa: "",
            ups: "F AA R AX W EY",
            ups_locale: "en-US"
          }
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
            spelling={legacyPhrase || settingsPhrase ? "far away" : "far"}
            dialect={dialect}
            index={0}
            issues={[]}
            onChange={(patch) =>
              setPronunciation((value) => ({ ...value, ...patch }))
            }
          />
          <output data-testid="pronunciation-wire">
            {JSON.stringify(pronunciation)}
          </output>
        </PronunciationPreviewProvider>
      </App>
    </ConfigProvider>
  );
}

describe("双口音真实试听控件", () => {
  it.each([
    ["英式", "IPA"],
    ["美式", "IPA"],
    ["英式", "UPS"],
    ["美式", "UPS"]
  ])("%s %s 提示使用统一的简短文案", (accent, alphabet) => {
    render(<Harness dialect="common" />);
    expect(
      screen.getByLabelText(`第 1 条发音的${accent} Azure ${alphabet}`)
    ).toHaveAttribute("placeholder", `请输入${accent}${alphabet}`);
  });

  it.each(["common", "uk", "us"] as const)(
    "%s 词形只试听可见的对应口音候选，不受全局来源影响",
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
          if (
            (dialect === "uk" && accent === "美式") ||
            (dialect === "us" && accent === "英式")
          ) {
            expect(
              screen.queryByLabelText(
                `第 1 条发音 ${accent} Azure ${alphabet} 最终读音 播放语音`
              )
            ).toBeNull();
            continue;
          }
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
    expect(
      screen.queryByLabelText("第 1 条发音 美式 Azure IPA 最终读音 播放语音")
    ).toBeNull();
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
    expect(
      screen.queryByLabelText("第 1 条发音 美式 Azure IPA 最终读音 播放语音")
    ).toBeNull();
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

it.each([
  ["英式", "uk", "IPA", "fɑː", "dʒɒb"],
  ["美式", "us", "UPS", "F AA R", "JH AA B"]
] as const)(
  "%s %s 编辑器编辑当前音标，完成回写，取消不保存",
  async (accent, side, alphabet, initial, edited) => {
    render(<Harness dialect="common" />);
    const label = `第 1 条发音 ${accent} Azure ${alphabet}`;
    const open = async () => {
      fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
      return screen.findByLabelText(`${label}音标编辑`);
    };
    const input = await open();
    expect(input).toHaveValue(initial);
    expect(input).not.toHaveAttribute("readonly");
    fireEvent.change(input, { target: { value: edited } });
    const voice = side === "uk" ? "Sonia" : "Aria";
    fireEvent.click(await screen.findByLabelText(`启用 ${voice}`));
    fireEvent.click(screen.getByLabelText(`试听 ${voice}`));
    await waitFor(() =>
      expect(speech.synthesize).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: {
            version: 2,
            text: "far",
            annotations: [
              {
                type: "phoneme",
                start: 0,
                end: 3,
                alphabet: alphabet.toLowerCase(),
                phoneme: edited
              }
            ]
          }
        }),
        { signal: expect.any(AbortSignal) }
      )
    );
    fireEvent.click(screen.getByLabelText(`完成${label}设置`));
    await waitFor(() => expect(input).not.toBeInTheDocument());
    expect(
      screen.getByLabelText(`第 1 条发音的${accent} Azure ${alphabet}`)
    ).toHaveValue(edited);
    const saved = JSON.parse(
      screen.getByTestId("pronunciation-wire").textContent!
    );
    expect(saved.synthesis[side][alphabet.toLowerCase()]).toBe(edited);
    expect(
      saved.synthesis[side][`${alphabet.toLowerCase()}_speech`].content.text
    ).toBe("far");
    const reopened = await open();
    expect(reopened).toHaveValue(edited);
    fireEvent.change(reopened, { target: { value: initial } });
    fireEvent.click(screen.getByLabelText(`取消${label}设置`));
    await waitFor(() => expect(reopened).not.toBeInTheDocument());
    expect(
      JSON.parse(screen.getByTestId("pronunciation-wire").textContent!)
    ).toEqual(saved);
  }
);

it("短语 UPS 在一个词内增改音素后保留词界，停顿按正文位置保存并在重开时映射回音标", async () => {
  render(<Harness dialect="common" settingsPhrase />);
  const label = "第 1 条发音 英式 Azure UPS";
  fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
  const input = await screen.findByLabelText(`${label}音标编辑`);
  fireEvent.input(input, {
    target: { value: "F AA R lng AX . S1 W EY" },
    inputType: "insertFromPaste"
  });
  fireEvent.input(input, {
    target: { value: "JH Q B" },
    inputType: "insertFromPaste"
  });
  fireEvent.keyDown(input, { key: "z", ctrlKey: true });
  expect(input).toHaveValue("F AA R lng AX . S1 W EY");
  fireEvent.click(screen.getByLabelText("停顿"));
  fireEvent.click(screen.getByLabelText("停顿 0.5 秒"));
  const dialog = screen.getByRole("dialog");
  fireEvent.mouseDown(dialog.querySelectorAll(".tsz-ve-gap")[3]!);
  fireEvent.click(screen.getByLabelText("启用 Sonia"));
  fireEvent.click(screen.getByLabelText("试听 Sonia"));
  await waitFor(() =>
    expect(speech.synthesize).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: {
          version: 2,
          text: "far away",
          annotations: [
            {
              type: "phoneme",
              start: 0,
              end: 3,
              alphabet: "ups",
              phoneme: "F AA R lng"
            },
            {
              type: "phoneme",
              start: 4,
              end: 8,
              alphabet: "ups",
              phoneme: "AX . S1 W EY"
            },
            { type: "pause", at: 3, duration_ms: 500 }
          ]
        }
      }),
      { signal: expect.any(AbortSignal) }
    )
  );
  fireEvent.click(screen.getByLabelText(`完成${label}设置`));
  await waitFor(() => expect(input).not.toBeInTheDocument());
  const saved = JSON.parse(
    screen.getByTestId("pronunciation-wire").textContent!
  ).synthesis.uk;
  expect(saved.ups_words).toEqual([
    { text: "far", phoneme: "F AA R lng" },
    { text: "away", phoneme: "AX . S1 W EY" }
  ]);
  expect(saved.ups_speech.content.annotations).toEqual([
    { type: "pause", at: 3, duration_ms: 500 }
  ]);
  fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
  expect(await screen.findByLabelText(`${label}音标编辑`)).toHaveValue(
    saved.ups
  );
  expect(screen.getByLabelText("编辑第 4 处停顿 0.5 秒")).toBeInTheDocument();
});

it("UPS 音素间空格不能被保存为英文词间停顿", async () => {
  render(<Harness dialect="uk" />);
  const label = "第 1 条发音 英式 Azure UPS";
  fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
  await screen.findByLabelText(`${label}音标编辑`);
  fireEvent.click(screen.getByLabelText("停顿"));
  fireEvent.click(screen.getByLabelText("停顿 0.5 秒"));
  fireEvent.mouseDown(screen.getByRole("dialog").querySelector(".tsz-ve-gap")!);
  expect(screen.getByText(/停顿只能设置在词间音标边界/)).toBeInTheDocument();
  expect(screen.getByLabelText(`完成${label}设置`)).toBeDisabled();
});

it("四个 TTS 设置器提供音标编辑、停顿和音色，完成各自保存；取消不影响字段试听", async () => {
  render(<Harness dialect="common" settingsPhrase />);
  const wire = () =>
    JSON.parse(screen.getByTestId("pronunciation-wire").textContent!);
  for (const [accent, side, alphabet, duration, voice, voiceId] of [
    ["英式", "uk", "IPA", 500, "Sonia", "en-gb-sonia"],
    ["美式", "us", "IPA", 1000, "Aria", "en-us-aria"],
    ["英式", "uk", "UPS", 2000, "Sonia", "en-gb-sonia"],
    ["美式", "us", "UPS", 3000, "Aria", "en-us-aria"]
  ] as const) {
    const label = `第 1 条发音 ${accent} Azure ${alphabet}`;
    fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
    const dialog = await screen.findByRole("dialog", {
      name: `${label} · 音标、停顿与音色`
    });
    const control = (label: string) =>
      dialog.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
    await waitFor(() => expect(control(`启用 ${voice}`)).not.toBeNull());
    expect(control(`启用 ${voice}`)).not.toBeChecked();
    for (const name of ["连读", "斜体", "语法结构", "音频", "编辑文本"])
      expect(control(name)).toBeNull();
    expect(control(`${label}音标编辑`)).not.toHaveAttribute("readonly");
    expect(control(`${label}音标编辑`)).toHaveValue(
      wire().synthesis[side][alphabet.toLowerCase()]
    );
    fireEvent.click(control(`启用 ${voice}`));
    fireEvent.click(control("停顿"));
    fireEvent.click(control(`停顿 ${duration / 1000} 秒`));
    fireEvent.mouseDown(
      dialog.querySelectorAll(".tsz-ve-gap")[alphabet === "UPS" ? 2 : 0]!
    );
    fireEvent.click(control(`试听 ${voice}`));
    await waitFor(() =>
      expect(speech.synthesize).toHaveBeenLastCalledWith(
        expect.objectContaining({
          voiceId,
          content: expect.objectContaining({
            text: "far away",
            annotations: expect.arrayContaining([
              { type: "pause", at: 3, duration_ms: duration }
            ])
          })
        }),
        { signal: expect.any(AbortSignal) }
      )
    );
    expect(
      wire().synthesis[side][`${alphabet.toLowerCase()}_speech`]
    ).toBeUndefined();
    fireEvent.click(control(`完成${label}设置`));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(
      wire().synthesis[side][`${alphabet.toLowerCase()}_speech`].content
        .annotations
    ).toEqual([{ type: "pause", at: 3, duration_ms: duration }]);
  }
  const saved = wire();
  const label = "第 1 条发音 英式 Azure IPA";
  fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
  const dialog = await screen.findByRole("dialog", {
    name: `${label} · 音标、停顿与音色`
  });
  const sonia = () =>
    dialog.querySelector<HTMLElement>('[aria-label="启用 Sonia"]')!;
  await waitFor(() => expect(sonia()).not.toBeNull());
  expect(sonia()).toBeChecked();
  fireEvent.click(sonia());
  fireEvent.click(
    dialog.querySelector<HTMLElement>(`[aria-label="取消${label}设置"]`)!
  );
  await waitFor(() => expect(dialog).not.toBeInTheDocument());
  expect(wire()).toEqual(saved);
  for (const [accent, duration] of [
    ["英式", 500],
    ["美式", 1000]
  ] as const) {
    const play = screen.getByLabelText(
      `第 1 条发音 ${accent} Azure IPA 最终读音 播放语音`
    );
    await waitFor(() => expect(play).toBeEnabled());
    fireEvent.click(play);
    await waitFor(() =>
      expect(speech.synthesize).toHaveBeenLastCalledWith(
        expect.objectContaining({
          content: expect.objectContaining({
            annotations: expect.arrayContaining([
              { type: "pause", at: 3, duration_ms: duration }
            ])
          })
        }),
        { signal: expect.any(AbortSignal) }
      )
    );
  }
}, 20000);
