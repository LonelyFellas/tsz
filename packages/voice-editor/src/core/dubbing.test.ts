import { describe, expect, it } from "vitest";
import { isVoiceRecommendationAvailable } from "./voice-recommendations";
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
  it("已保存版本按人工口音参与候选，原生地区保留且不决定英美侧", () => {
    const reassigned = [{ ...voices[1]!, accent: "gb" as const }];
    const setting = {
      voice_id: "guy",
      enabled: true,
      rate_percent: 0,
      locale: "en-US" as const
    };
    const item = {
      id: "reassigned",
      name: "reassigned",
      locale: "en-US" as const,
      groupName: "",
      setting
    };
    expect(isVoiceRecommendationAvailable(item, reassigned, "en-GB")).toBe(
      true
    );
    expect(isVoiceRecommendationAvailable(item, reassigned, "en-US")).toBe(
      false
    );
  });
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
  it("历史快照不靠参数相等转继承，继承取当前组优先级首项而非旧顺序", () => {
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
    ).toEqual(["first"]);
  });
  it("逐组跳过失效项，适用组耗尽才回退全局，继承不补目录声音", () => {
    const profile: VoiceProfile = {
      voices: [],
      dubbing: { mode: "inherit", area: "word" }
    };
    const items = [
      {
        ...recommendations[0]!,
        id: "invalid",
        groupName: "A",
        setting: { voice_id: "missing", enabled: true, rate_percent: 0 }
      },
      { ...recommendations[1]!, groupName: "B" },
      { ...recommendations[0]!, id: "global", groupName: "全局常用" }
    ];
    expect(
      resolveRecommendedVoices(profile, items, voices, "en-GB").map(
        (item) => item.version_id
      )
    ).toEqual(["second"]);
    expect(
      resolveRecommendedVoices(
        profile,
        [items[0]!, items[2]!],
        voices,
        "en-GB"
      ).map((item) => item.version_id)
    ).toEqual(["global"]);
    expect(
      resolveRecommendedVoices(profile, [items[0]!], voices, "en-GB")
    ).toEqual([]);
    const oldLocal = {
      ...profile,
      dubbing: { ...profile.dubbing!, mode: "local" as const }
    };
    expect(
      resolveRecommendedVoices(oldLocal, [], voices, "en-GB")
    ).toHaveLength(1);
  });
  it("按实际标记跳过原生地区或模型能力不符项，保留指定发音", () => {
    const profile: VoiceProfile = {
      voices: [],
      dubbing: { mode: "inherit", area: "word" }
    };
    const marked = {
      version: 2 as const,
      text: "cat",
      annotations: [
        {
          type: "phoneme" as const,
          start: 0,
          end: 3,
          alphabet: "ipa" as const,
          phoneme: "kæt"
        }
      ]
    };
    const options = [
      { ...voices[0]!, id: "native", locale: "en-SG" },
      { ...voices[0]!, id: "unsupported", supportsPhoneme: false },
      ...voices
    ];
    const items = ["native", "unsupported", "sonia"].map((voice_id, index) => ({
      ...recommendations[0]!,
      id: String(index),
      setting: { voice_id, rate_percent: 0, enabled: true }
    }));
    expect(
      resolveRecommendedVoices(profile, items, options, "en-GB", marked).map(
        (item) => item.voice_id
      )
    ).toEqual(["sonia"]);
    expect(marked.annotations[0]!.phoneme).toBe("kæt");
    expect(
      resolveRecommendedVoices(profile, items, options, "en-GB")[0]!.voice_id
    ).toBe("native");
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
