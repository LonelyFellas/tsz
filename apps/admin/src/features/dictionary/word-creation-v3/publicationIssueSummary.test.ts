import type { AdminWordV3, V3DraftValidationIssue } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { formsFixture, uuidFromInt } from "./fixtures";
import { buildV3PublicationIssueSummary } from "./publicationIssueSummary";

function word(): AdminWordV3 {
  const noun = formsFixture({
    pos: "noun",
    pos_id: uuidFromInt(1001)
  }).pos[0]!;
  const adjective = formsFixture({
    pos: "adjective",
    pos_id: uuidFromInt(1002)
  }).pos[0]!;
  return {
    schema_version: 3,
    id: uuidFromInt(1000),
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: "centre",
      matched_surfaces: ["centre"],
      strategy_version: "v3"
    },
    capabilities: {
      publication: { mode: "migration_canary", whitelisted: true },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: { pos: [noun, adjective] },
    meanings: {
      sense_groups: [],
      pos: [
        {
          pos_id: noun.pos_id,
          grammar_structures: [],
          senses: [
            {
              id: uuidFromInt(1010),
              sub_pos: "",
              level: "A1",
              depends_on_context: false,
              definitions: [],
              sentences: [],
              relations: []
            }
          ]
        }
      ]
    },
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: uuidFromInt(1090),
    created_at: "2026-08-30T00:00:00Z",
    updated_at: "2026-08-30T00:00:00Z"
  };
}

function issue(
  id: number,
  overrides: Partial<V3DraftValidationIssue> = {}
): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id: uuidFromInt(id),
    field: "actual_pron",
    code: "pronunciation_required",
    message: "pronunciation required",
    node_location: {
      node_role: "pronunciation",
      ancestor_node_ids: [uuidFromInt(1001)],
      pos_id: uuidFromInt(1001),
      form_type: "base"
    },
    ...overrides
  };
}

describe("buildV3PublicationIssueSummary", () => {
  it("keeps the raw total while grouping repeated messages by POS and code", () => {
    const current = word();
    const issues = [
      ...Array.from({ length: 8 }, (_, index) => issue(1100 + index)),
      ...Array.from({ length: 10 }, (_, index) =>
        issue(1200 + index, {
          node_location: {
            node_role: "pronunciation",
            ancestor_node_ids: [uuidFromInt(1002)],
            pos_id: uuidFromInt(1002),
            form_type: "base"
          }
        })
      )
    ];

    const summary = buildV3PublicationIssueSummary(current, issues);

    expect(summary.total).toBe(18);
    expect(summary.positions.map((position) => position.issues.length)).toEqual(
      [8, 10]
    );
    expect(summary.types).toEqual([
      expect.objectContaining({
        code: "pronunciation_required",
        count: 18
      })
    ]);
  });

  it("splits a POS total by step and resolves meanings ownership from ancestors", () => {
    const current = word();
    const meaningsIssue = issue(1300, {
      step: "meanings",
      node_id: uuidFromInt(1010),
      field: "frequency",
      code: "frequency_invalid",
      message: "invalid frequency",
      node_location: {
        node_role: "meanings.sense",
        ancestor_node_ids: [uuidFromInt(1001)]
      }
    });

    const summary = buildV3PublicationIssueSummary(current, [
      issue(1301),
      meaningsIssue
    ]);

    expect(summary.positions[0]).toMatchObject({
      pos_id: uuidFromInt(1001),
      by_step: { forms: 1, meanings: 1 }
    });
  });

  it("resolves meanings ownership for sense-level component usage nodes", () => {
    const current = word();
    current.meanings.pos[0]!.senses[0]!.component_usages = [
      { state: "unresolved", id: uuidFromInt(1011), literal: "give" }
    ];
    const componentIssue = issue(1400, {
      step: "meanings",
      node_id: uuidFromInt(1011),
      field: "component_usages",
      code: "frequency_invalid",
      message: "invalid component usage",
      node_location: {
        node_role: "meanings.sense",
        ancestor_node_ids: []
      }
    });

    const summary = buildV3PublicationIssueSummary(current, [componentIssue]);

    expect(summary.positions[0]).toMatchObject({
      pos_id: uuidFromInt(1001),
      by_step: { meanings: 1 }
    });
  });

  it("falls back to a step group when no POS can be proven", () => {
    const current = word();
    const general = issue(1400, {
      step: "meanings",
      node_location: {
        node_role: "meanings.general",
        ancestor_node_ids: []
      }
    });

    const summary = buildV3PublicationIssueSummary(current, [general]);

    expect(summary.positions[0]).toMatchObject({
      key: "step:meanings",
      label: "词义与例句",
      by_step: { forms: 0, meanings: 1 }
    });
  });

  it.each([
    [
      "group",
      (current: AdminWordV3) => current.forms.pos[0]!.form_groups[0]!.id
    ],
    [
      "membership",
      (current: AdminWordV3) =>
        current.forms.pos[0]!.form_groups[0]!.members[0]!.id
    ],
    ["form", (current: AdminWordV3) => current.forms.pos[0]!.forms[0]!.id],
    [
      "variant",
      (current: AdminWordV3) => {
        const variants = current.forms.pos[0]!.forms[0]!.regional_variants;
        return variants.mode === "common" ? variants.common.id : variants.uk.id;
      }
    ],
    [
      "pronunciation",
      (current: AdminWordV3) => {
        const variants = current.forms.pos[0]!.forms[0]!.regional_variants;
        return variants.mode === "common"
          ? variants.common.pronunciations[0]!.id
          : variants.uk.pronunciations[0]!.id;
      }
    ]
  ])("resolves forms POS ownership from a %s ancestor", (_label, nodeId) => {
    const current = word();
    const nested = issue(1500, {
      node_location: {
        node_role: `forms.${_label}`,
        ancestor_node_ids: [nodeId(current)]
      }
    });

    expect(
      buildV3PublicationIssueSummary(current, [nested]).positions[0]?.pos_id
    ).toBe(uuidFromInt(1001));
  });

  it("resolves ready regional definition and sentence variants while ignoring missing sides", () => {
    const current = word();
    const definitionVariantId = uuidFromInt(1704);
    const sentenceVariantId = uuidFromInt(1707);
    current.meanings = {
      sense_groups: [],
      pos: [
        {
          pos_id: uuidFromInt(1001),
          grammar_structures: [],
          senses: [
            {
              id: uuidFromInt(1701),
              sub_pos: "countable",
              level: "A1",
              depends_on_context: false,
              definitions: [
                {
                  id: uuidFromInt(1702),
                  level: "A1",
                  definition_mode: "en_definition",
                  content: {
                    mode: "distinguish",
                    source_dialect: "us",
                    uk: { state: "missing" },
                    us: {
                      state: "ready",
                      variant: {
                        id: definitionVariantId,
                        origin: "manual",
                        value: {
                          version: 2,
                          text: "center",
                          annotations: []
                        }
                      }
                    }
                  }
                }
              ],
              sentences: [
                {
                  id: uuidFromInt(1705),
                  level: "A1",
                  en_text: {
                    mode: "distinguish",
                    source_dialect: "uk",
                    uk: {
                      state: "ready",
                      variant: {
                        id: sentenceVariantId,
                        origin: "manual",
                        value: {
                          version: 2,
                          text: "A centre.",
                          annotations: []
                        }
                      }
                    },
                    us: { state: "missing" }
                  },
                  zh_text_id: uuidFromInt(1708),
                  zh_text: { version: 2, text: "一个中心。", annotations: [] },
                  links: [],
                  associations: [],
                  associations_state: "resolved"
                }
              ],
              relations: []
            }
          ]
        }
      ]
    };
    const issues = [definitionVariantId, sentenceVariantId].map((nodeId) =>
      issue(1710, {
        step: "meanings",
        node_id: nodeId,
        field: "value",
        code: "definition_invalid",
        node_location: {
          node_role: "text_variant",
          ancestor_node_ids: []
        }
      })
    );

    const summary = buildV3PublicationIssueSummary(current, issues);
    expect(summary.positions[0]).toMatchObject({
      pos_id: uuidFromInt(1001),
      by_step: { meanings: 2 }
    });
    expect(
      summary.positions[0]!.issues.map((item) => item.node_location.pos_id)
    ).toEqual([uuidFromInt(1001), uuidFromInt(1001)]);
    expect(summary.types[0]!.issues[0]!.node_location.pos_id).toBe(
      uuidFromInt(1001)
    );
  });

  it.each([
    ["grammar", uuidFromInt(1601)],
    ["grammar variant", uuidFromInt(1602)],
    ["sense", uuidFromInt(1603)],
    ["sense group", uuidFromInt(1600)],
    ["definition", uuidFromInt(1604)],
    ["definition content", uuidFromInt(1605)],
    ["sentence", uuidFromInt(1606)],
    ["sentence zh", uuidFromInt(1608)],
    ["translation", uuidFromInt(1609)],
    ["sentence en", uuidFromInt(1607)]
  ])("resolves meanings POS ownership from %s identity", (_label, nodeId) => {
    const current = word();
    current.meanings = {
      sense_groups: [
        { id: uuidFromInt(1600), name_zh: "核心", name_en: "Core" }
      ],
      pos: [
        {
          pos_id: uuidFromInt(1001),
          grammar_structures: [
            {
              id: uuidFromInt(1601),
              variants: [
                {
                  id: uuidFromInt(1602),
                  dialect: "common",
                  content: {
                    version: 2,
                    text: "a noun",
                    annotations: []
                  }
                }
              ]
            }
          ],
          senses: [
            {
              id: uuidFromInt(1603),
              sub_pos: "countable",
              level: "A1",
              sense_group_id: uuidFromInt(1600),
              frequency: "50",
              depends_on_context: false,
              definitions: [
                {
                  id: uuidFromInt(1604),
                  level: "A1",
                  grammar_structure_id: uuidFromInt(1601),
                  definition_mode: "zh_definition",
                  content_id: uuidFromInt(1605),
                  content: { version: 2, text: "中心", annotations: [] }
                }
              ],
              sentences: [
                {
                  id: uuidFromInt(1606),
                  level: "A1",
                  en_text: {
                    mode: "unified",
                    common: {
                      id: uuidFromInt(1607),
                      origin: "manual",
                      value: {
                        version: 2,
                        text: "A centre.",
                        annotations: []
                      }
                    }
                  },
                  zh_text_id: uuidFromInt(1608),
                  zh_text: { version: 2, text: "一个中心。", annotations: [] },
                  zh_translations: [
                    {
                      id: uuidFromInt(1609),
                      band: "a1_a2",
                      content: {
                        version: 2,
                        text: "一个中心。",
                        annotations: []
                      }
                    }
                  ],
                  links: [],
                  associations: [],
                  associations_state: "resolved"
                }
              ],
              relations: []
            }
          ]
        }
      ]
    };
    const nested = issue(1610, {
      step: "meanings",
      node_id: nodeId,
      field: "content",
      code: "definition_invalid",
      node_location: {
        node_role: `meanings.${_label}`,
        ancestor_node_ids: []
      }
    });

    expect(
      buildV3PublicationIssueSummary(current, [nested]).positions[0]?.pos_id
    ).toBe(uuidFromInt(1001));
  });
});
