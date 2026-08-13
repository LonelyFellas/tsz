import { describe, expect, it, vi } from "vitest";
import { HttpError } from "@tsz/api-client";
import { VoicePreviewError } from "@tsz/voice-editor";
import {
  createAdminVoicePreviewAdapter,
  type AdminSpeechDataSource
} from "./adapter";

const CONTENT = { version: 2 as const, text: "hello", annotations: [] };

function source(): AdminSpeechDataSource {
  return {
    voices: vi.fn().mockResolvedValue({
      items: [
        {
          alias: "ava",
          locale: "en-US",
          gender: "female",
          capabilities: {
            styles: ["cheerful"],
            min_rate_percent: -10,
            max_rate_percent: 10,
            min_pitch_semitones: 0,
            max_pitch_semitones: 0
          }
        }
      ]
    }),
    preview: vi.fn().mockResolvedValue({
      audio_url: "blob:audio",
      expires_at: "2026-08-09T10:00:00Z",
      cache_status: "hit",
      url_expires_in_seconds: 300
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
        label: "ava · en-US",
        locale: "en-US",
        gender: "female",
        styles: ["cheerful"],
        supportsRate: true,
        supportsPitch: false,
        isDefault: true,
        rateRange: { min: -10, max: 10 },
        pitchRange: { min: 0, max: 0 }
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
          pitchSemitones: 0
        },
        { signal: controller.signal }
      )
    ).resolves.toEqual({
      audioUrl: "blob:audio",
      expiresAt: "2026-08-09T10:00:00Z",
      cached: true
    });
    expect(dataSource.voices).toHaveBeenCalledWith(controller.signal);
    expect(dataSource.preview).toHaveBeenCalledWith(
      {
        content: CONTENT,
        voice_alias: "ava",
        style: "cheerful",
        rate_percent: 5,
        pitch_semitones: 0
      },
      controller.signal
    );
  });

  it("rejects unsupported language before a preview request", async () => {
    const dataSource = source();
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    await adapter.listVoices({ language: "en" });
    await expect(
      adapter.synthesize({ language: "zh", content: CONTENT, voiceId: "ava" })
    ).rejects.toMatchObject({ code: "invalid_content" });
    await expect(adapter.listVoices({ language: "zh" })).resolves.toEqual([]);
    expect(dataSource.preview).not.toHaveBeenCalled();
  });

  it.each([
    [404, undefined, "voice_not_found"],
    [400, "speech_voice_not_found", "voice_not_found"],
    [429, undefined, "rate_limited"],
    [400, "speech_rate_limited", "rate_limited"],
    [503, undefined, "unavailable"],
    [400, "speech_provider_unavailable", "unavailable"],
    [400, "speech_storage_unavailable", "unavailable"],
    [409, "speech_preview_in_progress", "preview_in_progress"],
    [400, "invalid_speech_preview", "invalid_content"],
    [400, undefined, "invalid_content"],
    [418, undefined, "unknown"]
  ] as const)("maps HTTP %s/%s to %s", async (status, code, expected) => {
    const dataSource = source();
    vi.mocked(dataSource.preview).mockRejectedValue(
      new HttpError(status, "failed", [], code)
    );
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    await adapter.listVoices({ language: "en" });
    const error = await adapter
      .synthesize({ language: "en", content: CONTENT, voiceId: "ava" })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(VoicePreviewError);
    expect(error).toMatchObject({ code: expected });
    expect((error as VoicePreviewError).message).not.toContain("failed");
  });

  it.each([
    [{ voiceId: "missing" }, "voice_not_found"],
    [{ voiceId: "ava", style: "angry" }, "option_not_supported"],
    [{ voiceId: "ava", ratePercent: 11 }, "option_not_supported"],
    [{ voiceId: "ava", ratePercent: 0.5 }, "option_not_supported"],
    [{ voiceId: "ava", pitchSemitones: 1 }, "option_not_supported"],
    [{ voiceId: "ava", pitchSemitones: 0.5 }, "option_not_supported"]
  ] as const)(
    "rejects a request outside catalog capabilities: %o",
    async (settings, code) => {
      const dataSource = source();
      const adapter = createAdminVoicePreviewAdapter(dataSource);
      await adapter.listVoices({ language: "en" });
      await expect(
        adapter.synthesize({ language: "en", content: CONTENT, ...settings })
      ).rejects.toMatchObject({ code });
      expect(dataSource.preview).not.toHaveBeenCalled();
    }
  );

  it("selects explicit valid defaults when capability ranges exclude zero", async () => {
    const dataSource = source();
    vi.mocked(dataSource.voices).mockResolvedValueOnce({
      items: [
        {
          alias: "edge",
          locale: "en-US",
          gender: "neutral",
          capabilities: {
            styles: [],
            min_rate_percent: 12,
            max_rate_percent: 20,
            min_pitch_semitones: 3,
            max_pitch_semitones: 3
          }
        }
      ]
    });
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    await adapter.listVoices({ language: "en" });
    await adapter.synthesize({
      language: "en",
      content: CONTENT,
      voiceId: "edge"
    });
    expect(dataSource.preview).toHaveBeenCalledWith(
      {
        content: CONTENT,
        voice_alias: "edge",
        rate_percent: 12,
        pitch_semitones: 3
      },
      undefined
    );
  });

  it("retries speech_preview_in_progress with a strict upper bound", async () => {
    vi.useFakeTimers();
    const dataSource = source();
    vi.mocked(dataSource.preview).mockRejectedValue(
      new HttpError(409, "sensitive detail", [], "speech_preview_in_progress")
    );
    const adapter = createAdminVoicePreviewAdapter(dataSource);
    await adapter.listVoices({ language: "en" });
    const assertion = expect(
      adapter.synthesize({
        language: "en",
        content: CONTENT,
        voiceId: "ava"
      })
    ).rejects.toMatchObject({
      code: "preview_in_progress",
      retryable: true
    });
    await vi.runAllTimersAsync();
    await assertion;
    expect(dataSource.preview).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
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
    await adapter.listVoices({ language: "en" });

    await expect(
      adapter.synthesize({ language: "en", content: CONTENT, voiceId: "ava" })
    ).rejects.toBe(failure);
  });
});
