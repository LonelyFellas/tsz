import { describe, expect, it } from "vitest";
import { selectVoiceVersion, voiceSettingFor } from "./voice-versions";
import type { VoiceOption, VoiceSetting } from "../types";

const voices = [
  { id: "sonia", locale: "en-GB" },
  { id: "guy", locale: "en-US" }
] as VoiceOption[];
const slow: VoiceSetting = {
  version_id: "slow",
  version_name: "慢读",
  locale: "en-GB",
  voice_id: "sonia",
  enabled: false,
  rate_percent: -25
};
const normal: VoiceSetting = {
  ...slow,
  version_id: "normal",
  version_name: "自然",
  enabled: true,
  rate_percent: 0
};
const us: VoiceSetting = { voice_id: "guy", enabled: true, rate_percent: 10 };

describe("文本配音版本", () => {
  it("同音色多个版本默认读取正式版本，调参时定位指定版本", () => {
    expect(voiceSettingFor([slow, normal], "sonia")).toBe(normal);
    expect(voiceSettingFor([slow, normal], "sonia", "slow")).toBe(slow);
  });
  it("选用版本只替换当前口音的启用状态，保留另一口音与全部历史参数", () => {
    const original = [slow, normal, us];
    const next = selectVoiceVersion(original, slow, "en-GB", voices);
    expect(next).toEqual([
      { ...slow, enabled: true },
      { ...normal, enabled: false },
      us
    ]);
    expect(original[0]!.enabled).toBe(false);
    expect(next[2]).toBe(us);
  });
  it("应用新推荐保留旧版本，未识别的历史配置不会被猜测口音", () => {
    const retired = { voice_id: "retired", enabled: false, rate_percent: 20 };
    const next = selectVoiceVersion(
      [normal, us, retired],
      slow,
      "en-GB",
      voices
    );
    expect(next).toEqual([
      { ...normal, enabled: false },
      us,
      retired,
      { ...slow, enabled: true }
    ]);
  });
});
