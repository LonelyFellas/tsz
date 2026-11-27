import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SharedFormsStepContentV3, VoiceProfileV3 } from "@tsz/types";
import { pronunciationPlaybackSource } from "@tsz/shared";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  uuidFromInt
} from "./fixtures";
import { applyFormCopy, planFormCopy } from "./formCopyModel";
import { resolveFormCopyProfiles } from "./formCopyProfiles";
import { applyFormsStructure } from "./sharedFormsModel";

const { resolve, voices } = vi.hoisted(() => ({
  resolve: vi.fn(),
  voices: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ api: { speech: { resolve, voices } } }));
function fixture(profile: VoiceProfileV3): SharedFormsStepContentV3 {
  return applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    formsFixture({
      forms: [
        commonFormFixture({
          pronunciations: [
            pronunciationFixture({
              voice_profile: profile,
              synthesis: {
                alphabet: "ipa",
                ipa: "s",
                ups: "S",
                uk: {
                  ipa: "s",
                  ups: "S",
                  ipa_speech: {
                    content: { version: 2, text: "centre", annotations: [] },
                    voice_profile: profile
                  }
                }
              }
            })
          ]
        }),
        commonFormFixture({
          id: uuidFromInt(900),
          spelling: "centres",
          form_type: "plural"
        })
      ]
    })
  ) as SharedFormsStepContentV3;
}
const profile: VoiceProfileV3 = {
  voices: [
    {
      voice_id: "stored",
      version_id: uuidFromInt(50),
      version_name: "stored",
      locale: "en-GB",
      enabled: false,
      rate_percent: -10,
      pitch_semitones: 1
    }
  ],
  dubbing: { area: "azure", uk: { mode: "inherit" }, us: { mode: "inherit" } }
};
beforeEach(() => {
  voices.mockReset().mockResolvedValue({
    items: [
      { alias: "stored", locale: "en-GB", accent: "gb" },
      { alias: "resolved", locale: "en-GB", accent: "gb" }
    ]
  });
  resolve.mockReset().mockResolvedValue({
    voices: [
      {
        voice_id: "resolved",
        version_id: uuidFromInt(51),
        version_name: "resolved",
        locale: "en-GB",
        enabled: true,
        rate_percent: 20,
        style_degree: 1.5,
        role: "YoungAdultFemale"
      }
    ]
  });
});

it("共用同一拼写的多条来源读法只解析一次，复制解析后的英式配音", async () => {
  const forms = fixture(profile);
  const source = forms.contents[0]!.regional_variants;
  const target = forms.contents[1]!.regional_variants;
  if (source.mode !== "common" || target.mode !== "common")
    throw new Error("fixture");
  source.common.spelling_speech = {
    content: { version: 2, text: source.common.spelling, annotations: [] },
    voice_profile: {
      ...profile,
      dubbing: { area: "word", uk: { mode: "inherit" }, us: { mode: "local" } }
    }
  };
  source.common.pronunciations = ["citation", "normal"].map((style, index) => ({
    ...pronunciationFixture({
      id: uuidFromInt(620 + index),
      style: style === "citation" ? "citation" : "normal"
    }),
    synthesis: {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      use_spelling: true,
      us: { source: "none", ipa: "", ups: "" }
    }
  }));
  target.common.pronunciations.push(
    pronunciationFixture({ id: uuidFromInt(624), style: "citation" }),
    pronunciationFixture({ id: uuidFromInt(625), style: "citation" })
  );
  const plan = planFormCopy(
    forms,
    forms.pos[0]!.forms[0]!.id,
    forms.pos[0]!.forms[1]!.id,
    "voices"
  );
  const resolved = await resolveFormCopyProfiles(
    plan,
    new AbortController().signal
  );
  const result = applyFormCopy(forms, plan, resolved).contents[1]!
    .regional_variants;

  expect(resolve).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({
    common: {
      spelling_speech: {
        voice_profile: {
          dubbing: { uk: { mode: "local" }, us: { mode: "inherit" } },
          voices: [
            expect.objectContaining({ voice_id: "stored", enabled: false }),
            expect.objectContaining({ voice_id: "resolved", rate_percent: 20 })
          ]
        }
      }
    }
  });
});

it("共享拼写已有有效配音时不解析被跳过的独立音素", async () => {
  const forms = fixture(profile);
  const source = forms.contents[0]!.regional_variants;
  const target = forms.contents[1]!.regional_variants;
  if (source.mode !== "common" || target.mode !== "common")
    throw new Error("fixture");
  const from = source.common;
  const to = target.common;
  from.spelling_speech = {
    content: { version: 2, text: from.spelling, annotations: [] },
    voice_profile: {
      ...profile,
      dubbing: { ...profile.dubbing!, area: "word" }
    }
  };
  const independent = from.pronunciations[0]!;
  independent.synthesis!.uk!.source = "ipa";
  independent.synthesis!.uk!.ipa = "";
  from.pronunciations.unshift(
    pronunciationFixture({
      id: uuidFromInt(660),
      synthesis: {
        alphabet: "ipa",
        ipa: "",
        ups: "",
        uk: { source: "spelling", ipa: "", ups: "" },
        us: { source: "none", ipa: "", ups: "" }
      }
    })
  );
  const skipped = pronunciationFixture({
    id: uuidFromInt(662),
    synthesis: structuredClone(independent.synthesis)
  });
  to.pronunciations.push(
    pronunciationFixture({ id: uuidFromInt(661) }),
    skipped
  );
  resolve.mockImplementation(
    async ({ source }: { source: { kind: string } }) => {
      if (source.kind === "phoneme") throw new Error("empty phoneme");
      return {
        voices: [
          {
            voice_id: "resolved",
            locale: "en-GB",
            enabled: true,
            rate_percent: 20
          }
        ]
      };
    }
  );
  const plan = planFormCopy(
    forms,
    forms.pos[0]!.forms[0]!.id,
    forms.pos[0]!.forms[1]!.id,
    "voices",
    {
      uk: { [skipped.id]: null },
      us: Object.fromEntries(to.pronunciations.map(({ id }) => [id, null]))
    }
  );
  const resolved = await resolveFormCopyProfiles(
    plan,
    new AbortController().signal
  );
  const result = applyFormCopy(forms, plan, resolved).contents[1]!
    .regional_variants;
  expect(result).toMatchObject({
    common: {
      spelling_speech: {
        voice_profile: {
          voices: expect.arrayContaining([
            expect.objectContaining({ voice_id: "resolved", rate_percent: 20 })
          ])
        }
      },
      pronunciations: [to.pronunciations[0], to.pronunciations[1], skipped]
    }
  });
});

it.each(["ipa", "spelling", "default"] as const)(
  "把来源当前使用的 UPS 配音复制到目标实际使用的 %s，并作为独立局部参数",
  async (targetSource) => {
    const sourceProfile: VoiceProfileV3 = {
      voices: [
        {
          voice_id: "stored",
          version_id: uuidFromInt(610),
          version_name: "Sonia",
          locale: "en-GB",
          enabled: true,
          rate_percent: 0,
          volume_percent: 93,
          audio_asset_id: uuidFromInt(611)
        }
      ],
      dubbing: { area: "azure", uk: { mode: "local" }, us: { mode: "local" } }
    };
    resolve.mockImplementation(
      async ({ profile }: { profile: VoiceProfileV3 }) => ({
        voices: profile.voices
      })
    );
    const forms = fixture(sourceProfile);
    const from = forms.contents[0]!.regional_variants;
    const to = forms.contents[1]!.regional_variants;
    if (from.mode !== "common" || to.mode !== "common")
      throw new Error("fixture");
    const source = from.common.pronunciations[0]!;
    const target = to.common.pronunciations[0]!;
    const sourceCandidate = source.synthesis!.uk!;
    delete source.voice_profile;
    source.synthesis!.us = { source: "none", ipa: "", ups: "" };
    sourceCandidate.source = "ups";
    sourceCandidate.ups_speech = structuredClone(sourceCandidate.ipa_speech!);
    sourceCandidate.ipa_speech!.voice_profile = {
      ...sourceProfile,
      voices: [
        {
          ...sourceProfile.voices[0]!,
          version_id: uuidFromInt(614),
          rate_percent: -20
        }
      ]
    };

    const previousProfile: VoiceProfileV3 = {
      voices: [
        {
          ...sourceProfile.voices[0]!,
          version_id: uuidFromInt(615),
          rate_percent: -10
        }
      ],
      dubbing: {
        area: targetSource === "ipa" ? "azure" : "word",
        uk: {
          mode: "local",
          recommendations: [
            {
              group_id: uuidFromInt(612),
              recommendation_id: uuidFromInt(613),
              voice_id: "stored",
              contribution_id: uuidFromInt(615)
            }
          ]
        },
        us: { mode: "inherit" }
      }
    };
    const targetSpeech = {
      content: {
        version: 2 as const,
        text: to.common.spelling,
        annotations:
          targetSource === "default"
            ? []
            : [{ type: "pause" as const, at: 0, duration_ms: 100 }]
      },
      voice_profile: previousProfile
    };
    if (targetSource === "ipa") {
      target.synthesis = {
        alphabet: "ipa",
        ipa: "",
        ups: "",
        uk: { source: "ipa", ipa: "s", ups: "", ipa_speech: targetSpeech }
      };
    } else {
      delete target.synthesis;
      if (targetSource === "spelling") to.common.spelling_speech = targetSpeech;
    }

    const plan = planFormCopy(
      forms,
      forms.pos[0]!.forms[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      "voices"
    );
    const profiles = await resolveFormCopyProfiles(
      plan,
      new AbortController().signal
    );
    const next = applyFormCopy(forms, plan, profiles);
    const copied = next.contents[1]!.regional_variants;
    if (copied.mode !== "common") throw new Error("fixture");
    const variant = copied.common;
    const row = variant.pronunciations[0]!;
    const active = pronunciationPlaybackSource(
      variant.spelling,
      row,
      variant.spelling_speech,
      "en-GB",
      "common"
    );
    expect(active.profile?.voices).toEqual([
      expect.objectContaining({
        voice_id: "stored",
        enabled: true,
        rate_percent: 0,
        volume_percent: 93
      })
    ]);
    expect(active.profile?.voices[0]!.version_id).not.toBe(uuidFromInt(610));
    expect(active.profile?.voices[0]!.version_id).not.toBe(uuidFromInt(615));
    expect(active.profile?.voices[0]!.audio_asset_id).toBeUndefined();
    expect(active.profile?.dubbing?.uk).toEqual({ mode: "local" });
    expect(active.profile?.dubbing?.area).toBe(previousProfile.dubbing!.area);
    const destination =
      targetSource === "ipa"
        ? row.synthesis?.uk?.ipa_speech
        : variant.spelling_speech;
    expect(destination?.content).toEqual(targetSpeech.content);
    expect(row.synthesis?.uk?.source).toBe(
      targetSource === "ipa" ? "ipa" : undefined
    );
    if (targetSource !== "ipa") {
      expect(active.profile?.dubbing?.us).toEqual({ mode: "inherit" });
    }
    expect(next.contents[0]).toEqual(forms.contents[0]);
  }
);

it.each(["default", "recommended", "duplicate", "reassigned"] as const)(
  "单侧复制旧版参数时保留拼写目标的另一侧推荐，并拒绝冲突（%s）",
  async (scenario) => {
    const legacy: VoiceProfileV3 = {
      voices: [{ voice_id: "stored", enabled: true, rate_percent: -20 }]
    };
    if (scenario === "reassigned") {
      Object.assign(legacy.voices[0]!, {
        version_id: uuidFromInt(620),
        version_name: "Sonia",
        locale: "en-US"
      });
      voices.mockResolvedValue({
        items: [{ alias: "stored", locale: "en-US", accent: "gb" }]
      });
    }
    if (scenario === "duplicate") {
      legacy.voices.push({
        voice_id: "resolved",
        enabled: true,
        rate_percent: 0
      });
      voices.mockResolvedValue({
        items: legacy.voices.map(({ voice_id }) => ({
          alias: voice_id,
          locale: "en-GB",
          accent: "gb",
          capability_evidence: { provider_voice_id: "en-GB-SoniaNeural" }
        }))
      });
    }
    const forms = fixture(legacy);
    const from = forms.contents[0]!.regional_variants;
    const to = forms.contents[1]!.regional_variants;
    if (from.mode !== "common" || to.mode !== "common")
      throw new Error("fixture");
    const source = from.common.pronunciations[0]!;
    source.synthesis!.uk!.source = "ipa";
    const target = to.common.pronunciations[0]!;
    delete target.synthesis;
    if (scenario === "recommended") {
      to.common.spelling_speech = {
        content: { text: to.common.spelling, version: 2, annotations: [] },
        voice_profile: {
          voices: [],
          dubbing: {
            area: "word",
            uk: { mode: "inherit" },
            us: { mode: "inherit" }
          }
        }
      };
    }
    const [sourceForm, targetForm] = forms.pos[0]!.forms;
    const plan = planFormCopy(forms, sourceForm!.id, targetForm!.id, "voices", {
      us: { [target.id]: null }
    });
    const profiles = await resolveFormCopyProfiles(
      plan,
      new AbortController().signal
    );
    if (scenario === "duplicate") {
      const before = structuredClone(forms);
      expect(() => applyFormCopy(forms, plan, profiles)).toThrow(
        "同一官方音色有多个旧版本"
      );
      expect(forms).toEqual(before);
      return;
    }
    const copied = applyFormCopy(forms, plan, profiles).contents[1]!
      .regional_variants;
    if (copied.mode !== "common") throw new Error("fixture");
    expect(copied.common.spelling_speech?.voice_profile).toEqual({
      voices: [
        {
          ...legacy.voices[0],
          version_id: expect.any(String),
          version_name: expect.any(String),
          locale: scenario === "reassigned" ? "en-US" : "en-GB",
          ...(scenario === "reassigned" ? { accent: "gb" } : {})
        }
      ],
      dubbing: { area: "word", uk: { mode: "local" }, us: { mode: "inherit" } }
    });
  }
);

describe("复制前解析完整音色配置", () => {
  it("独立拼写音色未配置时不请求解析残留读法配置", async () => {
    const forms = fixture(profile);
    const regions = forms.contents[0]!.regional_variants;
    if (regions.mode !== "common") throw new Error("fixture");
    regions.common.pronunciations[0]!.synthesis!.use_spelling = true;
    const plan = planFormCopy(
      forms,
      forms.pos[0]!.forms[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      "voices"
    );
    expect(
      await resolveFormCopyProfiles(plan, new AbortController().signal)
    ).toEqual([]);
    expect(voices).not.toHaveBeenCalled();
    expect(resolve).not.toHaveBeenCalled();
  });

  it.each(["explicit", "explicit-with-stale-row", "implicit"] as const)(
    "按实际使用的拼写正文解析独立音色（%s）",
    async (sourceKind) => {
      const forms = fixture({
        voices: [{ voice_id: "stale", enabled: true, rate_percent: 0 }],
        dubbing: {
          area: "azure",
          uk: { mode: "inherit" },
          us: { mode: "inherit" }
        }
      });
      const fromRegions = forms.contents[0]!.regional_variants;
      const toRegions = forms.contents[1]!.regional_variants;
      if (fromRegions.mode !== "common" || toRegions.mode !== "common")
        throw new Error("fixture");
      const from = fromRegions.common;
      const to = toRegions.common;
      const row = from.pronunciations[0]!;
      const stale = sourceKind === "explicit-with-stale-row";
      row.synthesis!.use_spelling = true;
      from.spelling_speech = {
        content: {
          version: 2,
          text: from.spelling,
          annotations: [{ type: "pause", at: 0, duration_ms: 100 }]
        },
        ...(stale
          ? {
              content_by_accent: {
                uk: {
                  version: 2 as const,
                  text: from.spelling,
                  annotations: []
                }
              }
            }
          : {}),
        voice_profile: structuredClone(profile)
      };
      if (!stale) {
        delete row.voice_profile;
        delete row.synthesis!.uk;
      }
      if (sourceKind === "implicit") delete row.synthesis;
      to.pronunciations[0]!.synthesis = {
        alphabet: "ipa",
        ipa: "",
        ups: "",
        use_spelling: true
      };
      const plan = planFormCopy(
        forms,
        forms.pos[0]!.forms[0]!.id,
        forms.pos[0]!.forms[1]!.id,
        "voices",
        { us: { [to.pronunciations[0]!.id]: null } }
      );
      const signal = new AbortController().signal;
      const resolved = await resolveFormCopyProfiles(plan, signal);
      expect(resolve).toHaveBeenCalledExactlyOnceWith(
        {
          profile: from.spelling_speech.voice_profile,
          source: {
            kind: "text",
            content:
              from.spelling_speech.content_by_accent?.uk ??
              from.spelling_speech.content
          },
          accent: "gb"
        },
        signal
      );
      const next = applyFormCopy(forms, plan, resolved).contents[1]!
        .regional_variants;
      if (next.mode !== "common") throw new Error("fixture");
      expect(
        next.common.spelling_speech!.voice_profile.voices.map(
          (setting) => setting.voice_id
        )
      ).toEqual(["stored", "resolved"]);
      expect(next.common.spelling_speech!.voice_profile.dubbing!.uk.mode).toBe(
        "local"
      );
    }
  );

  it("解析继承配音，保留未启用配置，并按口音和正文类型请求", async () => {
    const forms = fixture(profile);
    const plan = planFormCopy(
      forms,
      forms.pos[0]!.forms[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      "voices"
    );
    const controller = new AbortController();
    const result = await resolveFormCopyProfiles(plan, controller.signal);
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        accent: "gb",
        source: expect.objectContaining({
          kind: "phoneme",
          phoneme_locale: "en-GB",
          phoneme: "s"
        })
      }),
      controller.signal
    );
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        accent: "us",
        source: expect.objectContaining({ kind: "text" })
      }),
      controller.signal
    );
    expect(
      result.find((item) => item.side === "uk" && item.channel === "ipa")
        ?.profile.voices
    ).toEqual([
      profile.voices[0],
      expect.objectContaining({
        voice_id: "resolved",
        rate_percent: 20,
        style_degree: 1.5,
        role: "YoungAdultFemale"
      })
    ]);
    expect(forms.contents[0]).toEqual(plan.source.contentSnapshot);
  });
  it("音标复制和显式局部参数无需请求；带继承语义的 local 仍解析实际配置", async () => {
    const forms = fixture({ voices: profile.voices });
    const source = forms.pos[0]!.forms[0]!.id,
      target = forms.pos[0]!.forms[1]!.id;
    await resolveFormCopyProfiles(
      planFormCopy(forms, source, target, "phonetics"),
      new AbortController().signal
    );
    await resolveFormCopyProfiles(
      planFormCopy(forms, source, target, "voices"),
      new AbortController().signal
    );
    expect(resolve).not.toHaveBeenCalled();
    const local = fixture({
      ...profile,
      dubbing: { area: "azure", uk: { mode: "local" }, us: { mode: "local" } }
    });
    await resolveFormCopyProfiles(
      planFormCopy(local, source, target, "voices"),
      new AbortController().signal
    );
    expect(resolve).toHaveBeenCalled();
  });
  it("原生地区不覆盖目录人工口音归属，跨侧禁用副本不会覆盖启用音色", async () => {
    voices.mockResolvedValue({
      items: [
        { alias: "reassigned", locale: "en-US", accent: "gb" },
        { alias: "canadian", locale: "en-CA", accent: "us" }
      ]
    });
    const sourceProfile: VoiceProfileV3 = {
      voices: [
        {
          voice_id: "reassigned",
          locale: "en-US",
          version_id: uuidFromInt(60),
          version_name: "British",
          enabled: true,
          rate_percent: -10
        },
        {
          voice_id: "canadian",
          locale: "en-CA",
          version_id: uuidFromInt(61),
          version_name: "American",
          enabled: true,
          rate_percent: 20
        }
      ],
      dubbing: { area: "azure", uk: { mode: "local" }, us: { mode: "local" } }
    };
    resolve.mockImplementation(async (input) => ({
      voices: sourceProfile.voices.filter(
        (setting) =>
          setting.voice_id ===
          (input.accent === "gb" ? "reassigned" : "canadian")
      )
    }));
    const forms = fixture(sourceProfile);
    const plan = planFormCopy(
      forms,
      forms.pos[0]!.forms[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      "voices"
    );
    const profiles = await resolveFormCopyProfiles(
      plan,
      new AbortController().signal
    );
    expect(
      profiles
        .find((item) => item.side === "uk" && item.channel === "fallback")!
        .profile.voices.map((setting) => [setting.voice_id, setting.enabled])
    ).toEqual([["reassigned", true]]);
    expect(
      profiles
        .find((item) => item.side === "us" && item.channel === "fallback")!
        .profile.voices.map((setting) => [setting.voice_id, setting.enabled])
    ).toEqual([["canadian", true]]);
    const target = applyFormCopy(forms, plan, profiles).contents[1]!
      .regional_variants;
    if (target.mode !== "common") throw new Error("fixture");
    expect(
      target.common.pronunciations[0]!.voice_profile!.voices.map((setting) => [
        setting.voice_id,
        setting.enabled
      ])
    ).toEqual([
      ["reassigned", true],
      ["canadian", true]
    ]);
  });

  it("任何通道解析失败都返回失败，调用者不能应用部分结果", async () => {
    resolve.mockRejectedValueOnce(new Error("配置已失效"));
    const forms = fixture(profile);
    const plan = planFormCopy(
      forms,
      forms.pos[0]!.forms[0]!.id,
      forms.pos[0]!.forms[1]!.id,
      "voices"
    );
    await expect(
      resolveFormCopyProfiles(plan, new AbortController().signal)
    ).rejects.toThrow("配置已失效");
  });
});

it("逐侧拼写选择覆盖旧全局开关，复制前解析实际拼写配置", async () => {
  const forms = fixture(profile);
  const region = forms.contents[0]!.regional_variants;
  if (region.mode !== "common") throw new Error("fixture");
  const row = region.common.pronunciations[0]!;
  delete row.voice_profile;
  row.synthesis!.use_spelling = false;
  row.synthesis!.uk = { ...row.synthesis!.uk!, source: "spelling" };
  row.synthesis!.us = { ipa: "", ups: "", source: "none" };
  region.common.spelling_speech = {
    content: { version: 2, text: region.common.spelling, annotations: [] },
    voice_profile: profile
  };
  const plan = planFormCopy(
    forms,
    forms.pos[0]!.forms[0]!.id,
    forms.pos[0]!.forms[1]!.id,
    "voices"
  );
  const resolved = await resolveFormCopyProfiles(
    plan,
    new AbortController().signal
  );
  expect(
    resolved.some((item) => item.side === "uk" && item.channel === "fallback")
  ).toBe(true);
  expect(resolve).toHaveBeenCalledWith(
    expect.objectContaining({
      profile,
      accent: "gb",
      source: expect.objectContaining({
        kind: "text",
        content: expect.objectContaining({ text: region.common.spelling })
      })
    }),
    expect.any(AbortSignal)
  );
  expect(resolved.some((item) => item.side === "us")).toBe(false);
});
