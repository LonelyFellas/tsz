import { expect, it } from "vitest";
import type { AudioAssetV3, VoiceProfileV3 } from "@tsz/types";
import { withDefaultVoiceProfile } from "@tsz/voice-editor/core";
import { mergeSpellingSettings, spellingAudioLocales } from "./spellingSpeech";
import { pronunciationFixture } from "./fixtures";

const value = { version: 2 as const, text: "hello there", annotations: [] };

it("拼写任务聚合所有共享读法的活动口音并保留旧协议资产要求", () => {
  const first = pronunciationFixture({
    synthesis: {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      uk: { source: "none", ipa: "", ups: "" },
      us: { source: "spelling", ipa: "", ups: "" }
    }
  });
  const common = { dialect: "common" as const, pronunciations: [first] };
  expect(spellingAudioLocales([common])).toEqual(["en-US"]);
  const second = pronunciationFixture({
    synthesis: {
      ...first.synthesis!,
      uk: { source: "spelling", ipa: "", ups: "" }
    }
  });
  expect(
    spellingAudioLocales([{ ...common, pronunciations: [first, second] }])
  ).toEqual(["en-GB", "en-US"]);
  expect(spellingAudioLocales([{ ...common, dialect: "uk" }])).toEqual([]);
  expect(
    spellingAudioLocales([
      { dialect: "common", pronunciations: [pronunciationFixture()] }
    ])
  ).toBeUndefined();
});

it("修改未启用拼写的音色参数也清除对应旧音频，不影响另一侧", () => {
  const profile: VoiceProfileV3 = {
    voices: [
      {
        voice_id: "uk",
        locale: "en-GB",
        enabled: true,
        rate_percent: 0,
        audio_asset_id: "old-uk"
      },
      {
        voice_id: "us",
        locale: "en-US",
        enabled: true,
        rate_percent: 0,
        audio_asset_id: "kept-us"
      }
    ]
  };
  const merged = mergeSpellingSettings(
    { value, voiceProfile: profile },
    { value, voiceProfile: profile },
    {
      value,
      voiceProfile: {
        voices: profile.voices.map((voice) =>
          voice.locale === "en-GB" ? { ...voice, rate_percent: -20 } : voice
        )
      }
    },
    "uk"
  );
  expect(
    merged.voiceProfile?.voices.find((voice) => voice.locale === "en-GB")
  ).toMatchObject({ rate_percent: -20 });
  expect(
    merged.voiceProfile?.voices.find((voice) => voice.locale === "en-GB")
      ?.audio_asset_id
  ).toBeUndefined();
  expect(
    merged.voiceProfile?.voices.find((voice) => voice.locale === "en-US")
      ?.audio_asset_id
  ).toBe("kept-us");
});
const asset = (id: string, locale: "en-GB" | "en-US"): AudioAssetV3 => ({
  id,
  locale,
  gender: "female",
  content_type: "audio/mpeg",
  size_bytes: 10,
  original_name: `${id}.mp3`,
  created_at: "2026-11-13T00:00:00Z"
});
it("旧本地音色首次保存单侧设置时不把另一侧改成默认继承", () => {
  const profile: VoiceProfileV3 = {
    voices: [
      { voice_id: "uk", locale: "en-GB", enabled: true, rate_percent: -10 },
      {
        voice_id: "us",
        locale: "en-US",
        enabled: true,
        rate_percent: -5,
        audio_asset_id: "saved-us"
      }
    ]
  };
  const merged = mergeSpellingSettings(
    { value, voiceProfile: profile },
    { value, voiceProfile: profile },
    {
      value,
      voiceProfile: {
        voices: [
          profile.voices[1]!,
          { ...profile.voices[0]!, rate_percent: -15 }
        ],
        dubbing: {
          area: "word",
          uk: { mode: "local" },
          us: { mode: "local" }
        }
      }
    },
    "uk"
  );
  expect(merged.voiceProfile?.dubbing?.us.mode).toBe("local");
  expect(
    merged.voiceProfile?.voices.find((voice) => voice.locale === "en-US")
  ).toEqual(profile.voices[1]);
});
it("未修改配置不物化继承，保留打开后回写的音色和录音", () => {
  const latestProfile: VoiceProfileV3 = {
    voices: [
      { voice_id: "us", locale: "en-US", enabled: true, rate_percent: 20 }
    ]
  };
  const recording = asset("concurrent-us", "en-US");
  const merged = mergeSpellingSettings(
    { value, voiceProfile: latestProfile, audioAssets: [recording] },
    { value },
    {
      value,
      voiceProfile: withDefaultVoiceProfile(undefined, "word"),
      audioAssets: []
    },
    "uk"
  );
  expect(merged.voiceProfile).toBe(latestProfile);
  expect(merged.audioAssets).toEqual([recording]);
  expect(
    mergeSpellingSettings(
      { value },
      { value },
      { value, voiceProfile: withDefaultVoiceProfile(undefined, "word") },
      "uk"
    ).voiceProfile
  ).toBeUndefined();
});
it("当前口音录音精确替换，另一口音的并发录音及音色保持最新", () => {
  const initialAssets = [asset("old-uk", "en-GB"), asset("old-us", "en-US")];
  const latestAssets = [initialAssets[0]!, asset("concurrent-us", "en-US")];
  const newUk = asset("new-uk", "en-GB");
  const profile: VoiceProfileV3 = {
    voices: [
      { voice_id: "uk", locale: "en-GB", enabled: true, rate_percent: 0 },
      { voice_id: "us", locale: "en-US", enabled: true, rate_percent: 30 }
    ]
  };
  const merged = mergeSpellingSettings(
    { value, voiceProfile: profile, audioAssets: latestAssets },
    { value, voiceProfile: profile, audioAssets: initialAssets },
    { value, voiceProfile: profile, audioAssets: [newUk, initialAssets[1]!] },
    "uk"
  );
  expect(merged.audioAssets).toEqual([latestAssets[1], newUk]);
  expect(merged.voiceProfile).toBe(profile);
});
