import { describe, expect, it } from "vitest";
import type {
  AssistantCandidatePos,
  SharedFormsStepContentV3
} from "@tsz/types";
import { expandFormContents } from "@tsz/shared";
import {
  applyFormsStructure,
  assignSharedFormContent
} from "../word-creation-v3/sharedFormsModel";
import { createStableVariantIdFactory } from "../word-creation-v3/operations";
import {
  commonFormFixture,
  formsFixture,
  uuidFromInt
} from "../word-creation-v3/fixtures";
import { partOfSpeechCatalogFixture as catalog } from "../word-creation/partOfSpeech.test.helper";
import { planFormCandidates } from "./formCandidatesModel";

const empty = (): SharedFormsStepContentV3 => ({
  forms_format: "shared_v1",
  pos: [],
  contents: []
});
export const candidates: AssistantCandidatePos[] = [
  {
    pos: "noun",
    forms: [
      {
        form_type: "base",
        is_regular: true,
        uk: { spelling: "bank", dict_phonetic: "/bæŋk/" },
        us: { spelling: "bank", dict_phonetic: "/bæŋk/" }
      },
      {
        form_type: "plural",
        is_regular: true,
        uk: { spelling: "banks", dict_phonetic: "/bæŋks/" },
        us: { spelling: "banks", dict_phonetic: "/bæŋks/" }
      }
    ]
  }
];

describe("AI 候选本地导入", () => {
  it("清空带标注字段后补空，同步拼写、语音和音标的富文本", () => {
    const original = applyFormsStructure(
      empty(),
      formsFixture({
        forms: [
          commonFormFixture({
            spelling: "",
            pronunciations: [
              {
                id: uuidFromInt(42),
                dict_phonetic: "",
                actual_pron: "",
                style: "normal",
                dict_phonetic_rich: { version: 2, text: "", annotations: [] },
                actual_pron_rich: {
                  version: 1,
                  text: "",
                  spans: [],
                  liaisons: []
                }
              }
            ]
          })
        ]
      })
    ) as SharedFormsStepContentV3;
    const regions = original.contents[0]!.regional_variants;
    if (regions.mode !== "common") throw new Error("expected common form");
    regions.common.spelling_rich = { version: 2, text: "", annotations: [] };
    regions.common.spelling_speech = {
      content: { version: 2, text: "", annotations: [] },
      voice_profile: { voices: [] }
    };
    const speech = () => ({
      content: { version: 2 as const, text: "", annotations: [] },
      voice_profile: { voices: [] }
    });
    regions.common.pronunciations[0]!.synthesis = {
      alphabet: "ipa",
      ipa: "",
      ups: "",
      uk: { ipa: "", ups: "", ipa_speech: speech(), ups_speech: speech() },
      us: { ipa: "", ups: "", ipa_speech: speech(), ups_speech: speech() }
    };
    const before = structuredClone(original);
    const imported = planFormCandidates(original, candidates, catalog.items)
      .forms as SharedFormsStepContentV3;
    const result = imported.contents[0]!.regional_variants;
    if (result.mode !== "common") throw new Error("expected common form");
    const common = result.common;
    expect(common.spelling).toBe("bank");
    expect(common.spelling_rich?.text).toBe(common.spelling);
    expect(common.spelling_speech?.content.text).toBe(common.spelling);
    expect(common.spelling_speech?.voice_profile).toEqual(
      regions.common.spelling_speech.voice_profile
    );
    const row = common.pronunciations[0]!;
    expect(row.dict_phonetic).toBe("/bæŋk/");
    expect(row.actual_pron).toBeTruthy();
    expect(row.dict_phonetic_rich?.text).toBe(row.dict_phonetic);
    expect(row.actual_pron_rich?.text).toBe(row.actual_pron);
    for (const side of ["uk", "us"] as const) {
      for (const alphabet of ["ipa_speech", "ups_speech"] as const) {
        expect(row.synthesis?.[side]?.[alphabet]?.content.text).toBe(
          common.spelling
        );
        expect(row.synthesis?.[side]?.[alphabet]?.voice_profile).toEqual(
          regions.common.pronunciations[0]!.synthesis?.[side]?.[alphabet]
            ?.voice_profile
        );
      }
    }
    expect(imported.pos[0]!.forms[0]).toEqual(original.pos[0]!.forms[0]);
    expect(original).toEqual(before);
  });
  it("新增词性和独立词形内容，生成音标转换，重复导入不新增或改写引用", () => {
    const original = empty();
    const plan = planFormCandidates(original, candidates, catalog.items);
    expect(plan.changed).toBe(2);
    expect(original).toEqual(empty());
    const result = plan.forms as SharedFormsStepContentV3;
    expect(result.pos).toHaveLength(1);
    expect(result.contents).toHaveLength(2);
    expect(
      new Set(result.pos[0]!.forms.map((form) => form.content_id)).size
    ).toBe(2);
    const forms = expandFormContents(result).pos[0]!.forms;
    expect(forms.map((form) => form.form_type)).toEqual(["base", "plural"]);
    const base = forms[0]!.regional_variants;
    if (base.mode !== "common") throw new Error("expected common form");
    expect(base.common.pronunciations[0]!.dict_phonetic).toBe("/bæŋk/");
    expect(base.common.pronunciations[0]!.actual_pron).toBeTruthy();
    expect(base.common.pronunciations[0]!.actual_pron).not.toBe("/bæŋk/");
    expect(base.common.pronunciations[0]!.synthesis?.uk?.ipa).toBeTruthy();
    expect(base.common.origin).toBe("manual");
    const repeated = planFormCandidates(result, candidates, catalog.items);
    expect(repeated.changed).toBe(0);
    expect(repeated.forms).toEqual(result);
  });

  it("只补空缺发音并保留既有绑定、人工音标和音频", () => {
    const original = applyFormsStructure(
      empty(),
      formsFixture({
        forms: [
          commonFormFixture({
            spelling: "bank",
            pronunciations: [
              {
                id: uuidFromInt(42),
                dict_phonetic: "",
                actual_pron: "",
                style: "normal"
              }
            ]
          })
        ]
      })
    ) as SharedFormsStepContentV3;
    const oldBinding = structuredClone(original.pos[0]!.forms[0]);
    const plan = planFormCandidates(original, candidates, catalog.items);
    const filled = plan.forms as SharedFormsStepContentV3;
    expect(filled.pos[0]!.forms[0]).toEqual(oldBinding);
    const base = filled.contents[0]!.regional_variants;
    if (base.mode !== "common") throw new Error("expected common form");
    const row = base.common.pronunciations[0]!;
    row.dict_phonetic = "人工音标";
    row.actual_pron = "人工实际发音";
    row.style = "strong";
    row.audio_assets = [
      {
        id: uuidFromInt(55),
        locale: "en-GB",
        gender: "female",
        content_type: "audio/mpeg",
        size_bytes: 3,
        original_name: "manual.mp3",
        created_at: "2026-10-31T00:00:00Z"
      }
    ];
    const before = structuredClone(filled);
    expect(planFormCandidates(filled, candidates, catalog.items).forms).toEqual(
      before
    );
    row.dict_phonetic = "";
    row.actual_pron = "";
    const audioOnly = structuredClone(filled);
    expect(planFormCandidates(filled, candidates, catalog.items).forms).toEqual(
      audioOnly
    );
  });

  it("补空时按已有读法转换，保留强调读法", () => {
    const source = applyFormsStructure(
      empty(),
      formsFixture({
        forms: [
          commonFormFixture({
            spelling: "family",
            pronunciations: [
              {
                id: uuidFromInt(42),
                dict_phonetic: "/ˈfæmɪlɪ/",
                actual_pron: "",
                style: "strong"
              }
            ]
          })
        ]
      })
    ) as SharedFormsStepContentV3;
    const proposal: AssistantCandidatePos[] = [
      {
        pos: "noun",
        forms: [
          {
            form_type: "base",
            is_regular: true,
            uk: { spelling: "family", dict_phonetic: "/ˈfæmɪlɪ/" },
            us: { spelling: "family", dict_phonetic: "/ˈfæmɪlɪ/" }
          }
        ]
      }
    ];
    const result = planFormCandidates(source, proposal, catalog.items)
      .forms as SharedFormsStepContentV3;
    const regions = result.contents[0]!.regional_variants;
    if (regions.mode !== "common") throw new Error("expected common form");
    expect(regions.common.pronunciations[0]!.style).toBe("strong");
    expect(regions.common.pronunciations[0]!.actual_pron).toBe("ˈfæmɪlɪ");
  });

  it("不同英美拼写分开落入内容，目录外类型拒绝", () => {
    const regional = structuredClone(candidates);
    regional[0]!.forms[0]!.uk = {
      spelling: "centre",
      dict_phonetic: "/ˈsentə/"
    };
    regional[0]!.forms[0]!.us = {
      spelling: "center",
      dict_phonetic: "/ˈsentər/"
    };
    const result = planFormCandidates(empty(), regional, catalog.items)
      .forms as SharedFormsStepContentV3;
    expect(result.contents[0]!.regional_variants.mode).toBe("uk_us");
    expect(result.contents[0]!.dialect_rules.spelling_mode).toBe("distinguish");
    const regions = result.contents[0]!.regional_variants;
    if (regions.mode !== "uk_us") throw new Error("expected regional form");
    const british = structuredClone(regions.uk);
    regions.us.spelling = "";
    const completed = planFormCandidates(result, regional, catalog.items)
      .forms as SharedFormsStepContentV3;
    const after = completed.contents[0]!.regional_variants;
    if (after.mode !== "uk_us") throw new Error("expected regional form");
    expect(after.uk).toEqual(british);
    expect(after.us.spelling).toBe("center");
    regional[0]!.forms[1]!.form_type = "unconfigured";
    expect(() => planFormCandidates(empty(), regional, catalog.items)).toThrow(
      "目录"
    );
  });

  it("不改写多处共用的内容", () => {
    const original = applyFormsStructure(
      empty(),
      formsFixture({
        forms: [
          commonFormFixture({ spelling: "bank", pronunciations: [] }),
          commonFormFixture({
            id: uuidFromInt(90),
            form_type: "plural",
            spelling: "bank",
            pronunciations: []
          })
        ]
      })
    ) as SharedFormsStepContentV3;
    const shared = assignSharedFormContent(
      original,
      original.contents[0]!.id,
      original.pos[0]!.forms[1]!.id,
      createStableVariantIdFactory(expandFormContents(original), [])
    );
    const plan = planFormCandidates(
      shared,
      [{ pos: "noun", forms: [candidates[0]!.forms[0]!] }],
      catalog.items
    );
    expect(plan.changed).toBe(0);
    expect(plan.forms).toEqual(shared);
    expect(plan.rows[0]!.message).toContain("共用");
  });
});
