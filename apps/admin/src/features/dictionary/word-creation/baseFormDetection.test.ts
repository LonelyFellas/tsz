import type { AdminWordV3, SurfaceMatchPageV3 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  extractDetectedBaseForms,
  resolveDetectedBaseForm
} from "./baseFormDetection";

function v3Word(): AdminWordV3 {
  return {
    schema_version: 3,
    id: "entry-v3",
    language: "en",
    kind: "word",
    status: "published",
    revision: 1,
    lifecycle_revision: 1,
    annotation: null,
    annotation_revision: 1,
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

function formItem(
  overrides: Partial<SurfaceMatchPageV3["items"][number]["match"]> = {}
): SurfaceMatchPageV3["items"][number] {
  return {
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
      spelling: "centre",
      ...overrides
    }
  };
}

function entryContext(): SurfaceMatchPageV3["matched_entry_contexts"][number] {
  return {
    entry_id: "entry-v3",
    annotation: null,
    annotation_revision: 1,
    presentation: {
      label: "centre / center",
      matched_surfaces: ["centre", "center"],
      strategy_version: "surface_summary_v1"
    },
    pos_labels: ["noun", "verb"],
    gloss_previews: ["中心", "居中"],
    updated_at: "2026-08-26T00:00:00Z",
    inbound_relations: {
      total: 0,
      by_type: { synonym: 0, antonym: 0, derivative: 0 },
      previews: [],
      truncated: false
    }
  };
}

describe("base form detection presentation", () => {
  it("按后端顺序归并同一词条的多个原形词形，忽略派生词形", () => {
    const items = [
      formItem(),
      formItem({ variant_id: "variant-us", dialect: "us", spelling: "center" }),
      formItem({
        pos_id: "pos-v3-verb",
        form_id: "base-v3-verb",
        variant_id: "variant-us-verb",
        dialect: "us",
        spelling: "center"
      }),
      formItem({
        form_id: "plural-v3",
        variant_id: "plural-common",
        form_type: "plural",
        dialect: "common",
        spelling: "centers"
      })
    ];

    expect(extractDetectedBaseForms(items, [entryContext()])).toEqual([
      {
        key: "3:entry-v3",
        entryId: "entry-v3",
        formId: "base-v3",
        status: "published",
        label: "centre / center",
        spellings: ["centre", "center"],
        posLabels: ["noun", "verb"],
        glossPreviews: ["中心", "居中"]
      }
    ]);
  });

  it("草稿态与任意词性都进候选，派生词形仍被忽略", () => {
    const items = [
      formItem({
        entry_id: "entry-draft",
        status: "draft",
        content_scope: "draft",
        spelling: "colour"
      }),
      formItem({
        entry_id: "entry-draft",
        status: "draft",
        content_scope: "draft",
        form_id: "plural-draft",
        form_type: "plural",
        spelling: "colours"
      })
    ];

    expect(extractDetectedBaseForms(items, [])).toEqual([
      {
        key: "3:entry-draft",
        entryId: "entry-draft",
        formId: "base-v3",
        status: "draft",
        label: "colour",
        spellings: ["colour"],
        posLabels: [],
        glossPreviews: []
      }
    ]);
  });

  it("缺少上下文时回落到匹配词形自身", () => {
    const item = formItem({
      entry_id: "entry-v3-without-context",
      status: "draft",
      content_scope: "draft",
      form_id: "base-v3-without-context",
      variant_id: "variant-common",
      dialect: "common",
      spelling: "center"
    });

    expect(extractDetectedBaseForms([item], [])).toEqual([
      {
        key: "3:entry-v3-without-context",
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

  it("用稳定 form id 解析首个原形的英美式", () => {
    expect(
      resolveDetectedBaseForm(v3Word(), {
        key: "3:entry-v3",
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

  it("词条 id 或稳定 form id 不匹配时 fail closed", () => {
    const candidate = {
      key: "3:entry-v3:missing",
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
      resolveDetectedBaseForm(v3Word(), { ...candidate, entryId: "other" })
    ).toBeUndefined();
  });

  it("通用原形解析成 unified 词面", () => {
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
        key: "3:entry-v3",
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
