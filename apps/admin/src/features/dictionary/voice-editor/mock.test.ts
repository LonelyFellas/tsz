import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockAudioUploadAdapter,
  createMockVoicePreviewAdapter,
  MOCK_VOICES
} from "./mock";

beforeEach(() => vi.stubEnv("VITE_LOCAL_SPEECH_MOCK", undefined));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const REQUEST = {
  language: "en",
  content: { version: 2 as const, text: "hello", annotations: [] },
  voiceId: "en-GB-Sonia"
};

describe("mock voice preview adapter", () => {
  it("lists cloned English voices and rejects an aborted listing", async () => {
    const adapter = createMockVoicePreviewAdapter();
    const voices = await adapter.listVoices({ language: "en" });

    expect(voices).toEqual(MOCK_VOICES);
    expect(voices[0]).not.toBe(MOCK_VOICES[0]);
    expect(voices[0]!.styles).not.toBe(MOCK_VOICES[0]!.styles);
    expect(
      new Set(voices.map((voice) => `${voice.locale}:${voice.gender}`))
    ).toEqual(
      new Set(["en-GB:female", "en-GB:male", "en-US:female", "en-US:male"])
    );
    expect(voices.some((voice) => voice.styles.length > 0)).toBe(true);
    await expect(adapter.listVoices({ language: "zh" })).resolves.toEqual([]);

    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.listVoices({ language: "en", signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("synthesizes deterministic audio and marks the second request cached", async () => {
    const adapter = createMockVoicePreviewAdapter();

    const first = await adapter.synthesize(REQUEST);
    const second = await adapter.synthesize(REQUEST);

    expect(first).toMatchObject({
      cached: false,
      audioUrl: expect.stringMatching(/^data:audio\/wav;base64,/)
    });
    expect(Number.isFinite(Date.parse(first.expiresAt))).toBe(true);
    expect(second.cached).toBe(true);
  });

  it("rejects aborted and unknown-voice synthesis", async () => {
    const adapter = createMockVoicePreviewAdapter();
    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.synthesize(REQUEST, { signal: controller.signal })
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(
      adapter.synthesize({ ...REQUEST, voiceId: "missing" })
    ).rejects.toThrow("mock voice not found");
  });
});

describe("mock audio upload adapter", () => {
  it("fakes the three steps: reports progress, returns an asset carrying the chosen attribution, serves a silent url", async () => {
    const adapter = createMockAudioUploadAdapter();
    const onProgress = vi.fn();
    const asset = await adapter.upload({
      file: new File([new Uint8Array(3)], "a.mp3", { type: "audio/mpeg" }),
      locale: "en-US",
      gender: "male",
      onProgress
    });
    expect(onProgress.mock.calls.map(([ratio]) => ratio)).toEqual([0.4, 1]);
    expect(asset).toMatchObject({
      id: "mock-audio-1",
      locale: "en-US",
      gender: "male",
      content_type: "audio/mpeg",
      size_bytes: 3,
      original_name: "a.mp3"
    });
    expect(adapter.isStorageUnavailable?.()).toBe(false);
    const resolved = await adapter.resolveUrl(asset.id);
    expect(resolved.url.startsWith("data:audio/wav;base64,")).toBe(true);
    expect(Date.parse(resolved.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("rejects an aborted upload without producing an asset", async () => {
    const adapter = createMockAudioUploadAdapter();
    const controller = new AbortController();
    controller.abort();
    await expect(
      adapter.upload({
        file: new File([new Uint8Array(3)], "a.mp3", { type: "audio/mpeg" }),
        locale: "en-GB",
        gender: "female",
        signal: controller.signal
      })
    ).rejects.toMatchObject({ name: "AbortError" });
  });
});

it("本机演示返回可释放的音频，保留音色、语速与标注请求", async () => {
  vi.stubEnv("VITE_LOCAL_SPEECH_MOCK", "true");
  const blob = new Blob(["RIFF-demo"], { type: "audio/wav" });
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, blob: async () => blob });
  const revokeObjectURL = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn().mockReturnValue("blob:local-speech"),
    revokeObjectURL
  });
  const adapter = createMockVoicePreviewAdapter();
  const input = { ...REQUEST, ratePercent: -25 };
  const result = await adapter.synthesize(input);
  expect(fetcher).toHaveBeenCalledWith(
    "/__mock/voice-preview",
    expect.objectContaining({ method: "POST", body: JSON.stringify(input) })
  );
  expect(result.audioUrl).toBe("blob:local-speech");
  result.dispose?.();
  expect(revokeObjectURL).toHaveBeenCalledWith("blob:local-speech");
});
