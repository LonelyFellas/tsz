import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RichTextV3 } from "@tsz/types";
import type { AudioUploadAdapter } from "@tsz/voice-editor/types";

const state = vi.hoisted(() => ({
  flags: { VOICE_EDITOR: true, VOICE_PREVIEW: false, VOICE_AUDIO_UPLOAD: true },
  upload: vi.fn(),
  resolveUrl: vi.fn()
}));

vi.mock("@/lib/env", () => ({ env: state.flags }));
vi.mock("@/features/dictionary/voice-editor/dataSource", () => ({
  adminVoicePreviewAdapter: { listVoices: vi.fn(), synthesize: vi.fn() },
  voicePreviewIsMock: false,
  adminAudioUploadAdapter: {
    upload: (...args: Parameters<AudioUploadAdapter["upload"]>) =>
      state.upload(...args),
    resolveUrl: (...args: Parameters<AudioUploadAdapter["resolveUrl"]>) =>
      state.resolveUrl(...args)
  } satisfies AudioUploadAdapter
}));

import { V3VoiceTextField } from "./V3VoiceTextField";

const VALUE: RichTextV3 = { version: 2, text: "hello there", annotations: [] };

async function openAudioPanel() {
  // 编辑器是 lazy 代码块，整包并行跑时首次加载可能超过默认 1s
  await screen.findByRole(
    "toolbar",
    { name: "标注工具栏" },
    { timeout: 10_000 }
  );
  fireEvent.click(screen.getByRole("button", { name: "音频" }));
}

beforeEach(() => {
  state.flags.VOICE_AUDIO_UPLOAD = true;
  state.upload.mockReset();
  state.resolveUrl.mockReset();
});

describe("V3VoiceTextField 上传音频", () => {
  it("开关开着时注入适配器：上传成功后把资产原样（wire 形状）抛到 audio_assets", async () => {
    state.upload.mockImplementation(async ({ file, locale, gender }) => ({
      id: "asset-1",
      locale,
      gender,
      content_type: file.type,
      size_bytes: file.size,
      duration_ms: null,
      original_name: file.name,
      created_at: "2026-09-06T00:00:00Z"
    }));
    const onAudioAssetsChange = vi.fn();
    render(
      <V3VoiceTextField
        ariaLabel="语法结构 1 通用内容"
        field="content"
        nodeId="variant-1"
        onChange={vi.fn()}
        onAudioAssetsChange={onAudioAssetsChange}
        value={VALUE}
      />
    );
    await openAudioPanel();
    fireEvent.change(screen.getByLabelText("上传音频"), {
      target: {
        files: [new File([new Uint8Array(3)], "a.mp3", { type: "audio/mpeg" })]
      }
    });
    await waitFor(() => expect(onAudioAssetsChange).toHaveBeenCalledTimes(1));
    expect(onAudioAssetsChange).toHaveBeenCalledWith([
      {
        id: "asset-1",
        locale: "en-GB",
        gender: "female",
        content_type: "audio/mpeg",
        size_bytes: 3,
        duration_ms: null,
        original_name: "a.mp3",
        created_at: "2026-09-06T00:00:00Z"
      }
    ]);
  });

  it("已有的 audio_assets 原样列出来；开关关着时面板置灰但列表仍在", async () => {
    state.flags.VOICE_AUDIO_UPLOAD = false;
    render(
      <V3VoiceTextField
        ariaLabel="语法结构 1 通用内容"
        field="content"
        nodeId="variant-1"
        onChange={vi.fn()}
        audioAssets={[
          {
            id: "asset-9",
            locale: "en-US",
            gender: "male",
            content_type: "audio/mpeg",
            size_bytes: 3,
            original_name: "old.mp3",
            created_at: "2026-09-06T00:00:00Z"
          }
        ]}
        value={VALUE}
      />
    );
    await openAudioPanel();
    expect(screen.getByLabelText("试听 old.mp3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "选择音频文件" })).toBeDisabled();
    expect(screen.getByText("音频上传未启用")).toBeInTheDocument();
  });
});
