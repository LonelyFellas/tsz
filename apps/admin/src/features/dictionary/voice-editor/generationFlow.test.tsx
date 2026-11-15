import { useState } from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createAdminEndpoints, createHttpClient } from "@tsz/api-client";
import type { RichTextV2 } from "@tsz/types";
import { App } from "@tsz/ui/admin/overlays";
import { VoiceEditor } from "@tsz/voice-editor/editor";
import type {
  VoicePreviewAdapter,
  VoiceProfile
} from "@tsz/voice-editor/types";

afterEach(() => vi.unstubAllGlobals());

it("语法正文连续输入后生成最新音频，恢复完成按钮并只保存最新结果", async () => {
  let finish!: () => void;
  let running = false;
  const requests: string[] = [];
  const fetchAudio = vi.fn((_url: string, options: RequestInit) => {
    const { source } = JSON.parse(options.body as string);
    requests.push(source.content.text);
    if (running)
      return Promise.resolve(
        Response.json(
          {
            code: "speech_preview_in_progress",
            message: "音频正在生成，请稍后重试"
          },
          { status: 409 }
        )
      );
    running = true;
    return new Promise<Response>((resolve, reject) => {
      options.signal?.addEventListener(
        "abort",
        () => reject(options.signal?.reason),
        { once: true }
      );
      finish = () => {
        running = false;
        resolve(
          Response.json(
            {
              asset: {
                id: `audio-${source.content.text}`,
                locale: "en-GB",
                gender: "female",
                content_type: "audio/mpeg",
                size_bytes: 128,
                original_name: "generated.mp3",
                created_at: "2026-11-15T00:00:00Z"
              }
            },
            { status: 201 }
          )
        );
      };
    });
  });
  vi.stubGlobal("fetch", fetchAudio);
  const api = createAdminEndpoints(
    createHttpClient({ baseUrl: "/api/v1/admin" })
  );
  const preview: VoicePreviewAdapter = {
    listVoices: async () => [
      {
        id: "sonia",
        label: "Sonia",
        locale: "en-GB",
        gender: "female",
        styles: [],
        supportsRate: true,
        supportsPitch: true,
        isDefault: true
      }
    ],
    synthesize: vi.fn(),
    generateAudio: async (input, options) =>
      (
        await api.speech.generateAudio(
          {
            request_id: input.requestId,
            source: { kind: "text", content: input.content },
            setting: input.setting
          },
          options?.signal
        )
      ).asset
  };
  const saved = vi.fn();
  function GrammarDraft() {
    const [value, setValue] = useState<RichTextV2>({
      version: 2,
      text: "h",
      annotations: []
    });
    const [profile, setProfile] = useState<VoiceProfile>({
      voices: [
        {
          voice_id: "sonia",
          enabled: true,
          rate_percent: 0,
          version_id: "sonia-version",
          locale: "en-GB"
        }
      ]
    });
    return (
      <VoiceEditor
        mode="grammar"
        locale="en-GB"
        value={value}
        onChange={setValue}
        voiceProfile={profile}
        onVoiceProfileChange={setProfile}
        previewAdapter={preview}
        renderActions={(ready, _prepare, capture) => (
          <button disabled={!ready} onClick={() => saved(capture?.(true))}>
            完成
          </button>
        )}
      />
    );
  }
  render(
    <App>
      <GrammarDraft />
    </App>
  );
  await waitFor(() => expect(requests).toEqual(["h"]));
  expect(screen.getByRole("button", { name: "完成" })).toBeDisabled();
  fireEvent.change(screen.getByRole("textbox", { name: "语音编辑器" }), {
    target: { value: "hh" }
  });
  await act(async () => {});
  fireEvent.change(screen.getByRole("textbox", { name: "语音编辑器" }), {
    target: { value: "hha" }
  });
  await act(async () => {});
  await act(async () => finish());
  await waitFor(() => expect(requests).toEqual(["h", "hha"]));
  expect(screen.getByRole("button", { name: "完成" })).toBeDisabled();
  await act(async () => finish());
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成" })).toBeEnabled()
  );
  expect(
    screen.queryByText("音频正在生成，请稍后重试")
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  expect(saved).toHaveBeenCalledWith(
    expect.objectContaining({
      value: expect.objectContaining({ text: "hha" }),
      voiceProfile: expect.objectContaining({
        voices: [expect.objectContaining({ audio_asset_id: "audio-hha" })]
      })
    })
  );
});
