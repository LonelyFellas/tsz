import { App, ConfigProvider } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  Dialect,
  V3DraftValidationIssue,
  WordPronunciationV3
} from "@tsz/types";
import { PronunciationPreviewProvider } from "../../word-creation/PronunciationPreview";
import { V3SynthesisInputs } from "./V3SynthesisInputs";

const speech = vi.hoisted(() => ({
  synthesize: vi.fn(),
  recommendations: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ usePermission: () => true }));
vi.mock("@/lib/env", () => ({ env: { VOICE_PREVIEW: true } }));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: "us" })
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
      },
      {
        id: "en-us-aria",
        locale: "en-US",
        gender: "female",
        label: "Aria",
        styles: [],
        supportsRate: true,
        supportsPitch: true,
        isDefault: false
      }
    ],
    synthesize: speech.synthesize
  },
  adminAudioUploadAdapter: {},
  voicePreviewIsMock: false
}));

beforeEach(() => {
  speech.recommendations.mockReset().mockResolvedValue([]);
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
  empty = false,
  profiled = false,
  legacyPhrase = false,
  settingsPhrase = false,
  issues = []
}: {
  dialect: Dialect;
  legacy?: boolean;
  empty?: boolean;
  profiled?: boolean;
  legacyPhrase?: boolean;
  settingsPhrase?: boolean;
  issues?: readonly V3DraftValidationIssue[];
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
        : legacy || empty
          ? {
              alphabet: "ipa",
              use_spelling: false,
              ipa: empty ? "" : "fɑː",
              ...(empty ? {} : { ipa_locale: "en-GB" as const }),
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
            issues={issues}
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

const renderWithUps = (ui: Parameters<typeof render>[0]) => {
  const view = render(ui);
  for (const toggle of screen.queryAllByRole("button", {
    name: /^展开第 \d+ 条发音的 UPS$/
  }))
    fireEvent.click(toggle);
  return view;
};

describe("双口音真实试听控件", () => {
  it.each(
    (["common", "uk", "us"] as const).flatMap((dialect) =>
      (["ipa", "ups"] as const).map((alphabet) => ({ dialect, alphabet }))
    )
  )(
    "审查回归：$dialect 的扁平 $alphabet 提交错误显示在可定位字段",
    ({ dialect, alphabet }) => {
      const view = render(<Harness dialect={dialect} empty />);
      if (alphabet === "ups")
        fireEvent.click(
          screen.getByRole("button", { name: "展开第 1 条发音的 UPS" })
        );
      fireEvent.click(screen.getByRole("radio", { name: "词形拼写" }));
      fireEvent.click(
        screen.getByRole("radio", { name: `Azure ${alphabet.toUpperCase()}` })
      );
      const accent = dialect === "uk" ? "英式" : "美式";
      const input = screen.getByLabelText(
        `第 1 条发音的${accent} Azure ${alphabet.toUpperCase()}`
      );
      expect(input).toHaveAttribute("aria-invalid", "false");
      expect(
        screen.queryByText(`请填写 Azure ${alphabet.toUpperCase()}`)
      ).toBeNull();
      view.rerender(
        <Harness
          dialect={dialect}
          empty
          issues={[
            {
              schema_version: 3,
              step: "forms",
              node_id: "p",
              field: `synthesis.${alphabet}`,
              code: "pronunciation_required",
              message: "请填写合成音素",
              node_location: {
                node_role: "pronunciation",
                ancestor_node_ids: [],
                pronunciation_id: "p"
              }
            }
          ]}
        />
      );
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("data-v3-field", `synthesis.${alphabet}`);
      expect(
        document.querySelectorAll(
          `[data-v3-node-id="p"][data-v3-field="synthesis.${alphabet}"]`
        )
      ).toHaveLength(1);
      expect(
        screen.getByText(`请填写 Azure ${alphabet.toUpperCase()}`)
      ).toBeInTheDocument();
    }
  );

  it.each(["common", "us"] as const)(
    "审查回归：%s 扁平旧音标错误始终定位到可见口音",
    (dialect) => {
      render(
        <Harness
          dialect={dialect}
          legacy
          issues={[
            {
              schema_version: 3,
              step: "forms",
              node_id: "p",
              field: "synthesis.ipa",
              code: "phonetic_rich_text_invalid",
              message: "请确认口音",
              node_location: {
                node_role: "pronunciation",
                ancestor_node_ids: [],
                pronunciation_id: "p"
              }
            }
          ]}
        />
      );
      const input = screen.getByLabelText(
        `第 1 条发音的${dialect === "common" ? "英式" : "美式"} Azure IPA`
      );
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("data-v3-field", "synthesis.ipa");
      expect(
        document.querySelectorAll(
          '[data-v3-node-id="p"][data-v3-field="synthesis.ipa"]'
        )
      ).toHaveLength(1);
    }
  );

  it("审查回归：相同 UPS 错误的新数组不覆盖主动收起，新错误才重新展开", () => {
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "forms",
      node_id: "p",
      field: "synthesis.us.ups",
      code: "phonetic_rich_text_invalid",
      message: "请检查 UPS",
      node_location: { node_role: "pronunciation", ancestor_node_ids: [] }
    };
    const other = { ...issue, field: "synthesis.uk.ups" };
    const view = render(<Harness dialect="common" issues={[issue, other]} />);
    fireEvent.click(
      screen.getByRole("button", { name: "收起第 1 条发音的 UPS" })
    );
    view.rerender(
      <Harness dialect="common" issues={[{ ...other }, { ...issue }]} />
    );
    expect(
      screen.getByRole("button", { name: "展开第 1 条发音的 UPS" })
    ).toHaveAttribute("aria-expanded", "false");
    view.rerender(
      <Harness
        dialect="common"
        issues={[{ ...issue, message: "UPS 内容已失效，请重新转换" }]}
      />
    );
    expect(
      screen.getByRole("button", { name: "收起第 1 条发音的 UPS" })
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("审查回归：收起保留 UPS 面板、试听结果与播放状态，重开不重复合成", async () => {
    const dispose = vi.fn();
    speech.synthesize.mockResolvedValue({
      audioUrl: "/ups-preview.mp3",
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      cached: false,
      dispose
    });
    renderWithUps(<Harness dialect="common" />);
    const play = screen.getByLabelText(
      "第 1 条发音 美式 Azure UPS 最终读音 播放语音"
    );
    await waitFor(() => expect(play).toBeEnabled());
    fireEvent.click(play);
    await waitFor(() => expect(speech.synthesize).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(play).toBeEnabled());
    const pause = vi.mocked(HTMLMediaElement.prototype.pause);
    pause.mockClear();
    const input = screen.getByLabelText("第 1 条发音的美式 Azure UPS");
    fireEvent.click(
      screen.getByRole("button", { name: "收起第 1 条发音的 UPS" })
    );
    expect(dispose).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();
    expect(input).toBeInTheDocument();
    expect(input).not.toBeVisible();
    expect(input.closest(".word-synthesis-ups-fields")).toHaveAttribute(
      "aria-hidden",
      "true"
    );
    expect(input.closest(".word-synthesis-ups-fields")).toHaveAttribute(
      "inert"
    );
    fireEvent.click(
      screen.getByRole("button", { name: "展开第 1 条发音的 UPS" })
    );
    expect(
      screen.getByLabelText("第 1 条发音 美式 Azure UPS 最终读音 播放语音")
    ).toBe(play);
    const plays = vi.mocked(HTMLMediaElement.prototype.play).mock.calls.length;
    fireEvent.click(play);
    await waitFor(() =>
      expect(HTMLMediaElement.prototype.play).toHaveBeenCalledTimes(plays + 1)
    );
    expect(speech.synthesize).toHaveBeenCalledTimes(1);
  });

  it("UPS 默认收起，展开后可编辑，收起再展开不丢失内容或回退选择", () => {
    render(<Harness dialect="common" />);
    expect(screen.queryByLabelText("第 1 条发音的美式 Azure UPS")).toBeNull();
    expect(screen.getByLabelText("第 1 条发音的美式 Azure IPA")).toBeVisible();
    const toggle = screen.getByRole("button", {
      name: "展开第 1 条发音的 UPS"
    });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveTextContent("UPS");
    expect(toggle.closest(".word-synthesis-source-label")).toHaveTextContent(
      "语音来源"
    );
    fireEvent.click(toggle);
    expect(toggle).toHaveTextContent("UPS");
    const ups = screen.getByLabelText("第 1 条发音的美式 Azure UPS");
    expect(ups).toHaveValue("F AA R");
    fireEvent.change(ups, { target: { value: "K AE T" } });
    fireEvent.click(
      screen.getByRole("button", { name: "收起第 1 条发音的 UPS" })
    );
    expect(ups).toBeInTheDocument();
    expect(ups).not.toBeVisible();
    expect(screen.getByRole("radio", { name: "词形拼写" })).toBeChecked();
    expect(
      JSON.parse(screen.getByTestId("pronunciation-wire").textContent!)
        .synthesis.us.ups
    ).toBe("K AE T");
    fireEvent.click(
      screen.getByRole("button", { name: "展开第 1 条发音的 UPS" })
    );
    expect(screen.getByLabelText("第 1 条发音的美式 Azure UPS")).toHaveValue(
      "K AE T"
    );
  });

  it("校验发现 UPS 错误时自动展开，让错误字段可以定位", () => {
    const view = render(<Harness dialect="common" />);
    expect(screen.queryByLabelText("第 1 条发音的美式 Azure UPS")).toBeNull();
    view.rerender(
      <Harness
        dialect="common"
        issues={[
          {
            schema_version: 3,
            step: "forms",
            node_id: "p",
            field: "synthesis.us.ups",
            code: "phonetic_rich_text_invalid",
            message: "请检查 UPS",
            node_location: { node_role: "pronunciation", ancestor_node_ids: [] }
          }
        ]}
      />
    );
    expect(
      screen.getByRole("button", { name: "收起第 1 条发音的 UPS" })
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByLabelText("第 1 条发音的美式 Azure UPS")
    ).toHaveAttribute("aria-invalid", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Azure UPS" }));
    fireEvent.change(screen.getByLabelText("第 1 条发音的美式 Azure UPS"), {
      target: { value: "" }
    });
    expect(
      screen.getByLabelText("第 1 条发音的美式 Azure UPS")
    ).toHaveAttribute("aria-invalid", "true");
  });

  it("不在每条发音下重复说明 UPS 选源规则", () => {
    renderWithUps(<Harness dialect="common" />);
    expect(
      screen.queryByText("UPS 已填写时优先使用，留空时使用所选来源。")
    ).toBeNull();
  });

  it("空输入不常驻提示必填，已填音素的格式错误仍提示", () => {
    renderWithUps(<Harness dialect="common" />);
    fireEvent.click(screen.getByRole("radio", { name: "Azure IPA" }));
    const ups = screen.getByLabelText("第 1 条发音的美式 Azure UPS");
    fireEvent.change(ups, { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("第 1 条发音的美式 Azure IPA"), {
      target: { value: " " }
    });
    expect(screen.queryByText("请填写 Azure IPA")).toBeNull();
    expect(
      screen.getByLabelText("第 1 条发音 美式 Azure IPA 最终读音 播放语音")
    ).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Azure UPS" }));
    fireEvent.change(ups, { target: { value: "错误" } });
    expect(
      screen.getByText("UPS 使用区分大小写、以空格分隔的 ASCII 音素")
    ).toBeInTheDocument();
  });

  it("手动选源：展开显示 UPS 单选，收起隐藏但保留选择和内容", () => {
    render(<Harness dialect="common" />);
    expect(screen.queryByRole("radio", { name: "Azure UPS" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "展开第 1 条发音的 UPS" })
    );
    const ups = screen.getByRole("radio", { name: "Azure UPS" });
    expect(ups).not.toBeChecked();
    fireEvent.click(ups);
    expect(ups).toBeChecked();
    expect(
      JSON.parse(screen.getByTestId("pronunciation-wire").textContent!)
        .synthesis
    ).toMatchObject({ alphabet: "ups", use_spelling: false });
    fireEvent.click(
      screen.getByRole("button", { name: "收起第 1 条发音的 UPS" })
    );
    expect(screen.queryByRole("radio", { name: "Azure UPS" })).toBeNull();
    expect(
      screen.getByLabelText("第 1 条发音的美式 Azure UPS")
    ).not.toBeVisible();
    expect(
      JSON.parse(screen.getByTestId("pronunciation-wire").textContent!)
        .synthesis
    ).toMatchObject({ alphabet: "ups", use_spelling: false });
    fireEvent.click(
      screen.getByRole("button", { name: "展开第 1 条发音的 UPS" })
    );
    expect(screen.getByRole("radio", { name: "Azure UPS" })).toBeChecked();
    const input = screen.getByLabelText("第 1 条发音的美式 Azure UPS");
    expect(input).toHaveValue("F AA R");
    for (const source of ["Azure IPA", "词形拼写"]) {
      fireEvent.click(screen.getByRole("radio", { name: source }));
      fireEvent.change(input, { target: { value: "K AE T" } });
      expect(screen.getByRole("radio", { name: source })).toBeChecked();
      fireEvent.change(input, { target: { value: "" } });
      expect(screen.getByRole("radio", { name: source })).toBeChecked();
      expect(screen.queryByText("请填写 Azure UPS")).toBeNull();
    }
  });

  it.each([
    ["英式", "IPA"],
    ["美式", "IPA"],
    ["英式", "UPS"],
    ["美式", "UPS"]
  ])("%s %s 提示使用统一的简短文案", (accent, alphabet) => {
    renderWithUps(<Harness dialect="common" />);
    expect(
      screen.getByLabelText(`第 1 条发音的${accent} Azure ${alphabet}`)
    ).toHaveAttribute("placeholder", `请输入${accent}${alphabet}`);
  });

  it.each(["common", "uk", "us"] as const)(
    "%s 词形只试听可见的对应口音候选，不受全局来源影响",
    async (dialect) => {
      renderWithUps(<Harness dialect={dialect} />);
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
  it("缺省来源的旧 UPS 短语仍可按整段音素试听", async () => {
    renderWithUps(<Harness dialect="common" legacyPhrase />);
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
    renderWithUps(<Harness dialect="common" legacy />);
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
    renderWithUps(<Harness dialect="common" />);
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
  renderWithUps(<Harness dialect="common" settingsPhrase />);
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
  renderWithUps(<Harness dialect="uk" />);
  const label = "第 1 条发音 英式 Azure UPS";
  fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
  await screen.findByLabelText(`${label}音标编辑`);
  fireEvent.click(screen.getByLabelText("停顿"));
  fireEvent.click(screen.getByLabelText("停顿 0.5 秒"));
  fireEvent.mouseDown(screen.getByRole("dialog").querySelector(".tsz-ve-gap")!);
  expect(screen.getByText(/停顿只能设置在词间音标边界/)).toBeInTheDocument();
  expect(screen.getByLabelText(`完成${label}设置`)).toBeDisabled();
});

it("未配置的音素设置器采用首位推荐，完成时保存参数", async () => {
  speech.recommendations.mockResolvedValue([
    {
      id: "r",
      name: "慢读",
      groupName: "发音",
      locale: "en-GB",
      setting: { voice_id: "en-gb-sonia", enabled: true, rate_percent: -25 }
    }
  ]);
  render(<Harness dialect="uk" />);
  const label = "第 1 条发音 英式 Azure IPA";
  fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
  await waitFor(() =>
    expect(screen.getByLabelText("启用 Sonia")).toBeChecked()
  );
  expect(screen.getByLabelText("设置 Sonia 的语速")).toHaveTextContent("0.75");
});

it("四个 TTS 设置器提供音标编辑、停顿和音色，完成各自保存；取消不影响字段试听", async () => {
  renderWithUps(<Harness dialect="common" settingsPhrase />);
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
