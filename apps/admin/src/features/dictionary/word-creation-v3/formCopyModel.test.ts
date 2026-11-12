import { primaryRegionalVariant } from "@tsz/shared";
import { describe, expect, it } from "vitest";
import { synthesisForLocale } from "@tsz/shared";
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
      ? {
          dubbing: {
            area: "azure" as const,
            uk: { mode: "inherit" as const },
            us: { mode: "inherit" as const }
          }
        }
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
  return primaryRegionalVariant(content.regional_variants, side);
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
  it("拼写来源缺少独立音色时不复制残留读法profile", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    source.synthesis = {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      use_spelling: true
    };
    source.voice_profile = profile("stale-row");
    const original = structuredClone(forms);
    expect(() =>
      applyFormCopy(forms, planFormCopy(forms, sourceId, targetId, "voices"))
    ).toThrow("未配置");
    expect(forms).toEqual(original);
  });

  it("单侧复制到未配置的拼写来源，不将跳过侧的残留读法profile启用", () => {
    const { forms, sourceId, targetId } = setup();
    variant(forms.contents[0]!).pronunciations[0]!.voice_profile =
      profile("new-uk");
    const to = variant(forms.contents[1]!);
    const target = to.pronunciations[0]!;
    target.synthesis = {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      use_spelling: true
    };
    target.voice_profile = profile("stale-us");
    target.voice_profile.voices.forEach((voice) => {
      voice.locale = "en-US";
    });
    const next = applyFormCopy(
      forms,
      planFormCopy(forms, sourceId, targetId, "voices", {
        us: { [target.id]: null }
      })
    );
    expect(
      variant(next.contents[1]!).spelling_speech!.voice_profile.voices.map(
        (voice) => voice.voice_id
      )
    ).toEqual(["new-uk", "new-uk-disabled"]);
    expect(to.spelling_speech).toBeUndefined();
  });

  it.each(["skip", "different", "same"] as const)(
    "共享拼写音色按整个variant核对读法映射（%s）",
    (mapping) => {
      const { forms, sourceId, targetId } = setup(
        commonFormFixture({
          pronunciations: [
            pronunciationFixture({
              id: uuidFromInt(501),
              voice_profile: profile("first")
            }),
            pronunciationFixture({
              id: uuidFromInt(502),
              voice_profile: profile(mapping === "same" ? "first" : "second")
            })
          ]
        }),
        commonFormFixture({
          id: uuidFromInt(700),
          pronunciations: [
            pronunciationFixture({
              id: uuidFromInt(701),
              synthesis: {
                alphabet: "ipa",
                ipa: "",
                ups: "",
                use_spelling: true
              }
            }),
            pronunciationFixture({
              id: uuidFromInt(702),
              synthesis: {
                alphabet: "ipa",
                ipa: "",
                ups: "",
                use_spelling: true
              }
            })
          ]
        })
      );
      const to = variant(forms.contents[1]!);
      to.spelling_speech = speech(to.spelling, profile("original"));
      const skipped = to.pronunciations[1]!.id;
      const plan = planFormCopy(
        forms,
        sourceId,
        targetId,
        "voices",
        mapping === "skip"
          ? { uk: { [skipped]: null }, us: { [skipped]: null } }
          : {}
      );
      const original = structuredClone(forms);
      if (mapping === "same") {
        const next = applyFormCopy(forms, plan);
        expect(
          variant(next.contents[1]!).spelling_speech!.voice_profile.voices[0]!
            .voice_id
        ).toBe("first");
        expect(variant(next.contents[1]!).spelling_speech!.content).toEqual(
          to.spelling_speech.content
        );
      } else {
        expect(() => applyFormCopy(forms, plan)).toThrow("共用");
      }
      expect(forms).toEqual(original);
    }
  );

  it.each(["uk", "us"] as const)(
    "单侧复制%s音色保留跳过侧的无locale旧格式合成",
    (side) => {
      const { forms, sourceId, targetId } = setup(
        commonFormFixture({ spelling: "cat" }),
        commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
      );
      const source = variant(forms.contents[0]!).pronunciations[0]!;
      const to = variant(forms.contents[1]!);
      const target = to.pronunciations[0]!;
      source.voice_profile = profile("new-voice");
      target.synthesis = {
        alphabet: "ipa",
        ipa: "kæts",
        ups: "K AE T S",
        use_spelling: false
      };
      Object.assign(target.synthesis, {
        ipa_speech: speech(to.spelling, profile("old-ipa")),
        ups_speech: speech(to.spelling, profile("old-ups"))
      });
      const skipped = side === "uk" ? "us" : "uk";
      const skippedLocale = skipped === "uk" ? "en-GB" : "en-US";
      const before = synthesisForLocale(target.synthesis, skippedLocale);
      const original = structuredClone(forms);
      const next = applyFormCopy(
        forms,
        planFormCopy(forms, sourceId, targetId, "voices", {
          [skipped]: { [target.id]: null }
        })
      );
      const copied = variant(next.contents[1]!).pronunciations[0]!;
      expect(synthesisForLocale(copied.synthesis!, skippedLocale)).toEqual({
        ...before,
        ipa_locale: skippedLocale,
        ups_locale: skippedLocale
      });
      expect(
        copied.synthesis![side]!.ipa_speech!.voice_profile.voices[0]!.voice_id
      ).toBe("new-voice");
      expect(forms).toEqual(original);
    }
  );

  it.each([false, true])(
    "复制独立拼写音色而不使用残留profile（残留=%s）",
    (stale) => {
      const { forms, sourceId, targetId } = setup();
      const from = variant(forms.contents[0]!);
      const to = variant(forms.contents[1]!);
      const source = from.pronunciations[0]!;
      const target = to.pronunciations[0]!;
      source.synthesis = {
        alphabet: "ipa",
        ipa: "",
        ups: "",
        use_spelling: true
      };
      from.spelling_speech = {
        ...speech(from.spelling, profile("spelling-source")),
        audio_assets: [recording("source")]
      };
      if (stale) {
        source.voice_profile = profile("stale-row");
        source.synthesis.uk = {
          ipa: "inactive",
          ups: "",
          ipa_speech: speech(from.spelling, profile("stale-ipa"))
        };
      }
      target.synthesis = {
        alphabet: "ups",
        ipa: "",
        ups: "",
        use_spelling: true
      };
      to.spelling_speech = {
        ...speech(to.spelling, profile("target")),
        content: {
          version: 2,
          text: to.spelling,
          annotations: [{ type: "pause", at: 6, duration_ms: 100 }]
        },
        audio_assets: [recording("target")]
      };
      const original = structuredClone(forms);
      const next = applyFormCopy(
        forms,
        planFormCopy(forms, sourceId, targetId, "voices")
      );
      const copied = variant(next.contents[1]!);
      expect(copied.spelling_speech!.voice_profile.voices[0]!.voice_id).toBe(
        "spelling-source"
      );
      expect(
        copied.spelling_speech!.voice_profile.voices[0]!.version_id
      ).not.toBe(from.spelling_speech.voice_profile.voices[0]!.version_id);
      expect(
        JSON.stringify(copied.spelling_speech!.voice_profile)
      ).not.toContain("audio_asset_id");
      expect(copied.spelling_speech!.content).toEqual(
        to.spelling_speech.content
      );
      expect(copied.spelling_speech!.audio_assets).toEqual(
        to.spelling_speech.audio_assets
      );
      expect(copied.pronunciations[0]!.synthesis).toMatchObject({
        alphabet: "ups",
        use_spelling: true
      });
      expect(forms).toEqual(original);
    }
  );

  it.each(["cat", "𐐀cat"])(
    "音标复制映射%s正文首尾停顿，偏移按码点计算",
    (spelling) => {
      const { forms, sourceId, targetId } = setup(
        commonFormFixture({ spelling }),
        commonFormFixture({ id: uuidFromInt(700), spelling: `${spelling}s` })
      );
      const from = variant(forms.contents[0]!);
      const source = from.pronunciations[0]!;
      source.synthesis = {
        alphabet: "ipa",
        ipa: "",
        ups: "",
        uk: {
          ipa: "kæt",
          ups: "",
          ipa_speech: {
            ...speech(spelling, profile("source")),
            content: {
              version: 2,
              text: spelling,
              annotations: [
                { type: "pause", at: 0, duration_ms: 100 },
                {
                  type: "pause",
                  at: Array.from(spelling).length,
                  duration_ms: 200
                }
              ]
            }
          }
        }
      };
      const original = structuredClone(forms);
      const next = applyFormCopy(
        forms,
        planFormCopy(forms, sourceId, targetId, "phonetics")
      );
      expect(
        variant(next.contents[1]!).pronunciations[0]!.synthesis!.uk!.ipa_speech!
          .content
      ).toEqual({
        version: 2,
        text: `${spelling}s`,
        annotations: [
          { type: "pause", at: 0, duration_ms: 100 },
          {
            type: "pause",
            at: Array.from(spelling).length + 1,
            duration_ms: 200
          }
        ]
      });
      expect(forms).toEqual(original);
    }
  );

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

  it("common 目标按侧复制后保留跳过侧模式、区域和声音顺序", () => {
    const { forms, sourceId, targetId } = setup();
    const source = variant(forms.contents[0]!).pronunciations[0]!;
    const target = variant(forms.contents[1]!).pronunciations[0]!;
    source.voice_profile = profile("source");
    source.voice_profile.voices.forEach((voice) => {
      voice.locale = "en-GB";
    });
    target.voice_profile = {
      voices: [
        { ...profile("keep-us").voices[0]!, locale: "en-US" },
        { ...profile("keep-us").voices[1]!, locale: "en-US" }
      ],
      dubbing: {
        area: "word" as const,
        uk: { mode: "local" },
        us: { mode: "inherit" }
      }
    };
    const before = structuredClone(forms);
    const plan = planFormCopy(forms, sourceId, targetId, "voices", {
      us: { [target.id]: null }
    });
    const result = applyFormCopy(forms, plan);
    const copied = variant(result.contents[1]!).pronunciations[0]!
      .voice_profile!;
    expect(copied.dubbing).toEqual(target.voice_profile!.dubbing);
    expect(copied.voices.filter((voice) => voice.locale === "en-US")).toEqual(
      target.voice_profile!.voices
    );
    expect(
      copied.voices
        .filter((voice) => voice.locale === "en-GB")
        .map((voice) => voice.voice_id)
    ).toEqual(source.voice_profile!.voices.map((voice) => voice.voice_id));
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
        dubbing: {
          area: "azure" as const,
          uk: { mode: "inherit" as const },
          us: { mode: "inherit" as const }
        }
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
      dubbing: { area: "azure", uk: { mode: "local" }, us: { mode: "local" } },
      voices: [
        { voice_id: "resolved-uk" },
        { voice_id: "resolved-uk-disabled" }
      ]
    });
    expect(
      row.synthesis!.us!.ups_speech!.voice_profile.voices[0]!.voice_id
    ).toBe("resolved-us");
    source.voice_profile.dubbing!.uk.mode = "local";
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
    expect(copied.voice_profile!.dubbing!.uk.mode).toBe("local");
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
      expect(variant(next.contents[1]!, side).spelling_speech).toMatchObject({
        content: {
          version: 2,
          text: variant(forms.contents[1]!, side).spelling,
          annotations: []
        },
        voice_profile: {
          voices: [
            { voice_id: `ups-${side}`, enabled: true },
            { voice_id: `ups-${side}-disabled`, enabled: false }
          ]
        }
      });
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

it("复制音标保留逐侧UPS和停配，复制上传来源时保留目标选择与录音", () => {
  const { forms, sourceId, targetId } = setup(
    commonFormFixture({ spelling: "cat" }),
    commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
  );
  const from = variant(forms.contents[0]!).pronunciations[0]!;
  const to = variant(forms.contents[1]!).pronunciations[0]!;
  from.synthesis = {
    alphabet: "ipa",
    use_spelling: false,
    ipa: "",
    ups: "",
    uk: { source: "ups", ipa: "kæt", ups: "K AE T" },
    us: { source: "none", ipa: "kæt", ups: "K AE T" }
  };
  let result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "phonetics")
  );
  let copied = variant(result.contents[1]!).pronunciations[0]!;
  expect(copied.synthesis!.uk!.source).toBe("ups");
  expect(copied.synthesis!.us!.source).toBe("none");
  from.synthesis.uk!.source = "upload";
  to.synthesis = {
    alphabet: "ipa",
    use_spelling: false,
    ipa: "",
    ups: "",
    uk: { source: "none", ipa: "", ups: "" },
    us: { source: "ipa", ipa: "", ups: "" }
  };
  from.audio_assets = [recording("source-upload")];
  to.audio_assets = [recording("target-upload")];
  result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "phonetics")
  );
  copied = variant(result.contents[1]!).pronunciations[0]!;
  expect(copied.synthesis!.uk!.source).toBe("none");
  expect(copied.audio_assets).toEqual(to.audio_assets);
});

it("复制音色按逐侧拼写与音素来源取值，不读取相反的旧全局开关", () => {
  const { forms, sourceId, targetId } = setup(
    commonFormFixture({ spelling: "cat" }),
    commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
  );
  const fromVariant = variant(forms.contents[0]!);
  const toVariant = variant(forms.contents[1]!);
  const from = fromVariant.pronunciations[0]!;
  const to = toVariant.pronunciations[0]!;
  const voice = profile("spelling-current");
  fromVariant.spelling_speech = speech("cat", voice);
  from.synthesis = {
    alphabet: "ipa",
    use_spelling: false,
    ipa: "",
    ups: "",
    uk: { source: "spelling", ipa: "", ups: "" },
    us: { source: "spelling", ipa: "", ups: "" }
  };
  to.synthesis = {
    alphabet: "ipa",
    use_spelling: false,
    ipa: "",
    ups: "",
    uk: { source: "spelling", ipa: "", ups: "" },
    us: { source: "spelling", ipa: "", ups: "" }
  };
  let result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "voices")
  );
  expect(
    variant(result.contents[1]!).spelling_speech!.voice_profile.voices[0]!
      .voice_id
  ).toBe("spelling-current");
  from.synthesis.use_spelling = true;
  for (const side of ["uk", "us"] as const) {
    const selected = profile("phoneme-current");
    selected.voices.forEach((item) => {
      item.locale = side === "uk" ? "en-GB" : "en-US";
    });
    from.synthesis[side] = {
      source: "ipa",
      ipa: "kæt",
      ups: "",
      ipa_speech: speech("cat", selected)
    };
  }
  result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "voices")
  );
  expect(
    variant(result.contents[1]!).spelling_speech!.voice_profile.voices[0]!
      .voice_id
  ).toBe("phoneme-current");
  expect(toVariant.spelling_speech).toBeUndefined();
});

it("只复制英式拼写音色时保留美式IPA行的原有音色缓存", () => {
  const { forms, sourceId, targetId } = setup(
    commonFormFixture({ spelling: "cat" }),
    commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
  );
  const fromVariant = variant(forms.contents[0]!);
  const toVariant = variant(forms.contents[1]!);
  const from = fromVariant.pronunciations[0]!;
  const to = toVariant.pronunciations[0]!;
  fromVariant.spelling_speech = speech("cat", profile("new-spelling"));
  from.synthesis = {
    alphabet: "ipa",
    ipa: "",
    ups: "",
    uk: { source: "spelling", ipa: "", ups: "" }
  };
  to.synthesis = {
    alphabet: "ipa",
    ipa: "",
    ups: "",
    uk: { source: "spelling", ipa: "", ups: "" },
    us: { source: "ipa", ipa: "kæts", ups: "" }
  };
  const retained = profile("keep-us");
  retained.voices.forEach((voice) => {
    voice.locale = "en-US";
  });
  to.voice_profile = retained;
  const result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "voices", { us: { [to.id]: null } })
  );
  const copied = variant(result.contents[1]!);
  expect(copied.pronunciations[0]!.voice_profile).toEqual(retained);
  expect(copied.pronunciations[0]!.synthesis!.us).toEqual(to.synthesis.us);
  expect(copied.spelling_speech!.voice_profile.voices[0]!.voice_id).toBe(
    "new-spelling"
  );
});

it("混合旧格式复制上传来源时保留目标该侧有效拼写来源", () => {
  const { forms, sourceId, targetId } = setup(
    commonFormFixture({ spelling: "cat" }),
    commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
  );
  const from = variant(forms.contents[0]!).pronunciations[0]!;
  const to = variant(forms.contents[1]!).pronunciations[0]!;
  from.synthesis = {
    alphabet: "ipa",
    use_spelling: false,
    ipa: "",
    ups: "",
    uk: { source: "upload", ipa: "kæt", ups: "" },
    us: { ipa: "kæt", ups: "" }
  };
  to.synthesis = {
    alphabet: "ipa",
    use_spelling: true,
    ipa: "",
    ups: "",
    uk: { ipa: "", ups: "" },
    us: { ipa: "", ups: "" }
  };
  const result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "phonetics")
  );
  const synthesis = variant(result.contents[1]!).pronunciations[0]!.synthesis!;
  expect(synthesisForLocale(synthesis, "en-GB", "common").use_spelling).toBe(
    true
  );
  expect(synthesisForLocale(synthesis, "en-US", "common").use_spelling).toBe(
    false
  );
});

it("另一侧旧来源改变时不覆盖显式侧既有IPA音色缓存", () => {
  const { forms, sourceId, targetId } = setup(
    commonFormFixture({ spelling: "cat" }),
    commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
  );
  const from = variant(forms.contents[0]!).pronunciations[0]!;
  const targetVariant = variant(forms.contents[1]!);
  const to = targetVariant.pronunciations[0]!;
  from.synthesis = {
    alphabet: "ipa",
    use_spelling: false,
    ipa: "",
    ups: "",
    uk: { source: "ipa", ipa: "kæt", ups: "" },
    us: { ipa: "kæt", ups: "" }
  };
  to.voice_profile = profile("row-fallback");
  const spellingProfile = profile("spelling-target", true);
  spellingProfile.dubbing!.area = "word";
  targetVariant.spelling_speech = speech("cats", spellingProfile);
  to.synthesis = {
    alphabet: "ipa",
    use_spelling: true,
    ipa: "",
    ups: "",
    uk: {
      source: "ipa",
      ipa: "kæts",
      ups: "",
      ipa_speech: speech("cats", profile("keep-uk-ipa"))
    },
    us: { ipa: "kæts", ups: "" }
  };
  const result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "phonetics")
  );
  const synthesis = variant(result.contents[1]!).pronunciations[0]!.synthesis!;
  expect(synthesis.uk!.ipa_speech!.voice_profile.voices[0]!.voice_id).toBe(
    "keep-uk-ipa"
  );
  expect(synthesis.us!.ipa_speech!.voice_profile.voices[0]!.voice_id).toBe(
    "spelling-target"
  );
  expect(synthesis.us!.ipa_speech!.voice_profile.dubbing!.area).toBe("azure");
  expect(synthesis.us!.ipa_speech!.voice_profile.dubbing!.us.mode).toBe(
    "inherit"
  );
});

it("部分合并按保存的口音归属替换，而不是按原生locale保留旧英式声音", () => {
  const { forms, sourceId, targetId } = setup();
  const from = variant(forms.contents[0]!).pronunciations[0]!;
  const to = variant(forms.contents[1]!).pronunciations[0]!;
  from.voice_profile = profile("same-voice");
  const oldBritish = {
    ...profile("same-voice").voices[0]!,
    version_id: uuidFromInt(599),
    locale: "en-US" as const,
    accent: "gb" as const,
    rate_percent: 30
  };
  const american = {
    ...profile("keep-us").voices[0]!,
    version_id: uuidFromInt(598),
    locale: "en-US" as const,
    accent: "us" as const
  };
  to.voice_profile = {
    voices: [oldBritish, american],
    dubbing: { area: "word", uk: { mode: "local" }, us: { mode: "local" } }
  };
  const result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "voices", { us: { [to.id]: null } })
  );
  const copied = variant(result.contents[1]!).pronunciations[0]!.voice_profile!;
  expect(
    copied.voices.filter(
      (voice) => voice.voice_id === "same-voice" && voice.enabled
    )
  ).toHaveLength(1);
  expect(
    copied.voices.find((voice) => voice.voice_id === "same-voice")!.rate_percent
  ).toBe(12);
  expect(copied.voices.find((voice) => voice.voice_id === "keep-us")).toEqual(
    american
  );
});

it("音标来源迁移到拼写时保留本侧继承模式和另一侧拼写缓存", () => {
  const { forms, sourceId, targetId } = setup(
    commonFormFixture({ spelling: "cat" }),
    commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
  );
  const from = variant(forms.contents[0]!).pronunciations[0]!;
  const targetVariant = variant(forms.contents[1]!);
  const to = targetVariant.pronunciations[0]!;
  from.synthesis = {
    alphabet: "ipa",
    ipa: "",
    ups: "",
    uk: { source: "spelling", ipa: "kæt", ups: "" },
    us: { source: "ipa", ipa: "kæt", ups: "" }
  };
  const inherited = profile("own-ipa", true);
  const american = {
    ...profile("keep-us-spelling").voices[0]!,
    locale: "en-US" as const,
    accent: "us" as const
  };
  targetVariant.spelling_speech = speech("cats", {
    voices: [american],
    dubbing: { area: "word", uk: { mode: "local" }, us: { mode: "local" } }
  });
  to.synthesis = {
    alphabet: "ipa",
    ipa: "",
    ups: "",
    uk: {
      source: "ipa",
      ipa: "kæts",
      ups: "",
      ipa_speech: speech("cats", inherited)
    },
    us: { source: "ipa", ipa: "kæts", ups: "" }
  };
  const result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "phonetics")
  );
  const migrated = variant(result.contents[1]!).spelling_speech!.voice_profile;
  expect(migrated.dubbing).toEqual({
    area: "word",
    uk: { mode: "inherit" },
    us: { mode: "local" }
  });
  expect(migrated.voices.find((voice) => voice.locale === "en-US")).toEqual(
    american
  );
});

it("原无合成来源的目标从显式IPA资料复制后仍使用自己的逐侧音色", () => {
  const { forms, sourceId, targetId } = setup(
    commonFormFixture({ spelling: "cat" }),
    commonFormFixture({ id: uuidFromInt(700), spelling: "cats" })
  );
  const from = variant(forms.contents[0]!).pronunciations[0]!;
  const to = variant(forms.contents[1]!).pronunciations[0]!;
  from.synthesis = {
    alphabet: "ipa",
    ipa: "",
    ups: "",
    uk: { source: "ipa", ipa: "kæt", ups: "" },
    us: { source: "ipa", ipa: "kæt", ups: "" }
  };
  delete to.synthesis;
  const british = profile("own-uk").voices[0]!;
  const american = {
    ...profile("own-us").voices[0]!,
    locale: "en-US" as const,
    version_id: uuidFromInt(901)
  };
  to.voice_profile = { voices: [british, american] };
  const result = applyFormCopy(
    forms,
    planFormCopy(forms, sourceId, targetId, "phonetics")
  );
  const copied = variant(result.contents[1]!).pronunciations[0]!;
  expect(
    copied
      .synthesis!.uk!.ipa_speech!.voice_profile.voices.filter(
        (voice) => voice.enabled
      )
      .map((voice) => voice.voice_id)
  ).toEqual(["own-uk"]);
  expect(
    copied
      .synthesis!.us!.ipa_speech!.voice_profile.voices.filter(
        (voice) => voice.enabled
      )
      .map((voice) => voice.voice_id)
  ).toEqual(["own-us"]);
  expect(JSON.stringify(copied.synthesis)).not.toContain("audio_asset_id");
});
