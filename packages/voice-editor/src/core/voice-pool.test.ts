import { describe, expect, it } from "vitest";
import type {
  VoiceOption,
  VoiceProfile,
  VoiceRecommendation,
  VoiceSetting
} from "../types";
import {
  localVoicePool,
  effectiveVoiceSetting,
  providerVoiceKey,
  reorderPoolVoice,
  switchPoolRecommendation,
  togglePoolVoice,
  voicePoolConflicts,
  voicePoolProbabilities
} from "./voice-pool";
import { resolveRecommendedVoices } from "./dubbing";
const voices: VoiceOption[] = ["a", "b", "c", "d", "e"].map((id) => ({
  id,
  provider: "azure",
  providerVoiceId: `en-GB-${id}Neural`,
  label: id,
  locale: "en-GB",
  accent: "gb",
  gender: "female",
  styles: [],
  supportsRate: true,
  supportsPitch: true,
  supportsVolume: true,
  isDefault: false,
  rateRange: { min: -50, max: 100 }
}));
voices.push({
  ...voices[0]!,
  id: "us",
  locale: "en-US",
  accent: "us",
  providerVoiceId: "en-US-UsNeural"
});
const setting = (id: string, rate = 0): VoiceSetting => ({
  voice_id: id,
  enabled: true,
  rate_percent: rate,
  version_id: `${id}-version`,
  version_name: id,
  locale: id === "us" ? "en-US" : "en-GB"
});
const profile = (settings: VoiceSetting[]): VoiceProfile => ({
  voices: settings,
  dubbing: {
    area: "word" as const,
    uk: { mode: "local" },
    us: { mode: "local" }
  }
});
const rec = (id: string, name = "推荐"): VoiceRecommendation => ({
  id: `rec-${id}`,
  groupId: "group",
  groupName: "分组",
  name,
  locale: id === "us" ? "en-US" : "en-GB",
  setting: setting(id, -27)
});
const content = { version: 2 as const, text: "hello", annotations: [] };

describe("新版局部音色池", () => {
  it("官方身份按供应商和完整原始 ID 区分，alias 相同来源去重，不合并大小写或模型", () => {
    const options = [
      ...voices,
      { ...voices[0]!, id: "alias" },
      { ...voices[0]!, id: "case", providerVoiceId: "en-GB-ANeural" },
      {
        ...voices[0]!,
        id: "flash",
        providerVoiceId: `${voices[0]!.providerVoiceId}:DragonHDFlashLatestNeural`
      }
    ];
    expect(providerVoiceKey("a", options)).toBe(
      providerVoiceKey("alias", options)
    );
    expect(providerVoiceKey("a", options)).not.toBe(
      providerVoiceKey("case", options)
    );
    expect(providerVoiceKey("a", options)).not.toBe(
      providerVoiceKey("flash", options)
    );
    expect(
      voicePoolConflicts(
        [setting("a"), setting("alias"), setting("flash")],
        options
      )
    ).toHaveLength(1);
  });
  it("单侧推荐只替换本侧贡献，额外音色与另一侧不变，缓存参数保留", () => {
    const initial = profile([setting("b", -11)]);
    initial.dubbing!.us = { mode: "inherit" };
    const a = switchPoolRecommendation(
      initial,
      [rec("a")],
      voices,
      "uk"
    ).profile;
    expect(a.dubbing!.us).toEqual({ mode: "inherit" });
    const b = switchPoolRecommendation(a, [rec("b")], voices, "uk");
    expect(b.duplicates).toEqual(["b"]);
    expect(
      b.profile.voices
        .filter((item) => item.enabled)
        .map((item) => item.voice_id)
    ).toEqual(["b"]);
    expect(
      b.profile.voices.find((item) => item.voice_id === "b")!.rate_percent
    ).toBe(-11);
    expect(b.profile.dubbing!.uk.recommendations?.[0]).not.toHaveProperty(
      "contribution_id"
    );
    const none = switchPoolRecommendation(b.profile, [], voices, "uk").profile;
    expect(
      none.voices.filter((item) => item.enabled).map((item) => item.voice_id)
    ).toEqual(["b"]);
    expect(none.dubbing!.uk).toEqual({ mode: "local" });
    expect(none.dubbing!.us).toEqual({ mode: "inherit" });
  });
  it("不使用推荐只取消本侧原贡献，保留另一侧，本地空池绝不兜底", () => {
    const uk = switchPoolRecommendation(
      profile([]),
      [rec("a")],
      voices,
      "uk"
    ).profile;
    const both = switchPoolRecommendation(
      uk,
      [rec("us")],
      voices,
      "us"
    ).profile;
    const none = switchPoolRecommendation(both, [], voices, "uk").profile;
    expect(none.voices.find((item) => item.voice_id === "a")!.enabled).toBe(
      false
    );
    expect(none.voices.find((item) => item.voice_id === "us")!.enabled).toBe(
      true
    );
    expect(resolveRecommendedVoices(none, [rec("a")], voices, "en-GB")).toEqual(
      []
    );
    expect(
      resolveRecommendedVoices(profile([]), [rec("a")], voices, "en-GB")
    ).toEqual([]);
    const restored = switchPoolRecommendation(
      none,
      [rec("a")],
      voices,
      "uk"
    ).profile;
    expect(restored.voices).toHaveLength(2);
    expect(
      restored.voices.find((item) => item.voice_id === "a")!.version_id
    ).toBe(uk.voices[0]!.version_id);
  });
  it("取消再选恢复音色自己的版本、参数和格式，两个 alias 不创建第二行", () => {
    const voice = voices[0]!;
    const options = [...voices, { ...voice, id: "alias" }];
    const original = {
      ...setting("a", -27),
      volume_percent: 64,
      output_format: "wav" as const
    };
    const disabled = togglePoolVoice(profile([original]), voice, options);
    expect(disabled.voices[0]?.enabled).toBe(false);
    const restored = togglePoolVoice(disabled, options.at(-1)!, options);
    expect(restored.voices).toEqual([original]);
  });
  it("拒绝同官方 ID 多配置，单侧物化保留另一侧继承", () => {
    const initial = profile([setting("a")]);
    initial.dubbing!.us = { mode: "inherit" };
    const local = localVoicePool(initial, initial.voices, voices, "word", "uk");
    expect(local.dubbing!.us).toEqual({ mode: "inherit" });
    expect(() =>
      localVoicePool(
        initial,
        [setting("a"), { ...setting("a"), version_id: "duplicate" }],
        voices,
        "word",
        "uk"
      )
    ).toThrow("同一官方音色");
  });
  it("物化英式只复制本侧解析值，另一侧继承的缓存逐字段保留", () => {
    const cachedUs = {
      ...setting("us", 17),
      audio_asset_id: "cached-us",
      enabled: false
    };
    const initial: VoiceProfile = {
      voices: [cachedUs],
      dubbing: {
        area: "word",
        uk: { mode: "inherit" },
        us: { mode: "inherit" }
      }
    };
    const local = localVoicePool(
      initial,
      [setting("a"), setting("us", -27), cachedUs],
      voices,
      "word",
      "uk"
    );
    expect(local.voices).toEqual([setting("a"), cachedUs]);
    expect(local.dubbing).toEqual({
      area: "word",
      uk: { mode: "local" },
      us: { mode: "inherit" }
    });
    expect(initial.voices).toEqual([cachedUs]);
  });
  it("推荐匹配同一官方 ID 的另一 alias 时引用实际缓存身份与参数", () => {
    const options = [...voices, { ...voices[0]!, id: "alias" }];
    const cached = { ...setting("a", -11), enabled: false };
    const adopted = switchPoolRecommendation(
      profile([cached]),
      [{ ...rec("a"), setting: { ...setting("alias"), voice_id: "alias" } }],
      options,
      "uk"
    ).profile;
    expect(adopted.voices).toEqual([{ ...cached, enabled: true }]);
    expect(adopted.dubbing!.uk.recommendations?.[0]).toMatchObject({
      voice_id: "a",
      contribution_id: cached.version_id
    });
  });
  it("同侧排序跳过另一侧与未选缓存，参数和另一侧位置不变", () => {
    const values = [
      setting("a"),
      setting("us"),
      { ...setting("c"), enabled: false },
      setting("b", -27)
    ];
    expect(reorderPoolVoice(values, "b-version", -1, voices)).toEqual([
      values[3],
      values[1],
      values[2],
      values[0]
    ]);
    expect(reorderPoolVoice(values, "us-version", 1, voices)).toEqual(values);
  });
  it("概率按实际正文资格和各侧有效排名独立归一化，绝不用缓存补池", () => {
    const values = voices.map((voice) => setting(voice.id));
    const probabilities = voicePoolProbabilities(values, voices, content);
    expect(
      ["a", "b", "c", "d", "e"].map((id) =>
        Number((probabilities.get(`${id}-version`)! * 100).toFixed(1))
      )
    ).toEqual([43.8, 21.9, 14.6, 10.9, 8.8]);
    expect(probabilities.get("us-version")).toBe(1);
    const marked = {
      ...content,
      annotations: [{ type: "pause" as const, at: 5, duration_ms: 500 }]
    };
    const options = voices.map((voice) =>
      voice.id === "a" ? { ...voice, supportsPause: false } : voice
    );
    const next = voicePoolProbabilities(
      [
        setting("a"),
        setting("b"),
        { ...setting("c"), enabled: false },
        setting("us")
      ],
      options,
      marked
    );
    expect([...next]).toEqual([
      ["b-version", 1],
      ["us-version", 1]
    ]);
  });
  it("人工归属与原生locale分离，分侧排序/概率不改locale，归属变更不能悄悄跨侧", () => {
    const custom: VoiceOption = {
      ...voices[0]!,
      id: "custom",
      locale: "en-US",
      accent: "gb",
      providerVoiceId: "en-US-CustomNeural"
    };
    const options = [...voices, custom];
    const selected = togglePoolVoice(profile([setting("us")]), custom, options);
    expect(selected.voices.at(-1)).toMatchObject({
      locale: "en-US",
      accent: "gb"
    });
    const probabilities = voicePoolProbabilities(
      selected.voices,
      options,
      content
    );
    expect([...probabilities.values()]).toEqual([1, 1]);
    const moved = options.map((voice) =>
      voice.id === "custom" ? { ...voice, accent: "us" as const } : voice
    );
    expect(voicePoolProbabilities(selected.voices, moved, content).size).toBe(
      1
    );
    expect(() =>
      switchPoolRecommendation(
        selected,
        [{ ...rec("us"), setting: { ...setting("custom"), locale: "en-US" } }],
        moved,
        "us"
      )
    ).toThrow("另一侧");
    expect(selected.voices.at(-1)?.locale).toBe("en-US");
  });
  it("明确不支持的参数仅在有效投影中忽略，未知能力和指定标记不被删除", () => {
    const raw = {
      ...setting("a", -27),
      volume_percent: 64,
      pitch_semitones: 3,
      style: "cheerful",
      style_degree: 1.2,
      role: "Girl"
    };
    expect(
      effectiveVoiceSetting(raw, {
        ...voices[0]!,
        supportsRate: false,
        supportsPitch: false,
        supportsVolume: false,
        rateRange: { min: 0, max: 0 }
      })
    ).toEqual({ ...setting("a"), rate_percent: 0 });
    expect(raw.rate_percent).toBe(-27);
    const unknown = { ...voices[0]!, styles: ["cheerful"] };
    expect(effectiveVoiceSetting(raw, unknown)).toEqual(raw);
    expect(voicePoolProbabilities([raw], [unknown], content)).toEqual(
      new Map()
    );
  });
});
