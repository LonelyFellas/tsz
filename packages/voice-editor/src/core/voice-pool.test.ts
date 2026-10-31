import { describe, expect, it } from "vitest";
import type {
  VoiceOption,
  VoiceProfile,
  VoiceRecommendation,
  VoiceSetting
} from "../types";
import {
  convertVoicePool,
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
  dubbing: { mode: "local", area: "word", pool_version: "provider_id_v1" }
});
const rec = (id: string, pairId = "pair-a"): VoiceRecommendation => ({
  id: `rec-${id}`,
  groupId: "group",
  pairId,
  groupName: "分组",
  name: pairId,
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
  it("切推荐只替换旧贡献，保留额外声音，已获取重复声音明确反馈且不覆盖参数", () => {
    const initial = profile([setting("b", -11)]);
    const a = switchPoolRecommendation(
      initial,
      [rec("a"), rec("us")],
      voices
    ).profile;
    const b = switchPoolRecommendation(
      a,
      [rec("b", "pair-b"), rec("us", "pair-b")],
      voices
    );
    expect(b.duplicates).toEqual(["b"]);
    expect(
      b.profile.voices
        .filter((item) => item.enabled)
        .map((item) => item.voice_id)
    ).toEqual(["b", "us"]);
    expect(
      b.profile.voices.find((item) => item.voice_id === "b")?.rate_percent
    ).toBe(-11);
    expect(b.profile.dubbing?.recommendation?.contribution_ids).toEqual([
      b.profile.voices.find((item) => item.voice_id === "us")!.version_id
    ]);
    const none = switchPoolRecommendation(b.profile, [], voices).profile;
    expect(
      none.voices.filter((item) => item.enabled).map((item) => item.voice_id)
    ).toEqual(["b"]);
    expect(none.dubbing).not.toHaveProperty("recommendation");
  });
  it("不选推荐不补任何推荐或目录声；旧 local 空池仍保留旧语义", () => {
    const adopted = switchPoolRecommendation(
      profile([]),
      [rec("a"), rec("us")],
      voices
    ).profile;
    const none = switchPoolRecommendation(adopted, [], voices).profile;
    expect(none.voices).toHaveLength(2);
    expect(none.voices.every((item) => !item.enabled)).toBe(true);
    expect(
      resolveRecommendedVoices(none, [rec("a"), rec("us")], voices)
    ).toEqual([]);
    expect(
      resolveRecommendedVoices(
        { voices: [], dubbing: { mode: "local", area: "word" } },
        [rec("a")],
        voices,
        "en-GB"
      )
    ).toHaveLength(1);
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
  it("历史多版本须逐冲突明确选配置，未转换原数据和发布资产不变", () => {
    const original = [
      setting("a", -27),
      { ...setting("a", 10), version_id: "other", audio_asset_id: "old-audio" },
      setting("us")
    ];
    const snapshot = structuredClone(original);
    expect(() => convertVoicePool(undefined, original, voices, "word")).toThrow(
      "明确选择"
    );
    const converted = convertVoicePool(undefined, original, voices, "word", {
      [providerVoiceKey("a", voices)]: "other"
    });
    expect(converted.voices).toEqual([original[1], original[2]]);
    expect(original).toEqual(snapshot);
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
