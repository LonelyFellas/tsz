import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: { ADMIN_TTS_MOCK: false },
  voices: vi.fn(),
  preview: vi.fn(),
  audioUrl: vi.fn(),
  audioCreateUpload: vi.fn(),
  audioConfirm: vi.fn()
}));

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/auth", () => ({
  api: {
    speech: { voices: state.voices, preview: state.preview },
    audioAssets: {
      createUpload: state.audioCreateUpload,
      confirm: state.audioConfirm,
      url: state.audioUrl
    }
  }
}));

const CONTENT = { version: 2 as const, text: "hello", annotations: [] };

function stubRealSource() {
  state.voices.mockResolvedValue({
    items: [
      {
        alias: "real-voice",
        locale: "en-US",
        gender: "neutral",
        capabilities: {
          styles: [],
          min_rate_percent: 0,
          max_rate_percent: 0,
          min_pitch_semitones: 0,
          max_pitch_semitones: 0
        }
      }
    ]
  });
  state.preview.mockResolvedValue({
    audio_url: "https://example.test/preview.wav",
    expires_at: "2026-08-09T10:00:00Z",
    cache_status: "generated",
    url_expires_in_seconds: 300
  });
}

beforeEach(() => {
  state.env.ADMIN_TTS_MOCK = false;
  state.voices.mockReset();
  state.preview.mockReset();
  state.audioUrl.mockReset().mockResolvedValue({
    url: "https://example.test/asset.mp3",
    expires_at: "2026-09-06T00:05:00Z",
    url_expires_in_seconds: 300
  });
  state.audioCreateUpload.mockReset();
  state.audioConfirm.mockReset();
  stubRealSource();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin voice preview data source", () => {
  it("delegates both methods to the real API when mock is disabled", async () => {
    vi.stubEnv("PROD", false);
    const { adminVoicePreviewAdapter, voicePreviewIsMock } =
      await import("./dataSource");
    const controller = new AbortController();

    expect(voicePreviewIsMock).toBe(false);

    await expect(
      adminVoicePreviewAdapter.listVoices({
        language: "en",
        signal: controller.signal
      })
    ).resolves.toEqual([
      expect.objectContaining({ id: "real-voice", supportsRate: false })
    ]);
    await expect(
      adminVoicePreviewAdapter.synthesize(
        { language: "en", content: CONTENT, voiceId: "real-voice" },
        { signal: controller.signal }
      )
    ).resolves.toMatchObject({
      audioUrl: "https://example.test/preview.wav",
      cached: false
    });
    expect(state.voices).toHaveBeenCalledWith(controller.signal);
    expect(state.preview).toHaveBeenCalledWith(
      {
        content: CONTENT,
        voice_alias: "real-voice",
        rate_percent: 0,
        pitch_semitones: 0
      },
      controller.signal
    );
  });

  it("loads and memoizes the development mock adapter", async () => {
    vi.stubEnv("PROD", false);
    state.env.ADMIN_TTS_MOCK = true;
    const { adminVoicePreviewAdapter, voicePreviewIsMock } =
      await import("./dataSource");

    expect(voicePreviewIsMock).toBe(true);
    const voices = await adminVoicePreviewAdapter.listVoices({
      language: "en"
    });
    const preview = await adminVoicePreviewAdapter.synthesize({
      language: "en",
      content: CONTENT,
      voiceId: voices[0]!.id
    });

    expect(voices[0]?.id).toBe("en-GB-Sonia");
    expect(preview.audioUrl).toMatch(/^data:audio\/wav;base64,/);
    expect(state.voices).not.toHaveBeenCalled();
    expect(state.preview).not.toHaveBeenCalled();
  });

  it("routes the audio upload adapter with the same mock switch: real API when off, in-memory mock when on", async () => {
    vi.stubEnv("PROD", false);
    const real = await import("./dataSource");
    await expect(
      real.adminAudioUploadAdapter.resolveUrl("asset-1")
    ).resolves.toEqual({
      url: "https://example.test/asset.mp3",
      expiresAt: "2026-09-06T00:05:00Z"
    });
    expect(state.audioUrl).toHaveBeenCalledWith("asset-1", undefined);

    vi.resetModules();
    state.env.ADMIN_TTS_MOCK = true;
    const mocked = await import("./dataSource");
    const asset = await mocked.adminAudioUploadAdapter.upload({
      file: new File([new Uint8Array(3)], "a.mp3", { type: "audio/mpeg" }),
      locale: "en-GB",
      gender: "female"
    });
    expect(asset).toMatchObject({ id: "mock-audio-1", original_name: "a.mp3" });
    expect(state.audioCreateUpload).not.toHaveBeenCalled();
    expect(state.audioConfirm).not.toHaveBeenCalled();
  });

  it("forces the real adapter in production even when the mock flag is true", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("MODE", "production");
    state.env.ADMIN_TTS_MOCK = true;
    const { adminVoicePreviewAdapter, voicePreviewIsMock } =
      await import("./dataSource");

    expect(voicePreviewIsMock).toBe(false);
    await adminVoicePreviewAdapter.listVoices({ language: "en" });

    expect(state.voices).toHaveBeenCalledOnce();
  });
});
