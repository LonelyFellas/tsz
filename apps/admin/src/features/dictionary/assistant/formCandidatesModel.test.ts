import { describe, expect, it } from "vitest";
import type {
  AssistantCandidatePos,
  SharedFormsStepContentV3
} from "@tsz/types";
import {
  expandFormContents,
  primaryRegionalVariant,
  regionalVariants
} from "@tsz/shared";
import {
  applyFormsStructure,
  assignSharedFormContent
} from "../word-creation-v3/sharedFormsModel";
import {
  addPartOfSpeech,
  createStableVariantIdFactory,
  fillFormTypeTemplate
} from "../word-creation-v3/operations";
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
    for (const form of forms) {
      for (const variant of regionalVariants(form.regional_variants)) {
        expect(variant.pronunciations[0]!.style).toBe("citation");
      }
    }
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
    expect(row.style).toBe("normal");
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
    expect(regions.uk.pronunciations[0]!.style).toBe("citation");
    expect(regions.us.pronunciations[0]!.style).toBe("citation");
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

  it("为已有空白短语词形回填不同的英美字典音标", () => {
    const pastType = "phrase_past_ten_4b4e1cb9f726aa3d";
    const phrase = {
      ...catalog.items.find((item) => item.code === "verb")!,
      kind: "phrase" as const,
      code: "phrase_verbal_constituent",
      allowed_form_types: [pastType],
      default_form_types: [pastType]
    };
    const initial = addPartOfSpeech({ pos: [] }, phrase);
    if (!initial.ok) throw new Error(initial.reason);
    const original = applyFormsStructure(
      empty(),
      fillFormTypeTemplate(initial.value, [phrase])
    ) as SharedFormsStepContentV3;
    const proposals: AssistantCandidatePos[] = [
      {
        pos: phrase.code,
        forms: [
          {
            form_type: "base",
            is_regular: true,
            uk: { spelling: "wake up", dict_phonetic: "ˈweɪk ˌʌp" },
            us: { spelling: "wake up", dict_phonetic: "ˈweɪk ˌʌp" }
          },
          {
            form_type: pastType,
            is_regular: false,
            uk: { spelling: "woke up", dict_phonetic: "ˈwəʊk ˌʌp" },
            us: { spelling: "woke up", dict_phonetic: "ˈwoʊk ˌʌp" }
          }
        ]
      }
    ];
    const plan = planFormCandidates(original, proposals, [phrase]);
    expect(plan.changed).toBe(2);
    const filled = plan.forms as SharedFormsStepContentV3;
    expect(filled.pos[0]!.form_groups).toEqual(original.pos[0]!.form_groups);
    const past = filled.pos[0]!.forms[1]!;
    expect(past.id).toBe(original.pos[0]!.forms[1]!.id);
    expect(past.content_id).toBe(original.pos[0]!.forms[1]!.content_id);
    const regions = filled.contents.find(
      (content) => content.id === past.content_id
    )!.regional_variants;
    if (regions.mode !== "uk_us") throw new Error("expected regional form");
    expect(regions.uk.spelling).toBe("woke up");
    expect(regions.us.spelling).toBe("woke up");
    expect(regions.uk.pronunciations[0]!.dict_phonetic).toBe("ˈwəʊk ˌʌp");
    expect(regions.us.pronunciations[0]!.dict_phonetic).toBe("ˈwoʊk ˌʌp");
    expect(planFormCandidates(filled, proposals, [phrase]).changed).toBe(0);

    const manualDraft = structuredClone(original);
    const manual = manualDraft.contents.find(
      (content) => content.id === past.content_id
    )!;
    if (manual.regional_variants.mode !== "common")
      throw new Error("expected common form");
    manual.regional_variants.common.spelling = "woke up";
    manual.regional_variants.common.pronunciations[0]!.dict_phonetic =
      "ˌwəʊk ˈʌp";
    const protectedResult = planFormCandidates(manualDraft, proposals, [
      phrase
    ]);
    expect(protectedResult.changed).toBe(1);
    expect(
      (protectedResult.forms as SharedFormsStepContentV3).contents.find(
        (content) => content.id === past.content_id
      )
    ).toEqual(manual);
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
    expect(plan.rows[0]!.message).toBe("candidate_shared_kept");
  });

  it.each([
    ["record", "record", "ˈrekɔːd", "ˈrekərd", "rɪˈkɔːd", "rɪˈkɔːrd"],
    ["colour", "color", "ˈkʌlə", "ˈkʌlər", "ˈkʌlə", "ˈkʌlər"],
    ["book", "book", "bʊk", "bʊk", "bʊk", "bʊk"]
  ])(
    "回填共用空原形时分别保存 %s 的词性和英美读音",
    (ukWord, usWord, nounUk, nounUs, verbUk, verbUs) => {
      const noun = catalog.items.find((item) => item.code === "noun")!;
      const verb = catalog.items.find((item) => item.code === "verb")!;
      const afterNoun = addPartOfSpeech({ pos: [] }, noun);
      if (!afterNoun.ok) throw new Error(afterNoun.reason);
      const afterVerb = addPartOfSpeech(afterNoun.value, verb);
      if (!afterVerb.ok) throw new Error(afterVerb.reason);
      const original = applyFormsStructure(
        empty(),
        afterVerb.value
      ) as SharedFormsStepContentV3;
      const shared = assignSharedFormContent(
        original,
        original.pos[0]!.forms[0]!.content_id,
        original.pos[1]!.forms[0]!.id,
        createStableVariantIdFactory(expandFormContents(original), [])
      );
      const proposals: AssistantCandidatePos[] = [
        {
          pos: "noun",
          forms: [
            {
              form_type: "base",
              is_regular: true,
              uk: { spelling: ukWord, dict_phonetic: nounUk },
              us: { spelling: usWord, dict_phonetic: nounUs }
            }
          ]
        },
        {
          pos: "verb",
          forms: [
            {
              form_type: "base",
              is_regular: true,
              uk: { spelling: ukWord, dict_phonetic: verbUk },
              us: { spelling: usWord, dict_phonetic: verbUs }
            }
          ]
        }
      ];
      const planned = planFormCandidates(shared, proposals, catalog.items);
      expect(planned.changed).toBe(2);
      const filled = planned.forms as SharedFormsStepContentV3;
      expect(filled.pos.map((pos) => pos.forms[0]!.id)).toEqual(
        original.pos.map((pos) => pos.forms[0]!.id)
      );
      expect(
        new Set(filled.pos.map((pos) => pos.forms[0]!.content_id)).size
      ).toBe(2);
      for (const [index, pos] of filled.pos.entries()) {
        const before = shared.pos[index]!.forms[0]!.regional_bindings;
        const after = pos.forms[0]!.regional_bindings;
        if (before.mode === "common" && after.mode === "common") {
          expect(after.common.id).toBe(before.common.id);
          expect(after.common.pronunciations.map(({ id }) => id)).toEqual(
            before.common.pronunciations.map(({ id }) => id)
          );
        }
      }
      const contents = expandFormContents(filled).pos.map((pos) =>
        (["uk", "us"] as const).map((side) => {
          const variant = primaryRegionalVariant(
            pos.forms[0]!.regional_variants,
            side
          );
          return [variant.spelling, variant.pronunciations[0]!.dict_phonetic];
        })
      );
      expect(contents).toEqual([
        [
          [ukWord, nounUk],
          [usWord, nounUs]
        ],
        [
          [ukWord, verbUk],
          [usWord, verbUs]
        ]
      ]);
      expect(planFormCandidates(filled, proposals, catalog.items).changed).toBe(
        0
      );
    }
  );
});
