import type {
  AdminWordV2,
  AdminWordV3,
  LexiconSurfaceMatchV2,
  MatchedEntryContextV2,
  SurfaceMatchPageV3
} from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  extractDetectedBaseForms,
  resolveDetectedBaseForm
} from "./baseFormDetection";
import { wordFixture } from "./wordCreation.test.helper";

function v3Word(): AdminWordV3 {
  return {
    schema_version: 3,
    id: "entry-v3",
    language: "en",
    kind: "word",
    status: "published",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: false,
    presentation: {
      label: "centre / center",
      matched_surfaces: ["centre", "center"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: { mode: "native" },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: {
      pos: [
        {
          pos_id: "pos-v3",
          pos: "noun",
          dialect_rules: {
            spelling_mode: "distinguish",
            phonetic_mode: "distinguish"
          },
          forms: [
            {
              id: "base-v3",
              form_type: "base",
              regional_variants: {
                mode: "uk_us",
                uk: {
                  id: "uk-v3",
                  dialect: "uk",
                  spelling: "centre",
                  origin: "dictionary",
                  pronunciations: []
                },
                us: {
                  id: "us-v3",
                  dialect: "us",
                  spelling: "center",
                  origin: "dictionary",
                  pronunciations: []
                }
              }
            }
          ],
          form_groups: []
        }
      ]
    },
    meanings: { sense_groups: [], pos: [] },
    completed_steps: ["basics", "forms"],
    max_reachable_step: "meanings",
    created_by: "admin",
    created_at: "2026-08-26T00:00:00Z",
    updated_at: "2026-08-26T00:00:00Z"
  };
}

function v2FormMatch(
  overrides: Partial<LexiconSurfaceMatchV2["existing"]> = {}
): LexiconSurfaceMatchV2 {
  return {
    match_id: "match-v2",
    match_category: "form_form",
    severity: "warning",
    attention_level: "normal",
    can_continue: true,
    confirmation_reasons: ["unacknowledged_surface_matches"],
    candidate: {
      candidate_type: "headword",
      candidate_ref: "candidate",
      surface: "colour",
      normalized_surface: "colour",
      dialect: "uk",
      entry_kind: "word"
    },
    existing: {
      word_id: "entry-v2",
      headword: "colour",
      kind: "word",
      status: "draft",
      source: {
        source_kind: "form",
        source_id: "source-v2",
        source_node_id: "base-v2",
        content_scope: "draft",
        surface: "colour",
        dialect: "uk",
        pos_id: "pos-v2",
        pos: "noun",
        form_type: "base"
      },
      ...overrides
    }
  };
}

describe("base form detection presentation", () => {
  it("按后端顺序归并完整快照中的 V3 与 legacy V2 原形，忽略派生词形", () => {
    const page: SurfaceMatchPageV3 = {
      schema_version: 3,
      snapshot_id: "snapshot",
      items: [
        {
          match_kind: "form_variant_v3",
          match: {
            source_schema_version: 3,
            entry_id: "entry-v3",
            entry_kind: "word",
            status: "published",
            content_scope: "current_publication",
            pos_id: "pos-v3",
            group_ids: [],
            form_id: "base-v3",
            variant_id: "variant-uk",
            form_type: "base",
            dialect: "uk",
            spelling: "centre"
          }
        },
        {
          match_kind: "form_variant_v3",
          match: {
            source_schema_version: 3,
            entry_id: "entry-v3",
            entry_kind: "word",
            status: "published",
            content_scope: "current_publication",
            pos_id: "pos-v3",
            group_ids: [],
            form_id: "base-v3",
            variant_id: "variant-us",
            form_type: "base",
            dialect: "us",
            spelling: "center"
          }
        },
        {
          match_kind: "form_variant_v3",
          match: {
            source_schema_version: 3,
            entry_id: "entry-v3",
            entry_kind: "word",
            status: "published",
            content_scope: "current_publication",
            pos_id: "pos-v3",
            group_ids: [],
            form_id: "plural-v3",
            variant_id: "plural-common",
            form_type: "plural",
            dialect: "common",
            spelling: "centers"
          }
        },
        {
          match_kind: "legacy_v2",
          match: {
            source_schema_version: 2,
            existing: {
              word_id: "entry-v2",
              headword: "colour",
              kind: "word",
              status: "draft",
              source: {
                source_kind: "form",
                source_id: "source-v2",
                source_node_id: "base-v2",
                content_scope: "draft",
                surface: "colour",
                dialect: "uk",
                pos_id: "pos-v2",
                pos: "noun",
                form_type: "base"
              }
            }
          }
        },
        {
          match_kind: "legacy_v2",
          match: {
            source_schema_version: 2,
            existing: {
              word_id: "entry-v2-derived",
              headword: "centers",
              kind: "word",
              status: "published",
              source: {
                source_kind: "form",
                source_id: "source-v2-derived",
                source_node_id: "plural-v2",
                content_scope: "current_publication",
                surface: "centers",
                dialect: "common",
                pos_id: "pos-v2-derived",
                pos: "noun",
                form_type: "plural"
              }
            }
          }
        }
      ],
      total: 5,
      matched_entry_contexts: [
        {
          entry_id: "entry-v3",
          presentation: {
            label: "centre / center",
            matched_surfaces: ["centre", "center"],
            strategy_version: "surface_summary_v1"
          },
          pos_labels: ["noun"],
          gloss_previews: ["中心"],
          updated_at: "2026-08-26T00:00:00Z",
          inbound_relations: {
            total: 0,
            by_type: { synonym: 0, antonym: 0, derivative: 0 },
            previews: [],
            truncated: false
          }
        }
      ],
      confirmation_reasons: ["unacknowledged_surface_matches"],
      policy_name: "surface_warning_acknowledgement",
      policy_epoch: 1,
      continuation_policy: "enabled",
      next_cursor: null,
      surface_confirmation_token: "token"
    };

    expect(
      extractDetectedBaseForms(
        page.schema_version,
        page.items,
        page.matched_entry_contexts
      )
    ).toEqual([
      {
        key: "3:entry-v3:base-v3",
        schemaVersion: 3,
        entryId: "entry-v3",
        formId: "base-v3",
        status: "published",
        label: "centre / center",
        spellings: ["centre", "center"],
        posLabels: ["noun"],
        glossPreviews: ["中心"]
      },
      {
        key: "2:entry-v2:base-v2",
        schemaVersion: 2,
        entryId: "entry-v2",
        formId: "base-v2",
        status: "draft",
        label: "colour",
        spellings: ["colour"],
        posLabels: ["noun"],
        glossPreviews: []
      }
    ]);
  });

  it("V2 原形接受草稿和任意词性，使用上下文并忽略主词与派生词形", () => {
    const base = v2FormMatch();
    const repeated = v2FormMatch();
    repeated.match_id = "match-v2-us";
    if (repeated.existing.source.source_kind !== "form") {
      throw new Error("expected form fixture");
    }
    repeated.existing.source = {
      ...repeated.existing.source,
      source_id: "source-v2-us",
      surface: "color",
      dialect: "us"
    };
    const derived = v2FormMatch();
    derived.match_id = "match-v2-plural";
    if (derived.existing.source.source_kind !== "form") {
      throw new Error("expected form fixture");
    }
    derived.existing.source = {
      ...derived.existing.source,
      source_id: "source-v2-plural",
      source_node_id: "plural-v2",
      surface: "colours",
      form_type: "plural"
    };
    const headword = v2FormMatch();
    headword.match_id = "match-v2-headword";
    headword.existing.source = {
      source_kind: "headword",
      source_id: "headword-v2",
      content_scope: "draft",
      surface: "colour",
      dialect: "uk"
    };
    const context: MatchedEntryContextV2 = {
      word_id: "entry-v2",
      pos_labels: ["adjective", "noun"],
      gloss_previews: ["颜色"],
      updated_at: "2026-08-26T00:00:00Z",
      inbound_relations: {
        total: 0,
        by_type: { synonym: 0, antonym: 0, derivative: 0 },
        previews: [],
        truncated: false
      }
    };

    expect(
      extractDetectedBaseForms(
        2,
        [base, repeated, derived, headword],
        [context]
      )
    ).toEqual([
      {
        key: "2:entry-v2:base-v2",
        schemaVersion: 2,
        entryId: "entry-v2",
        formId: "base-v2",
        status: "draft",
        label: "colour",
        spellings: ["colour", "color"],
        posLabels: ["adjective", "noun"],
        glossPreviews: ["颜色"]
      }
    ]);
  });

  it("缺少上下文时仍使用 surface 自身信息展示 V2 与 V3 原形", () => {
    expect(extractDetectedBaseForms(2, [v2FormMatch()], [])).toEqual([
      {
        key: "2:entry-v2:base-v2",
        schemaVersion: 2,
        entryId: "entry-v2",
        formId: "base-v2",
        status: "draft",
        label: "colour",
        spellings: ["colour"],
        posLabels: ["noun"],
        glossPreviews: []
      }
    ]);

    const v3Match: SurfaceMatchPageV3["items"][number] = {
      match_kind: "form_variant_v3",
      match: {
        source_schema_version: 3,
        entry_id: "entry-v3-without-context",
        entry_kind: "word",
        status: "draft",
        content_scope: "draft",
        pos_id: "pos-v3",
        group_ids: [],
        form_id: "base-v3-without-context",
        variant_id: "variant-common",
        form_type: "base",
        dialect: "common",
        spelling: "center"
      }
    };
    expect(extractDetectedBaseForms(3, [v3Match], [])).toEqual([
      {
        key: "3:entry-v3-without-context:base-v3-without-context",
        schemaVersion: 3,
        entryId: "entry-v3-without-context",
        formId: "base-v3-without-context",
        status: "draft",
        label: "center",
        spellings: ["center"],
        posLabels: [],
        glossPreviews: []
      }
    ]);
  });

  it("忽略与声明 schema 不一致的直接 surface item", () => {
    const v3Match: SurfaceMatchPageV3["items"][number] = {
      match_kind: "form_variant_v3",
      match: {
        source_schema_version: 3,
        entry_id: "entry-v3",
        entry_kind: "word",
        status: "draft",
        content_scope: "draft",
        pos_id: "pos-v3",
        group_ids: [],
        form_id: "base-v3",
        variant_id: "variant-common",
        form_type: "base",
        dialect: "common",
        spelling: "center"
      }
    };

    expect(extractDetectedBaseForms(2, [v3Match], [])).toEqual([]);
    expect(extractDetectedBaseForms(3, [v2FormMatch()], [])).toEqual([]);
  });

  it("用稳定 form id 解析 V3 首个原形的英美式", () => {
    expect(
      resolveDetectedBaseForm(v3Word(), {
        key: "3:entry-v3:base-v3",
        schemaVersion: 3,
        entryId: "entry-v3",
        formId: "base-v3",
        status: "published",
        label: "centre / center",
        spellings: ["centre", "center"],
        posLabels: ["noun"],
        glossPreviews: []
      })
    ).toEqual({
      mode: "distinguish",
      uk: "centre",
      us: "center",
      source_dialect: "us"
    });
  });

  it("用稳定 base slot id 解析 V2 通用原形", () => {
    const word: AdminWordV2 = wordFixture({ headword: "colour" });
    word.id = "entry-v2";
    word.forms.pos[0]!.base_form.id = "base-v2";
    word.forms.pos[0]!.base_form.variants = [
      {
        id: "common-v2",
        dialect: "common",
        spelling: "color",
        origin: "dictionary",
        pronunciations: []
      }
    ];

    expect(
      resolveDetectedBaseForm(word, {
        key: "2:entry-v2:base-v2",
        schemaVersion: 2,
        entryId: "entry-v2",
        formId: "base-v2",
        status: "draft",
        label: "colour",
        spellings: ["colour"],
        posLabels: ["noun"],
        glossPreviews: []
      })
    ).toEqual({ mode: "unified", common: "color" });
  });

  it("用检测返回的 variant node id 解析 V2 所属原形", () => {
    const word: AdminWordV2 = wordFixture({ headword: "center" });
    word.id = "entry-v2";
    word.forms.pos[0]!.base_form.id = "base-v2";
    word.forms.pos[0]!.base_form.variants = [
      {
        id: "variant-v2",
        dialect: "common",
        spelling: "take care of",
        origin: "dictionary",
        pronunciations: []
      }
    ];

    expect(
      resolveDetectedBaseForm(word, {
        key: "2:entry-v2:variant-v2",
        schemaVersion: 2,
        entryId: "entry-v2",
        formId: "variant-v2",
        status: "draft",
        label: "take care of",
        spellings: ["take care of"],
        posLabels: ["verb"],
        glossPreviews: []
      })
    ).toEqual({ mode: "unified", common: "take care of" });
  });

  it("详情 schema 或稳定 form id 不匹配时 fail closed", () => {
    const candidate = {
      key: "3:entry-v3:missing",
      schemaVersion: 3 as const,
      entryId: "entry-v3",
      formId: "missing",
      status: "published" as const,
      label: "center",
      spellings: ["center"],
      posLabels: ["noun"],
      glossPreviews: []
    };
    expect(resolveDetectedBaseForm(v3Word(), candidate)).toBeUndefined();
    expect(
      resolveDetectedBaseForm(wordFixture({ id: "entry-v3" }), candidate)
    ).toBeUndefined();
  });

  it("覆盖 V2 英美式、不完整变体和 V3 通用原形的解析边界", () => {
    const v2Word = wordFixture({ headword: "colour", id: "entry-v2" });
    v2Word.forms.pos[0]!.base_form.id = "base-v2";
    v2Word.forms.pos[0]!.base_form.variants = [
      {
        id: "uk-v2",
        dialect: "uk",
        spelling: "colour",
        origin: "dictionary",
        pronunciations: []
      },
      {
        id: "us-v2",
        dialect: "us",
        spelling: "color",
        origin: "dictionary",
        pronunciations: []
      }
    ];
    const v2Candidate = {
      key: "2:entry-v2:base-v2",
      schemaVersion: 2 as const,
      entryId: "entry-v2",
      formId: "base-v2",
      status: "draft" as const,
      label: "colour",
      spellings: ["colour", "color"],
      posLabels: ["adjective"],
      glossPreviews: []
    };
    expect(resolveDetectedBaseForm(v2Word, v2Candidate)).toEqual({
      mode: "distinguish",
      uk: "colour",
      us: "color",
      source_dialect: "us"
    });
    v2Word.forms.pos[0]!.base_form.variants.pop();
    expect(resolveDetectedBaseForm(v2Word, v2Candidate)).toBeUndefined();
    expect(
      resolveDetectedBaseForm(v2Word, { ...v2Candidate, formId: "missing" })
    ).toBeUndefined();

    const v3Common = v3Word();
    const form = v3Common.forms.pos[0]!.forms[0]!;
    form.regional_variants = {
      mode: "common",
      common: {
        id: "common-v3",
        dialect: "common",
        spelling: "center",
        origin: "dictionary",
        pronunciations: []
      }
    };
    expect(
      resolveDetectedBaseForm(v3Common, {
        key: "3:entry-v3:base-v3",
        schemaVersion: 3,
        entryId: "entry-v3",
        formId: "base-v3",
        status: "published",
        label: "center",
        spellings: ["center"],
        posLabels: ["noun"],
        glossPreviews: []
      })
    ).toEqual({ mode: "unified", common: "center" });
  });
});
