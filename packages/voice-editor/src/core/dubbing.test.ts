import { describe, expect, it } from "vitest";
import type { VoiceOption, VoiceProfile, VoiceRecommendation } from "../types";
import {
  localVoiceProfile,
  recommendationVoiceSetting,
  retainResolvedAudio,
  resolveRecommendedVoices
} from "./dubbing";

const voices: VoiceOption[] = [
  {
    id: "sonia",
    label: "Sonia",
    locale: "en-GB",
    accent: "gb",
    styles: [],
    gender: "neutral",
    supportsRate: true,
    supportsPitch: true,
    isDefault: false,
    rateRange: { min: -50, max: 70 }
  },
  {
    id: "guy",
    label: "Guy",
    locale: "en-US",
    accent: "us",
    styles: [],
    gender: "neutral",
    supportsRate: true,
    supportsPitch: true,
    isDefault: false,
    rateRange: { min: -50, max: 70 }
  }
];
const recommendations: VoiceRecommendation[] = [
  {
    id: "first",
    name: "first",
    locale: "en-GB",
    groupName: "group",
    setting: { voice_id: "sonia", enabled: true, rate_percent: 0 }
  },
  {
    id: "second",
    name: "second",
    locale: "en-GB",
    groupName: "group",
    setting: { voice_id: "sonia", enabled: true, rate_percent: -27 }
  }
];
describe("文本配音模式", () => {
  it("普通英美推荐也保存稳定的完整版本身份", () => {
    expect(recommendationVoiceSetting(recommendations[0]!, voices)).toEqual({
      voice_id: "sonia",
      enabled: true,
      rate_percent: 0,
      version_id: "first",
      version_name: "first",
      locale: "en-GB"
    });
  });
  it("重新解析只保留同版本且实际参数未变化的正式音频", () => {
    const setting = recommendationVoiceSetting(recommendations[0]!, voices);
    const stored = { ...setting, audio_asset_id: "audio" };
    expect(
      retainResolvedAudio([{ ...setting, version_name: "renamed" }], [stored])
    ).toEqual([{ ...stored, version_name: "renamed" }]);
    expect(
      retainResolvedAudio([{ ...setting, rate_percent: -27 }], [stored])[0]
    ).not.toHaveProperty("audio_asset_id");
    expect(
      retainResolvedAudio([{ ...setting, version_id: "other" }], [stored])[0]
    ).not.toHaveProperty("audio_asset_id");
    expect(
      retainResolvedAudio([{ ...setting, volume_percent: 100 }], [stored])[0]
    ).toHaveProperty("audio_asset_id", "audio");
  });
  it("历史快照不靠参数相等转继承，显式继承才读取推荐顺序", () => {
    const old = {
      voices: [{ voice_id: "sonia", enabled: true, rate_percent: 0 }]
    };
    expect(resolveRecommendedVoices(old, recommendations, voices)).toBe(
      old.voices
    );
    const inherited: VoiceProfile = {
      voices: [],
      dubbing: {
        mode: "inherit",
        area: "word",
        recommendation_order: ["second", "first"]
      }
    };
    expect(
      resolveRecommendedVoices(inherited, recommendations, voices, "en-GB").map(
        (setting) => setting.version_id
      )
    ).toEqual(["second", "first"]);
  });
  it("局部多版本优先，完整参数复制并保留稳定版本ID", () => {
    const local = localVoiceProfile(
      [
        { voice_id: "sonia", enabled: true, rate_percent: -27 },
        {
          voice_id: "sonia",
          version_id: "retained",
          version_name: "named",
          locale: "en-GB",
          enabled: true,
          rate_percent: 0
        }
      ],
      voices,
      "word"
    );
    expect(local.dubbing?.mode).toBe("local");
    expect(local.voices[0]).toMatchObject({
      version_id: expect.any(String),
      locale: "en-GB",
      rate_percent: -27
    });
    expect(local.voices[1]!.version_id).toBe("retained");
    expect(
      resolveRecommendedVoices(local, recommendations, voices, "en-GB")
    ).toEqual(local.voices);
  });
});
