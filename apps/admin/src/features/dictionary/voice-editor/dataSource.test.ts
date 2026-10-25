import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  env: { ADMIN_TTS_MOCK: false },
  profile: { id: "a", role: "super_admin", permissions: [] as string[] },
  voices: vi.fn(),
  preview: vi.fn(),
  groups: vi.fn(),
  library: vi.fn(),
  audioUrl: vi.fn(),
  audioCreateUpload: vi.fn(),
  audioConfirm: vi.fn()
}));

vi.mock("@/lib/env", () => ({ env: state.env }));
vi.mock("@/lib/auth", () => ({
  useAuthStore: { getState: () => ({ profile: state.profile }) },
  api: {
    speech: {
      voices: state.voices,
      preview: state.preview,
      groups: state.groups,
      library: state.library
    },
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
  state.profile = { id: "a", role: "super_admin", permissions: [] };
  state.env.ADMIN_TTS_MOCK = false;
  state.voices.mockReset();
  state.preview.mockReset();
  state.groups.mockReset().mockResolvedValue({ groups: [], revision: 0 });
  state.library.mockReset().mockResolvedValue({ items: [] });
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
  it.each([new Error("offline"), { status: 500 }])(
    "文本音色目录不依赖个人参数：%s",
    async (failure) => {
      state.library.mockRejectedValue(failure);
      const { adminVoicePreviewAdapter } = await import("./dataSource");
      const voices = await adminVoicePreviewAdapter.listVoices({
        language: "en"
      });
      expect(voices).toHaveLength(1);
      expect(voices[0]).toMatchObject({ id: "real-voice" });
      expect(state.library).not.toHaveBeenCalled();
      expect(voices[0]?.defaultSettings).toBeUndefined();
      await adminVoicePreviewAdapter.synthesize({
        language: "en",
        content: CONTENT,
        voiceId: "real-voice",
        ratePercent: 0,
        pitchSemitones: 0
      });
      expect(state.preview).toHaveBeenCalled();
    }
  );
  it("分组按账号共享缓存，选择音色不带入历史个人参数", async () => {
    state.library.mockResolvedValue({
      items: [
        {
          voice_alias: "real-voice",
          parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
        }
      ]
    });
    const { loadAdminVoiceRecommendations, adminVoicePreviewAdapter } =
      await import("./dataSource");
    await loadAdminVoiceRecommendations({ area: "word" });
    await loadAdminVoiceRecommendations({ area: "meaning" });
    expect(state.groups).toHaveBeenCalledTimes(1);
    const voices = await adminVoicePreviewAdapter.listVoices({
      language: "en"
    });
    expect(voices[0]?.defaultSettings).toBeUndefined();
    await adminVoicePreviewAdapter.listVoices({ language: "en" });
    expect(state.library).not.toHaveBeenCalled();
    state.profile = { ...state.profile, id: "another" };
    await loadAdminVoiceRecommendations({ area: "word" });
    await adminVoicePreviewAdapter.listVoices({ language: "en" });
    expect(state.groups).toHaveBeenCalledTimes(2);
    expect(state.library).not.toHaveBeenCalled();
  });

  it("推荐按板块和口音加载，并复制完整声音参数", async () => {
    state.groups.mockResolvedValue({
      revision: 1,
      groups: [
        {
          id: "g",
          name: "释义",
          areas: ["meaning"],
          uk: [
            {
              id: "uk-rec",
              name: "慢读",
              voice_alias: "sonia",
              parameters: {
                rate_percent: -25,
                pitch_semitones: 2,
                volume_percent: 65,
                style: "cheerful"
              }
            }
          ],
          us: [
            {
              id: "us-rec",
              name: "美式",
              voice_alias: "guy",
              parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
            }
          ]
        }
      ]
    });
    const { loadAdminVoiceRecommendations } = await import("./dataSource");
    const result = await loadAdminVoiceRecommendations({
      area: "meaning",
      locale: "en-GB"
    });
    expect(result).toEqual([
      {
        id: "uk-rec",
        name: "慢读",
        locale: "en-GB",
        groupName: "释义",
        setting: {
          voice_id: "sonia",
          enabled: true,
          rate_percent: -25,
          pitch_semitones: 2,
          volume_percent: 65,
          style: "cheerful"
        }
      }
    ]);
    expect(await loadAdminVoiceRecommendations({ area: "grammar" })).toEqual(
      []
    );
  });
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

  it("生成与上传在实际请求前检查各自权限，读取能力不自动消耗服务", async () => {
    state.profile = { id: "a", role: "admin", permissions: ["words.access"] };
    const { adminVoicePreviewAdapter, adminAudioUploadAdapter } =
      await import("./dataSource");
    await adminVoicePreviewAdapter.listVoices({ language: "en" });
    await expect(
      adminVoicePreviewAdapter.synthesize({
        language: "en",
        content: CONTENT,
        voiceId: "real-voice"
      })
    ).rejects.toThrow("没有生成语音的权限");
    await expect(
      adminAudioUploadAdapter.upload({
        file: new File([new Uint8Array(3)], "a.mp3", { type: "audio/mpeg" }),
        locale: "en-GB",
        gender: "female"
      })
    ).rejects.toThrow("没有上传音频的权限");
    expect(state.preview).not.toHaveBeenCalled();
    expect(state.audioCreateUpload).not.toHaveBeenCalled();
    expect(state.audioConfirm).not.toHaveBeenCalled();
  });

  it("词条编辑和语音合成均不隐含上传权限，额外授予后才可上传", async () => {
    vi.stubEnv("PROD", false);
    state.env.ADMIN_TTS_MOCK = true;
    state.profile = {
      id: "a",
      role: "admin",
      permissions: ["words.access", "words.edit", "speech.generate"]
    };
    const { adminAudioUploadAdapter } = await import("./dataSource");
    const input = {
      file: new File([new Uint8Array(3)], "a.mp3", { type: "audio/mpeg" }),
      locale: "en-GB" as const,
      gender: "female" as const
    };
    await expect(adminAudioUploadAdapter.upload(input)).rejects.toThrow(
      "没有上传音频的权限"
    );
    state.profile.permissions.push("speech.upload_audio");
    await expect(adminAudioUploadAdapter.upload(input)).resolves.toMatchObject({
      original_name: "a.mp3"
    });
    state.profile.permissions = ["speech.upload_audio", "words.access"];
    await expect(adminAudioUploadAdapter.upload(input)).rejects.toThrow(
      "没有上传音频的权限"
    );
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
