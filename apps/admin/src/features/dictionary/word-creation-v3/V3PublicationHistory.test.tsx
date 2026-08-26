import { HttpError, InvalidAdminWordResponseError } from "@tsz/api-client";
import type {
  AdminWordPublicationV2,
  AdminWordPublicationV3,
  AdminWordV3,
  SurfaceMatchPageAny
} from "@tsz/types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
} from "@testing-library/react";
import { StrictMode } from "react";
import { describe, expect, it, vi } from "vitest";
import { wordFixture } from "../word-creation/wordCreation.test.helper";
import { formsFixture, ukUsFormFixture } from "./fixtures";
import { V3PublicationHistory } from "./V3PublicationHistory";

function v3Word(overrides: Partial<AdminWordV3> = {}): AdminWordV3 {
  return {
    schema_version: 3,
    id: "word-mixed",
    language: "en",
    kind: "word",
    status: "published",
    revision: 9,
    lifecycle_revision: 3,
    has_unpublished_changes: false,
    presentation: {
      label: "server V3 presentation",
      matched_surfaces: ["not-the-label"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication: { mode: "migration_canary", whitelisted: true },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: formsFixture(),
    meanings: { sense_groups: [], pos: [] },
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    created_by: "admin-1",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z",
    published_revision: 9,
    published_at: "2026-08-25T00:30:00Z",
    ...overrides
  };
}

function v2Publication(
  overrides: Partial<AdminWordPublicationV2> = {}
): AdminWordPublicationV2 {
  return {
    schema_version: 2,
    publication_id: "pub-v2",
    entry_id: "word-mixed",
    publication_number: 1,
    source_revision: 3,
    published_by_admin_id: "admin-1",
    published_at: "2026-08-24T00:00:00Z",
    is_current: false,
    word: wordFixture({ headword: "historical-v2", status: "published" }),
    ...overrides
  };
}

function v3Publication(
  overrides: Partial<AdminWordPublicationV3> = {}
): AdminWordPublicationV3 {
  return {
    schema_version: 3,
    publication_id: "pub-v3",
    entry_id: "word-mixed",
    publication_number: 2,
    source_revision: 9,
    published_by_admin_id: "admin-1",
    published_at: "2026-08-25T00:30:00Z",
    is_current: false,
    word: v3Word(),
    ...overrides
  };
}

function v2PublicationWithSnapshotBody(): AdminWordPublicationV2 {
  const publication = v2Publication({
    word: wordFixture({
      headword: "immutable-v2-detail",
      status: "published"
    })
  });
  const variant = publication.word.forms.pos[0]!.base_form.variants[0]!;
  variant.spelling = "historical-v2-spelling";
  variant.pronunciations = [
    {
      id: "historical-v2-pronunciation",
      dict_phonetic: "historical-v2-dict",
      actual_pron: "historical-v2-actual",
      style: "weak"
    }
  ];
  const definition =
    publication.word.meanings.pos[0]!.senses[0]!.definitions[0]!;
  if (definition.definition_mode !== "zh_definition") {
    throw new Error("expected zh definition fixture");
  }
  definition.content.text = "historical-v2-meaning";
  return publication;
}

function v3PublicationWithSnapshotBody(): AdminWordPublicationV3 {
  const word = v3Word({
    presentation: {
      label: "immutable-v3-detail",
      matched_surfaces: [],
      strategy_version: "surface_summary_v1"
    }
  });
  const form = word.forms.pos[0]!.forms[0]!;
  if (form.regional_variants.mode !== "common") {
    throw new Error("expected common form fixture");
  }
  form.regional_variants.common.spelling = "historical-v3-spelling";
  form.regional_variants.common.pronunciations = [
    {
      id: "historical-v3-pronunciation",
      dict_phonetic: "historical-v3-dict",
      actual_pron: "historical-v3-actual",
      style: "strong"
    }
  ];
  word.meanings = {
    sense_groups: [],
    pos: [
      {
        pos_id: word.forms.pos[0]!.pos_id,
        grammar_structures: [],
        senses: [
          {
            id: "historical-v3-sense",
            sub_pos: "N-COUNT",
            level: "B1",
            frequency: "12.50",
            depends_on_context: false,
            definitions: [
              {
                id: "historical-v3-definition",
                level: "B1",
                definition_mode: "zh_definition",
                content_id: "historical-v3-content",
                content: {
                  version: 1,
                  text: "historical-v3-meaning",
                  spans: [],
                  liaisons: []
                }
              }
            ],
            sentences: [],
            relations: []
          }
        ]
      }
    ]
  };
  return v3Publication({ word });
}

function complexV2Publication(): AdminWordPublicationV2 {
  const publication = v2PublicationWithSnapshotBody();
  publication.publication_id = "pub-v2-complex";
  publication.publication_number = 21;
  publication.source_revision = 31;
  publication.published_by_admin_id = "v2-publisher-admin";
  publication.word.headwords = { mode: "unified", common: "shared-snapshot" };
  const forms = publication.word.forms.pos[0]!;
  const baseVariant = forms.base_form.variants[0]!;
  baseVariant.spelling = "shared-summary-spelling";
  baseVariant.pronunciations = [
    {
      id: "shared-summary-pronunciation-v2",
      dict_phonetic: "shared-summary-dict",
      actual_pron: "shared-summary-actual",
      style: "normal"
    }
  ];
  forms.form_groups = [
    {
      id: "v2-form-group-first",
      is_regular: false,
      slots: [
        {
          id: "v2-ordered-slot-first",
          form_type: "plural",
          variants: [
            {
              id: "v2-ordered-variant",
              dialect: "common",
              spelling: "shared-structure-spelling",
              origin: "manual",
              pronunciations: []
            }
          ]
        }
      ]
    }
  ];
  const meanings = publication.word.meanings;
  meanings.sense_groups = [
    {
      id: "v2-sense-group-only",
      name_zh: "V2 结构组",
      name_en: "V2 structure group"
    }
  ];
  const pos = meanings.pos[0]!;
  pos.grammar_structures = [
    {
      id: "v2-grammar-structure-only",
      variants: [
        {
          id: "v2-grammar-variant",
          dialect: "common",
          content: {
            version: 1,
            text: "V2 grammar only",
            spans: [],
            liaisons: []
          }
        }
      ]
    }
  ];
  const sense = pos.senses[0]!;
  sense.sense_group_id = "v2-sense-group-only";
  const definition = sense.definitions[0]!;
  if (definition.definition_mode !== "zh_definition") {
    throw new Error("expected zh definition fixture");
  }
  definition.content.text = "shared-summary-meaning";
  sense.sentences = [
    {
      id: "v2-sentence-only",
      level: "B1",
      en_text: {
        mode: "unified",
        common: {
          id: "v2-sentence-en",
          origin: "manual",
          value: {
            version: 1,
            text: "V2 sentence only.",
            spans: [],
            liaisons: []
          }
        }
      },
      zh_text_id: "v2-sentence-zh",
      zh_text: {
        version: 1,
        text: "仅 V2 例句",
        spans: [],
        liaisons: []
      },
      links: [
        {
          word_id: publication.entry_id,
          sense_id: sense.id,
          role: "focus"
        }
      ]
    }
  ];
  sense.relations = [
    {
      id: "v2-relation-only",
      relation: "synonym",
      pending_target_headword: "v2-related-only",
      score: "88.5"
    }
  ];
  return publication;
}

function complexV3Publication(): AdminWordPublicationV3 {
  const publication = v3PublicationWithSnapshotBody();
  publication.publication_id = "pub-v3-complex";
  publication.publication_number = 22;
  publication.source_revision = 32;
  publication.published_by_admin_id = "v3-publisher-admin";
  publication.word.presentation = {
    label: "shared-snapshot",
    matched_surfaces: ["shared-snapshot"],
    strategy_version: "surface_summary_v1"
  };
  const forms = publication.word.forms.pos[0]!;
  const formId = forms.forms[0]!.id;
  const form = forms.forms[0]!;
  if (form.regional_variants.mode !== "common") {
    throw new Error("expected common form fixture");
  }
  form.regional_variants.common.spelling = "shared-summary-spelling";
  form.regional_variants.common.pronunciations = [
    {
      id: "shared-summary-pronunciation-v3",
      dict_phonetic: "shared-summary-dict",
      actual_pron: "shared-summary-actual",
      style: "normal"
    }
  ];
  forms.form_groups = [
    {
      id: "v3-form-group-first",
      is_regular: false,
      members: [{ id: "v3-membership-first", form_id: formId }]
    },
    {
      id: "v3-form-group-second",
      is_regular: true,
      members: [{ id: "v3-membership-second", form_id: formId }]
    }
  ];
  const meanings = publication.word.meanings;
  meanings.sense_groups = [
    {
      id: "v3-sense-group-only",
      name_zh: "V3 结构组",
      name_en: "V3 structure group"
    }
  ];
  const pos = meanings.pos[0]!;
  pos.grammar_structures = [
    {
      id: "v3-grammar-structure-only",
      variants: [
        {
          id: "v3-grammar-variant",
          dialect: "common",
          content: {
            version: 2,
            text: "V3 grammar only",
            annotations: []
          }
        }
      ]
    }
  ];
  const sense = pos.senses[0]!;
  sense.sense_group_id = "v3-sense-group-only";
  const definition = sense.definitions[0]!;
  if (definition.definition_mode !== "zh_definition") {
    throw new Error("expected zh definition fixture");
  }
  definition.content.text = "shared-summary-meaning";
  sense.sentences = [
    {
      id: "v3-sentence-only",
      level: "B1",
      en_text: {
        mode: "unified",
        common: {
          id: "v3-sentence-en",
          origin: "manual",
          value: {
            version: 2,
            text: "V3 sentence only.",
            annotations: []
          }
        }
      },
      zh_text_id: "v3-sentence-zh",
      zh_text: {
        version: 2,
        text: "仅 V3 例句",
        annotations: []
      },
      links: [
        {
          word_id: publication.entry_id,
          sense_id: sense.id,
          role: "focus"
        }
      ],
      associations: [
        {
          id: "v3-association-only",
          source_dialect: "common",
          source_range: { start: 0, end: 2, surface: "V3" },
          target_word_id: "v3-associated-word",
          target_sense_id: "v3-associated-sense",
          origin: "manual",
          target_headword: "v3-associated-only",
          target_gloss: "V3 association",
          resolved_pos: "noun"
        }
      ],
      associations_state: "resolved"
    }
  ];
  sense.relations = [
    {
      id: "v3-relation-only",
      relation: "synonym",
      pending_target_headword: "v3-related-only",
      score: "88.5"
    }
  ];
  return publication;
}

function requests() {
  return {
    get: vi.fn(),
    listPublications: vi.fn(),
    getPublication: vi.fn(),
    activatePublication: vi.fn()
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function activationSurfacePage(
  snapshotId: string,
  spelling: string,
  nextCursor: string | null,
  token?: string,
  total = nextCursor === null ? 1 : 2
): SurfaceMatchPageAny {
  const page = {
    schema_version: 3 as const,
    snapshot_id: snapshotId,
    items: [
      {
        match_kind: "form_variant_v3" as const,
        match: {
          source_schema_version: 3 as const,
          entry_id: `entry-${spelling}`,
          status: "published" as const,
          content_scope: "current_publication" as const,
          pos_id: `pos-${spelling}`,
          group_ids: [],
          form_id: `form-${spelling}`,
          variant_id: `variant-${spelling}`,
          form_type: "base" as const,
          dialect: "common" as const,
          spelling
        }
      }
    ],
    total,
    matched_entry_contexts: [],
    confirmation_reasons: [
      "visibility_activation"
    ] as SurfaceMatchPageAny["confirmation_reasons"],
    policy_name: "allow_multiple_active_exact_headword_publications" as const,
    policy_epoch: 7,
    continuation_policy: "enabled" as const
  };
  if (nextCursor !== null) {
    return { ...page, next_cursor: nextCursor };
  }
  if (!token) throw new Error("terminal surface page requires a token");
  return {
    ...page,
    next_cursor: null,
    surface_confirmation_token: token
  };
}

describe("V3PublicationHistory", () => {
  it("renders a successful history response after StrictMode replays lifecycle effects", async () => {
    const api = requests();
    const detail = v3PublicationWithSnapshotBody();
    api.listPublications.mockResolvedValue({
      publications: [
        v3Publication({
          word: v3Word({
            presentation: {
              label: "strict history loaded",
              matched_surfaces: [],
              strategy_version: "surface_summary_v1"
            }
          })
        })
      ]
    });
    api.getPublication.mockResolvedValue({ publication: detail });

    render(
      <StrictMode>
        <V3PublicationHistory
          currentWord={v3Word()}
          onActivated={vi.fn()}
          requests={api}
        />
      </StrictMode>
    );

    expect(
      await screen.findByText("strict history loaded")
    ).toBeInTheDocument();
    expect(api.listPublications).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "查看第 2 次发布" }));
    const detailView = await screen.findByTestId("publication-detail");
    expect(
      within(detailView).getByText("historical-v3-spelling")
    ).toBeInTheDocument();
    expect(
      within(detailView).getByText(
        "词典音标 historical-v3-dict · 实际发音 historical-v3-actual · 强读"
      )
    ).toBeInTheDocument();
    expect(
      within(detailView).getByText("historical-v3-meaning")
    ).toBeInTheDocument();
    expect(api.getPublication).toHaveBeenCalledTimes(1);
    expect(api.getPublication).toHaveBeenCalledWith("word-mixed", "pub-v3");
  });

  it("lists mixed summaries and opens immutable detail from getPublication", async () => {
    const api = requests();
    const listV2 = v2Publication();
    const listV3 = v3Publication({
      word: v3Word({
        presentation: {
          label: "list-only-label",
          matched_surfaces: [],
          strategy_version: "surface_summary_v1"
        }
      })
    });
    const detailV2 = v2PublicationWithSnapshotBody();
    const detailV3 = v3PublicationWithSnapshotBody();
    api.listPublications.mockResolvedValue({ publications: [listV2, listV3] });
    api.getPublication.mockImplementation(
      async (_wordId: string, publicationId: string) => ({
        publication: publicationId === "pub-v2" ? detailV2 : detailV3
      })
    );

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activate-key"}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    expect(await screen.findByText("historical-v2")).toBeInTheDocument();
    expect(screen.getByText("list-only-label")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看第 1 次发布" }));
    const detail = await screen.findByTestId("publication-detail");
    expect(within(detail).getByText("immutable-v2-detail")).toBeInTheDocument();
    expect(
      within(detail).getByText("historical-v2-spelling")
    ).toBeInTheDocument();
    expect(
      within(detail).getByText(
        "词典音标 historical-v2-dict · 实际发音 historical-v2-actual · 弱读"
      )
    ).toBeInTheDocument();
    expect(
      within(detail).getByText("historical-v2-meaning")
    ).toBeInTheDocument();
    expect(within(detail).queryByText("centre")).toBeNull();
    expect(within(detail).queryByText("server V3 presentation")).toBeNull();
    expect(
      within(detail).getByRole("button", { name: "激活此发布版本" })
    ).toBeEnabled();
    expect(api.getPublication).toHaveBeenCalledWith("word-mixed", "pub-v2");

    fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    fireEvent.click(screen.getByRole("button", { name: "查看第 2 次发布" }));
    const v3Detail = await screen.findByTestId("publication-detail");
    expect(
      within(v3Detail).getByText("immutable-v3-detail")
    ).toBeInTheDocument();
    expect(
      within(v3Detail).getByText("historical-v3-spelling")
    ).toBeInTheDocument();
    expect(
      within(v3Detail).getByText(
        "词典音标 historical-v3-dict · 实际发音 historical-v3-actual · 强读"
      )
    ).toBeInTheDocument();
    expect(
      within(v3Detail).getByText("historical-v3-meaning")
    ).toBeInTheDocument();
    expect(within(v3Detail).queryByText("centre")).toBeNull();
    expect(within(v3Detail).queryByText("server V3 presentation")).toBeNull();
    expect(api.getPublication).toHaveBeenCalledWith("word-mixed", "pub-v3");
  });

  it("productizes V2 and V3 publication details without exposing wire metadata", async () => {
    const api = requests();
    const detailV2 = complexV2Publication();
    const detailV3 = complexV3Publication();
    api.listPublications.mockResolvedValue({
      publications: [detailV2, detailV3]
    });
    api.getPublication.mockImplementation(
      async (_wordId: string, publicationId: string) => ({
        publication:
          publicationId === detailV2.publication_id ? detailV2 : detailV3
      })
    );

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 21 次发布" })
    );
    let detail = within(await screen.findByTestId("publication-detail"));
    expect(detail.getByTestId("publication-metadata")).toHaveTextContent(
      "发布批次：第 21 次"
    );
    expect(detail.getByTestId("publication-metadata")).toHaveTextContent(
      "当前状态：历史版本"
    );
    expect(detail.getByText("shared-summary-spelling")).toBeInTheDocument();
    expect(detail.getByText("shared-summary-meaning")).toBeInTheDocument();
    expect(
      detail.getByText("释义组 1：V2 结构组 / V2 structure group")
    ).toBeInTheDocument();
    expect(detail.getByText("V2 grammar only")).toBeInTheDocument();
    expect(detail.getByText("通用：V2 sentence only.")).toBeInTheDocument();
    expect(detail.getByText("中文：仅 V2 例句")).toBeInTheDocument();
    expect(detail.getByText("主关联")).toBeInTheDocument();
    expect(detail.getByText("近义词")).toBeInTheDocument();
    expect(detail.getByText("v2-related-only")).toBeInTheDocument();
    expect(detail.queryByText(/v2-sentence-only|v2-relation-only/)).toBeNull();
    expect(detail.queryByText("v2-publisher-admin")).toBeNull();
    expect(detail.queryByText(/source_revision|schema_version/)).toBeNull();
    expect(detail.queryByTestId("publication-structure-snapshot")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    fireEvent.click(screen.getByRole("button", { name: "查看第 22 次发布" }));
    detail = within(await screen.findByTestId("publication-detail"));
    expect(detail.getByTestId("publication-metadata")).toHaveTextContent(
      "发布批次：第 22 次"
    );
    expect(detail.getByTestId("publication-metadata")).toHaveTextContent(
      "当前状态：历史版本"
    );
    expect(detail.getByText("shared-summary-spelling")).toBeInTheDocument();
    expect(detail.getByText("shared-summary-meaning")).toBeInTheDocument();
    expect(
      detail.getByText("释义组 1：V3 结构组 / V3 structure group")
    ).toBeInTheDocument();
    expect(detail.getByText("V3 grammar only")).toBeInTheDocument();
    expect(detail.getByText("通用：V3 sentence only.")).toBeInTheDocument();
    expect(detail.getByText("中文：仅 V3 例句")).toBeInTheDocument();
    expect(detail.getByText("主关联")).toBeInTheDocument();
    expect(
      detail.getByText("上下文关联：v3-associated-only · V3 association")
    ).toBeInTheDocument();
    expect(detail.getByText("近义词")).toBeInTheDocument();
    expect(detail.getByText("v3-related-only")).toBeInTheDocument();
    expect(
      detail.queryByText(
        /v3-sentence-only|v3-relation-only|v3-association-only/
      )
    ).toBeNull();
    expect(detail.queryByText("v3-publisher-admin")).toBeNull();
    expect(detail.queryByText(/source_revision|schema_version/)).toBeNull();
    expect(detail.queryByTestId("publication-structure-snapshot")).toBeNull();
  });

  it("缺失词性映射、等级与关联摘要时使用只读快照回退", async () => {
    const api = requests();
    const detailV2 = complexV2Publication();
    const detailV3 = complexV3Publication();
    detailV2.is_current = true;
    detailV3.is_current = true;

    const v2Pos = detailV2.word.meanings.pos[0]!;
    v2Pos.pos_id = "orphan-v2-pos";
    v2Pos.senses[0]!.sentences[0]!.level = undefined as never;
    const v2Relation = v2Pos.senses[0]!.relations[0]!;
    delete v2Relation.pending_target_headword;
    v2Relation.target_gloss = "V2 待补充释义";

    const v3Pos = detailV3.word.meanings.pos[0]!;
    v3Pos.pos_id = "orphan-v3-pos";
    v3Pos.senses[0]!.sentences[0]!.level = "";
    v3Pos.senses[0]!.sentences[0]!.associations[0]!.target_gloss = "";
    const v3Relation = v3Pos.senses[0]!.relations[0]!;
    delete v3Relation.pending_target_headword;
    v3Relation.target_gloss = "V3 待补充释义";

    api.listPublications.mockResolvedValue({
      publications: [detailV2, detailV3]
    });
    api.getPublication.mockImplementation(
      async (_wordId: string, publicationId: string) => ({
        publication:
          publicationId === detailV2.publication_id ? detailV2 : detailV3
      })
    );

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 21 次发布" })
    );
    let detail = within(await screen.findByTestId("publication-detail"));
    expect(detail.getByTestId("publication-metadata")).toHaveTextContent(
      "当前状态：当前线上版本"
    );
    expect(
      detail.getByText("待补充目标词条 · V2 待补充释义")
    ).toBeInTheDocument();
    expect(detail.getAllByText("其他词性").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    fireEvent.click(screen.getByRole("button", { name: "查看第 22 次发布" }));
    detail = within(await screen.findByTestId("publication-detail"));
    expect(detail.getByTestId("publication-metadata")).toHaveTextContent(
      "当前状态：当前线上版本"
    );
    expect(
      detail.getByText("上下文关联：v3-associated-only")
    ).toBeInTheDocument();
    expect(
      detail.getByText("待补充目标词条 · V3 待补充释义")
    ).toBeInTheDocument();
    expect(detail.getAllByText("其他词性").length).toBeGreaterThan(0);
  });

  it("renders V2 common and UK/US forms plus unified and split English definitions", async () => {
    const api = requests();
    const detail = v2PublicationWithSnapshotBody();
    detail.word.forms.pos[0]!.base_form.variants.push(
      {
        id: "historical-v2-uk-variant",
        dialect: "uk",
        spelling: "historical-v2-uk-spelling",
        origin: "manual",
        pronunciations: []
      },
      {
        id: "historical-v2-us-variant",
        dialect: "us",
        spelling: "historical-v2-us-spelling",
        origin: "manual",
        pronunciations: [
          {
            id: "historical-v2-us-pronunciation",
            dict_phonetic: "historical-v2-us-dict",
            actual_pron: "historical-v2-us-actual",
            style: "strong"
          }
        ]
      }
    );
    detail.word.meanings.pos[0]!.senses[0]!.definitions.push(
      {
        id: "historical-v2-en-unified-definition",
        level: "B1",
        definition_mode: "en_definition",
        content: {
          mode: "unified",
          common: {
            id: "historical-v2-en-unified-content",
            origin: "manual",
            value: {
              version: 1,
              text: "historical-v2-unified-meaning",
              spans: [],
              liaisons: []
            }
          }
        }
      },
      {
        id: "historical-v2-en-split-definition",
        level: "B1",
        definition_mode: "en_definition",
        content: {
          mode: "distinguish",
          source_dialect: "uk",
          uk: {
            state: "ready",
            variant: {
              id: "historical-v2-en-uk-content",
              origin: "manual",
              value: {
                version: 1,
                text: "historical-v2-split-ready-meaning",
                spans: [],
                liaisons: []
              }
            }
          },
          us: { state: "missing" }
        }
      }
    );
    api.listPublications.mockResolvedValue({ publications: [detail] });
    api.getPublication.mockResolvedValue({ publication: detail });

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 1 次发布" })
    );
    const snapshot = within(
      await screen.findByTestId("publication-snapshot-body")
    );

    expect(snapshot.getByText("historical-v2-spelling")).toBeInTheDocument();
    expect(snapshot.getByText("historical-v2-uk-spelling")).toBeInTheDocument();
    expect(snapshot.getByText("historical-v2-us-spelling")).toBeInTheDocument();
    expect(snapshot.getByText("无发音")).toBeInTheDocument();
    expect(
      snapshot.getByText(
        "词典音标 historical-v2-us-dict · 实际发音 historical-v2-us-actual · 强读"
      )
    ).toBeInTheDocument();
    expect(
      snapshot.getByText("historical-v2-unified-meaning")
    ).toBeInTheDocument();
    expect(
      snapshot.getByText("historical-v2-split-ready-meaning")
    ).toBeInTheDocument();
  });

  it("renders V3 common and UK/US forms plus unified and split English definitions", async () => {
    const api = requests();
    const detail = v3PublicationWithSnapshotBody();
    detail.word.forms.pos[0]!.forms.push(
      ukUsFormFixture({
        uk: {
          spelling: "historical-v3-uk-spelling",
          pronunciations: []
        },
        us: {
          spelling: "historical-v3-us-spelling",
          pronunciations: [
            {
              id: "historical-v3-us-pronunciation",
              dict_phonetic: "historical-v3-us-dict",
              actual_pron: "historical-v3-us-actual"
            }
          ]
        }
      })
    );
    detail.word.meanings.pos[0]!.senses[0]!.definitions.push(
      {
        id: "historical-v3-en-unified-definition",
        level: "B1",
        definition_mode: "en_definition",
        content: {
          mode: "unified",
          common: {
            id: "historical-v3-en-unified-content",
            origin: "manual",
            value: {
              version: 1,
              text: "historical-v3-unified-meaning",
              spans: [],
              liaisons: []
            }
          }
        }
      },
      {
        id: "historical-v3-en-split-definition",
        level: "B1",
        definition_mode: "en_definition",
        content: {
          mode: "distinguish",
          source_dialect: "us",
          uk: { state: "missing" },
          us: {
            state: "ready",
            variant: {
              id: "historical-v3-en-us-content",
              origin: "manual",
              value: {
                version: 1,
                text: "historical-v3-split-ready-meaning",
                spans: [],
                liaisons: []
              }
            }
          }
        }
      }
    );
    api.listPublications.mockResolvedValue({ publications: [detail] });
    api.getPublication.mockResolvedValue({ publication: detail });

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    const snapshot = within(
      await screen.findByTestId("publication-snapshot-body")
    );

    expect(snapshot.getByText("historical-v3-spelling")).toBeInTheDocument();
    expect(snapshot.getByText("historical-v3-uk-spelling")).toBeInTheDocument();
    expect(snapshot.getByText("historical-v3-us-spelling")).toBeInTheDocument();
    expect(snapshot.getByText("无发音")).toBeInTheDocument();
    expect(
      snapshot.getByText(
        "词典音标 historical-v3-us-dict · 实际发音 historical-v3-us-actual"
      )
    ).toBeInTheDocument();
    expect(
      snapshot.getByText("historical-v3-unified-meaning")
    ).toBeInTheDocument();
    expect(
      snapshot.getByText("historical-v3-split-ready-meaning")
    ).toBeInTheDocument();
  });

  it("renders explicit empty snapshot states for contract-minimum V2 and V3 bodies", async () => {
    const api = requests();
    const emptyV2 = v2Publication({
      word: {
        ...wordFixture({ headword: "empty-v2", status: "published" }),
        forms: { pos: [] },
        meanings: { sense_groups: [], pos: [] }
      }
    });
    const emptyV3 = v3Publication({
      word: v3Word({
        presentation: {
          label: "empty-v3",
          matched_surfaces: [],
          strategy_version: "surface_summary_v1"
        },
        forms: { pos: [] },
        meanings: { sense_groups: [], pos: [] }
      })
    });
    api.listPublications.mockResolvedValue({
      publications: [emptyV2, emptyV3]
    });
    api.getPublication.mockImplementation(
      async (_wordId: string, publicationId: string) => ({
        publication: publicationId === "pub-v2" ? emptyV2 : emptyV3
      })
    );

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 1 次发布" })
    );
    let snapshot = within(
      await screen.findByTestId("publication-snapshot-body")
    );
    expect(snapshot.getByText("无词形快照")).toBeInTheDocument();
    expect(snapshot.getByText("无释义快照")).toBeInTheDocument();
    expect(snapshot.getByText("无例句快照")).toBeInTheDocument();
    expect(snapshot.getByText("无关系词快照")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    fireEvent.click(screen.getByRole("button", { name: "查看第 2 次发布" }));
    snapshot = within(await screen.findByTestId("publication-snapshot-body"));
    expect(snapshot.getByText("无词形快照")).toBeInTheDocument();
    expect(snapshot.getByText("无释义快照")).toBeInTheDocument();
    expect(snapshot.getByText("无例句快照")).toBeInTheDocument();
    expect(snapshot.getByText("无关系词快照")).toBeInTheDocument();
  });

  it("uses the current native capability to activate non-current V2 or V3 publications", async () => {
    const api = requests();
    const legacy = v2Publication();
    const historicalShadow = v3Publication({
      publication_id: "pub-v3-shadow",
      publication_number: 2,
      word: v3Word({
        capabilities: {
          publication: {
            mode: "shadow_only",
            blocked_code: "phase2_consumers_not_ready"
          },
          pronunciation_normalization_version: "nfkc_trim_lower_v1"
        }
      })
    });
    const current = v3Publication({
      publication_id: "pub-v3-current",
      publication_number: 3,
      is_current: true
    });
    api.listPublications.mockResolvedValue({
      publications: [legacy, historicalShadow, current]
    });
    api.getPublication.mockImplementation(
      async (_wordId: string, publicationId: string) => ({
        publication:
          publicationId === "pub-v2"
            ? legacy
            : publicationId === "pub-v3-shadow"
              ? historicalShadow
              : current
      })
    );

    render(
      <V3PublicationHistory
        currentWord={v3Word({
          capabilities: {
            publication: { mode: "native" },
            pronunciation_normalization_version: "nfkc_trim_lower_v1"
          }
        })}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    for (const publicationNumber of [1, 2]) {
      fireEvent.click(
        await screen.findByRole("button", {
          name: `查看第 ${publicationNumber} 次发布`
        })
      );
      expect(
        await screen.findByRole("button", { name: "激活此发布版本" })
      ).toBeEnabled();
      fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "查看第 3 次发布" }));
    expect(screen.queryByRole("button", { name: "激活此发布版本" })).toBeNull();
  });

  it("keeps non-current V2 and V3 history read-only when the current entry is archived", async () => {
    const api = requests();
    const legacy = v2Publication();
    const historicalV3 = v3Publication();
    const keyFactory = vi.fn(() => "must-not-be-created");
    api.listPublications.mockResolvedValue({
      publications: [legacy, historicalV3]
    });
    api.getPublication.mockImplementation(
      async (_wordId: string, publicationId: string) => ({
        publication: publicationId === "pub-v2" ? legacy : historicalV3
      })
    );

    render(
      <V3PublicationHistory
        currentWord={v3Word({ status: "archived" })}
        idempotencyKeyFactory={keyFactory}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    for (const publicationNumber of [1, 2]) {
      fireEvent.click(
        await screen.findByRole("button", {
          name: `查看第 ${publicationNumber} 次发布`
        })
      );
      expect(
        await screen.findByTestId("publication-snapshot-body")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "激活此发布版本" })
      ).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    }
    expect(keyFactory).not.toHaveBeenCalled();
    expect(api.activatePublication).not.toHaveBeenCalled();
  });

  it("activates a V2 publication after loading a complete surface snapshot with a rotated key", async () => {
    const api = requests();
    const legacy = v2Publication();
    const firstPage = activationSurfacePage(
      "activation-snapshot",
      "first-source",
      "cursor-2"
    );
    const terminalPage = activationSurfacePage(
      "activation-snapshot",
      "terminal-source",
      null,
      "terminal-activation-token",
      2
    );
    const activated = v3Word({ revision: 13, lifecycle_revision: 8 });
    const fetchSurfacePage = vi.fn(async () => terminalPage);
    const keyFactory = vi
      .fn()
      .mockReturnValueOnce("initial-activation-key")
      .mockReturnValueOnce("confirmed-activation-key");
    api.listPublications.mockResolvedValue({ publications: [legacy] });
    api.getPublication.mockResolvedValue({ publication: legacy });
    api.activatePublication
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "confirmation required",
          [],
          "surface_match_acknowledgement_required",
          [],
          { surface_match_page: firstPage }
        )
      )
      .mockResolvedValueOnce({ word: activated });
    const onActivated = vi.fn();

    render(
      <StrictMode>
        <V3PublicationHistory
          currentWord={v3Word({ revision: 12, lifecycle_revision: 7 })}
          fetchSurfacePage={fetchSurfacePage}
          idempotencyKeyFactory={keyFactory}
          onActivated={onActivated}
          requests={api}
        />
      </StrictMode>
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 1 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

    await screen.findByText("terminal-source");
    for (const detailsButton of await screen.findAllByRole("button", {
      name: "查看候选详情"
    })) {
      fireEvent.click(detailsButton);
    }
    expect(
      await screen.findByText("词形 · first-source · 原形 · 通用")
    ).toBeInTheDocument();
    expect(
      await screen.findByText("词形 · terminal-source · 原形 · 通用")
    ).toBeInTheDocument();
    expect(fetchSurfacePage).toHaveBeenCalledWith(
      "activation-snapshot",
      "cursor-2",
      expect.any(AbortSignal)
    );
    fireEvent.click(screen.getByRole("button", { name: "确认并激活" }));

    await waitFor(() => expect(onActivated).toHaveBeenCalledWith(activated));
    expect(api.activatePublication).toHaveBeenNthCalledWith(
      1,
      "word-mixed",
      "pub-v2",
      "initial-activation-key",
      {
        schema_version: 3,
        base_revision: 12,
        base_lifecycle_revision: 7
      }
    );
    expect(api.activatePublication).toHaveBeenNthCalledWith(
      2,
      "word-mixed",
      "pub-v2",
      "confirmed-activation-key",
      {
        schema_version: 3,
        base_revision: 12,
        base_lifecycle_revision: 7,
        confirmed_surface_match_token: "terminal-activation-token"
      }
    );
  });

  it("invalidates an old token when surface matches change and confirms the replacement snapshot", async () => {
    const api = requests();
    const historical = v3Publication();
    const oldPage = activationSurfacePage(
      "old-activation-snapshot",
      "old-source",
      null,
      "old-token"
    );
    const replacementPage = activationSurfacePage(
      "replacement-activation-snapshot",
      "replacement-source",
      null,
      "replacement-token"
    );
    const keys = ["initial-key", "old-confirm-key", "replacement-key"];
    const keyFactory = vi.fn(() => keys.shift()!);
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "confirmation required",
          [],
          "surface_match_acknowledgement_required",
          [],
          { surface_match_page: oldPage }
        )
      )
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "matches changed",
          [],
          "surface_matches_changed",
          [],
          { surface_match_page: replacementPage }
        )
      )
      .mockResolvedValueOnce({ word: v3Word({ revision: 10 }) });

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={keyFactory}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认并激活" }));

    await screen.findByText("replacement-source");
    for (const detailsButton of await screen.findAllByRole("button", {
      name: "查看候选详情"
    })) {
      fireEvent.click(detailsButton);
    }
    expect(
      await screen.findByText("词形 · replacement-source · 原形 · 通用")
    ).toBeInTheDocument();
    expect(screen.queryByText("词形 · old-source · 原形 · 通用")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /确认并激活/ }));
    await waitFor(() =>
      expect(api.activatePublication).toHaveBeenCalledTimes(3)
    );
    expect(api.activatePublication.mock.calls.map((call) => call[2])).toEqual([
      "initial-key",
      "old-confirm-key",
      "replacement-key"
    ]);
    expect(api.activatePublication.mock.calls[2]![3]).toMatchObject({
      confirmed_surface_match_token: "replacement-token"
    });
  });

  it.each([
    [410, "surface_match_snapshot_expired"],
    [409, "surface_policy_changed"]
  ])(
    "restarts activation without a token after paged snapshot invalidation %s/%s",
    async (status, code) => {
      const api = requests();
      const historical = v3Publication();
      const stalePage = activationSurfacePage(
        "stale-paged-snapshot",
        "stale-page-source",
        "cursor-2"
      );
      const replacementPage = activationSurfacePage(
        "fresh-terminal-snapshot",
        "fresh-page-source",
        null,
        "fresh-terminal-token"
      );
      const fetchSurfacePage = vi
        .fn()
        .mockRejectedValue(
          new HttpError(
            status as number,
            "snapshot invalid",
            [],
            code as string
          )
        );
      const keys = ["initial-key", "restart-key", "fresh-confirm-key"];
      const keyFactory = vi.fn(() => keys.shift()!);
      api.listPublications.mockResolvedValue({ publications: [historical] });
      api.getPublication.mockResolvedValue({ publication: historical });
      api.activatePublication
        .mockRejectedValueOnce(
          new HttpError(
            409,
            "confirmation required",
            [],
            "surface_match_acknowledgement_required",
            [],
            { surface_match_page: stalePage }
          )
        )
        .mockRejectedValueOnce(
          new HttpError(
            409,
            "confirmation required",
            [],
            "surface_match_acknowledgement_required",
            [],
            { surface_match_page: replacementPage }
          )
        )
        .mockResolvedValueOnce({ word: v3Word({ revision: 10 }) });

      render(
        <V3PublicationHistory
          currentWord={v3Word()}
          fetchSurfacePage={fetchSurfacePage}
          idempotencyKeyFactory={keyFactory}
          onActivated={vi.fn()}
          requests={api}
        />
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "查看第 2 次发布" })
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "激活此发布版本" })
      );
      fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

      fireEvent.click(
        await screen.findByRole("button", { name: "重新检查激活条件" })
      );
      await waitFor(() =>
        expect(api.activatePublication).toHaveBeenCalledTimes(2)
      );
      expect(api.activatePublication.mock.calls[1]![2]).toBe("restart-key");
      expect(api.activatePublication.mock.calls[1]![3]).not.toHaveProperty(
        "confirmed_surface_match_token"
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "确认并激活" })
      );
      await waitFor(() =>
        expect(api.activatePublication).toHaveBeenCalledTimes(3)
      );
      expect(api.activatePublication.mock.calls[2]![2]).toBe(
        "fresh-confirm-key"
      );
      expect(api.activatePublication.mock.calls[2]![3]).toMatchObject({
        confirmed_surface_match_token: "fresh-terminal-token"
      });
    }
  );

  it("aborts paged surface loading when the publication detail closes", async () => {
    const api = requests();
    const historical = v3Publication();
    const firstPage = activationSurfacePage(
      "closing-activation-snapshot",
      "visible-before-close",
      "cursor-2"
    );
    const terminalPage = deferred<SurfaceMatchPageAny>();
    let pageSignal: AbortSignal | undefined;
    const fetchSurfacePage = vi.fn(
      (_snapshotId: string, _cursor: string, signal: AbortSignal) => {
        pageSignal = signal;
        return terminalPage.promise;
      }
    );
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication.mockRejectedValueOnce(
      new HttpError(
        409,
        "confirmation required",
        [],
        "surface_match_acknowledgement_required",
        [],
        { surface_match_page: firstPage }
      )
    );

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        fetchSurfacePage={fetchSurfacePage}
        idempotencyKeyFactory={() => "activation-key"}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));
    await waitFor(() => expect(fetchSurfacePage).toHaveBeenCalledTimes(1));
    expect(pageSignal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    expect(pageSignal?.aborted).toBe(true);
    await act(async () =>
      terminalPage.resolve(
        activationSurfacePage(
          "closing-activation-snapshot",
          "late-after-close",
          null,
          "late-token",
          2
        )
      )
    );

    expect(screen.queryByText(/late-after-close/)).toBeNull();
    expect(api.activatePublication).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      410,
      "surface_match_snapshot_expired",
      "同名公开范围确认已失效，请重新检查激活条件。"
    ],
    [
      409,
      "exact_headword_creation_temporarily_disabled",
      "学习端暂不支持多个同名公开词条。"
    ],
    [
      409,
      "surface_match_acknowledgement_required",
      "激活需要确认同名公开范围，但服务端未返回可确认快照。"
    ]
  ])(
    "keeps V2 detail visible when surface response %s/%s has no usable snapshot",
    async (status, code, message) => {
      const api = requests();
      const historical = v2Publication();
      api.listPublications.mockResolvedValue({ publications: [historical] });
      api.getPublication.mockResolvedValue({ publication: historical });
      api.activatePublication.mockRejectedValueOnce(
        new HttpError(status as number, "surface gate", [], code as string)
      );

      render(
        <V3PublicationHistory
          currentWord={v3Word()}
          idempotencyKeyFactory={() => "activation-key"}
          onActivated={vi.fn()}
          requests={api}
        />
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "查看第 1 次发布" })
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "激活此发布版本" })
      );
      fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

      expect(await screen.findByText(message as string)).toBeInTheDocument();
      expect(
        within(screen.getByTestId("publication-detail")).getByRole("heading", {
          name: "historical-v2"
        })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "激活此发布版本" })
      ).toBeEnabled();
    }
  );

  it("fails closed if a dirty draft appears while surface confirmation is open", async () => {
    const api = requests();
    const historical = v3Publication();
    const terminalPage = activationSurfacePage(
      "dirty-activation-snapshot",
      "dirty-source",
      null,
      "dirty-token"
    );
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication.mockRejectedValueOnce(
      new HttpError(
        409,
        "confirmation required",
        [],
        "surface_match_acknowledgement_required",
        [],
        { surface_match_page: terminalPage }
      )
    );
    const view = render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activation-key"}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "查看候选详情" })
    );
    expect(
      await screen.findByText("词形 · dirty-source · 原形 · 通用")
    ).toBeInTheDocument();

    view.rerender(
      <V3PublicationHistory
        activationBlockedByUnsavedChanges
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activation-key"}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "确认并激活" }));

    expect(api.activatePublication).toHaveBeenCalledTimes(1);
  });

  it("requires confirmation, single-flights activate, then refreshes canonical/history", async () => {
    const api = requests();
    const historical = v3Publication();
    const activated = v3Word({ revision: 10, lifecycle_revision: 4 });
    const pending = deferred<{ word: AdminWordV3 }>();
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication.mockReturnValue(pending.promise);
    const onActivated = vi.fn();
    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activate-key"}
        onActivated={onActivated}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    expect(api.activatePublication).not.toHaveBeenCalled();
    const confirm = screen.getByRole("button", { name: "确认激活" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(api.activatePublication).toHaveBeenCalledTimes(1);
    expect(api.activatePublication).toHaveBeenCalledWith(
      "word-mixed",
      "pub-v3",
      "activate-key",
      {
        schema_version: 3,
        base_revision: 9,
        base_lifecycle_revision: 3
      }
    );

    await act(async () => pending.resolve({ word: activated }));
    await waitFor(() => expect(onActivated).toHaveBeenCalledWith(activated));
    await waitFor(() => expect(api.listPublications).toHaveBeenCalledTimes(2));
  });

  it("keeps immutable detail viewable but fails closed when unsaved drafts block activation", async () => {
    const api = requests();
    const historical = v3Publication();
    const idempotencyKeyFactory = vi.fn(() => "activate-key");
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication.mockResolvedValue({
      word: v3Word({ revision: 10, lifecycle_revision: 4 })
    });
    const view = render(
      <V3PublicationHistory
        activationBlockedByUnsavedChanges
        currentWord={v3Word()}
        idempotencyKeyFactory={idempotencyKeyFactory}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    expect(
      await screen.findByText("正在查看只读的历史发布快照")
    ).toBeInTheDocument();
    expect(screen.getByText("请先保存或放弃未保存的草稿")).toBeInTheDocument();
    const blocked = screen.getByRole("button", { name: "激活此发布版本" });
    expect(blocked).toBeDisabled();

    blocked.removeAttribute("disabled");
    fireEvent.click(blocked);
    const bypassedConfirmation = screen.queryByRole("button", {
      name: "确认激活"
    });
    if (bypassedConfirmation) {
      bypassedConfirmation.removeAttribute("disabled");
      fireEvent.click(bypassedConfirmation);
    }
    expect(idempotencyKeyFactory).not.toHaveBeenCalled();
    expect(api.activatePublication).not.toHaveBeenCalled();

    view.rerender(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={idempotencyKeyFactory}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    expect(
      screen.getByRole("button", { name: "激活此发布版本" })
    ).toBeEnabled();
  });

  it("does not let a blocked activation generation trigger across canonical remounts", async () => {
    const api = requests();
    const historical = v3Publication();
    const idempotencyKeyFactory = vi.fn(() => "activate-key");
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.getPublication.mockResolvedValue({ publication: historical });
    const view = render(
      <V3PublicationHistory
        activationBlockedByUnsavedChanges
        currentWord={v3Word()}
        idempotencyKeyFactory={idempotencyKeyFactory}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    view.rerender(
      <V3PublicationHistory
        activationBlockedByUnsavedChanges
        currentWord={v3Word({ revision: 10 })}
        idempotencyKeyFactory={idempotencyKeyFactory}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    await waitFor(() => expect(api.listPublications).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "查看第 2 次发布" }));
    const blocked = await screen.findByRole("button", {
      name: "激活此发布版本"
    });
    blocked.removeAttribute("disabled");
    fireEvent.click(blocked);
    const bypassedConfirmation = screen.queryByRole("button", {
      name: "确认激活"
    });
    if (bypassedConfirmation) {
      bypassedConfirmation.removeAttribute("disabled");
      fireEvent.click(bypassedConfirmation);
    }

    expect(idempotencyKeyFactory).not.toHaveBeenCalled();
    expect(api.activatePublication).not.toHaveBeenCalled();
  });

  it.each([
    [403, "当前账号没有激活发布版本的权限。"],
    [422, "激活请求校验未通过。"],
    [500, "激活发布版本失败，请稍后重试。"],
    [503, "发布服务暂不可用，请稍后重试。"]
  ])(
    "classifies activate HTTP %s and preserves immutable detail",
    async (status, message) => {
      const api = requests();
      const historical = v2Publication();
      api.listPublications.mockResolvedValue({ publications: [historical] });
      api.getPublication.mockResolvedValue({ publication: historical });
      api.activatePublication.mockRejectedValue(
        new HttpError(status as number, "sensitive backend detail")
      );
      render(
        <V3PublicationHistory
          currentWord={v3Word()}
          idempotencyKeyFactory={() => "activate-key"}
          onActivated={vi.fn()}
          requests={api}
        />
      );

      fireEvent.click(
        await screen.findByRole("button", { name: "查看第 1 次发布" })
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "激活此发布版本" })
      );
      fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

      expect(await screen.findByText(message as string)).toBeInTheDocument();
      expect(
        within(screen.getByTestId("publication-detail")).getByRole("heading", {
          name: "historical-v2"
        })
      ).toBeInTheDocument();
    }
  );

  it.each(["revision_conflict", "idempotency_conflict"])(
    "invalidates %s confirmation, refreshes canonical/history, and requires a fresh activation",
    async (code) => {
      const api = requests();
      const expired = v3Publication();
      const freshWord = v3Word({ revision: 10, lifecycle_revision: 4 });
      const fresh = v3Publication({
        publication_id: "pub-fresh",
        publication_number: 3,
        source_revision: 10,
        word: freshWord
      });
      const activated = v3Word({ revision: 11, lifecycle_revision: 5 });
      const keyFactory = vi
        .fn()
        .mockReturnValueOnce("expired-activation-key")
        .mockReturnValueOnce("fresh-activation-key");
      api.listPublications
        .mockResolvedValueOnce({ publications: [expired] })
        .mockResolvedValue({ publications: [fresh] });
      api.get.mockResolvedValue({ word: freshWord, retired_stable_nodes: [] });
      api.getPublication.mockImplementation(
        async (_wordId: string, publicationId: string) => ({
          publication: publicationId === "pub-fresh" ? fresh : expired
        })
      );
      api.activatePublication
        .mockRejectedValueOnce(new HttpError(409, "expired", [], code))
        .mockResolvedValueOnce({ word: activated });
      const onActivated = vi.fn();
      const view: {
        rerender?: ReturnType<typeof render>["rerender"];
      } = {};
      const onCanonicalRefreshed = vi.fn((word: AdminWordV3) => {
        view.rerender?.(
          <V3PublicationHistory
            currentWord={word}
            idempotencyKeyFactory={keyFactory}
            onActivated={onActivated}
            onCanonicalRefreshed={onCanonicalRefreshed}
            requests={api}
          />
        );
      });
      view.rerender = render(
        <V3PublicationHistory
          currentWord={v3Word()}
          idempotencyKeyFactory={keyFactory}
          onActivated={onActivated}
          onCanonicalRefreshed={onCanonicalRefreshed}
          requests={api}
        />
      ).rerender;

      fireEvent.click(
        await screen.findByRole("button", { name: "查看第 2 次发布" })
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "激活此发布版本" })
      );
      const expiredConfirm = screen.getByRole("button", { name: "确认激活" });
      fireEvent.click(expiredConfirm);

      await waitFor(() => expect(api.get).toHaveBeenCalledWith("word-mixed"));
      await waitFor(() =>
        expect(onCanonicalRefreshed).toHaveBeenCalledWith(freshWord)
      );
      expect(screen.queryByRole("button", { name: "确认激活" })).toBeNull();
      fireEvent.click(expiredConfirm);
      expect(api.activatePublication).toHaveBeenCalledTimes(1);
      expect(keyFactory).toHaveBeenCalledTimes(1);

      fireEvent.click(
        await screen.findByRole("button", { name: "查看第 3 次发布" })
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "激活此发布版本" })
      );
      fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

      await waitFor(() =>
        expect(api.activatePublication).toHaveBeenLastCalledWith(
          "word-mixed",
          "pub-fresh",
          "fresh-activation-key",
          {
            schema_version: 3,
            base_revision: 10,
            base_lifecycle_revision: 4
          }
        )
      );
      expect(onActivated).toHaveBeenCalledWith(activated);
      expect(keyFactory).toHaveBeenCalledTimes(2);
      expect(api.listPublications.mock.calls.length).toBeGreaterThanOrEqual(2);
    }
  );

  it("refreshes an archived canonical after activation loses the lifecycle race", async () => {
    const api = requests();
    const historical = v3Publication();
    const archived = v3Word({
      status: "archived",
      revision: 10,
      lifecycle_revision: 4
    });
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.get.mockResolvedValue({ word: archived, retired_stable_nodes: [] });
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication.mockRejectedValue(
      new HttpError(409, "entry archived", [], "entry_archived")
    );
    const onCanonicalRefreshed = vi.fn();
    const view: {
      rerender?: ReturnType<typeof render>["rerender"];
    } = {};
    onCanonicalRefreshed.mockImplementation((word: AdminWordV3) => {
      view.rerender?.(
        <V3PublicationHistory
          currentWord={word}
          idempotencyKeyFactory={() => "archived-activation-key"}
          onActivated={vi.fn()}
          onCanonicalRefreshed={onCanonicalRefreshed}
          requests={api}
        />
      );
    });
    view.rerender = render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "archived-activation-key"}
        onActivated={vi.fn()}
        onCanonicalRefreshed={onCanonicalRefreshed}
        requests={api}
      />
    ).rerender;

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    const staleConfirm = screen.getByRole("button", { name: "确认激活" });
    fireEvent.click(staleConfirm);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith("word-mixed"));
    await waitFor(() =>
      expect(onCanonicalRefreshed).toHaveBeenCalledWith(archived)
    );
    expect(api.listPublications.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByRole("button", { name: "确认激活" })).toBeNull();
    expect(screen.queryByRole("button", { name: "激活此发布版本" })).toBeNull();
    fireEvent.click(staleConfirm);
    expect(api.activatePublication).toHaveBeenCalledTimes(1);
  });

  it("keeps activation unavailable while a failed conflict refresh is retried", async () => {
    const api = requests();
    const expired = v3Publication();
    const freshWord = v3Word({ revision: 12, lifecycle_revision: 6 });
    const fresh = v3Publication({
      publication_id: "pub-after-refresh",
      publication_number: 4,
      source_revision: 12,
      word: freshWord
    });
    api.listPublications
      .mockResolvedValueOnce({ publications: [expired] })
      .mockResolvedValue({ publications: [fresh] });
    api.get
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ word: freshWord, retired_stable_nodes: [] });
    api.getPublication.mockResolvedValue({ publication: expired });
    api.activatePublication.mockRejectedValueOnce(
      new HttpError(409, "stale", [], "revision_conflict")
    );
    const onCanonicalRefreshed = vi.fn();
    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "expired-key"}
        onActivated={vi.fn()}
        onCanonicalRefreshed={onCanonicalRefreshed}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

    expect(
      await screen.findByText("刷新最新词条与发布历史失败")
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认激活" })).toBeNull();
    expect(api.activatePublication).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "重新刷新词条与发布历史" })
    );

    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(onCanonicalRefreshed).toHaveBeenCalledWith(freshWord)
    );
    expect(api.listPublications).toHaveBeenCalledTimes(3);
    expect(api.activatePublication).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByRole("button", { name: "查看第 4 次发布" })
    ).toBeInTheDocument();
  });

  it("does not replace canonical state or reactivate when conflict refresh rejects a cross-entry GET", async () => {
    const api = requests();
    const expired = v3Publication();
    api.listPublications.mockResolvedValue({ publications: [expired] });
    api.getPublication.mockResolvedValue({ publication: expired });
    api.activatePublication.mockRejectedValueOnce(
      new HttpError(409, "stale", [], "revision_conflict")
    );
    api.get.mockRejectedValue(
      new InvalidAdminWordResponseError(
        "get.word.id",
        "enum_mismatch",
        "string"
      )
    );
    const onCanonicalRefreshed = vi.fn();
    const onActivated = vi.fn();
    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "expired-key"}
        onActivated={onActivated}
        onCanonicalRefreshed={onCanonicalRefreshed}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

    expect(
      await screen.findByText("刷新最新词条与发布历史失败")
    ).toBeInTheDocument();
    expect(onCanonicalRefreshed).not.toHaveBeenCalled();
    expect(onActivated).not.toHaveBeenCalled();
    expect(api.activatePublication).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "重新刷新词条与发布历史" })
    );
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(api.activatePublication).toHaveBeenCalledTimes(1);
  });

  it("does not update canonical/history after an activation identity guard rejects the response", async () => {
    const api = requests();
    const historical = v3Publication();
    api.listPublications.mockResolvedValue({ publications: [historical] });
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication.mockRejectedValue(
      new InvalidAdminWordResponseError(
        "activate_publication.word.id",
        "enum_mismatch",
        "string"
      )
    );
    const onActivated = vi.fn();
    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activation-key"}
        onActivated={onActivated}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));

    expect(
      await screen.findByText("激活发布版本失败，请稍后重试。")
    ).toBeInTheDocument();
    expect(onActivated).not.toHaveBeenCalled();
    expect(api.listPublications).toHaveBeenCalledTimes(1);
    expect(
      within(screen.getByTestId("publication-detail")).getByText(
        "server V3 presentation"
      )
    ).toBeInTheDocument();
  });

  it("ignores a conflict refresh that completes after unmount", async () => {
    const api = requests();
    const historical = v3Publication();
    const canonical = deferred<{
      word: AdminWordV3;
      retired_stable_nodes: [];
    }>();
    const history = deferred<{ publications: AdminWordPublicationV3[] }>();
    api.listPublications
      .mockResolvedValueOnce({ publications: [historical] })
      .mockReturnValueOnce(history.promise);
    api.get.mockReturnValue(canonical.promise);
    api.getPublication.mockResolvedValue({ publication: historical });
    api.activatePublication.mockRejectedValue(
      new HttpError(409, "expired", [], "revision_conflict")
    );
    const onCanonicalRefreshed = vi.fn();
    const { unmount } = render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "expired-key"}
        onActivated={vi.fn()}
        onCanonicalRefreshed={onCanonicalRefreshed}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 2 次发布" })
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "激活此发布版本" })
    );
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      canonical.resolve({
        word: v3Word({ revision: 13, lifecycle_revision: 7 }),
        retired_stable_nodes: []
      });
      history.resolve({ publications: [] });
    });

    expect(onCanonicalRefreshed).not.toHaveBeenCalled();
  });

  it("fails closed for split V2 labels, mismatched detail identities, and detail transport errors", async () => {
    const api = requests();
    const split = v2Publication({
      word: {
        ...wordFixture({ headword: "centre", status: "published" }),
        headwords: {
          mode: "distinguish",
          uk: "centre",
          us: "center",
          source_dialect: "uk"
        }
      }
    });
    api.listPublications.mockResolvedValue({ publications: [split] });
    api.getPublication
      .mockResolvedValueOnce({
        publication: {
          ...split,
          publication_id: "wrong-publication",
          word: wordFixture({ headword: "wrong-publication-detail" })
        }
      })
      .mockResolvedValueOnce({
        publication: {
          ...split,
          entry_id: "wrong-entry",
          word: wordFixture({ headword: "wrong-entry-detail" })
        }
      })
      .mockRejectedValueOnce(new HttpError(503, "unavailable"));

    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activate-key"}
        onActivated={vi.fn()}
        requests={api}
      />
    );

    expect(
      await screen.findByText("英式 centre / 美式 center")
    ).toBeInTheDocument();

    for (const callCount of [1, 2, 3]) {
      fireEvent.click(screen.getByRole("button", { name: "查看第 1 次发布" }));
      await waitFor(() =>
        expect(api.getPublication).toHaveBeenCalledTimes(callCount)
      );
      expect(await screen.findByText("发布详情加载失败")).toBeInTheDocument();
      expect(screen.queryByText("wrong-publication-detail")).toBeNull();
      expect(screen.queryByText("wrong-entry-detail")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    }
  });

  it.each([
    [
      new TypeError("offline"),
      "网络异常，激活状态未知，请刷新发布历史后再重试。"
    ],
    [new Error("decoder failed"), "激活发布版本失败，请稍后重试。"]
  ])(
    "classifies non-HTTP activation failures and retries the same operation key",
    async (error, message) => {
      const api = requests();
      const historical = v3Publication();
      const keyFactory = vi.fn(() => "stable-activation-key");
      api.listPublications.mockResolvedValue({ publications: [historical] });
      api.getPublication.mockResolvedValue({ publication: historical });
      api.activatePublication.mockRejectedValue(error);
      render(
        <V3PublicationHistory
          currentWord={v3Word()}
          idempotencyKeyFactory={keyFactory}
          onActivated={vi.fn()}
          requests={api}
        />
      );

      fireEvent.click(
        await screen.findByRole("button", { name: "查看第 2 次发布" })
      );
      fireEvent.click(
        await screen.findByRole("button", { name: "激活此发布版本" })
      );
      const confirm = screen.getByRole("button", { name: "确认激活" });
      fireEvent.click(confirm);
      expect(await screen.findByText(message)).toBeInTheDocument();
      fireEvent.click(confirm);
      await waitFor(() =>
        expect(api.activatePublication).toHaveBeenCalledTimes(2)
      );

      expect(keyFactory).toHaveBeenCalledTimes(1);
      expect(api.activatePublication.mock.calls[1]![2]).toBe(
        "stable-activation-key"
      );
      expect(
        within(screen.getByTestId("publication-detail")).getByText(
          "server V3 presentation"
        )
      ).toBeInTheDocument();
    }
  );

  it("keeps history read-only for each current-word capability gate", async () => {
    const scenarios = [
      {
        historical: { mode: "migration_canary", whitelisted: true } as const,
        current: {
          mode: "shadow_only",
          blocked_code: "phase2_consumers_not_ready"
        } as const
      },
      {
        historical: { mode: "migration_canary", whitelisted: true } as const,
        current: { mode: "migration_canary", whitelisted: false } as const
      }
    ];

    for (const scenario of scenarios) {
      const api = requests();
      const historical = v3Publication({
        word: v3Word({
          capabilities: {
            publication: scenario.historical,
            pronunciation_normalization_version: "nfkc_trim_lower_v1"
          }
        })
      });
      api.listPublications.mockResolvedValue({ publications: [historical] });
      api.getPublication.mockResolvedValue({ publication: historical });
      const view = render(
        <V3PublicationHistory
          currentWord={v3Word({
            capabilities: {
              publication: scenario.current,
              pronunciation_normalization_version: "nfkc_trim_lower_v1"
            }
          })}
          idempotencyKeyFactory={() => "activate-key"}
          onActivated={vi.fn()}
          requests={api}
        />
      );

      fireEvent.click(
        await screen.findByRole("button", { name: "查看第 2 次发布" })
      );
      expect(
        await screen.findByText("正在查看只读的历史发布快照")
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "激活此发布版本" })
      ).toBeNull();
      expect(api.activatePublication).not.toHaveBeenCalled();
      view.unmount();
    }
  });

  it("ignores a superseded list response after the canonical revision changes", async () => {
    const api = requests();
    const stale = deferred<{ publications: AdminWordPublicationV2[] }>();
    const fresh = v3Publication({
      word: v3Word({
        presentation: {
          label: "fresh-revision-history",
          matched_surfaces: [],
          strategy_version: "surface_summary_v1"
        }
      })
    });
    api.listPublications
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({ publications: [fresh] });
    const onActivated = vi.fn();
    const view = render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activate-key"}
        onActivated={onActivated}
        requests={api}
      />
    );

    view.rerender(
      <V3PublicationHistory
        currentWord={v3Word({ revision: 10 })}
        idempotencyKeyFactory={() => "activate-key"}
        onActivated={onActivated}
        requests={api}
      />
    );
    expect(
      await screen.findByText("fresh-revision-history")
    ).toBeInTheDocument();
    await act(async () =>
      stale.resolve({
        publications: [
          v2Publication({
            word: wordFixture({
              headword: "stale-revision-history",
              status: "published"
            })
          })
        ]
      })
    );

    expect(screen.queryByText("stale-revision-history")).toBeNull();
    expect(screen.getByText("fresh-revision-history")).toBeInTheDocument();
    expect(api.listPublications).toHaveBeenCalledTimes(2);
  });

  it("ignores stale detail and activation completions after supersede or unmount", async () => {
    const api = requests();
    const first = deferred<{ publication: AdminWordPublicationV2 }>();
    const activate = deferred<{ word: AdminWordV3 }>();
    const historicalV3 = v3Publication();
    api.listPublications.mockResolvedValue({
      publications: [v2Publication(), historicalV3]
    });
    api.getPublication
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ publication: historicalV3 });
    api.activatePublication.mockReturnValue(activate.promise);
    const onActivated = vi.fn();
    const { unmount } = render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activate-key"}
        onActivated={onActivated}
        requests={api}
      />
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "查看第 1 次发布" })
    );
    fireEvent.click(screen.getByRole("button", { name: "关闭发布详情" }));
    fireEvent.click(screen.getByRole("button", { name: "查看第 2 次发布" }));
    expect(
      await screen.findByText("server V3 presentation")
    ).toBeInTheDocument();
    await act(async () =>
      first.resolve({
        publication: v2Publication({
          word: wordFixture({
            headword: "stale-v2-detail",
            status: "published"
          })
        })
      })
    );
    expect(screen.queryByText("stale-v2-detail")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "激活此发布版本" }));
    fireEvent.click(screen.getByRole("button", { name: "确认激活" }));
    unmount();
    await act(async () => activate.resolve({ word: v3Word({ revision: 10 }) }));
    expect(onActivated).not.toHaveBeenCalled();
    expect(api.listPublications).toHaveBeenCalledTimes(1);
  });

  it("shows retryable list error and preserves empty-state semantics", async () => {
    const api = requests();
    api.listPublications
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ publications: [] });
    render(
      <V3PublicationHistory
        currentWord={v3Word()}
        idempotencyKeyFactory={() => "activate-key"}
        onActivated={vi.fn()}
        requests={api}
      />
    );
    expect(await screen.findByText("发布历史加载失败")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "重 试" }));
    expect(await screen.findByText("暂无发布记录")).toBeInTheDocument();
    expect(api.listPublications).toHaveBeenCalledTimes(2);
  });
});
