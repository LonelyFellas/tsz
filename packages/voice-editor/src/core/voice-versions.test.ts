import { describe, expect, it } from "vitest";
import {
  selectVoiceVersion,
  voiceSettingFor,
  withNativeVoiceVersion
} from "./voice-versions";
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
  it("新身份创建保持参数且重复进入不重建版本，普通旧英美记录原样", () => {
    const old = { voice_id: "sonia", enabled: false, rate_percent: -10 };
    expect(
      withNativeVoiceVersion(old, {
        id: "sonia",
        locale: "en-GB"
      } as VoiceOption)
    ).toBe(old);
    const flash = {
      id: "flash",
      label: "Flash",
      locale: "en-US",
      supportsVolume: false
    } as VoiceOption;
    const created = withNativeVoiceVersion(
      { ...old, voice_id: "flash" },
      flash,
      "首位推荐"
    );
    expect(created).toMatchObject({
      locale: "en-US",
      version_id: expect.any(String),
      version_name: "首位推荐",
      rate_percent: -10
    });
    expect(withNativeVoiceVersion(created, flash)).toBe(created);
  });
  it("澳大利亚替换英式选用，其他地区各自保留补充版本", () => {
    const au: VoiceSetting = {
      ...slow,
      version_id: "au",
      voice_id: "natasha",
      locale: "en-AU"
    };
    const india: VoiceSetting = {
      ...normal,
      version_id: "india",
      voice_id: "neerja",
      locale: "en-IN"
    };
    const ireland: VoiceSetting = {
      ...normal,
      version_id: "ireland",
      voice_id: "emily",
      locale: "en-IE"
    };
    const first = selectVoiceVersion(
      [normal, us, india, ireland],
      au,
      "en-AU",
      voices
    );
    expect(
      first.find((item) => item.version_id === normal.version_id)?.enabled
    ).toBe(false);
    expect(first.find((item) => item.version_id === "au")).toMatchObject({
      enabled: true,
      locale: "en-AU"
    });
    expect(first.find((item) => item.version_id === "india")).toBe(india);
    expect(first.find((item) => item.version_id === "ireland")).toBe(ireland);
    const replacement = { ...india, version_id: "india-2", enabled: false };
    const next = selectVoiceVersion(first, replacement, "en-IN", voices);
    expect(next.find((item) => item.version_id === "india")?.enabled).toBe(
      false
    );
    expect(next.find((item) => item.version_id === "ireland")?.enabled).toBe(
      true
    );
    expect(next.find((item) => item.version_id === "au")?.enabled).toBe(true);
  });
  it("人工归属改变选用组但不改原生地区，未归类既有版本保留", () => {
    const sg = {
      ...slow,
      version_id: "sg",
      voice_id: "luna",
      locale: "en-SG" as const
    };
    const current = [
      ...voices,
      { id: "luna", locale: "en-SG", accent: "gb" } as VoiceOption
    ];
    const next = selectVoiceVersion([normal, us], sg, "en-SG", current);
    expect(next.find((item) => item.voice_id === "sonia")?.enabled).toBe(false);
    expect(next.find((item) => item.voice_id === "guy")?.enabled).toBe(true);
    expect(next.find((item) => item.voice_id === "luna")).toMatchObject({
      enabled: true,
      locale: "en-SG"
    });
  });
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
