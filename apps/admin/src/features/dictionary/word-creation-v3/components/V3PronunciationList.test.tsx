import { env } from "@/lib/env";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { RichTextV2 } from "@tsz/types";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import { formsFixture, commonFormFixture } from "../fixtures";
import { toFormsWire } from "../model";
import { V3PronunciationList } from "./V3PronunciationList";

vi.mock("@/lib/env", () => ({
  env: { VOICE_EDITOR: true, AZURE_PRONUNCIATION_INPUTS: true }
}));
vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {},
  adminAudioUploadAdapter: {},
  voicePreviewIsMock: false
}));
vi.mock("../../word-creation/PronunciationPreview", () => ({
  PronunciationPreviewControls: ({
    content,
    ariaLabelPrefix
  }: {
    content: RichTextV2;
    ariaLabelPrefix: string;
  }) => (
    <button aria-label={ariaLabelPrefix} data-content={JSON.stringify(content)}>
      最终读音
    </button>
  )
}));
vi.mock("@tsz/voice-editor/editor", () => ({
  VoiceEditor: ({
    value,
    onChange,
    onVoiceProfileChange,
    onAudioAssetsChange
  }: VoiceEditorProps) => (
    <div>
      <button
        onClick={() =>
          onAudioAssetsChange?.([
            {
              id: "audio-local",
              locale: "en-GB",
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
      <span data-testid="editor-content">{JSON.stringify(value)}</span>
      <button
        onClick={() =>
          onChange({
            version: 2,
            text: value.text,
            annotations: [
              { type: "highlight", start: 0, end: 1, color: "yellow" }
            ]
          })
        }
      >
        标注音标
      </button>
      <button
        onClick={() =>
          onVoiceProfileChange?.({
            voices: [
              { voice_id: "british-voice", enabled: true, rate_percent: -10 }
            ]
          })
        }
      >
        配置音色
      </button>
    </div>
  )
}));

function Harness({ configured = false }: { configured?: boolean } = {}) {
  const [content, setContent] = useState(() => {
    const form = commonFormFixture();
    if (configured)
      form.regional_variants.common.pronunciations[0]!.synthesis = {
        alphabet: "ups",
        ipa: "kæt",
        ups: "K AE T"
      };
    return formsFixture({ forms: [form] });
  });
  const form = content.pos[0]!.forms[0]!;
  if (form.regional_variants.mode !== "common")
    throw new Error("common expected");
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

describe("独立发音输入", () => {
  it("正确组装拼写+UPS，保留共享音色、真人录音和另一行", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("在第 1 条后新增发音"));
    fireEvent.change(screen.getByLabelText("第 1 条发音的Azure IPA"), {
      target: { value: "kæt" }
    });
    fireEvent.change(screen.getByLabelText("第 1 条发音的Azure UPS"), {
      target: { value: "K AE T" }
    });
    fireEvent.click(screen.getAllByLabelText("Azure UPS")[0]!);
    fireEvent.click(
      screen.getByLabelText("第 1 条发音打开 Azure UPS 发音设置")
    );
    fireEvent.click(await screen.findByText("配置音色"));
    fireEvent.click(screen.getByText("保存录音"));
    const editor = JSON.parse(
      screen.getByTestId("editor-content").textContent!
    );
    expect(editor.text).not.toBe("K AE T");
    expect(editor.annotations).toEqual([
      {
        type: "phoneme",
        start: 0,
        end: Array.from(editor.text).length,
        alphabet: "ups",
        phoneme: "K AE T"
      }
    ]);
    fireEvent.click(screen.getByLabelText("收起设置"));
    const wire = JSON.parse(screen.getByTestId("wire").textContent!);
    const rows = wire.pos[0].forms[0].regional_variants.common.pronunciations;
    expect(rows[0].synthesis).toEqual({
      alphabet: "ups",
      ipa: "kæt",
      ups: "K AE T"
    });
    expect(rows[0].voice_profile.voices[0].voice_id).toBe("british-voice");
    expect(rows[0].audio_assets[0].original_name).toBe("test.mp3");
    expect(rows[1].synthesis).toBeUndefined();
    fireEvent.click(
      screen.getByLabelText("第 1 条发音打开 Azure UPS 发音设置")
    );
    await waitFor(() =>
      expect(screen.getByTestId("editor-content")).toHaveTextContent(
        '"alphabet":"ups"'
      )
    );
    expect(
      screen.queryByLabelText("打开第 1 条发音的字典音标编辑器")
    ).not.toBeInTheDocument();
  });
  it("两个转换都取字典，替换须确认且能撤销，不切换来源", async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText("第 1 条发音的字典音标"), {
      target: { value: "/kæt/" }
    });
    fireEvent.change(screen.getByLabelText("第 1 条发音的Azure IPA"), {
      target: { value: "human IPA" }
    });
    fireEvent.change(screen.getByLabelText("第 1 条发音的Azure UPS"), {
      target: { value: "H U M" }
    });
    fireEvent.click(screen.getByLabelText("第 1 条发音转换为 Azure UPS"));
    expect(await screen.findByText("K AE T")).toBeInTheDocument();
    fireEvent.click(screen.getByText(/取\s*消/));
    expect(screen.getByLabelText("第 1 条发音的Azure UPS")).toHaveValue(
      "H U M"
    );
    fireEvent.click(screen.getByLabelText("第 1 条发音转换为 Azure UPS"));
    fireEvent.click(screen.getByText("应用转换结果"));
    expect(screen.getByLabelText("第 1 条发音的Azure UPS")).toHaveValue(
      "K AE T"
    );
    expect(screen.getByLabelText("第 1 条发音的Azure IPA")).toHaveValue(
      "human IPA"
    );
    expect(screen.getByLabelText("Azure IPA")).toBeChecked();
    fireEvent.keyDown(screen.getByLabelText("第 1 条发音的Azure UPS"), {
      key: "z",
      ctrlKey: true
    });
    expect(screen.getByLabelText("第 1 条发音的Azure UPS")).toHaveValue(
      "H U M"
    );
    fireEvent.change(screen.getByLabelText("第 1 条发音的字典音标"), {
      target: { value: "/kæt?/" }
    });
    fireEvent.click(screen.getByLabelText("第 1 条发音转换为 Azure IPA"));
    expect(screen.getByText(/第 5 个字符/)).toBeInTheDocument();
    expect(screen.getByLabelText("第 1 条发音的Azure IPA")).toHaveValue(
      "human IPA"
    );
  });
});

it("关闭新入口仍保留音色录音入口，读取和保存已有 synthesis，不能编辑新字段", async () => {
  env.AZURE_PRONUNCIATION_INPUTS = false;
  try {
    render(<Harness configured />);
    expect(
      screen.queryByLabelText("第 1 条发音的Azure IPA")
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Azure UPS（当前来源）/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("第 1 条发音发音设置与真人录音"));
    fireEvent.click(await screen.findByText("保存录音"));
    fireEvent.click(screen.getByText("配置音色"));
    fireEvent.change(screen.getByLabelText("第 1 条发音的实际发音"), {
      target: { value: "actual" }
    });
    const wire = JSON.parse(screen.getByTestId("wire").textContent!);
    expect(
      wire.pos[0].forms[0].regional_variants.common.pronunciations[0].synthesis
    ).toEqual({ alphabet: "ups", ipa: "kæt", ups: "K AE T" });
    expect(
      wire.pos[0].forms[0].regional_variants.common.pronunciations[0]
        .audio_assets
    ).toHaveLength(1);
  } finally {
    env.AZURE_PRONUNCIATION_INPUTS = true;
  }
});

it("两行试听各自使用对应音素，切换来源保留内容", () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("第 1 条发音的Azure IPA"), {
    target: { value: "kæt" }
  });
  fireEvent.change(screen.getByLabelText("第 1 条发音的Azure UPS"), {
    target: { value: "K AE T" }
  });
  for (const alphabet of ["IPA", "UPS"]) {
    fireEvent.click(screen.getByLabelText(`Azure ${alphabet}`));
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
      expect(screen.getByLabelText(`第 1 条发音的Azure ${source}`)).toHaveValue(
        phoneme
      );
    }
  }
});

it("格式错误提示不会拼接成操作指令", async () => {
  render(<Harness />);
  fireEvent.change(screen.getByLabelText("第 1 条发音的Azure UPS"), {
    target: { value: "中文" }
  });
  fireEvent.click(screen.getByLabelText("Azure UPS"));
  fireEvent.click(screen.getByLabelText("第 1 条发音打开 Azure UPS 发音设置"));
  expect(
    await screen.findByText(
      "UPS 使用区分大小写、以空格分隔的 ASCII 音素。音色可先配置。"
    )
  ).toBeInTheDocument();
});
