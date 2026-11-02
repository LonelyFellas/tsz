import { describe, expect, it } from "vitest";
import type { AdminSpeechVoice } from "@tsz/types";
import {
  newVoiceTrial,
  voiceTrialCapabilities,
  voiceTrialIssue,
  voiceTrialSetting
} from "./voice-trial";

const voice: AdminSpeechVoice = {
  alias: "sonia",
  display_name: "Sonia",
  locale: "en-GB",
  gender: "female",
  is_common: true,
  metadata: {
    provider_voice_id: "en-GB-SoniaNeural",
    model: "neural",
    age_group: null,
    description: null,
    personalities: [],
    scenarios: [],
    roles: [],
    source_url: "https://speech.microsoft.com/portal/voicegallery",
    checked_at: "2026-10-25"
  },
  capabilities: {
    styles: [],
    min_rate_percent: -50,
    max_rate_percent: 50,
    min_pitch_semitones: -10,
    max_pitch_semitones: 10
  }
};
describe("音色试听能力", () => {
  it("英美音色按能力开放，其他地区保留自然读法但关闭指定音素", () => {
    expect(voiceTrialCapabilities(voice)).toEqual({
      supportsPhoneme: true,
      supportsPause: true,
      supportsSayAs: true,
      supportsSub: true
    });
    expect(voiceTrialCapabilities({ ...voice, locale: "en-AU" })).toMatchObject(
      { supportsPhoneme: false, supportsPause: true }
    );
    expect(voiceTrialCapabilities({ ...voice, metadata: undefined })).toEqual({
      supportsPhoneme: false,
      supportsPause: false,
      supportsSayAs: false,
      supportsSub: false
    });
  });
  it("HD Flash及未开放合成的音色不允许标注，不将旧草稿静默丢弃", () => {
    for (const item of [
      { ...voice, metadata: { ...voice.metadata!, model: "hd_flash" } },
      { ...voice, synthesis_available: false }
    ]) {
      const source = newVoiceTrial("record");
      source.content.annotations.push({
        type: "phoneme",
        start: 0,
        end: 6,
        alphabet: "ipa",
        phoneme: "rɪˈkɔːd"
      });
      expect(voiceTrialIssue(item, source)).toMatch(/暂未开放/);
      expect(source.content.annotations).toHaveLength(1);
    }
  });
  it("500字符限制按码点计数，特殊读法受服务能力约束", () => {
    expect(
      voiceTrialIssue(voice, newVoiceTrial("🙂".repeat(500)))
    ).toBeUndefined();
    expect(voiceTrialIssue(voice, newVoiceTrial("🙂".repeat(501)))).toMatch(
      /1–500/
    );
    const source = newVoiceTrial("123");
    source.content.annotations = [
      { type: "say_as", start: 0, end: 3, interpret_as: "digits" }
    ];
    expect(voiceTrialIssue(voice, source)).toBeUndefined();
    expect(
      voiceTrialIssue(
        { ...voice, metadata: { ...voice.metadata!, model: "hd_flash" } },
        source
      )
    ).toMatch(/读法或停顿/);
  });
  it("试听和 SSML 设置共用能力过滤，保留输入的旧参数不变", () => {
    const parameters = {
      rate_percent: -27,
      pitch_semitones: 2,
      volume_percent: 65,
      style: "cheerful",
      style_degree: 1.3,
      role: "Girl"
    };
    const locked = {
      ...voice,
      capabilities: {
        ...voice.capabilities,
        min_rate_percent: 0,
        max_rate_percent: 0,
        min_pitch_semitones: 0,
        max_pitch_semitones: 0,
        supports_volume_percent: false
      }
    };
    const setting = voiceTrialSetting(locked, parameters, "wav");
    expect(setting).toMatchObject({
      voice_id: "sonia",
      rate_percent: 0,
      pitch_semitones: 0,
      volume_percent: 100,
      output_format: "wav"
    });
    expect(setting).not.toHaveProperty("style");
    expect(setting).not.toHaveProperty("style_degree");
    expect(setting).not.toHaveProperty("role");
    expect(parameters).toMatchObject({
      rate_percent: -27,
      pitch_semitones: 2,
      volume_percent: 65,
      style_degree: 1.3,
      role: "Girl"
    });
  });
});
