import { env } from "@/lib/env";
import { ConfigProvider } from "antd";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import { formsFixture, commonFormFixture } from "../fixtures";
import { toFormsWire } from "../model";
import { V3PronunciationList } from "./V3PronunciationList";
vi.mock("@/lib/env", () => ({
  env: { VOICE_EDITOR: true, AZURE_PRONUNCIATION_INPUTS: true }
}));
const accent = vi.hoisted(() => ({ value: "us" as "uk" | "us" }));
beforeEach(() => {
  accent.value = "us";
});
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: accent.value })
}));
vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {},
  adminAudioUploadAdapter: {},
  voicePreviewIsMock: false
}));
vi.mock("../../word-creation/PronunciationPreview", () => ({
  PronunciationPreviewControls: ({
    content,
    ariaLabelPrefix,
    disabled
  }: {
    content: RichTextV2;
    ariaLabelPrefix: string;
    disabled: boolean;
  }) => (
    <button
      disabled={disabled}
      aria-label={ariaLabelPrefix}
      data-content={JSON.stringify(content)}
    >
      最终读音
    </button>
  )
}));
vi.mock("@tsz/voice-editor/editor", () => ({
  VoiceEditor: ({
    value,
    onVoiceProfileChange,
    onAudioAssetsChange
  }: VoiceEditorProps) => (
    <div>
      <span data-testid="editor-content">{JSON.stringify(value)}</span>
      <button
        onClick={() =>
          onVoiceProfileChange?.({
            voices: [
              { voice_id: "american-voice", enabled: true, rate_percent: -10 }
            ]
          })
        }
      >
        配置音色
      </button>
      <button
        onClick={() =>
          onAudioAssetsChange?.([
            {
              id: "audio-local",
              locale: "en-US",
              gender: "female",
              content_type: "audio/mpeg",
              size_bytes: 3,
              duration_ms: null,
              original_name: "test.mp3",
              created_at: "2026-09-09T00:00:00Z"
            }
          ])
        }
      >
        保存录音
      </button>
    </div>
  )
}));
function Harness({
  configured = false,
  phrase = false
}: { configured?: boolean; phrase?: boolean } = {}) {
  const [content, setContent] = useState(() => {
    const form = commonFormFixture();
    form.regional_variants.common.spelling = phrase ? "hello cat" : "cat";
    const row = form.regional_variants.common.pronunciations[0]!;
    row.dict_phonetic = "kæt";
    row.actual_pron = phrase ? "həˈloʊ kæt" : "kæt";
    if (configured)
      row.synthesis = { alphabet: "ups", ipa: "kæt", ups: "K AE T" };
    return formsFixture({ forms: [form] });
  });
  const form = content.pos[0]!.forms[0]!;
  if (form.regional_variants.mode !== "common") throw Error();
  return (
    <>
      <V3PronunciationList
        content={content}
        variant={form.regional_variants.common}
        issues={[]}
        idFactory={() => crypto.randomUUID()}
        onChange={setContent}
      />
      <output data-testid="wire">{JSON.stringify(toFormsWire(content))}</output>
    </>
  );
}
const field = (name: string) => screen.getByLabelText(`第 1 条发音的${name}`);
const convert = (name: string) =>
  fireEvent.click(screen.getByLabelText(`第 1 条发音转换为 Azure ${name}`));
const change = (name: string, value: string) =>
  fireEvent.change(field(name), { target: { value } });
const rows = () =>
  JSON.parse(screen.getByTestId("wire").textContent!).pos[0].forms[0]
    .regional_variants.common.pronunciations;
describe("独立发音输入", () => {
  it("默认拼写；两种音素预览、音色、录音及另一行保持独立", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("在第 1 条后新增发音"));
    change("Azure IPA", "kæt");
    change("Azure UPS", "K AE T");
    expect(screen.getAllByRole("radio", { name: "词形拼写" })[0]).toBeChecked();
    fireEvent.click(screen.getAllByRole("radio", { name: "Azure UPS" })[0]!);
    fireEvent.click(screen.getByLabelText("第 1 条发音发音设置与真人录音"));
    fireEvent.click(await screen.findByText("配置音色"));
    fireEvent.click(screen.getByText("保存录音"));
    const content = JSON.parse(
      screen.getByTestId("editor-content").textContent!
    );
    expect(content).toEqual({
      version: 2,
      text: "cat",
      annotations: [
        {
          type: "phoneme",
          start: 0,
          end: 3,
          alphabet: "ups",
          phoneme: "K AE T"
        }
      ]
    });
    expect(rows()[0].synthesis).toEqual({
      alphabet: "ups",
      ipa: "kæt",
      ups: "K AE T",
      use_spelling: false,
      ups_words: null,
      ipa_locale: "en-US",
      ups_locale: "en-US"
    });
    expect(rows()[0].voice_profile.voices[0].voice_id).toBe("american-voice");
    expect(rows()[0].audio_assets[0].original_name).toBe("test.mp3");
    expect(rows()[1].synthesis).toBeUndefined();
    fireEvent.click(screen.getByLabelText("收起设置"));
    fireEvent.click(screen.getByLabelText("第 1 条发音发音设置与真人录音"));
    await waitFor(() =>
      expect(screen.getByTestId("editor-content")).toHaveTextContent(
        '"alphabet":"ups"'
      )
    );
  });
  it("固定从实际发音转换，不读字典或另一候选；覆盖确认、取消、撤销且不改变来源", async () => {
    render(<Harness />);
    change("字典音标", "dɔg");
    change("实际发音", "kæt");
    change("Azure UPS", "H U M");
    change("Azure IPA", "human IPA");
    convert("UPS");
    expect(await screen.findByText("K AE T")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/取\s*消/));
    expect(field("Azure UPS")).toHaveValue("H U M");
    convert("UPS");
    fireEvent.click(screen.getByText("应用转换结果"));
    expect(field("Azure UPS")).toHaveValue("K AE T");
    expect(field("Azure IPA")).toHaveValue("human IPA");
    expect(screen.getByRole("radio", { name: "词形拼写" })).toBeChecked();
    fireEvent.keyDown(field("Azure UPS"), { key: "z", ctrlKey: true });
    expect(field("Azure UPS")).toHaveValue("H U M");
    change("实际发音", "");
    convert("UPS");
    expect(screen.getByText("请先填写实际发音")).toBeInTheDocument();
    expect(field("Azure UPS")).toHaveValue("H U M");
    change("实际发音", "kæt?");
    convert("IPA");
    expect(screen.getByText(/此符号或组合/)).toBeInTheDocument();
    expect(field("Azure IPA")).toHaveValue("human IPA");
  });
  it("两行试听各自使用对应候选，不受语音来源切换影响", () => {
    render(<Harness />);
    change("Azure IPA", "kæt");
    change("Azure UPS", "K AE T");
    for (const selection of ["词形拼写", "Azure IPA", "Azure UPS"]) {
      fireEvent.click(screen.getByRole("radio", { name: selection }));
      for (const [source, phoneme] of [
        ["IPA", "kæt"],
        ["UPS", "K AE T"]
      ]) {
        const content = JSON.parse(
          screen
            .getByLabelText(`第 1 条发音 Azure ${source} 最终读音`)
            .getAttribute("data-content")!
        );
        expect(content.annotations).toEqual([
          expect.objectContaining({ alphabet: source!.toLowerCase(), phoneme })
        ]);
      }
    }
  });
  it("短语连续显示，词界保存；手改后禁止复用，撤销恢复", () => {
    render(<Harness phrase />);
    convert("UPS");
    expect(field("Azure UPS")).toHaveValue("H AX . S1 L O K AE T");
    expect(rows()[0].synthesis.ups_words).toEqual([
      { text: "hello", phoneme: "H AX . S1 L O" },
      { text: "cat", phoneme: "K AE T" }
    ]);
    const preview = screen.getByLabelText("第 1 条发音 Azure UPS 最终读音");
    expect(preview).toBeEnabled();
    expect(
      JSON.parse(preview.getAttribute("data-content")!).annotations
    ).toHaveLength(2);
    change("Azure UPS", "H AX . S1 L O K AE T T");
    expect(preview).toBeDisabled();
    fireEvent.keyDown(field("Azure UPS"), { key: "z", ctrlKey: true });
    expect(preview).toBeEnabled();
    expect(rows()[0].synthesis.ups_words).toHaveLength(2);
  });
  it("撤销 UPS 内容不会撤销后来主动选择的语音来源", () => {
    render(<Harness />);
    change("Azure UPS", "OLD");
    change("Azure UPS", "NEW");
    fireEvent.click(screen.getByRole("radio", { name: "Azure UPS" }));
    fireEvent.keyDown(field("Azure UPS"), { key: "z", ctrlKey: true });
    expect(field("Azure UPS")).toHaveValue("OLD");
    expect(screen.getByRole("radio", { name: "Azure UPS" })).toBeChecked();
    expect(rows()[0].synthesis.use_spelling).toBe(false);
  });
  it("发音设置通过弹层显示，Escape 关闭并返回触发按钮", async () => {
    const { container } = render(
      <ConfigProvider theme={{ token: { motion: false } }}>
        <Harness />
      </ConfigProvider>
    );
    const trigger = screen.getByLabelText("第 1 条发音发音设置与真人录音");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("dialog", { name: "第 1 条发音发音设置" })
    ).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", {
      name: "第 1 条发音发音设置"
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(
      container.querySelector(".word-pronunciation-synthesis")
    ).not.toContainElement(panel);
    await screen.findByText("配置音色");
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false")
    );
    await waitFor(() => expect(panel).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
  it("通用栏旧候选先确认口音，偏好改变不重标音标；两套候选口音独立", () => {
    const view = render(<Harness configured />);
    const preview = () =>
      screen.getByLabelText("第 1 条发音 Azure UPS 最终读音");
    expect(preview()).toBeDisabled();
    fireEvent.click(screen.getByLabelText("第 1 条发音确认 Azure UPS 为美式"));
    expect(preview()).toBeEnabled();
    expect(rows()[0].synthesis.ups_locale).toBe("en-US");
    accent.value = "uk";
    view.rerender(<Harness configured />);
    expect(preview()).toBeDisabled();
    expect(field("Azure UPS")).toHaveValue("K AE T");
    expect(screen.getByText(/当前发音：英式/)).toBeInTheDocument();
    change("Azure IPA", "kɛt");
    expect(rows()[0].synthesis.ipa_locale).toBe("en-GB");
    expect(rows()[0].synthesis.ups_locale).toBe("en-US");
    expect(preview()).toBeDisabled();
    convert("UPS");
    expect(
      screen.getByText(/UPS 自动转换目前仅验证 en-US/)
    ).toBeInTheDocument();
    expect(field("Azure UPS")).toHaveValue("K AE T");
  });
  it("来源改变后取消过期的覆盖确认", async () => {
    render(<Harness />);
    change("Azure UPS", "OLD");
    convert("UPS");
    change("实际发音", "dɔg");
    fireEvent.click(screen.getByText("应用转换结果"));
    expect(field("Azure UPS")).toHaveValue("OLD");
    expect(screen.getByText(/来源、口音或目标内容已变化/)).toBeInTheDocument();
  });
});
it("关闭入口时旧 UPS 记录原样保存且保留设置", async () => {
  env.AZURE_PRONUNCIATION_INPUTS = false;
  try {
    render(<Harness configured />);
    expect(
      screen.queryByLabelText("第 1 条发音的Azure IPA")
    ).not.toBeInTheDocument();
    expect(screen.getByText(/当前来源：Azure UPS/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("第 1 条发音发音设置与真人录音"));
    fireEvent.click(await screen.findByText("保存录音"));
    expect(rows()[0].synthesis).toEqual({
      alphabet: "ups",
      ipa: "kæt",
      ups: "K AE T"
    });
  } finally {
    env.AZURE_PRONUNCIATION_INPUTS = true;
  }
});
it("实际发音填入需确认并保留可撤销快照", () => {
  render(<Harness />);
  change("实际发音", "dɔg");
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  fireEvent.click(screen.getByText(/^应\s*用$/));
  expect(field("实际发音")).toHaveValue("kæt");
  fireEvent.click(screen.getByLabelText("撤销实际发音填入"));
  expect(field("实际发音")).toHaveValue("dɔg");
});
