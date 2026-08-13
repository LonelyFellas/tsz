import { describe, expect, it } from "vitest";
import { createMockVoicePreviewAdapter, MOCK_VOICES } from "./mock";

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
