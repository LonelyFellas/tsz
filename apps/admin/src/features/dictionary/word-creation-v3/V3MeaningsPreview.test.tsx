import type { AdminWordV3 } from "@tsz/types";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { formsFixture, UUIDS } from "./fixtures";
import { V3MeaningsPreview } from "./V3MeaningsPreview";

function word(meanings: AdminWordV3["meanings"]): AdminWordV3 {
  return {
    schema_version: 3,
    id: "internal-word-id",
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: "center",
      matched_surfaces: ["center"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: { mode: "native" },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: formsFixture(),
    meanings,
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    created_by: "internal-admin-id",
    created_at: "2026-08-26T00:00:00Z",
    updated_at: "2026-08-26T00:00:00Z"
  };
}

describe("V3MeaningsPreview", () => {
  it("以产品层级完整展示语法、释义、例句和关联且隐藏内部身份", () => {
    render(
      <V3MeaningsPreview
        word={word({
          sense_groups: [
            { id: "internal-group-id", name_zh: "空间位置", name_en: "Place" }
          ],
          pos: [
            {
              pos_id: UUIDS.pos,
              grammar_structures: [
                {
                  id: "internal-grammar-id",
                  variants: [
                    {
                      id: "internal-grammar-variant-id",
                      dialect: "common",
                      content: {
                        version: 2,
                        text: "at the center of",
                        annotations: []
                      }
                    }
                  ]
                }
              ],
              senses: [
                {
                  id: "internal-sense-id",
                  sub_pos: "N-COUNT",
                  level: "B1",
                  sense_group_id: "internal-group-id",
                  frequency: "high",
                  depends_on_context: true,
                  definitions: [
                    {
                      id: "internal-definition-id",
                      level: "B1",
                      definition_mode: "zh_definition",
                      content_id: "internal-definition-content-id",
                      content: {
                        version: 2,
                        text: "中心位置",
                        annotations: []
                      }
                    },
                    {
                      id: "internal-english-definition-id",
                      level: "B1",
                      definition_mode: "en_definition",
                      content: {
                        mode: "distinguish",
                        source_dialect: "uk",
                        uk: {
                          state: "ready",
                          variant: {
                            id: "internal-en-uk-id",
                            origin: "manual",
                            value: {
                              version: 2,
                              text: "the middle point",
                              annotations: []
                            }
                          }
                        },
                        us: { state: "missing" }
                      }
                    }
                  ],
                  sentences: [
                    {
                      id: "internal-sentence-id",
                      level: "B1",
                      en_text: {
                        mode: "unified",
                        common: {
                          id: "internal-sentence-en-id",
                          origin: "manual",
                          value: {
                            version: 2,
                            text: "Stand in the center.",
                            annotations: []
                          }
                        }
                      },
                      zh_text_id: "internal-sentence-zh-id",
                      zh_text: {
                        version: 2,
                        text: "站在中心。",
                        annotations: []
                      },
                      links: [
                        {
                          word_id: "internal-word-id",
                          sense_id: "internal-sense-id",
                          role: "focus"
                        },
                        {
                          word_id: "internal-other-word-id",
                          sense_id: "internal-other-sense-id",
                          role: "future-role"
                        }
                      ],
                      associations: [
                        {
                          id: "internal-association-id",
                          association_schema_version: 3,
                          source_dialect: "common",
                          source_segments: [
                            {
                              start: 13,
                              end: 19,
                              surface: "center"
                            }
                          ],
                          target_word_id: "internal-target-word-id",
                          target_sense_id: "internal-target-sense-id",
                          state: "linked",
                          target_component_usages: [],
                          origin: "manual",
                          target_headword: "middle",
                          target_gloss: "中间",
                          resolved_pos: "noun"
                        },
                        {
                          id: "internal-pending-association-id",
                          association_schema_version: 3,
                          source_dialect: "common",
                          source_segments: [
                            {
                              start: 0,
                              end: 5,
                              surface: "Stand"
                            }
                          ],
                          state: "pending",
                          origin: "manual",
                          pending_target_kind: "word",
                          pending_target_headword: "stand",
                          pending_target_gloss: "站立"
                        }
                      ],
                      associations_state: "resolved"
                    }
                  ],
                  relations: [
                    {
                      id: "internal-relation-id",
                      relation: "synonym",
                      pending_target_headword: "midpoint",
                      pending_target_gloss: "中点",
                      score: "80"
                    }
                  ]
                }
              ]
            }
          ]
        })}
      />
    );

    expect(screen.getByText("释义组 1：空间位置 / Place")).toBeVisible();
    expect(screen.getByText("名词")).toBeVisible();
    expect(screen.getByText("通用：at the center of")).toBeVisible();
    expect(screen.getByText("可数名词")).toBeVisible();
    expect(screen.getByText("依赖上下文")).toBeVisible();
    expect(screen.getByText("中心位置")).toBeVisible();
    expect(screen.getByText("the middle point")).toBeVisible();
    expect(screen.getByText("Stand in the center.")).toBeVisible();
    expect(screen.getByText("站在中心。")).toBeVisible();
    expect(screen.getByText("中")).toBeVisible();
    expect(screen.getByText("主关联")).toBeVisible();
    expect(screen.getByText("其他关联")).toBeVisible();
    expect(screen.getByText("上下文关联：middle · 中间")).toBeVisible();
    expect(screen.getByText("待关联词条：stand · 站立")).toBeVisible();
    expect(screen.getByText("已关联")).toBeVisible();
    expect(screen.getByText("待关联")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\b(?:Linked|Pending)\b/u);
    expect(screen.getByText("近义词")).toBeVisible();
    expect(screen.getByText("midpoint · 中点")).toBeVisible();
    expect(
      screen.queryByText(/internal-|future-role|N-COUNT|synonym/)
    ).toBeNull();
  });

  it("空内容显示明确空状态", () => {
    render(<V3MeaningsPreview word={word({ sense_groups: [], pos: [] })} />);
    expect(screen.getByText("暂无词义与例句")).toBeVisible();
  });

  it("缺省字段使用产品化回退并保持空分区明确", () => {
    render(
      <V3MeaningsPreview
        word={word({
          sense_groups: [
            { id: "english-only", name_zh: "", name_en: "English only" },
            { id: "fallback-group", name_zh: "", name_en: "" }
          ],
          pos: [
            {
              pos_id: "orphan-pos",
              grammar_structures: [],
              senses: []
            },
            {
              pos_id: UUIDS.pos,
              grammar_structures: [],
              senses: [
                {
                  id: "fallback-sense",
                  sub_pos: "",
                  level: "",
                  sense_group_id: "fallback-group",
                  depends_on_context: false,
                  definitions: [
                    {
                      id: "zh-sentence-definition",
                      level: "",
                      definition_mode: "zh_sentence",
                      content_id: "zh-sentence-content",
                      content: {
                        version: 2,
                        text: "用于说明回退分支。",
                        annotations: []
                      }
                    }
                  ],
                  sentences: [
                    {
                      id: "fallback-sentence",
                      level: "",
                      en_text: {
                        mode: "unified",
                        common: {
                          id: "fallback-sentence-en",
                          origin: "manual",
                          value: {
                            version: 2,
                            text: "Fallback sentence.",
                            annotations: []
                          }
                        }
                      },
                      zh_text_id: "fallback-sentence-zh",
                      zh_text: {
                        version: 2,
                        text: "回退例句。",
                        annotations: []
                      },
                      links: [],
                      associations: [
                        {
                          id: "fallback-association",
                          association_schema_version: 3,
                          source_dialect: "common",
                          source_segments: [
                            {
                              start: 0,
                              end: 8,
                              surface: "Fallback"
                            }
                          ],
                          target_word_id: "target-word",
                          target_sense_id: "target-sense",
                          state: "linked",
                          target_component_usages: [],
                          origin: "manual",
                          target_headword: "fallback",
                          target_gloss: "",
                          resolved_pos: "noun"
                        }
                      ],
                      associations_state: "resolved"
                    }
                  ],
                  relations: [
                    {
                      id: "fallback-relation",
                      relation: "synonym",
                      target_gloss: "待补充释义",
                      score: "1"
                    }
                  ]
                },
                {
                  id: "empty-sense",
                  sub_pos: "",
                  level: "",
                  depends_on_context: false,
                  definitions: [],
                  sentences: [],
                  relations: []
                }
              ]
            }
          ]
        })}
      />
    );

    expect(screen.getByText("其他词性")).toBeVisible();
    expect(screen.getByText("暂无释义")).toBeVisible();
    expect(screen.getByText("释义组 2：释义组 2")).toBeVisible();
    expect(screen.getByText("用于说明回退分支。")).toBeVisible();
    expect(screen.getByText("上下文关联：fallback")).toBeVisible();
    expect(screen.getByText("待补充目标词条 · 待补充释义")).toBeVisible();
  });
});
