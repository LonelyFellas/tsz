import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { VoiceEditorProps } from "@tsz/voice-editor/types";
import { formsFixture, commonFormFixture } from "../fixtures";
import { toFormsWire } from "../model";
import { V3PronunciationList } from "./V3PronunciationList";

vi.mock("@/lib/env", () => ({ env: { VOICE_EDITOR: true } }));
vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: {},
  adminAudioUploadAdapter: {},
  voicePreviewIsMock: false
}));
vi.mock("../../word-creation/PronunciationPreview", () => ({
  PronunciationPreviewControls: () => <button>最终读音</button>
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
            voice_ids: ["british-voice"],
            rate_percent: -10
          })
        }
      >
        配置音色
      </button>
    </div>
  )
}));

function Harness() {
  const [content, setContent] = useState(() =>
    formsFixture({ forms: [commonFormFixture()] })
  );
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

describe("字典音标发音编辑器", () => {
  it("保存标注与音色配置，关闭重开保留数据，其他发音行独立", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByLabelText("在第 1 条后新增发音"));
    fireEvent.click(screen.getByLabelText("打开第 1 条发音的字典音标编辑器"));
    fireEvent.click(await screen.findByText("标注音标"));
    fireEvent.click(screen.getByText("配置音色"));
    fireEvent.click(screen.getByText("保存录音"));
    fireEvent.click(screen.getByLabelText("完成第 1 条发音的字典音标编辑"));
    const wire = JSON.parse(screen.getByTestId("wire").textContent!);
    const rows = wire.pos[0].forms[0].regional_variants.common.pronunciations;
    expect(rows[0].dict_phonetic_rich.text).toBe(rows[0].dict_phonetic);
    expect(rows[0].dict_phonetic_rich.annotations).toEqual([
      { type: "highlight", start: 0, end: 1, color: "yellow" }
    ]);
    expect(rows[0].voice_profile).toEqual({
      voice_ids: ["british-voice"],
      rate_percent: -10
    });
    expect(rows[0].audio_assets[0].original_name).toBe("test.mp3");
    expect(rows[1].audio_assets).toBeUndefined();
    expect(rows[1].dict_phonetic_rich).toBeUndefined();
    expect(rows[1].voice_profile).toBeUndefined();
    fireEvent.click(screen.getByLabelText("打开第 1 条发音的字典音标编辑器"));
    await waitFor(() =>
      expect(screen.getByTestId("editor-content")).toHaveTextContent(
        '"type":"highlight"'
      )
    );
  });
});
