import { describe, expect, it } from "vitest";
import type { AdminWordV3 } from "@tsz/types";
import { commonFormFixture, formsFixture, uuidFromInt } from "./fixtures";
import { buildV3ReviewModel } from "./reviewModel";

function modelInput(overrides: Partial<AdminWordV3> = {}): AdminWordV3 {
  return {
    schema_version: 3 as const,
    id: "word-1",
    language: "en" as const,
    kind: "word" as const,
    status: "published" as const,
    revision: 4,
    lifecycle_revision: 1,
    published_revision: 4,
    has_unpublished_changes: false,
    presentation: {
      label: "center",
      matched_surfaces: ["center"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: { mode: "native" as const },
      pronunciation_normalization_version: "nfkc_trim_lower_v1" as const
    },
    forms: formsFixture(),
    meanings: {
      sense_groups: [{ id: "group-1", name_zh: "核心", name_en: "Core" }],
      pos: [
        {
          pos_id: "pos-1",
          grammar_structures: [],
          senses: [
            {
              id: "sense-1",
              sub_pos: "N-COUNT",
              level: "A1" as const,
              sense_group_id: "group-1",
              depends_on_context: false,
              definitions: [],
              sentences: [
                {
                  id: "sentence-1",
                  level: "A1" as const,
                  en_text: {
                    mode: "unified" as const,
                    common: {
                      id: "sentence-en-1",
                      origin: "manual" as const,
                      value: {
                        version: 2 as const,
                        text: "Center.",
                        annotations: []
                      }
                    }
                  },
                  zh_text_id: "sentence-zh-1",
                  zh_text: {
                    version: 2 as const,
                    text: "中心。",
                    annotations: []
                  },
                  links: [],
                  associations: [],
                  associations_state: "resolved" as const
                }
              ],
              relations: [
                {
                  id: "relation-1",
                  relation: "synonym" as const,
                  target_word_id: "target-1",
                  target_sense_id: "target-sense-1",
                  score: "0.8",
                  target_headword: "middle",
                  target_gloss: "中部"
                }
              ]
            }
          ]
        }
      ]
    },
    compatibility: undefined,
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    created_by: "admin-1",
    created_at: "2026-08-29T00:00:00Z",
    updated_at: "2026-08-29T00:00:00Z",
    published_at: "2026-08-29T00:00:00Z",
    ...overrides
  };
}

describe("buildV3ReviewModel", () => {
  it("separates publication status from language metadata and counts content", () => {
    expect(buildV3ReviewModel(modelInput())).toMatchObject({
      identity: {
        label: "center",
        kindLabel: "单词",
        languageLabel: "English 英语"
      },
      state: {
        status: "published",
        statusLabel: "已发布",
        primaryAction: "edit"
      },
      summary: {
        posCount: 1,
        baseCount: 1,
        formCount: 1,
        pronunciationCount: 1,
        senseCount: 1,
        sentenceCount: 1,
        relationCount: 1
      }
    });
  });

  it("原形数按拼写去重：同拼写只数一次，空拼写不计入", () => {
    const filled = commonFormFixture({
      id: uuidFromInt(4_101),
      variant_id: uuidFromInt(4_102),
      spelling: "center"
    });
    // 新增变化组会造出拼写相同的独立原形，概览不该把同一个词数成两个。
    const duplicate = commonFormFixture({
      id: uuidFromInt(4_103),
      variant_id: uuidFromInt(4_104),
      spelling: " Center "
    });
    const other = commonFormFixture({
      id: uuidFromInt(4_105),
      variant_id: uuidFromInt(4_106),
      spelling: "colour"
    });
    const blank = commonFormFixture({
      id: uuidFromInt(4_107),
      variant_id: uuidFromInt(4_108),
      spelling: "   "
    });

    expect(
      buildV3ReviewModel(
        modelInput({
          forms: formsFixture({ forms: [filled, duplicate, other, blank] })
        })
      ).summary
    ).toMatchObject({ baseCount: 2, formCount: 4 });
  });

  it("distinguishes published dirty, draft, and archived actions", () => {
    expect(
      buildV3ReviewModel(modelInput({ has_unpublished_changes: true })).state
    ).toMatchObject({ status: "published_dirty", primaryAction: "validate" });
    expect(
      buildV3ReviewModel(modelInput({ status: "draft" })).state
    ).toMatchObject({
      status: "draft",
      primaryAction: "validate"
    });
    expect(
      buildV3ReviewModel(modelInput({ status: "archived" })).state
    ).toMatchObject({
      status: "archived",
      statusLabel: "垃圾桶",
      primaryAction: "none"
    });
  });
});
