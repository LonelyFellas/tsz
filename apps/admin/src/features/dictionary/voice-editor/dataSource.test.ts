import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: { ADMIN_TTS_MOCK: false },
  voices: vi.fn(),
  preview: vi.fn()
}));

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/auth", () => ({
  api: { tts: { voices: state.voices, preview: state.preview } }
}));

const CONTENT = { version: 2 as const, text: "hello", annotations: [] };

function stubRealSource() {
  state.voices.mockResolvedValue({
    items: [
      {
        id: "real-voice",
        label: "Real Voice",
        locale: "en-US",
        gender: "neutral",
        styles: [],
        supports_rate: false,
        supports_pitch: false,
        is_default: true
      }
    ]
  });
  state.preview.mockResolvedValue({
    audio_url: "https://example.test/preview.wav",
    expires_at: "2026-08-09T10:00:00Z",
    cached: false,
    ssml: "<speak/>"
  });
}

beforeEach(() => {
  state.env.ADMIN_TTS_MOCK = false;
  state.voices.mockReset();
  state.preview.mockReset();
  stubRealSource();
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("admin voice preview data source", () => {
  it("delegates both methods to the real API when mock is disabled", async () => {
    vi.stubEnv("PROD", false);
    const { adminVoicePreviewAdapter } = await import("./dataSource");
    const controller = new AbortController();

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
    expect(state.voices).toHaveBeenCalledWith("en", controller.signal);
    expect(state.preview).toHaveBeenCalledWith(
      { language: "en", content: CONTENT, voice_id: "real-voice" },
      controller.signal
    );
  });

  it("loads and memoizes the development mock adapter", async () => {
    vi.stubEnv("PROD", false);
    state.env.ADMIN_TTS_MOCK = true;
    const { adminVoicePreviewAdapter } = await import("./dataSource");

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

  it("forces the real adapter in production even when the mock flag is true", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("MODE", "production");
    state.env.ADMIN_TTS_MOCK = true;
    const { adminVoicePreviewAdapter } = await import("./dataSource");

    await adminVoicePreviewAdapter.listVoices({ language: "en" });

    expect(state.voices).toHaveBeenCalledOnce();
  });
});
