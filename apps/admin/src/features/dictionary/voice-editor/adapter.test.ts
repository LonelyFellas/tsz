import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { VoicePreviewError } from "@tsz/voice-editor";
import {
  createAdminVoicePreviewAdapter,
  type AdminTtsDataSource
} from "./adapter";

const CONTENT = { version: 2 as const, text: "hello", annotations: [] };

function source(): AdminTtsDataSource {
  return {
    voices: vi.fn().mockResolvedValue({
      items: [
        {
          id: "ava",
          label: "Ava",
          locale: "en-US",
          gender: "female",
          styles: ["cheerful"],
          supports_rate: true,
          supports_pitch: false,
          is_default: true
        }
      ]
    }),
    preview: vi.fn().mockResolvedValue({
      audio_url: "blob:audio",
      expires_at: "2026-08-09T10:00:00Z",
      cached: true,
      ssml: "<speak/>"
    })
  };
}

describe("admin voice preview adapter", () => {
  it("maps voice and preview wire fields in both directions with AbortSignal", async () => {
    const dataSource = source();
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    const controller = new AbortController();

    await expect(
      adapter.listVoices({ language: "en", signal: controller.signal })
    ).resolves.toEqual([
      {
        id: "ava",
        label: "Ava",
        locale: "en-US",
        gender: "female",
        styles: ["cheerful"],
        supportsRate: true,
        supportsPitch: false,
        isDefault: true
      }
    ]);
    await expect(
      adapter.synthesize(
        {
          language: "en",
          content: CONTENT,
          voiceId: "ava",
          style: "cheerful",
          ratePercent: 5,
          pitchSemitones: -1
        },
        { signal: controller.signal }
      )
    ).resolves.toEqual({
      audioUrl: "blob:audio",
      expiresAt: "2026-08-09T10:00:00Z",
      cached: true,
      ssml: "<speak/>"
    });
    expect(dataSource.voices).toHaveBeenCalledWith("en", controller.signal);
    expect(dataSource.preview).toHaveBeenCalledWith(
      {
        language: "en",
        content: CONTENT,
        voice_id: "ava",
        style: "cheerful",
        rate_percent: 5,
        pitch_semitones: -1
      },
      controller.signal
    );
  });

  it("rejects unsupported language before a preview request", async () => {
    const dataSource = source();
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    await expect(
      adapter.synthesize({ language: "zh", content: CONTENT, voiceId: "ava" })
    ).rejects.toMatchObject({ code: "invalid_content" });
    await expect(adapter.listVoices({ language: "zh" })).resolves.toEqual([]);
    expect(dataSource.preview).not.toHaveBeenCalled();
  });

  it.each([
    [404, undefined, "voice_not_found"],
    [400, "tts_voice_not_found", "voice_not_found"],
    [429, undefined, "rate_limited"],
    [400, "tts_rate_limited", "rate_limited"],
    [429, "quota_exceeded", "quota_exceeded"],
    [400, "tts_quota_exceeded", "quota_exceeded"],
    [503, undefined, "unavailable"],
    [400, "tts_unavailable", "unavailable"],
    [400, "option_not_supported", "option_not_supported"],
    [422, "tts_option_not_supported", "option_not_supported"],
    [400, "invalid_speech_markup", "invalid_content"],
    [422, undefined, "invalid_content"],
    [418, undefined, "unknown"]
  ] as const)("maps HTTP %s/%s to %s", async (status, code, expected) => {
    const dataSource = source();
    vi.mocked(dataSource.preview).mockRejectedValue(
      new HttpError(status, "failed", [], code)
    );
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    const error = await adapter
      .synthesize({ language: "en", content: CONTENT, voiceId: "ava" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VoicePreviewError);
    expect(error).toMatchObject({ code: expected, message: "failed" });
  });

  it("maps list errors and preserves non-HTTP errors", async () => {
    const dataSource = source();
    vi.mocked(dataSource.voices).mockRejectedValueOnce(
      new HttpError(503, "down")
    );
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    await expect(adapter.listVoices({ language: "en" })).rejects.toMatchObject({
      code: "unavailable"
    });
    vi.mocked(dataSource.voices).mockRejectedValueOnce(
      new DOMException("stop", "AbortError")
    );
    await expect(adapter.listVoices({ language: "en" })).rejects.toMatchObject({
      name: "AbortError"
    });
  });

  it("preserves non-HTTP preview errors", async () => {
    const dataSource = source();
    const failure = new DOMException("stop", "AbortError");
    vi.mocked(dataSource.preview).mockRejectedValueOnce(failure);
    const adapter = createAdminVoicePreviewAdapter(dataSource);

    await expect(
      adapter.synthesize({ language: "en", content: CONTENT, voiceId: "ava" })
    ).rejects.toBe(failure);
  });
});
