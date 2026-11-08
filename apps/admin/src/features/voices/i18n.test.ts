import { expect, it } from "vitest";
import { createInterfaceI18n } from "@tsz/shared/i18n";
import {
  defaultVoiceTranslation,
  voiceLabel,
  voiceMessage,
  voiceMessageText,
  voiceResources,
  voiceSearchText,
  type VoiceTranslation
} from "./i18n";
import { recommendationError } from "./dubbing-model";

it("已知枚举与本地消息随语言显示，未知原文和业务值保持原样", () => {
  const instance = createInterfaceI18n("en-US", voiceResources);
  const t: VoiceTranslation = (key, values) =>
    instance.t(key, { ns: "adminVoices", ...values });
  expect(voiceLabel("女声", t)).toBe("Female voice");
  expect(voiceLabel("原文 provider_unknown / 001", t)).toBe(
    "原文 provider_unknown / 001"
  );
  expect(voiceMessageText("后端原文：女声 / raw 001", t)).toBe(
    "后端原文：女声 / raw 001"
  );
  const message = voiceMessage("group_saved", { name: "自然朗读 raw 001" });
  expect(voiceMessageText(message, t)).toContain("自然朗读 raw 001");
  expect(voiceMessageText(message, defaultVoiceTranslation)).toBe(
    "「自然朗读 raw 001」配音已保存。"
  );
  expect(voiceSearchText("温柔")).toContain("Gentle");
});

it("本地校验使用当前语言，位置名称与草稿保持原始值", () => {
  const instance = createInterfaceI18n("en-GB", voiceResources);
  const t: VoiceTranslation = (key, values) =>
    instance.t(key, { ns: "adminVoices", ...values });
  const item = {
    id: "raw-id",
    voice_alias: "unknown-provider",
    name: "原推荐",
    parameters: { rate_percent: 0, pitch_semitones: 0, style: null }
  };
  const before = JSON.stringify(item);
  expect(recommendationError("原组", "uk", item, undefined, t)).toContain(
    "原组 / British / 原推荐"
  );
  expect(recommendationError("原组", "uk", item, undefined)).toContain(
    "原组 / 英式 / 原推荐"
  );
  expect(JSON.stringify(item)).toBe(before);
});
