import { describe, expect, it } from "vitest";
import type {
  AudioAssetV3,
  FormContentV3,
  FormContentVariantV3,
  SharedFormsStepContentV3,
  VoiceProfileV3,
  WordConcreteFormV3
} from "@tsz/types";
import { applyFormsStructure, expandFormContents } from "./sharedFormsModel";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt
} from "./fixtures";
import { applyFormCopy, planFormCopy } from "./formCopyModel";

function profile(id: string, inherited = false): VoiceProfileV3 {
  return {
    voices: [
      {
        voice_id: id,
        enabled: true,
        rate_percent: 12,
        pitch_semitones: 2,
        volume_percent: 90,
        style: "cheerful",
        style_degree: 1.5,
        role: "YoungAdultFemale",
        output_format: "wav",
        version_id: uuidFromInt(900),
        version_name: "慢速",
        locale: "en-GB",
        audio_asset_id: `${id}-audio`
      },
      {
        voice_id: `${id}-disabled`,
        enabled: false,
        rate_percent: -10,
        locale: "en-GB",
        audio_asset_id: `${id}-disabled-audio`
      }
    ],
    ...(inherited
      ? { dubbing: { mode: "inherit" as const, area: "azure" as const } }
      : {})
  };
}

function recording(id: string): AudioAssetV3 {
  return {
    id,
    locale: "en-GB",
    gender: "female",
    content_type: "audio/mpeg",
    size_bytes: 42,
    original_name: `${id}.mp3`,
    created_at: "2026-10-01T00:00:00Z"
  };
}

function setup(source?: WordConcreteFormV3, target?: WordConcreteFormV3) {
  const forms = applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture({
      forms: [
        source ?? commonFormFixture({ spelling: "old word" }),
        target ??
          commonFormFixture({
            id: uuidFromInt(700),
            spelling: "longer spelling"
          })
      ]
    })
  ) as SharedFormsStepContentV3;
  return {
    forms,
    sourceId: forms.pos[0]!.forms[0]!.id,
    targetId: forms.pos[0]!.forms[1]!.id
  };
}

function variant(
  content: FormContentV3,
  side: "uk" | "us" = "uk"
): FormContentVariantV3 {
  return content.regional_variants.mode === "common"
    ? content.regional_variants.common
    : content.regional_variants[side];
}

function rich(text: string) {
  return {
    version: 2 as const,
    text,
    annotations: [{ type: "italic" as const, start: 0, end: 1 }]
  };
}

function speech(text: string, voice: VoiceProfileV3) {
  return {
    content: { version: 2 as const, text, annotations: [] },
    voice_profile: voice
  };
}

describe("词形内容定向复制", () => {
  it("复制音标保留目标身份、读法、拼写、继承音色与真人录音，并重建词界和清理全部正式音频", () => {
    const { forms, sourceId, targetId } = setup();
    const from = variant(forms.contents[0]!);
    const to = variant(forms.contents[1]!);
    const source = from.pronunciations[0]!;
    const target = to.pronunciations[0]!;
    source.dict_phonetic = "/source/";
    source.dict_phonetic_rich = rich("/source/");
    source.actual_pron = "source actual";
    source.actual_pron_rich = rich("source actual");
    source.style = "weak";
    source.audio_assets = [recording("source-upload")];
    source.voice_profile = profile("source");
    source.synthesis = {
      alphabet: "ups",
      ipa: "",
      ups: "",
      use_spelling: false,
      uk: {
        ipa: "old word",
        ups: "OW L D W ER D",
        ups_words: [
          { text: "old", phoneme: "OW L D" },
          { text: "word", phoneme: "W ER D" }
        ],
        ipa_speech: {
          ...speech(from.spelling, profile("source-ipa")),
          content: {
            version: 2,
            text: from.spelling,
            annotations: [
              { type: "pause", at: 3, duration_ms: 200 },
              { type: "sub", start: 4, end: 8, alias: "word" }
            ]
          }
        }
      },
      us: {
        ipa: "other",
        ups: "",
        ups_speech: speech(from.spelling, profile("source-ups"))
      }
    };
    target.style = "normal";
    target.voice_profile = profile("target", true);
    target.audio_assets = [recording("target-upload")];
    target.synthesis = {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      uk: {
        ipa: "target",
        ups: "",
        ipa_speech: speech(to.spelling, profile("target-ipa", true))
      },
      us: {
        ipa: "target us",
        ups: "",
        ups_speech: speech(to.spelling, profile("target-ups", true))
      }
    };
    to.spelling_speech = {
      ...speech(to.spelling, profile("spelling")),
      audio_assets: [recording("spelling")]
    };
    const before = structuredClone(forms);
    const plan = planFormCopy(forms, sourceId, targetId, "phonetics");
    expect(plan.warnings[0]).toContain("审听");
    const next = applyFormCopy(forms, plan);
    const copied = variant(next.contents[1]!).pronunciations[0]!;
    expect(next.pos).toEqual(before.pos);
    expect(next.contents[0]).toEqual(before.contents[0]);
    expect(next.contents[1]).toMatchObject({
      id: before.contents[1]!.id,
      dialect_rules: before.contents[1]!.dialect_rules
    });
    expect(variant(next.contents[1]!)).toMatchObject({
      id: to.id,
      spelling: to.spelling,
      origin: to.origin,
      spelling_speech: to.spelling_speech
    });
    expect(copied).toMatchObject({
      id: target.id,
      style: "normal",
      dict_phonetic: "/source/",
      dict_phonetic_rich: source.dict_phonetic_rich,
      actual_pron_rich: source.actual_pron_rich,
      audio_assets: target.audio_assets,
      voice_profile: { dubbing: target.voice_profile.dubbing }
    });
    expect(
      copied.voice_profile!.voices.map(({ audio_asset_id }) => audio_asset_id)
    ).toEqual([undefined, undefined]);
    expect(copied.synthesis!.uk!.ups_words).toEqual([
      { text: "longer", phoneme: "OW L D" },
      { text: "spelling", phoneme: "W ER D" }
    ]);
    expect(copied.synthesis!.uk!.ipa_speech!.content).toEqual({
      version: 2,
      text: to.spelling,
      annotations: [
        { type: "pause", at: 6, duration_ms: 200 },
        { type: "sub", start: 7, end: 15, alias: "word" }
      ]
    });
    expect(
      copied.synthesis!.uk!.ipa_speech!.voice_profile.voices[0]!.voice_id
    ).toBe("target-ipa");
    expect(
      copied.synthesis!.us!.ups_speech!.voice_profile.voices[0]!.voice_id
    ).toBe("target");
    expect(JSON.stringify(copied)).not.toContain("audio_asset_id");
    expect(forms).toEqual(before);
  });

  it("复制音色保留目标所有正文与发音源选择，复制禁用版本参数与顺序且不带来源音频", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    const to = variant(forms.contents[1]!);
    const target = to.pronunciations[0]!;
    source.synthesis = {
      alphabet: "ups",
      ipa: "",
      ups: "",
      uk: {
        ipa: "source",
        ups: "",
        ipa_speech: speech("old word", profile("source-ipa"))
      },
      us: {
        ipa: "source us",
        ups: "",
        ups_speech: speech("old word", profile("source-ups"))
      }
    };
    target.synthesis = {
      alphabet: "ipa",
      use_spelling: true,
      ipa: "legacy",
      ups: "legacy ups",
      uk: {
        ipa: "target",
        ups: "target ups",
        ups_words: [{ text: "longer", phoneme: "X" }],
        ipa_speech: {
          ...speech(to.spelling, profile("target")),
          content: {
            version: 2,
            text: to.spelling,
            annotations: [{ type: "pause", at: 6, duration_ms: 50 }]
          }
        }
      },
      us: { ipa: "target us", ups: "" }
    };
    target.audio_assets = [recording("target")];
    const before = structuredClone(forms);
    const next = applyFormCopy(
      forms,
      planFormCopy(forms, sourceId, targetId, "voices")
    );
    const copied = variant(next.contents[1]!).pronunciations[0]!;
    expect(next.pos).toEqual(before.pos);
    expect(copied).toMatchObject({
      id: target.id,
      dict_phonetic: target.dict_phonetic,
      actual_pron: target.actual_pron,
      style: target.style,
      audio_assets: target.audio_assets,
      synthesis: {
        alphabet: "ipa",
        use_spelling: true,
        ipa: "legacy",
        ups: "legacy ups",
        uk: {
          ipa: "target",
          ups: "target ups",
          ups_words: target.synthesis.uk!.ups_words,
          ipa_speech: { content: target.synthesis.uk!.ipa_speech!.content }
        }
      }
    });
    const copiedProfile = copied.synthesis!.uk!.ipa_speech!.voice_profile;
    expect(copiedProfile.voices).toHaveLength(2);
    expect(copiedProfile.voices[0]).toMatchObject({
      voice_id: "source-ipa",
      enabled: true,
      rate_percent: 12,
      pitch_semitones: 2,
      volume_percent: 90,
      style: "cheerful",
      style_degree: 1.5,
      role: "YoungAdultFemale",
      output_format: "wav",
      version_name: "慢速"
    });
    expect(copiedProfile.voices[0]!.version_id).not.toBe(
      source.synthesis.uk!.ipa_speech!.voice_profile.voices[0]!.version_id
    );
    expect(copiedProfile.voices[1]).toMatchObject({
      voice_id: "source-ipa-disabled",
      enabled: false,
      rate_percent: -10
    });
    expect(JSON.stringify(copiedProfile)).not.toContain("audio_asset_id");
    expect(
      copied.synthesis!.us!.ups_speech!.voice_profile.voices[0]!.voice_id
    ).toBe("source-ups");
    expect(forms).toEqual(before);
  });

  it("来源仅选择拼写发音时复制该选择，并保留目标拼写和音色", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    const target = variant(forms.contents[1]!).pronunciations[0]!;
    source.synthesis = {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      use_spelling: true
    };
    target.synthesis = {
      alphabet: "ups",
      ipa: "old",
      ups: "OLD",
      use_spelling: false
    };
    target.voice_profile = profile("target");
    const next = applyFormCopy(
      forms,
      planFormCopy(forms, sourceId, targetId, "phonetics")
    );
    const copied = variant(next.contents[1]!).pronunciations[0]!;
    expect(copied.synthesis!.use_spelling).toBe(true);
    expect(copied.synthesis!.alphabet).toBe("ipa");
    expect(variant(next.contents[1]!).spelling).toBe("longer spelling");
    expect(copied.voice_profile!.voices[0]!.voice_id).toBe("target");
  });

  it.each(["spelling", "ups"] as const)(
    "音标切换 IPA→%s 保留目标原来有效的音色",
    (selection) => {
      const { forms, sourceId, targetId } = setup();
      const source = variant(forms.contents[0]!).pronunciations[0]!;
      const targetVariant = variant(forms.contents[1]!);
      const target = targetVariant.pronunciations[0]!;
      target.synthesis = {
        alphabet: "ipa",
        ipa: "old",
        ups: "OLD",
        uk: {
          ipa: "old",
          ups: "OLD",
          ipa_speech: speech(targetVariant.spelling, profile("target-active")),
          ups_speech: speech(targetVariant.spelling, profile("target-inactive"))
        },
        us: {
          ipa: "old",
          ups: "OLD",
          ipa_speech: speech(targetVariant.spelling, profile("target-active")),
          ups_speech: speech(targetVariant.spelling, profile("target-inactive"))
        }
      };
      source.synthesis = {
        alphabet: selection === "ups" ? "ups" : "ipa",
        use_spelling: selection === "spelling",
        ipa: "new",
        ups: "N EW",
        uk: {
          ipa: "new",
          ups: "N EW",
          ups_words: [
            { text: "old", phoneme: "N" },
            { text: "word", phoneme: "EW" }
          ]
        },
        us: {
          ipa: "new",
          ups: "N EW",
          ups_words: [
            { text: "old", phoneme: "N" },
            { text: "word", phoneme: "EW" }
          ]
        }
      };
      const copied = variant(
        applyFormCopy(
          forms,
          planFormCopy(forms, sourceId, targetId, "phonetics")
        ).contents[1]!
      ).pronunciations[0]!;
      const effective =
        selection === "spelling"
          ? copied.voice_profile
          : copied.synthesis!.uk!.ups_speech!.voice_profile;
      expect(effective!.voices[0]!.voice_id).toBe("target-active");
      expect(JSON.stringify(effective)).not.toContain("audio_asset_id");
    }
  );

  it("common 目标跳过一侧时拒绝覆盖推荐配音的区域和顺序", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    const target = variant(forms.contents[1]!).pronunciations[0]!;
    source.voice_profile = profile("source");
    source.voice_profile.voices.forEach((voice) => {
      voice.locale = "en-GB";
    });
    target.voice_profile = {
      voices: [],
      dubbing: {
        mode: "local",
        area: "word",
        recommendation_order: ["us-b", "us-a"]
      }
    };
    const before = structuredClone(forms);
    const plan = planFormCopy(forms, sourceId, targetId, "voices", {
      us: { [target.id]: null }
    });
    expect(() => applyFormCopy(forms, plan)).toThrow("口音不明确");
    expect(forms).toEqual(before);
  });

  it("已按目录解析的口音归属优先于原生 locale，保留启用状态", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    source.voice_profile = profile("stored", true);
    const resolved = (["uk", "us"] as const).map((side) => ({
      side,
      sourcePronunciationId: source.id,
      channel: "fallback" as const,
      sideScoped: true,
      profile: {
        voices: [
          {
            voice_id: side === "uk" ? "us-native-gb" : "canadian",
            version_id: uuidFromInt(side === "uk" ? 801 : 802),
            version_name: side,
            locale: side === "uk" ? ("en-US" as const) : ("en-CA" as const),
            enabled: true,
            rate_percent: 0
          }
        ],
        dubbing: { mode: "inherit" as const, area: "azure" as const }
      }
    }));
    const copied = variant(
      applyFormCopy(
        forms,
        planFormCopy(forms, sourceId, targetId, "voices"),
        resolved
      ).contents[1]!
    ).pronunciations[0]!;
    expect(
      copied.voice_profile!.voices.map((voice) => [
        voice.voice_id,
        voice.enabled
      ])
    ).toEqual([
      ["us-native-gb", true],
      ["canadian", true]
    ]);
  });

  it("版本不同要求逐侧映射，null跳过且不增删重排版本", () => {
    const { forms, sourceId, targetId } = setup(
      ukUsFormFixture({
        uk: { pronunciations: [pronunciationFixture({ dict_phonetic: "UK" })] },
        us: { pronunciations: [] }
      }),
      ukUsFormFixture({
        id: uuidFromInt(700),
        uk: {
          pronunciations: [
            pronunciationFixture({
              id: uuidFromInt(701),
              actual_pron: "first"
            }),
            pronunciationFixture({
              id: uuidFromInt(702),
              actual_pron: "second"
            })
          ]
        },
        us: {
          pronunciations: [
            pronunciationFixture({
              id: uuidFromInt(703),
              actual_pron: "US unchanged"
            })
          ]
        }
      })
    );
    const plan = planFormCopy(forms, sourceId, targetId, "phonetics");
    expect(plan.needsMapping).toBe(true);
    expect(() => applyFormCopy(forms, plan)).toThrow("选择来源或跳过");
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    const target = variant(forms.contents[1]!);
    const mapped = planFormCopy(forms, sourceId, targetId, "phonetics", {
      uk: {
        [target.pronunciations[0]!.id]: null,
        [target.pronunciations[1]!.id]: source.id
      }
    });
    expect(mapped.needsMapping).toBe(false);
    const next = applyFormCopy(forms, mapped);
    expect(next.pos).toEqual(forms.pos);
    expect(
      variant(next.contents[1]!).pronunciations.map((row) => row.id)
    ).toEqual(target.pronunciations.map((row) => row.id));
    expect(variant(next.contents[1]!).pronunciations[0]).toEqual(
      target.pronunciations[0]
    );
    expect(variant(next.contents[1]!).pronunciations[1]!.dict_phonetic).toBe(
      "UK"
    );
    expect(variant(next.contents[1]!, "us")).toEqual(
      variant(forms.contents[1]!, "us")
    );
  });

  it("拒绝两套不同英美正文写入common，common双侧候选按侧写入uk_us并保留来源缺侧目标", () => {
    const conflict = setup(
      ukUsFormFixture({
        uk: { pronunciations: [pronunciationFixture({ dict_phonetic: "UK" })] },
        us: { pronunciations: [pronunciationFixture({ dict_phonetic: "US" })] }
      })
    );
    expect(() =>
      applyFormCopy(
        conflict.forms,
        planFormCopy(
          conflict.forms,
          conflict.sourceId,
          conflict.targetId,
          "phonetics"
        )
      )
    ).toThrow("英美区分");
    const { forms, sourceId, targetId } = setup(
      commonFormFixture({
        spelling: "cat",
        pronunciations: [
          pronunciationFixture({
            synthesis: {
              alphabet: "ipa",
              ipa: "",
              ups: "",
              uk: { ipa: "UK", ups: "" }
            }
          })
        ]
      }),
      ukUsFormFixture({
        id: uuidFromInt(700),
        uk: { spelling: "cats" },
        us: {
          spelling: "cats",
          pronunciations: [
            pronunciationFixture({
              id: uuidFromInt(703),
              synthesis: {
                alphabet: "ipa",
                ipa: "",
                ups: "",
                us: { ipa: "KEEP US", ups: "" }
              }
            })
          ]
        }
      })
    );
    const next = applyFormCopy(
      forms,
      planFormCopy(forms, sourceId, targetId, "phonetics")
    );
    expect(
      variant(next.contents[1]!).pronunciations[0]!.synthesis!.uk!.ipa
    ).toBe("UK");
    expect(
      variant(next.contents[1]!, "us").pronunciations[0]!.synthesis!.us!.ipa
    ).toBe("KEEP US");
  });

  it("inherit/local均使用解析后的有效音色并落local，未配置来源不清空目标", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    source.voice_profile = profile("stored", true);
    const plan = planFormCopy(forms, sourceId, targetId, "voices");
    expect(() => applyFormCopy(forms, plan)).toThrow("解析");
    const resolved = ["uk", "us"].map((side) => {
      const effective = profile(`resolved-${side}`, true);
      effective.voices.forEach((voice) => {
        voice.locale = side === "uk" ? "en-GB" : "en-US";
      });
      return {
        side: side as "uk" | "us",
        sourcePronunciationId: source.id,
        channel: "fallback" as const,
        profile: effective
      };
    });
    const next = applyFormCopy(forms, plan, resolved);
    const row = variant(next.contents[1]!).pronunciations[0]!;
    expect(row.synthesis!.uk!.ipa_speech!.voice_profile).toMatchObject({
      dubbing: { mode: "local", area: "azure" },
      voices: [
        { voice_id: "resolved-uk" },
        { voice_id: "resolved-uk-disabled" }
      ]
    });
    expect(
      row.synthesis!.us!.ups_speech!.voice_profile.voices[0]!.voice_id
    ).toBe("resolved-us");
    source.voice_profile.dubbing!.mode = "local";
    expect(() =>
      applyFormCopy(forms, planFormCopy(forms, sourceId, targetId, "voices"))
    ).toThrow("解析");
    delete source.voice_profile;
    expect(() =>
      applyFormCopy(forms, planFormCopy(forms, sourceId, targetId, "voices"))
    ).toThrow("未配置");
  });

  it("common拼写来源合并双侧有效fallback并保留禁用版本，口音不明的差异或部分复制拒绝", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    const target = variant(forms.contents[1]!).pronunciations[0]!;
    source.voice_profile = profile("stored", true);
    target.voice_profile = profile("target");
    target.synthesis = {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      use_spelling: true
    };
    const resolved = (["uk", "us"] as const).map((side) => {
      const effective = profile(`resolved-${side}`, true);
      effective.voices.forEach((voice) => {
        voice.locale = side === "uk" ? "en-GB" : "en-US";
      });
      return {
        side,
        sourcePronunciationId: source.id,
        channel: "fallback" as const,
        profile: effective
      };
    });
    const plan = planFormCopy(forms, sourceId, targetId, "voices");
    const next = applyFormCopy(forms, plan, resolved);
    const copied = variant(next.contents[1]!).pronunciations[0]!;
    expect(copied.synthesis!.use_spelling).toBe(true);
    expect(
      copied.voice_profile!.voices.map((voice) => [
        voice.voice_id,
        voice.enabled
      ])
    ).toEqual([
      ["resolved-uk", true],
      ["resolved-uk-disabled", false],
      ["resolved-us", true],
      ["resolved-us-disabled", false]
    ]);
    expect(copied.voice_profile!.dubbing!.mode).toBe("local");
    expect(JSON.stringify(copied.voice_profile)).not.toContain(
      "audio_asset_id"
    );
    resolved.forEach((item) =>
      item.profile.voices.forEach((voice) => {
        delete voice.locale;
      })
    );
    expect(() => applyFormCopy(forms, plan, resolved)).toThrow("口音不明确");
    delete source.voice_profile.dubbing;
    source.voice_profile.voices.forEach((voice) => {
      delete voice.locale;
    });
    target.voice_profile.voices.forEach((voice) => {
      delete voice.locale;
    });
    const partial = planFormCopy(forms, sourceId, targetId, "voices", {
      us: { [target.id]: null }
    });
    expect(() => applyFormCopy(forms, partial)).toThrow("口音不明确");
    const completeLegacy = applyFormCopy(
      forms,
      planFormCopy(forms, sourceId, targetId, "voices")
    );
    expect(
      variant(completeLegacy.contents[1]!).pronunciations[0]!.voice_profile!
        .voices[0]!.voice_id
    ).toBe("stored");
  });

  it("来源仅有nested音色时把当前选中通道复制到拼写来源fallback，单侧legacy可无locale", () => {
    const { forms, sourceId, targetId } = setup(
      ukUsFormFixture(),
      ukUsFormFixture({ id: uuidFromInt(700) })
    );
    for (const side of ["uk", "us"] as const) {
      const source = variant(forms.contents[0]!, side).pronunciations[0]!;
      const target = variant(forms.contents[1]!, side).pronunciations[0]!;
      const spelling = variant(forms.contents[0]!, side).spelling;
      const ipaProfile = profile(`ipa-${side}`);
      const upsProfile = profile(`ups-${side}`);
      upsProfile.voices.forEach((voice) => {
        delete voice.locale;
      });
      source.synthesis = {
        alphabet: "ups",
        ipa: "",
        ups: "",
        [side]: {
          ipa: "source ipa",
          ups: "SOURCE UPS",
          ipa_speech: speech(spelling, ipaProfile),
          ups_speech: speech(spelling, upsProfile)
        }
      };
      target.synthesis = {
        alphabet: "ipa",
        ipa: "target",
        ups: "",
        use_spelling: true
      };
    }
    const next = applyFormCopy(
      forms,
      planFormCopy(forms, sourceId, targetId, "voices")
    );
    for (const side of ["uk", "us"] as const) {
      const row = variant(next.contents[1]!, side).pronunciations[0]!;
      expect(row.voice_profile!.voices[0]!.voice_id).toBe(`ups-${side}`);
      expect(row.synthesis!.use_spelling).toBe(true);
      expect(row.synthesis!.alphabet).toBe("ipa");
    }
  });

  it("来源缺侧只更新展示音标，保留目标该侧发音源选择与候选；全null操作不改forms", () => {
    const { forms, sourceId, targetId } = setup(
      commonFormFixture({
        pronunciations: [
          pronunciationFixture({
            dict_phonetic: "new dictionary",
            synthesis: {
              alphabet: "ups",
              ipa: "",
              ups: "",
              use_spelling: false,
              uk: { ipa: "source UK", ups: "SOURCE" }
            }
          })
        ]
      }),
      ukUsFormFixture({ id: uuidFromInt(700) })
    );
    const target = variant(forms.contents[1]!, "us").pronunciations[0]!;
    target.synthesis = {
      alphabet: "ipa",
      ipa: "legacy US",
      ipa_locale: "en-US",
      ups: "",
      use_spelling: true
    };
    const previous = structuredClone(target.synthesis);
    const next = applyFormCopy(
      forms,
      planFormCopy(forms, sourceId, targetId, "phonetics")
    );
    expect(
      variant(next.contents[1]!, "us").pronunciations[0]!.dict_phonetic
    ).toBe("new dictionary");
    expect(
      variant(next.contents[1]!, "us").pronunciations[0]!.synthesis
    ).toEqual(previous);
    expect(
      variant(next.contents[1]!, "uk").pronunciations[0]!.synthesis!.alphabet
    ).toBe("ups");
    const skipped = planFormCopy(forms, sourceId, targetId, "voices", {
      uk: { [variant(forms.contents[1]!, "uk").pronunciations[0]!.id]: null },
      us: { [target.id]: null }
    });
    expect(applyFormCopy(forms, skipped)).toBe(forms);
  });

  it("标注或UPS无法对应时原子拒绝，不静默丢失字段", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    source.synthesis = {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      uk: {
        ipa: "old word",
        ups: "",
        ipa_speech: {
          ...speech("old word", profile("source")),
          content: {
            version: 2,
            text: "old word",
            annotations: [{ type: "pause", at: 2, duration_ms: 100 }]
          }
        }
      }
    };
    const before = structuredClone(forms);
    expect(() =>
      applyFormCopy(forms, planFormCopy(forms, sourceId, targetId, "phonetics"))
    ).toThrow("词界");
    expect(forms).toEqual(before);
    source.synthesis.uk = {
      ipa: "",
      ups: "A B",
      ups_words: [
        { text: "old", phoneme: "A" },
        { text: "word", phoneme: "B" }
      ]
    };
    variant(forms.contents[1]!).spelling = "single";
    expect(() =>
      applyFormCopy(forms, planFormCopy(forms, sourceId, targetId, "phonetics"))
    ).toThrow("UPS");
  });

  it("保持共享引用，仅替换target content，并拦截source/target快照及改绑变化", () => {
    const { forms, sourceId, targetId } = setup();
    const other = structuredClone(forms.pos[0]!.forms[1]!);
    other.id = uuidFromInt(800);
    forms.pos[0]!.forms.push(other);
    const plan = planFormCopy(forms, sourceId, targetId, "phonetics");
    const next = applyFormCopy(forms, plan);
    expect(next.pos).toEqual(forms.pos);
    expect(
      expandFormContents(next).pos[0]!.forms[2]!.regional_variants
    ).toMatchObject({
      common: {
        pronunciations: [
          {
            dict_phonetic: variant(forms.contents[0]!).pronunciations[0]!
              .dict_phonetic
          }
        ]
      }
    });
    expect(planFormCopy(forms, targetId, other.id, "voices").sameContent).toBe(
      true
    );
    expect(
      applyFormCopy(forms, planFormCopy(forms, targetId, other.id, "voices"))
    ).toBe(forms);
    variant(forms.contents[0]!).pronunciations[0]!.dict_phonetic = "changed";
    expect(() => applyFormCopy(forms, plan)).toThrow("已变化");
    variant(forms.contents[0]!).pronunciations[0]!.dict_phonetic =
      plan.source.contentSnapshot.regional_variants.mode === "common"
        ? plan.source.contentSnapshot.regional_variants.common
            .pronunciations[0]!.dict_phonetic
        : "";
    variant(forms.contents[1]!).origin = "manual";
    expect(() => applyFormCopy(forms, plan)).toThrow("已变化");
    forms.pos[0]!.forms[1]!.content_id = forms.contents[0]!.id;
    expect(() => applyFormCopy(forms, plan)).toThrow("已变化");
  });
});
