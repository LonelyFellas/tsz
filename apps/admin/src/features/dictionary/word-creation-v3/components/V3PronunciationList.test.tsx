import { App as AntApp, ConfigProvider } from "antd";

import { changeVoiceText } from "./V3VoiceTextField.test-helper";
import { env } from "@/lib/env";

import {
  fireEvent,
  render as rtlRender,
  screen,
  within
} from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PronunciationSynthesisV3, RichTextV2 } from "@tsz/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import { formsFixture, commonFormFixture, ukUsFormFixture } from "../fixtures";
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
    contextLabel,
    onChange,
    onVoiceProfileChange,
    renderActions
  }: VoiceEditorProps) => (
    <div>
      <div role="toolbar" aria-label="标注工具栏" />
      <textarea
        aria-label={contextLabel}
        value={value.text}
        onChange={(event) =>
          onChange({ version: 2, text: event.target.value, annotations: [] })
        }
      />
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
      {renderActions?.(true)}
    </div>
  )
}));
const renderWithUps = (
  ui: Parameters<typeof rtlRender>[0],
  options?: Parameters<typeof rtlRender>[1]
) => {
  const view = rtlRender(ui, {
    wrapper: ({ children }) => (
      <ConfigProvider theme={{ token: { motion: false } }}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    ),
    ...options
  });
  for (const toggle of screen.queryAllByRole("button", {
    name: /^展开第 \d+ 条发音的 UPS$/
  }))
    fireEvent.click(toggle);
  return view;
};
function Harness({
  configured = false,
  phrase = false,
  word = "cat",
  phonetic = "kæt",
  initialSynthesis
}: {
  configured?: boolean;
  phrase?: boolean;
  word?: string;
  phonetic?: string;
  initialSynthesis?: PronunciationSynthesisV3;
} = {}) {
  const [content, setContent] = useState(() => {
    const form = commonFormFixture();
    form.regional_variants.common.spelling = phrase ? "hello cat" : word;
    const row = form.regional_variants.common.pronunciations[0]!;
    row.dict_phonetic = phonetic;
    row.actual_pron = phrase ? "həˈloʊ kæt" : "kæt";
    if (configured)
      row.synthesis = { alphabet: "ups", ipa: "kæt", ups: "K AE T" };
    if (initialSynthesis) row.synthesis = initialSynthesis;
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
function RegionalHarness() {
  const [content, setContent] = useState(() =>
    formsFixture({ forms: [ukUsFormFixture()] })
  );
  const form = content.pos[0]!.forms[0]!;
  const variants = form.regional_variants;
  if (variants.mode !== "uk_us") throw Error();
  return (
    <>
      {(["uk", "us"] as const).map((side) => (
        <section aria-label={side} key={side}>
          <V3PronunciationList
            content={content}
            variant={variants[side]}
            issues={[]}
            idFactory={() => crypto.randomUUID()}
            onChange={setContent}
          />
        </section>
      ))}
      <output data-testid="regional-wire">
        {JSON.stringify(toFormsWire(content))}
      </output>
    </>
  );
}
const field = (name: string) =>
  screen.getByLabelText(
    `第 1 条发音的${name.startsWith("Azure ") ? `美式 ${name}` : name}`
  );
const convert = (name: string) =>
  fireEvent.click(screen.getByLabelText(`第 1 条发音转换为美式 Azure ${name}`));
const change = (name: string, value: string) =>
  changeVoiceText(field(name), { target: { value } });
const rows = () =>
  JSON.parse(screen.getByTestId("wire").textContent!).pos[0].forms[0]
    .regional_variants.common.pronunciations;
describe("独立发音输入", () => {
  it("区分词形时英式和美式各只编辑自身的 IPA、UPS", () => {
    renderWithUps(<RegionalHarness />);
    const uk = screen.getByRole("region", { name: "uk" });
    const us = screen.getByRole("region", { name: "us" });
    for (const alphabet of ["IPA", "UPS"]) {
      expect(uk).toContainElement(
        within(uk).getByLabelText(`第 1 条发音的英式 Azure ${alphabet}`)
      );
      expect(us).toContainElement(
        within(us).getByLabelText(`第 1 条发音的美式 Azure ${alphabet}`)
      );
      expect(
        uk.querySelectorAll("textarea[aria-label*='美式 Azure']")
      ).toHaveLength(0);
      expect(
        us.querySelectorAll("textarea[aria-label*='英式 Azure']")
      ).toHaveLength(0);
    }
    changeVoiceText(screen.getByLabelText("第 1 条发音的英式 Azure IPA"), {
      target: { value: "sɛn.tə" }
    });
    changeVoiceText(screen.getByLabelText("第 1 条发音的美式 Azure UPS"), {
      target: { value: "S EH N T ER" }
    });
    const variants = JSON.parse(
      screen.getByTestId("regional-wire").textContent!
    ).pos[0].forms[0].regional_variants;
    expect(variants.uk.pronunciations[0].synthesis.uk.ipa).toBe("sɛn.tə");
    expect(variants.uk.pronunciations[0].synthesis.us).toBeUndefined();
    expect(variants.us.pronunciations[0].synthesis.us.ups).toBe("S EH N T ER");
    expect(variants.us.pronunciations[0].synthesis.uk).toBeUndefined();
  });
  it("通用音标也同时保留四个英美候选，切换偏好不覆盖内容", () => {
    const view = renderWithUps(<Harness />);
    for (const side of ["英式", "美式"]) {
      for (const alphabet of ["IPA", "UPS"]) {
        expect(field(`${side} Azure ${alphabet}`)).toHaveValue("");
      }
    }
    change("英式 Azure IPA", "fɑː");
    change("美式 Azure IPA", "fɑɹ");
    change("英式 Azure UPS", "F AA");
    change("美式 Azure UPS", "F AA R");
    expect(rows()[0].synthesis).toMatchObject({
      uk: { ipa: "fɑː", ups: "F AA" },
      us: { ipa: "fɑɹ", ups: "F AA R" },
      use_spelling: false
    });
    accent.value = "uk";
    view.rerender(<Harness />);
    expect(field("英式 Azure IPA")).toHaveValue("fɑː");
    expect(field("美式 Azure IPA")).toHaveValue("fɑɹ");
    fireEvent.keyDown(field("英式 Azure IPA"), { key: "z", ctrlKey: true });
    expect(field("英式 Azure IPA")).toHaveValue("");
    expect(field("美式 Azure IPA")).toHaveValue("fɑɹ");
  });
  it("实际发音与音素输入的右端依次排列转换和编辑按钮", () => {
    renderWithUps(<Harness />);
    const actualGroup = field("实际发音").closest(
      ".v3-voice-text-field-compact"
    );
    expect(actualGroup).toContainElement(
      screen.getByLabelText("从字典音标填入实际发音")
    );
    expect(actualGroup).toContainElement(
      screen.getByLabelText("打开第 1 条发音的实际发音编辑器")
    );
    const actualConvert = screen.getByLabelText("从字典音标填入实际发音");
    const actualEdit = screen.getByLabelText("打开第 1 条发音的实际发音编辑器");
    expect(
      field("实际发音").compareDocumentPosition(actualConvert) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      actualConvert.compareDocumentPosition(actualEdit) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    for (const alphabet of ["IPA", "UPS"]) {
      const group = field(`Azure ${alphabet}`).closest(
        ".word-synthesis-control"
      );
      expect(group).toContainElement(
        screen.getByLabelText(`第 1 条发音转换为美式 Azure ${alphabet}`)
      );
      expect(group).toContainElement(
        screen.getByLabelText(`第 1 条发音 美式 Azure ${alphabet} 最终读音`)
      );
      const convert = screen.getByLabelText(
        `第 1 条发音转换为美式 Azure ${alphabet}`
      );
      expect(convert.textContent).toBe("");
      expect(
        field(`Azure ${alphabet}`).compareDocumentPosition(convert) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
      expect(
        convert.compareDocumentPosition(
          screen.getByLabelText(
            `打开第 1 条发音 美式 Azure ${alphabet} TTS 设置器`
          )
        ) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
  });
  it("移除旧设置后 IPA、UPS 来源和各自音色设置仍独立", async () => {
    renderWithUps(<Harness />);
    expect(
      screen.queryByRole("button", { name: /发音设置与真人录音/ })
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("在第 1 条后新增发音"));
    change("Azure IPA", "kæt");
    change("Azure UPS", "K AE T");
    for (const radio of screen.getAllByRole("radio", { name: "Azure IPA" })) {
      expect(radio).toBeChecked();
    }
    expect(screen.getByText("/ kæt /")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Azure UPS" })
    ).toBeInTheDocument();
    for (const alphabet of ["IPA", "UPS"]) {
      const label = `第 1 条发音 美式 Azure ${alphabet}`;
      const before = structuredClone(rows()[0].synthesis);
      fireEvent.click(screen.getByLabelText(`打开${label} TTS 设置器`));
      fireEvent.click(await screen.findByText("配置音色"));
      expect(rows()[0].synthesis).toEqual(before);
      fireEvent.click(screen.getByLabelText(`完成${label}设置`));
      expect(
        rows()[0].synthesis.us[`${alphabet.toLowerCase()}_speech`].voice_profile
          .voices[0].voice_id
      ).toBe("american-voice");
      expect(rows()[0].synthesis.alphabet).toBe("ipa");
      expect(rows()[0].synthesis.us.ipa).toBe("kæt");
      expect(rows()[0].synthesis.us.ups).toBe("K AE T");
      expect(rows()[1].synthesis).toBeUndefined();
    }
  });
  it("IPA 读取字典，UPS 读取人工修正后的对应 IPA；实际发音不参与转换", async () => {
    renderWithUps(<Harness />);
    await change("字典音标", "dɔg");
    await change("实际发音", "kæt");
    change("Azure UPS", "H U M");
    change("Azure IPA", "kɛt");
    convert("UPS");
    expect(await screen.findByText("K EH T")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/取\s*消/));
    expect(field("Azure UPS")).toHaveValue("H U M");
    convert("UPS");
    fireEvent.click(screen.getByText("应用转换结果"));
    expect(field("Azure UPS")).toHaveValue("K EH T");
    expect(field("Azure IPA")).toHaveValue("kɛt");
    expect(
      await screen.findByRole("radio", { name: "Azure IPA" })
    ).toBeChecked();
    fireEvent.keyDown(field("Azure UPS"), { key: "z", ctrlKey: true });
    expect(field("Azure UPS")).toHaveValue("H U M");
    change("Azure IPA", "");
    convert("UPS");
    expect(
      screen.getByText("请先填写对应口音的 Azure IPA")
    ).toBeInTheDocument();
    expect(field("Azure UPS")).toHaveValue("H U M");
    await change("实际发音", "kæt?");
    convert("IPA");
    expect(field("Azure IPA")).toHaveValue("dɔg");
    expect(field("实际发音")).toHaveValue("kæt?");
    expect(field("Azure UPS")).toHaveValue("H U M");
  });
  it("两行试听各自使用对应候选，不受语音来源切换影响", () => {
    renderWithUps(<Harness />);
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
            .getByLabelText(`第 1 条发音 美式 Azure ${source} 最终读音`)
            .getAttribute("data-content")!
        );
        expect(content.annotations).toEqual([
          expect.objectContaining({ alphabet: source!.toLowerCase(), phoneme })
        ]);
      }
    }
  });
  it("短语连续显示，词界保存；手改后禁止复用，撤销恢复", () => {
    renderWithUps(<Harness phrase />);
    change("Azure IPA", "hə.ˈloʊ kæt");
    convert("UPS");
    expect(field("Azure UPS")).toHaveValue("H AX . S1 L O K AE T");
    expect(rows()[0].synthesis.us.ups_words).toEqual([
      { text: "hello", phoneme: "H AX . S1 L O" },
      { text: "cat", phoneme: "K AE T" }
    ]);
    const preview = screen.getByLabelText(
      "第 1 条发音 美式 Azure UPS 最终读音"
    );
    expect(preview).toBeEnabled();
    expect(
      JSON.parse(preview.getAttribute("data-content")!).annotations
    ).toHaveLength(2);
    change("Azure UPS", "H AX . S1 L O K AE T T");
    expect(preview).toBeDisabled();
    fireEvent.keyDown(field("Azure UPS"), { key: "z", ctrlKey: true });
    expect(preview).toBeEnabled();
    expect(rows()[0].synthesis.us.ups_words).toHaveLength(2);
  });
  it("撤销 UPS 内容不会撤销后来选择的回退来源", () => {
    renderWithUps(<Harness />);
    change("Azure UPS", "OLD");
    change("Azure UPS", "NEW");
    fireEvent.click(screen.getByRole("radio", { name: "词形拼写" }));
    fireEvent.keyDown(field("Azure UPS"), { key: "z", ctrlKey: true });
    expect(field("Azure UPS")).toHaveValue("OLD");
    expect(screen.getByRole("radio", { name: "词形拼写" })).toBeChecked();
    expect(rows()[0].synthesis.use_spelling).toBe(true);
  });
  it("通用栏旧候选确认后只归入对应口音，偏好改变不重标", () => {
    const view = renderWithUps(<Harness configured />);
    const preview = () =>
      screen.getByLabelText("第 1 条发音 美式 Azure UPS 最终读音");
    expect(preview()).toBeDisabled();
    expect(field("英式 Azure UPS")).toHaveValue("");
    expect(field("美式 Azure UPS")).toHaveValue("");
    fireEvent.click(screen.getByLabelText("第 1 条发音确认 Azure UPS 为美式"));
    expect(preview()).toBeEnabled();
    expect(rows()[0].synthesis.us.ups).toBe("K AE T");
    expect(rows()[0].synthesis.ups).toBe("");
    accent.value = "uk";
    view.rerender(<Harness configured />);
    expect(preview()).toBeEnabled();
    expect(field("美式 Azure UPS")).toHaveValue("K AE T");
    expect(field("英式 Azure UPS")).toHaveValue("");
    change("英式 Azure IPA", "kɛt");
    expect(rows()[0].synthesis.uk.ipa).toBe("kɛt");
    expect(rows()[0].synthesis.us.ups).toBe("K AE T");
    fireEvent.click(screen.getByLabelText("第 1 条发音转换为英式 Azure UPS"));
    expect(field("美式 Azure UPS")).toHaveValue("K AE T");
    expect(field("英式 Azure UPS")).toHaveValue("K EH T");
  });
  it("来源改变后取消过期的覆盖确认", async () => {
    renderWithUps(<Harness />);
    change("Azure UPS", "OLD");
    change("Azure IPA", "kæt");
    convert("UPS");
    change("Azure IPA", "dɔg");
    fireEvent.click(screen.getByText("应用转换结果"));
    expect(field("Azure UPS")).toHaveValue("OLD");
    expect(screen.getByText(/来源、口音或目标内容已变化/)).toBeInTheDocument();
  });
});
it("关闭音素输入时旧 UPS 记录原样保留且不显示旧设置", () => {
  env.AZURE_PRONUNCIATION_INPUTS = false;
  try {
    renderWithUps(<Harness configured />);
    expect(
      screen.queryByLabelText("第 1 条发音的Azure IPA")
    ).not.toBeInTheDocument();
    expect(screen.getByText(/当前来源：Azure UPS/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /发音设置与真人录音/ })
    ).not.toBeInTheDocument();
    expect(rows()[0].synthesis).toEqual({
      alphabet: "ups",
      ipa: "kæt",
      ups: "K AE T"
    });
  } finally {
    env.AZURE_PRONUNCIATION_INPUTS = true;
  }
});
it("实际发音填入需确认并保留可撤销快照", async () => {
  renderWithUps(<Harness />);
  await change("实际发音", "dɔg");
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  fireEvent.click(screen.getByText(/^应\s*用$/));
  expect(field("实际发音")).toHaveValue("kæt");
  fireEvent.click(screen.getByLabelText("撤销实际发音填入"));
  expect(field("实际发音")).toHaveValue("dɔg");
});
it("字典独立生成实际发音和英美 IPA，UPS 从各自 IPA 转换", () => {
  renderWithUps(<Harness word="school" phonetic="/skuːl/" />);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(screen.getByText("sguːl")).toBeInTheDocument();
  fireEvent.click(screen.getByText(/^应\s*用$/));
  expect(field("实际发音")).toHaveValue("sguːl");
  for (const [accent, ipa, ups] of [
    ["英式", "sguːl", "S G U lng L"],
    ["美式", "sgul", "S G U L"]
  ]) {
    fireEvent.click(
      screen.getByLabelText(`第 1 条发音转换为${accent} Azure IPA`)
    );
    fireEvent.click(
      screen.getByLabelText(`第 1 条发音转换为${accent} Azure UPS`)
    );
    expect(field(`${accent} Azure IPA`)).toHaveValue(ipa);
    expect(field(`${accent} Azure UPS`)).toHaveValue(ups);
  }
  expect(field("字典音标")).toHaveValue("/skuːl/");
  expect(rows()[0].synthesis.use_spelling).toBe(false);
  fireEvent.click(screen.getByLabelText("撤销实际发音填入"));
  expect(field("实际发音")).toHaveValue("kæt");
});
it.each(["英式", "美式"])(
  "%s UPS 转换先确认字典 r 的规范化，再同步更新 IPA 和 UPS",
  (side) => {
    renderWithUps(
      <Harness
        word="different"
        initialSynthesis={{
          alphabet: "ipa",
          ipa: "",
          ups: "",
          use_spelling: false,
          uk: { ipa: "ˈdɪfrənt", ups: "" },
          us: { ipa: "ˈdɪfrənt", ups: "" }
        }}
      />
    );
    fireEvent.click(
      screen.getByLabelText(`第 1 条发音转换为${side} Azure UPS`)
    );
    expect(screen.getByText("规范 Azure IPA 并转换 UPS")).toBeInTheDocument();
    expect(field(`${side} Azure IPA`)).toHaveValue("ˈdɪfrənt");
    expect(field(`${side} Azure UPS`)).toHaveValue("");
    fireEvent.click(screen.getByText("应用转换结果"));
    expect(field(`${side} Azure IPA`)).toHaveValue("ˈdɪfɹənt");
    expect(field(`${side} Azure UPS`)).toHaveValue("S1 D IH F R AX N T");
    const other = side === "英式" ? "美式" : "英式";
    expect(field(`${other} Azure IPA`)).toHaveValue("ˈdɪfrənt");
    expect(field(`${other} Azure UPS`)).toHaveValue("");
    expect(field("字典音标")).toHaveValue("kæt");
    expect(field("实际发音")).toHaveValue("kæt");
    expect(
      rows()[0].synthesis[side === "英式" ? "uk" : "us"].ups_words
    ).toEqual([{ text: "different", phoneme: "S1 D IH F R AX N T" }]);
    fireEvent.keyDown(field(`${side} Azure IPA`), { key: "z", ctrlKey: true });
    fireEvent.keyDown(field(`${side} Azure UPS`), { key: "z", ctrlKey: true });
    expect(field(`${side} Azure IPA`)).toHaveValue("ˈdɪfrənt");
    expect(field(`${side} Azure UPS`)).toHaveValue("");
  }
);
it("取消或 IPA 来源改变时不应用 r 规范化与 UPS 转换", () => {
  renderWithUps(<Harness word="different" />);
  change("Azure IPA", "ˈdɪfrənt");
  change("Azure UPS", "H U M");
  convert("UPS");
  expect(screen.getByText("规范 Azure IPA 并转换 UPS")).toBeInTheDocument();
  fireEvent.click(screen.getByText(/取\s*消/));
  expect(field("Azure IPA")).toHaveValue("ˈdɪfrənt");
  expect(field("Azure UPS")).toHaveValue("H U M");
  convert("UPS");
  change("Azure IPA", "kɛt");
  fireEvent.click(screen.getByText("应用转换结果"));
  expect(field("Azure IPA")).toHaveValue("kɛt");
  expect(field("Azure UPS")).toHaveValue("H U M");
  expect(screen.getByText(/来源、口音或目标内容已变化/)).toBeInTheDocument();
});
it("r 规范化后仍有不支持音素时保持严格拒绝，不改写 IPA 或 UPS", () => {
  renderWithUps(<Harness />);
  change("Azure IPA", "frɑː");
  change("Azure UPS", "H U M");
  convert("UPS");
  expect(screen.getByText(/尚无确认规则/)).toBeInTheDocument();
  expect(
    screen.queryByText("规范 Azure IPA 并转换 UPS")
  ).not.toBeInTheDocument();
  expect(field("Azure IPA")).toHaveValue("frɑː");
  expect(field("Azure UPS")).toHaveValue("H U M");
});
it("字典转换失败保留目标，确认期间编辑目标会阻止覆盖", async () => {
  const view = renderWithUps(<Harness phonetic="kæt😀" />);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  expect(screen.getByText(/第 1 个词包含未支持的音标/)).toBeInTheDocument();
  expect(field("实际发音")).toHaveValue("kæt");
  view.unmount();
  renderWithUps(<Harness word="school" phonetic="skuːl" />);
  fireEvent.click(screen.getByLabelText("从字典音标填入实际发音"));
  await change("实际发音", "dɒg");
  fireEvent.click(screen.getByText(/^应\s*用$/));
  expect(field("实际发音")).toHaveValue("dɒg");
  expect(
    screen.getByText(/来源、口音、读法或目标内容已变化/)
  ).toBeInTheDocument();
});

it("读法按指定顺序展示，逐字正音使用独立 wire 值", () => {
  renderWithUps(<Harness />);
  fireEvent.mouseDown(screen.getByLabelText("第 1 条发音的读法"));
  expect(
    Array.from(
      document.querySelectorAll(".ant-select-item-option-content")
    ).map((item) => item.textContent)
  ).toEqual(["语流连读", "逐字正音", "强读", "弱读"]);
  fireEvent.click(screen.getByText("逐字正音"));
  const wire = JSON.parse(screen.getByTestId("wire").textContent!);
  expect(
    wire.pos[0].forms[0].regional_variants.common.pronunciations[0].style
  ).toBe("citation");
});
