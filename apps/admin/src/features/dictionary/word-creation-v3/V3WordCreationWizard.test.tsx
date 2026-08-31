import { HttpError } from "@tsz/api-client";
import type {
  AdminWordDraftV3Envelope,
  AdminWordV3,
  AdminWordV3Envelope,
  DraftMeaningsStepContentWritableV3,
  DraftValidationResponseV3,
  FormsImpactResponseV3,
  SentenceAssociationInputV3,
  SurfaceMatchPageV3,
  V3DraftValidationIssue,
  WordSentenceWritableV3
} from "@tsz/types";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import type { ReactNode } from "react";
import { StrictMode, useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

vi.mock("../api", () => ({
  useRelatedSearchAny: () => ({
    exact: { data: undefined, isFetching: false },
    contains: { data: undefined, isFetching: false }
  })
}));

import type { V3WordRequests } from "./api";
import { V3FormsAndPronunciationStep } from "./components/V3FormsAndPronunciationStep";
import { toWritableMeanings } from "./meaningsModel";
import { V3MeaningsAndExamplesStep } from "./V3MeaningsAndExamplesStep";
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  UUIDS
} from "./fixtures";
import {
  V3PreviewAndPublishStep,
  type V3PreviewPublishController
} from "./V3PreviewAndPublishStep";
import {
  V3WordCreationWizard,
  type V3WizardSlotContext
} from "./V3WordCreationWizard";

function canonicalMeanings(posId: string): AdminWordV3["meanings"] {
  return {
    sense_groups: [
      { id: "sense-group-canonical", name_zh: "核心", name_en: "Core" }
    ],
    pos: [
      {
        pos_id: posId,
        grammar_structures: [
          {
            id: "grammar-canonical",
            variants: [
              {
                id: "grammar-variant-canonical",
                dialect: "common",
                content: { version: 2, text: "grammar", annotations: [] }
              }
            ]
          }
        ],
        senses: [
          {
            id: "sense-canonical",
            sub_pos: "countable",
            level: "A1",
            sense_group_id: "sense-group-canonical",
            depends_on_context: false,
            definitions: [
              {
                id: "definition-canonical",
                level: "A1",
                definition_mode: "zh_definition",
                content_id: "definition-content-canonical",
                content: { version: 2, text: "中心", annotations: [] }
              }
            ],
            sentences: [
              {
                id: "sentence-canonical",
                level: "A1",
                en_text: {
                  mode: "unified",
                  common: {
                    id: "sentence-en-canonical",
                    origin: "manual",
                    value: {
                      version: 2,
                      text: "A centre.",
                      annotations: []
                    }
                  }
                },
                zh_text_id: "sentence-zh-canonical",
                zh_text: { version: 2, text: "一个中心。", annotations: [] },
                links: [
                  {
                    word_id: "word-1",
                    sense_id: "sense-canonical",
                    role: "focus"
                  }
                ],
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
}

function word(revision = 1, spelling = "centre"): AdminWordV3 {
  const forms = formsFixture();
  const variants = forms.pos[0]!.forms[0]!.regional_variants;
  if (variants.mode === "common") variants.common.spelling = spelling;
  return {
    schema_version: 3,
    id: "word-1",
    language: "en",
    kind: "word",
    status: "draft",
    revision,
    lifecycle_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: spelling,
      matched_surfaces: [spelling],
      strategy_version: "v3"
    },
    capabilities: {
      publication: {
        mode: "shadow_only",
        blocked_code: "phase2_consumers_not_ready"
      },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms,
    meanings: canonicalMeanings(forms.pos[0]!.pos_id),
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: "admin-1",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
}

function envelope(revision: number, spelling: string): AdminWordV3Envelope {
  return { word: word(revision, spelling) };
}

function draftEnvelope(
  revision: number,
  spelling: string
): AdminWordDraftV3Envelope {
  return { ...envelope(revision, spelling), retired_stable_nodes: [] };
}

function requests(overrides: Partial<V3WordRequests> = {}): V3WordRequests {
  const validation: DraftValidationResponseV3 = {
    schema_version: 3,
    validated_revision: 1,
    valid: true,
    issues: []
  };
  return {
    detect: vi.fn(),
    surfacePage: vi.fn(),
    create: vi.fn(),
    get: vi.fn(async () => draftEnvelope(1, "centre")),
    impact: vi.fn(async () => ({
      schema_version: 3,
      base_revision: 1,
      requires_confirmation: false,
      affected: []
    })),
    saveForms: vi.fn(async () => envelope(2, "centre")),
    saveMeanings: vi.fn(async () => envelope(2, "centre")),
    replaceSentenceAssociations: vi.fn(async () => envelope(2, "centre")),
    listPendingSentenceAssociations: vi.fn(async () => ({
      results: [],
      total: 0,
      next_cursor: null
    })),
    claimPendingSentenceAssociation: vi.fn(async () => envelope(2, "centre")),
    validate: vi.fn(async () => validation),
    publish: vi.fn(async () => envelope(2, "centre")),
    ...overrides
  } as V3WordRequests;
}

function spellingOf(context: V3WizardSlotContext) {
  const variants = context.draftForms.pos[0]!.forms[0]!.regional_variants;
  return variants.mode === "common" ? variants.common.spelling : "";
}

function editedForms(context: V3WizardSlotContext) {
  const next = structuredClone(context.draftForms);
  const variants = next.pos[0]!.forms[0]!.regional_variants;
  if (variants.mode === "common") variants.common.spelling = "local edit";
  return next;
}

function Slot({ context }: { context: V3WizardSlotContext }) {
  return (
    <div>
      <output data-testid="revision">{context.word.revision}</output>
      <output data-testid="spelling">{spellingOf(context)}</output>
      <output data-testid="active-pos">{context.activePosId}</output>
      <output data-testid="publication-issues">
        {context.issues.map((issue) => issue.code).join(",")}
      </output>
      <button
        type="button"
        onClick={() => context.setDraftForms(editedForms(context))}
      >
        编辑
      </button>
      <button
        type="button"
        onClick={() => void context.actions.saveForms("save")}
      >
        保存
      </button>
      <button
        type="button"
        onClick={() => {
          void context.actions.saveForms("save");
          void context.actions.saveForms("save");
        }}
      >
        双击保存
      </button>
      <button
        type="button"
        onClick={() => {
          void context.actions.previewFormsImpact();
          void context.actions.previewFormsImpact();
        }}
      >
        双击影响预览
      </button>
      <button
        type="button"
        onClick={() => {
          void context.actions.publish();
          void context.actions.publish();
        }}
      >
        双击发布
      </button>
      <button type="button" onClick={() => void context.actions.validate()}>
        检查发布条件
      </button>
      <button
        type="button"
        disabled={!context.issues[0]}
        onClick={() =>
          context.issues[0] &&
          void context.actions.navigateIssue(context.issues[0])
        }
      >
        定位首个发布问题
      </button>
      <button type="button" onClick={() => context.setActivePosId("pos-2")}>
        切换词性
      </button>
    </div>
  );
}

function inRouter(node: ReactNode) {
  return <MemoryRouter>{node}</MemoryRouter>;
}

function renderWizard(
  source: V3WordRequests,
  options: {
    navigationAdapter?: Parameters<
      typeof V3WordCreationWizard
    >[0]["navigationAdapter"];
    onWordChange?: (value: AdminWordV3) => void;
    initialWord?: AdminWordV3;
    initialStep?: Parameters<typeof V3WordCreationWizard>[0]["initialStep"];
    readOnly?: boolean;
    allowPublishedEditing?: boolean;
    idempotencyKeyFactory?: () => string;
    renderStep?: (context: V3WizardSlotContext) => ReactNode;
    retiredStableNodes?: Parameters<
      typeof V3WordCreationWizard
    >[0]["retiredStableNodes"];
  } = {}
) {
  return render(
    inRouter(
      <V3WordCreationWizard
        initialWord={options.initialWord ?? word()}
        requests={source}
        initialStep={options.initialStep}
        readOnly={options.readOnly}
        allowPublishedEditing={options.allowPublishedEditing}
        idempotencyKeyFactory={options.idempotencyKeyFactory}
        navigationAdapter={options.navigationAdapter}
        onWordChange={options.onWordChange}
        retiredStableNodes={options.retiredStableNodes}
        renderStep={
          options.renderStep ??
          ((context): ReactNode => <Slot context={context} />)
        }
      />
    )
  );
}

function validationIssue(): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id: "pron-2",
    field: "actual_pron",
    code: "node_binding_unknown",
    message: "invalid pronunciation",
    node_location: {
      node_role: "pronunciation",
      ancestor_node_ids: ["pos-2", "group-2", "form-2", "variant-us"],
      pos_id: "pos-2",
      form_group_id: "group-2",
      form_id: "form-2",
      variant_id: "variant-us",
      pronunciation_id: "pron-2"
    }
  };
}

function impactSurfacePage(nextCursor: string | null): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: "impact-snapshot",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 9,
    continuation_policy: "enabled",
    next_cursor: nextCursor,
    ...(nextCursor === null
      ? {
          surface_confirmation_token: "surface-terminal-token",
          impact_confirmation_token: "impact-terminal-token"
        }
      : {})
  } as SurfaceMatchPageV3;
}

describe("V3WordCreationWizard", () => {
  it("only replaces publication issues after check and keeps them through ordinary saves", async () => {
    const checkedIssue = validationIssue();
    const validate = vi
      .fn()
      .mockResolvedValueOnce({
        schema_version: 3 as const,
        validated_revision: 1,
        valid: false,
        issues: [checkedIssue]
      })
      .mockResolvedValueOnce({
        schema_version: 3 as const,
        validated_revision: 2,
        valid: true,
        issues: []
      });
    const source = requests({ validate });
    renderWizard(source);

    fireEvent.click(screen.getByText("检查发布条件"));
    await waitFor(() =>
      expect(screen.getByTestId("publication-issues")).toHaveTextContent(
        "node_binding_unknown"
      )
    );

    fireEvent.click(screen.getByText("编辑"));
    fireEvent.click(screen.getByText("保存"));
    await waitFor(() =>
      expect(screen.getByTestId("revision")).toHaveTextContent("2")
    );
    expect(screen.getByTestId("publication-issues")).toHaveTextContent(
      "node_binding_unknown"
    );

    fireEvent.click(screen.getByText("检查发布条件"));
    await waitFor(() =>
      expect(screen.getByTestId("publication-issues")).toBeEmptyDOMElement()
    );
  });

  it("does not turn ordinary save validation errors into publication field issues", async () => {
    const saveForms = vi.fn(async () => {
      throw new HttpError(422, "invalid", [], "validation_failed", [
        validationIssue()
      ]);
    });
    renderWizard(requests({ saveForms }));

    fireEvent.click(screen.getByText("编辑"));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() => expect(saveForms).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("publication-issues")).toBeEmptyDOMElement();
  });
  it("新增多维例句先保存 meanings，再用新 revision 整组保存 Pending 关联", async () => {
    const initial = word();
    initial.completed_steps = ["basics", "forms"];
    initial.max_reachable_step = "meanings";
    const saved = word(2);
    saved.completed_steps = ["basics", "forms"];
    saved.max_reachable_step = "meanings";
    const associated = structuredClone(saved);
    associated.lifecycle_revision = 2;
    const saveMeanings = vi.fn(async () => ({ word: saved }));
    const replaceSentenceAssociations = vi.fn(async () => ({
      word: associated
    }));
    const source = requests({
      saveMeanings,
      replaceSentenceAssociations
    });
    const sentence: WordSentenceWritableV3 = {
      id: "sentence-new",
      level: "B1",
      en_text: {
        mode: "unified",
        common: {
          id: "sentence-new-en",
          origin: "manual",
          value: {
            version: 2,
            text: "It is centered on the center of the wall.",
            annotations: []
          }
        }
      },
      zh_text_id: "sentence-new-zh",
      zh_text: { version: 2, text: "它位于墙的中央。", annotations: [] },
      zh_translations: [
        {
          id: "sentence-new-zh",
          band: "b1_b2",
          content: {
            version: 2,
            text: "它位于墙的中央。",
            annotations: []
          }
        }
      ],
      links: [{ word_id: "word-1", sense_id: "sense-canonical", role: "head" }]
    };
    const associations: SentenceAssociationInputV3[] = [
      {
        id: "association-new",
        source_dialect: "common",
        source_segments: [
          {
            start: 22,
            end: 40,
            surface: "center of the wall"
          }
        ],
        pending_target_kind: "phrase",
        pending_target_headword: "center of the wall",
        pending_target_gloss: "墙的中心位置"
      }
    ];

    renderWizard(source, {
      initialWord: initial,
      initialStep: "meanings",
      renderStep: (context) => (
        <button
          onClick={() =>
            void context.actions.saveMultidimensionalSentence(
              UUIDS.pos,
              "sense-canonical",
              sentence,
              associations
            )
          }
          type="button"
        >
          保存多维例句
        </button>
      )
    });
    fireEvent.click(screen.getByRole("button", { name: "保存多维例句" }));

    await waitFor(() => expect(saveMeanings).toHaveBeenCalledTimes(1));
    expect(saveMeanings).toHaveBeenCalledWith(
      "word-1",
      expect.objectContaining({
        schema_version: 3,
        base_revision: 1,
        intent: "save",
        content: expect.objectContaining({
          pos: [
            expect.objectContaining({
              senses: [
                expect.objectContaining({
                  sentences: expect.arrayContaining([
                    expect.objectContaining({ id: "sentence-new" })
                  ])
                })
              ]
            })
          ]
        })
      })
    );
    await waitFor(() =>
      expect(replaceSentenceAssociations).toHaveBeenCalledTimes(1)
    );
    expect(replaceSentenceAssociations).toHaveBeenCalledWith(
      "word-1",
      "sentence-new",
      expect.any(String),
      {
        association_schema_version: 3,
        base_revision: 2,
        base_lifecycle_revision: 1,
        associations
      }
    );
  });

  it("新增例句 meanings 保存失败时不发整组关联请求且父级不变", async () => {
    const initial = word();
    const saveMeanings = vi
      .fn()
      .mockRejectedValue(new Error("meanings failed"));
    const replaceSentenceAssociations = vi.fn();
    const onWordChange = vi.fn();
    const sentence = structuredClone(
      toWritableMeanings(initial.meanings).pos[0]!.senses[0]!.sentences[0]!
    );
    sentence.id = "sentence-unsaved";
    sentence.en_text = {
      mode: "unified",
      common: {
        id: "sentence-unsaved-en",
        origin: "manual",
        value: { version: 2, text: "A new sentence.", annotations: [] }
      }
    };
    const associations: SentenceAssociationInputV3[] = [
      {
        id: "association-unsaved",
        source_dialect: "common",
        source_segments: [{ start: 2, end: 5, surface: "new" }],
        pending_target_kind: "word",
        pending_target_headword: "new"
      }
    ];
    renderWizard(requests({ saveMeanings, replaceSentenceAssociations }), {
      initialWord: initial,
      initialStep: "meanings",
      onWordChange,
      renderStep: (context) => (
        <button
          onClick={() =>
            void context.actions
              .saveMultidimensionalSentence(
                UUIDS.pos,
                "sense-canonical",
                sentence,
                associations
              )
              .catch(() => undefined)
          }
          type="button"
        >
          保存未落库例句
        </button>
      )
    });
    fireEvent.click(screen.getByRole("button", { name: "保存未落库例句" }));
    await waitFor(() => expect(saveMeanings).toHaveBeenCalledTimes(1));
    expect(replaceSentenceAssociations).not.toHaveBeenCalled();
    expect(onWordChange).not.toHaveBeenCalled();
  });

  it("已有例句只改关联时直接使用当前 revision，不重复保存 meanings", async () => {
    const initial = word();
    initial.completed_steps = ["basics", "forms"];
    initial.max_reachable_step = "meanings";
    const associated = structuredClone(initial);
    associated.lifecycle_revision = 2;
    const saveMeanings = vi.fn(async () => ({ word: word(2) }));
    const replaceSentenceAssociations = vi.fn(async () => ({
      word: associated
    }));
    const source = requests({ saveMeanings, replaceSentenceAssociations });
    const sentence = toWritableMeanings(initial.meanings).pos[0]!.senses[0]!
      .sentences[0]!;
    const associations: SentenceAssociationInputV3[] = [
      {
        id: "association-existing",
        source_dialect: "common",
        source_segments: [{ start: 2, end: 8, surface: "centre" }],
        pending_target_kind: "word",
        pending_target_headword: "centre"
      }
    ];

    renderWizard(source, {
      initialWord: initial,
      initialStep: "meanings",
      renderStep: (context) => (
        <button
          onClick={() =>
            void context.actions.saveMultidimensionalSentence(
              UUIDS.pos,
              "sense-canonical",
              sentence,
              associations
            )
          }
          type="button"
        >
          更新已有例句关联
        </button>
      )
    });
    fireEvent.click(screen.getByRole("button", { name: "更新已有例句关联" }));

    await waitFor(() =>
      expect(replaceSentenceAssociations).toHaveBeenCalledTimes(1)
    );
    expect(saveMeanings).not.toHaveBeenCalled();
    expect(replaceSentenceAssociations).toHaveBeenCalledWith(
      "word-1",
      "sentence-canonical",
      expect.any(String),
      {
        association_schema_version: 3,
        base_revision: 1,
        base_lifecycle_revision: 1,
        associations
      }
    );
  });

  it("整组关联保存失败时不替换父级 canonical 或丢失已存关联", async () => {
    const initial = word();
    const storedAssociation = {
      id: "association-legacy",
      association_schema_version: 3 as const,
      source_dialect: "common" as const,
      source_segments: [{ start: 2, end: 8, surface: "centre" }],
      origin: "manual" as const,
      state: "linked" as const,
      target_word_id: "target-word",
      target_sense_id: "target-sense",
      target_component_usages: [],
      target_headword: "centre",
      target_gloss: "中心",
      resolved_pos: "noun"
    };
    initial.meanings.pos[0]!.senses[0]!.sentences[0]!.associations = [
      storedAssociation
    ];
    const sentence = toWritableMeanings(initial.meanings).pos[0]!.senses[0]!
      .sentences[0]!;
    const associations: SentenceAssociationInputV3[] = [
      {
        id: storedAssociation.id,
        source_dialect: storedAssociation.source_dialect,
        source_segments: storedAssociation.source_segments,
        target_word_id: storedAssociation.target_word_id,
        target_sense_id: storedAssociation.target_sense_id
      }
    ];
    const replaceSentenceAssociations = vi
      .fn()
      .mockRejectedValue(new Error("association replace failed"));
    const onWordChange = vi.fn();

    renderWizard(requests({ replaceSentenceAssociations }), {
      initialWord: initial,
      initialStep: "meanings",
      onWordChange,
      renderStep: (context) => (
        <div>
          <output data-testid="association-count">
            {
              context.word.meanings.pos[0]!.senses[0]!.sentences[0]!
                .associations.length
            }
          </output>
          <button
            onClick={() =>
              void context.actions
                .saveMultidimensionalSentence(
                  UUIDS.pos,
                  "sense-canonical",
                  sentence,
                  associations
                )
                .catch(() => undefined)
            }
            type="button"
          >
            保存失败关联
          </button>
        </div>
      )
    });

    fireEvent.click(screen.getByRole("button", { name: "保存失败关联" }));
    await waitFor(() =>
      expect(replaceSentenceAssociations).toHaveBeenCalledTimes(1)
    );
    expect(screen.getByTestId("association-count")).toHaveTextContent("1");
    expect(onWordChange).not.toHaveBeenCalled();
  });

  it("initializes empty meanings once per session and preserves every generated UUID across step changes and rerenders", () => {
    const initial = word();
    initial.forms = {
      pos: [
        formsFixture({ pos_id: "pos-1" }).pos[0]!,
        formsFixture({ pos_id: "pos-2", pos: "verb" }).pos[0]!
      ]
    };
    initial.meanings = { sense_groups: [], pos: [] };
    const source = requests();
    const renderStep = (context: V3WizardSlotContext) => {
      const nodeIds = [
        ...context.draftMeanings.sense_groups.map((group) => group.id),
        ...context.draftMeanings.pos.flatMap((pos) => [
          ...pos.grammar_structures.flatMap((grammar) => [
            grammar.id,
            ...grammar.variants.map((variant) => variant.id)
          ]),
          ...pos.senses.flatMap((sense) => [
            sense.id,
            ...sense.definitions.flatMap((definition) => [
              definition.id,
              ...(definition.definition_mode === "zh_definition" ||
              definition.definition_mode === "zh_sentence"
                ? [definition.content_id]
                : [])
            ]),
            ...sense.sentences.flatMap((sentence) => [
              sentence.id,
              sentence.en_text.mode === "unified"
                ? sentence.en_text.common.id
                : "",
              sentence.zh_text_id
            ])
          ])
        ])
      ];
      return (
        <div>
          <output data-testid="initialized-counts">
            {[
              context.draftMeanings.sense_groups.length,
              context.draftMeanings.pos.length,
              context.draftMeanings.pos.reduce(
                (sum, pos) => sum + pos.grammar_structures.length,
                0
              ),
              context.draftMeanings.pos.reduce(
                (sum, pos) => sum + pos.senses.length,
                0
              ),
              context.draftMeanings.pos.reduce(
                (sum, pos) =>
                  sum +
                  pos.senses.reduce(
                    (senseSum, sense) => senseSum + sense.sentences.length,
                    0
                  ),
                0
              )
            ].join("/")}
          </output>
          <output data-testid="initialized-node-ids">
            {nodeIds.join(",")}
          </output>
          <output data-testid="initialized-dirty">
            {String(context.dirtySteps.meanings)}/
            {String(context.hasUnsavedChanges)}
          </output>
          <button
            type="button"
            onClick={() =>
              context.setActiveStep(
                context.activeStep === "forms" ? "meanings" : "forms"
              )
            }
          >
            切换步骤
          </button>
        </div>
      );
    };
    const wizard = (
      <V3WordCreationWizard
        initialWord={initial}
        requests={source}
        renderStep={renderStep}
      />
    );
    const view = render(inRouter(wizard));

    expect(screen.getByTestId("initialized-counts")).toHaveTextContent(
      "2/2/2/2/2"
    );
    expect(screen.getByTestId("initialized-dirty")).toHaveTextContent(
      "false/false"
    );
    const initialIds = screen.getByTestId("initialized-node-ids").textContent;
    expect(initialIds?.split(",")).toHaveLength(18);
    expect(new Set(initialIds?.split(",")).size).toBe(18);

    fireEvent.click(screen.getByText("切换步骤"));
    fireEvent.click(screen.getByText("切换步骤"));
    expect(screen.getByTestId("initialized-node-ids")).toHaveTextContent(
      initialIds ?? ""
    );

    view.rerender(inRouter(wizard));
    expect(screen.getByTestId("initialized-node-ids")).toHaveTextContent(
      initialIds ?? ""
    );
  });

  it("returns to a clean state when generated meanings are edited and fully restored", () => {
    const initial = word();
    initial.meanings = { sense_groups: [], pos: [] };
    let generatedBaseline: DraftMeaningsStepContentWritableV3 | undefined;

    renderWizard(requests(), {
      initialWord: initial,
      renderStep: (context) => {
        generatedBaseline ??= structuredClone(context.draftMeanings);
        return (
          <>
            <output data-testid="generated-template-dirty">
              {String(context.dirtySteps.meanings)}
            </output>
            <button
              onClick={() =>
                context.setDraftMeanings({
                  ...context.draftMeanings,
                  sense_groups: context.draftMeanings.sense_groups.map(
                    (group, index) =>
                      index === 0 ? { ...group, name_zh: "临时修改" } : group
                  )
                })
              }
            >
              修改模板
            </button>
            <button
              onClick={() =>
                context.setDraftMeanings(structuredClone(generatedBaseline!))
              }
            >
              还原模板
            </button>
          </>
        );
      }
    });

    expect(screen.getByTestId("generated-template-dirty")).toHaveTextContent(
      "false"
    );
    fireEvent.click(screen.getByText("修改模板"));
    expect(screen.getByTestId("generated-template-dirty")).toHaveTextContent(
      "true"
    );
    fireEvent.click(screen.getByText("还原模板"));
    expect(screen.getByTestId("generated-template-dirty")).toHaveTextContent(
      "false"
    );
  });

  it("adds one native meanings template for a newly added forms POS without rebuilding existing nodes", () => {
    const initial = word();
    initial.meanings = { sense_groups: [], pos: [] };
    renderWizard(requests(), {
      initialWord: initial,
      renderStep: (context) => (
        <div>
          <output data-testid="pos-template-ids">
            {context.draftMeanings.pos
              .map(
                (pos) =>
                  `${pos.pos_id}:${pos.grammar_structures[0]?.id}:${pos.senses[0]?.id}:${pos.senses[0]?.sentences[0]?.id}`
              )
              .join("|")}
          </output>
          <output data-testid="template-dirty-steps">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <button
            type="button"
            onClick={() => {
              const next = structuredClone(context.draftForms);
              if (next.pos.length === 1) {
                next.pos.push(
                  formsFixture({ pos_id: "pos-2", pos: "verb" }).pos[0]!
                );
              } else {
                next.pos[0]!.pos = "noun";
              }
              context.setDraftForms(next);
            }}
          >
            更新词形
          </button>
        </div>
      )
    });

    const firstPosTemplate = screen.getByTestId("pos-template-ids").textContent;
    expect(firstPosTemplate).toMatch(new RegExp(`^${UUIDS.pos}:`, "u"));
    expect(screen.getByText("基本词性").parentElement).toHaveTextContent("1");
    expect(screen.getByText("词形变化").parentElement).toHaveTextContent("0");
    expect(screen.getByText("语法结构").parentElement).toHaveTextContent("1");
    expect(screen.getByText("多维词义").parentElement).toHaveTextContent("1");
    expect(screen.getByText("多维例句").parentElement).toHaveTextContent("1");

    fireEvent.click(screen.getByText("更新词形"));
    const withSecondPos = screen.getByTestId("pos-template-ids").textContent;
    expect(withSecondPos?.split("|")).toHaveLength(2);
    expect(withSecondPos?.split("|")[0]).toBe(firstPosTemplate);
    expect(screen.getByTestId("template-dirty-steps")).toHaveTextContent(
      "true/false"
    );
    expect(screen.getByText("基本词性").parentElement).toHaveTextContent("2");
    expect(screen.getByText("语法结构").parentElement).toHaveTextContent("2");
    expect(screen.getByText("多维词义").parentElement).toHaveTextContent("2");
    expect(screen.getByText("多维例句").parentElement).toHaveTextContent("2");

    fireEvent.click(screen.getByText("更新词形"));
    expect(screen.getByTestId("pos-template-ids")).toHaveTextContent(
      withSecondPos ?? ""
    );
  });

  it("initializes a newer empty canonical response once when the current meanings draft is clean", async () => {
    const initial = word();
    const newer = word(2, "newer canonical");
    newer.meanings = { sense_groups: [], pos: [] };
    const source = requests();
    const renderStep = (context: V3WizardSlotContext) => (
      <output data-testid="newer-canonical-template">
        {context.word.revision}/{context.draftMeanings.sense_groups.length}/
        {context.draftMeanings.pos.length}/{String(context.dirtySteps.meanings)}
      </output>
    );
    const view = render(
      inRouter(
        <V3WordCreationWizard
          initialWord={initial}
          requests={source}
          renderStep={renderStep}
        />
      )
    );

    view.rerender(
      inRouter(
        <V3WordCreationWizard
          initialWord={newer}
          requests={source}
          renderStep={renderStep}
        />
      )
    );

    await waitFor(() =>
      expect(screen.getByTestId("newer-canonical-template")).toHaveTextContent(
        "2/1/1/false"
      )
    );
  });

  it("enters Step 3 with editable default content and none of the manual-start empty states", () => {
    const initial = word();
    initial.meanings = { sense_groups: [], pos: [] };
    renderWizard(requests(), {
      initialWord: initial,
      initialStep: "meanings",
      renderStep: (context) => (
        <V3MeaningsAndExamplesStep
          activePosId={context.activePosId}
          forms={context.draftForms}
          issues={context.issues}
          onActivePosChange={context.setActivePosId}
          onChange={context.setDraftMeanings}
          value={context.draftMeanings}
          wordId={context.word.id}
        />
      )
    });

    expect(screen.getByText("语义区间 1")).toBeVisible();
    expect(screen.getAllByText("语法结构").length).toBeGreaterThan(0);
    expect(screen.getByText("多维释义")).toBeVisible();
    expect(screen.getAllByText("多维例句").length).toBeGreaterThan(0);
    expect(screen.queryByText(/暂无语义区间/u)).toBeNull();
    expect(screen.queryByText("当前词性还没有词义内容")).toBeNull();
    expect(screen.queryByRole("button", { name: "开始录入词义" })).toBeNull();
  }, 20_000);

  it.each([
    ["方言识别", "basics"],
    ["基本词性", "forms"],
    ["词形变化", "forms"],
    ["语法结构", "meanings"],
    ["多维词义", "meanings"],
    ["多维例句", "meanings"]
  ] as const)("maps %s to the %s V3 step", (label, expectedStep) => {
    const initialWord = word();
    initialWord.completed_steps = ["basics", "forms", "meanings"];
    initialWord.max_reachable_step = "preview";
    renderWizard(requests(), {
      initialWord,
      renderStep: (context) => (
        <output data-testid="progress-active-step">{context.activeStep}</output>
      )
    });

    fireEvent.click(screen.getByText(label));

    expect(screen.getByTestId("progress-active-step")).toHaveTextContent(
      expectedStep
    );
  });

  it("用 GET 的退役节点播种并保留 variant 身份账本", () => {
    const retiredUk = "00000000-0000-4000-8000-000000000901";
    const retiredUs = "00000000-0000-4000-8000-000000000902";
    renderWizard(requests(), {
      retiredStableNodes: [
        {
          id: retiredUk,
          node_role: "uk_variant",
          parent_node_id: UUIDS.form,
          retired_at: "2026-08-27T00:00:00Z"
        },
        {
          id: retiredUs,
          node_role: "us_variant",
          parent_node_id: UUIDS.form,
          retired_at: "2026-08-27T00:00:01Z"
        }
      ],
      renderStep: (context) => (
        <output data-testid="stable-variant-ids">
          {[
            context.stableVariantIds(UUIDS.form, "common_variant"),
            context.stableVariantIds(UUIDS.form, "uk_variant"),
            context.stableVariantIds(UUIDS.form, "us_variant")
          ].join(":")}
        </output>
      )
    });

    expect(screen.getByTestId("stable-variant-ids")).toHaveTextContent(
      `${UUIDS.common_variant}:${retiredUk}:${retiredUs}`
    );
  });

  it("publishes with a compatible idempotency key when HTTP lacks randomUUID", async () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0xff);
      return bytes;
    });
    vi.stubGlobal("crypto", { getRandomValues });
    const publish = vi.fn(async () => envelope(2, "published over HTTP"));

    try {
      renderWizard(requests({ publish }), {
        renderStep: (context) => (
          <button type="button" onClick={() => void context.actions.publish()}>
            HTTP 发布
          </button>
        )
      });

      fireEvent.click(screen.getByText("HTTP 发布"));
      await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
      expect(publish).toHaveBeenCalledWith(
        "word-1",
        "ffffffff-ffff-4fff-bfff-ffffffffffff",
        {
          schema_version: 3 as const,
          base_revision: 1
        }
      );
      expect(getRandomValues).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("applies save, prepare, and publish canonicals after StrictMode replays lifecycle effects", async () => {
    const strictWord = (revision: number, spelling: string): AdminWordV3 => {
      const value = word(revision, spelling);
      value.capabilities.publication = {
        mode: "migration_canary",
        whitelisted: true
      };
      value.completed_steps = ["basics", "forms", "meanings"];
      value.max_reachable_step = "preview";
      return value;
    };
    const savedWord = strictWord(2, "strict saved");
    const publishedWord = {
      ...strictWord(3, "strict published"),
      status: "published" as const,
      published_revision: 3,
      published_at: "2026-08-25T00:30:00Z",
      has_unpublished_changes: false
    };
    const saveForms = vi.fn(async () => ({ word: savedWord }));
    const validate = vi.fn(async () => ({
      schema_version: 3 as const,
      validated_revision: 2,
      valid: true,
      issues: []
    }));
    const impact = vi.fn(async () => ({
      schema_version: 3 as const,
      base_revision: 2,
      requires_confirmation: false,
      affected: []
    }));
    const publish = vi.fn(async () => ({ word: publishedWord }));
    const source = requests({ saveForms, validate, impact, publish });
    const onWordChange = vi.fn();
    render(
      inRouter(
        <StrictMode>
          <V3WordCreationWizard
            initialWord={strictWord(1, "centre")}
            requests={source}
            idempotencyKeyFactory={() => "strict-publish-key"}
            onWordChange={onWordChange}
            renderStep={(context) => (
              <>
                <output data-testid="strict-wizard-revision">
                  {context.word.revision}
                </output>
                <output data-testid="strict-wizard-spelling">
                  {spellingOf(context)}
                </output>
                <output data-testid="strict-wizard-status">
                  {context.word.status}
                </output>
                <output data-testid="strict-wizard-validation">
                  {context.validation?.validated_revision ?? "none"}
                </output>
                <output data-testid="strict-wizard-impact">
                  {context.impact?.base_revision ?? "none"}
                </output>
                <button
                  type="button"
                  onClick={() => void context.actions.saveForms("save")}
                >
                  StrictMode 保存
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void context.actions.validate().then((validation) => {
                      if (validation?.valid) {
                        return context.actions.previewFormsImpact();
                      }
                    });
                  }}
                >
                  StrictMode 检查发布条件
                </button>
                <button
                  type="button"
                  disabled={!context.validation?.valid || !context.impact}
                  onClick={() => void context.actions.publish()}
                >
                  StrictMode 发布
                </button>
              </>
            )}
          />
        </StrictMode>
      )
    );

    fireEvent.click(screen.getByText("StrictMode 保存"));
    await waitFor(() =>
      expect(screen.getByTestId("strict-wizard-revision")).toHaveTextContent(
        "2"
      )
    );
    expect(screen.getByTestId("strict-wizard-spelling")).toHaveTextContent(
      "strict saved"
    );
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveForms).toHaveBeenCalledWith(
      "word-1",
      expect.objectContaining({
        schema_version: 3 as const,
        base_revision: 1,
        intent: "save"
      })
    );

    fireEvent.click(screen.getByText("StrictMode 检查发布条件"));
    await waitFor(() =>
      expect(screen.getByTestId("strict-wizard-validation")).toHaveTextContent(
        "2"
      )
    );
    await waitFor(() =>
      expect(screen.getByTestId("strict-wizard-impact")).toHaveTextContent("2")
    );
    expect(validate).toHaveBeenCalledWith("word-1", {
      schema_version: 3,
      base_revision: 2
    });
    expect(impact).toHaveBeenCalledWith("word-1", {
      schema_version: 3,
      base_revision: 2,
      content: savedWord.forms
    });
    expect(impact).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("StrictMode 发布"));
    await waitFor(() =>
      expect(screen.getByTestId("strict-wizard-revision")).toHaveTextContent(
        "3"
      )
    );
    expect(screen.getByTestId("strict-wizard-spelling")).toHaveTextContent(
      "strict published"
    );
    expect(screen.getByTestId("strict-wizard-status")).toHaveTextContent(
      "published"
    );
    expect(publish).toHaveBeenCalledWith("word-1", "strict-publish-key", {
      schema_version: 3,
      base_revision: 2
    });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(onWordChange).toHaveBeenLastCalledWith(publishedWord);
  });

  it("replaces local forms and revision with the canonical save response", async () => {
    const source = requests({
      saveForms: vi.fn(async () => envelope(7, "server normalized"))
    });
    const onWordChange = vi.fn();
    renderWizard(source, { onWordChange });
    const stableSpellingNode = screen.getByTestId("spelling");

    fireEvent.click(screen.getByText("编辑"));
    fireEvent.click(screen.getByText("保存"));

    await waitFor(() =>
      expect(screen.getByTestId("revision")).toHaveTextContent("7")
    );
    expect(screen.getByTestId("spelling")).toHaveTextContent(
      "server normalized"
    );
    expect(screen.getByTestId("spelling")).toBe(stableSpellingNode);
    expect(onWordChange).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 7 })
    );
  });

  it("refreshes a 409 conflict for comparison without losing local input", async () => {
    const source = requests({
      saveForms: vi.fn(async () => {
        throw new HttpError(409, "stale", [], "revision_conflict", [], {
          current_revision: 4
        });
      }),
      get: vi.fn(async () => draftEnvelope(4, "server latest"))
    });
    renderWizard(source);

    fireEvent.click(screen.getByText("编辑"));
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
    fireEvent.click(screen.getByText("保存"));
    expect(await screen.findByText("版本冲突")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新并比较" }));

    await waitFor(() =>
      expect(screen.getByTestId("revision")).toHaveTextContent("4")
    );
    expect(screen.getByTestId("spelling")).toHaveTextContent("local edit");
    expect(screen.getByTestId("revision")).toHaveTextContent("4");
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
  });

  it("refreshes a meanings 409 after forms save without losing the writable meanings draft", async () => {
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "local-group", name_zh: "本地释义", name_en: "Local" }
      ],
      pos: []
    };
    const latest = word(4, "server latest");
    latest.meanings = {
      sense_groups: [
        { id: "server-group", name_zh: "服务端释义", name_en: "Server" }
      ],
      pos: []
    };
    const source = requests({
      saveForms: vi.fn(async (_wordId, input) => ({
        word: { ...word(2, "local edit"), forms: input.content }
      })),
      saveMeanings: vi.fn(async () => {
        throw new HttpError(409, "stale", [], "revision_conflict", [], {
          current_revision: 4
        });
      }),
      get: vi.fn(async () => ({ word: latest, retired_stable_nodes: [] }))
    });
    renderWizard(source, {
      renderStep: (context) => (
        <>
          <output data-testid="meanings-conflict-revision">
            {context.word.revision}
          </output>
          <output data-testid="meanings-conflict-local">
            {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
          </output>
          <output data-testid="meanings-conflict-forms">
            {spellingOf(context)}
          </output>
          <button
            type="button"
            onClick={() => context.setDraftForms(editedForms(context))}
          >
            同时编辑词形
          </button>
          <button
            type="button"
            onClick={() => context.setDraftMeanings(localMeanings)}
          >
            编辑释义
          </button>
          <button
            type="button"
            onClick={() =>
              void context.actions.saveMeanings(context.draftMeanings, "save")
            }
          >
            保存释义
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("同时编辑词形"));
    fireEvent.click(screen.getByText("编辑释义"));
    fireEvent.click(screen.getByText("保存释义"));
    expect(await screen.findByText("版本冲突")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "刷新并比较" }));

    await waitFor(() =>
      expect(
        screen.getByTestId("meanings-conflict-revision")
      ).toHaveTextContent("4")
    );
    expect(screen.getByTestId("meanings-conflict-revision")).toHaveTextContent(
      "4"
    );
    expect(screen.getByTestId("meanings-conflict-local")).toHaveTextContent(
      "本地释义"
    );
    expect(screen.getByTestId("meanings-conflict-forms")).toHaveTextContent(
      "server latest"
    );
    expect(source.saveForms).toHaveBeenCalledTimes(1);
    expect(vi.mocked(source.saveForms).mock.calls[0]![1]).toMatchObject({
      base_revision: 1,
      intent: "save"
    });
    expect(vi.mocked(source.saveMeanings).mock.calls[0]![1].base_revision).toBe(
      2
    );
    expect(screen.getByText("词义与例句冲突")).toBeInTheDocument();
    expect(screen.queryByText(/词形与发音、词义与例句/)).toBeNull();
  });

  it("retries a failed meanings conflict refresh while preserving local input", async () => {
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "local-group", name_zh: "重试仍保留", name_en: "Retry" }
      ],
      pos: []
    };
    const get = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500, "get failed"))
      .mockResolvedValueOnce(draftEnvelope(5, "server after retry"));
    renderWizard(
      requests({
        saveMeanings: vi.fn(async () => {
          throw new HttpError(409, "stale", [], "revision_conflict");
        }),
        get
      }),
      {
        renderStep: (context) => (
          <>
            <output data-testid="meanings-retry-revision">
              {context.word.revision}
            </output>
            <output data-testid="meanings-retry-local">
              {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
            </output>
            <button
              type="button"
              onClick={() => context.setDraftMeanings(localMeanings)}
            >
              编辑重试释义
            </button>
            <button
              type="button"
              onClick={() =>
                void context.actions.saveMeanings(context.draftMeanings, "save")
              }
            >
              保存重试释义
            </button>
          </>
        )
      }
    );

    fireEvent.click(screen.getByText("编辑重试释义"));
    fireEvent.click(screen.getByText("保存重试释义"));
    fireEvent.click(await screen.findByRole("button", { name: "刷新并比较" }));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    expect(screen.getByTestId("meanings-retry-local")).toHaveTextContent(
      "重试仍保留"
    );
    const retryButton = screen.getByText("重 试").closest("button")!;
    await waitFor(() => expect(retryButton).not.toHaveClass("ant-btn-loading"));
    fireEvent.click(retryButton);

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(
      () =>
        expect(screen.getByTestId("meanings-retry-revision")).toHaveTextContent(
          "5"
        ),
      { timeout: 3000 }
    );
    expect(screen.getByTestId("meanings-retry-local")).toHaveTextContent(
      "重试仍保留"
    );
    expect(get).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("ignores a meanings conflict refresh superseded by a newer local edit", async () => {
    let resolveGet!: (value: AdminWordDraftV3Envelope) => void;
    const get = vi.fn(
      () =>
        new Promise<AdminWordDraftV3Envelope>((resolve) => {
          resolveGet = resolve;
        })
    );
    const firstDraft: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "first-group", name_zh: "第一次编辑", name_en: "First" }
      ],
      pos: []
    };
    const latestDraft: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "latest-group", name_zh: "刷新中再编辑", name_en: "Latest" }
      ],
      pos: []
    };
    renderWizard(
      requests({
        saveMeanings: vi.fn(async () => {
          throw new HttpError(409, "stale", [], "revision_conflict");
        }),
        get
      }),
      {
        renderStep: (context) => (
          <>
            <output data-testid="meanings-stale-revision">
              {context.word.revision}
            </output>
            <output data-testid="meanings-stale-local">
              {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
            </output>
            <button
              type="button"
              onClick={() => context.setDraftMeanings(firstDraft)}
            >
              第一次编辑释义
            </button>
            <button
              type="button"
              onClick={() => context.setDraftMeanings(latestDraft)}
            >
              刷新中编辑释义
            </button>
            <button
              type="button"
              onClick={() =>
                void context.actions.saveMeanings(context.draftMeanings, "save")
              }
            >
              保存冲突释义
            </button>
          </>
        )
      }
    );

    fireEvent.click(screen.getByText("第一次编辑释义"));
    fireEvent.click(screen.getByText("保存冲突释义"));
    fireEvent.click(await screen.findByRole("button", { name: "刷新并比较" }));
    fireEvent.click(screen.getByText("刷新中编辑释义"));
    await act(async () => resolveGet(draftEnvelope(6, "stale server")));

    expect(screen.getByTestId("meanings-stale-revision")).toHaveTextContent(
      "1"
    );
    expect(screen.getByTestId("meanings-stale-local")).toHaveTextContent(
      "刷新中再编辑"
    );
    expect(screen.queryByText("版本冲突")).toBeNull();
  });

  it("routes a publication-check issue through POS, group, form, variant, pronunciation and focus", async () => {
    const issue = validationIssue();
    const calls: string[] = [];
    const navigationAdapter = {
      expandGroup: vi.fn(async () => {
        calls.push("group");
      }),
      revealForm: vi.fn(async () => {
        calls.push("form");
      }),
      revealVariant: vi.fn(async () => {
        calls.push("variant");
      }),
      revealPronunciation: vi.fn(async () => {
        calls.push("pronunciation");
      }),
      focusField: vi.fn(async () => {
        calls.push("focus");
      })
    };
    const source = requests({
      validate: vi.fn(async () => ({
        schema_version: 3 as const,
        validated_revision: 1,
        valid: false,
        issues: [issue]
      }))
    });
    renderWizard(source, { navigationAdapter });

    fireEvent.click(screen.getByText("检查发布条件"));

    await waitFor(() =>
      expect(screen.getByTestId("publication-issues")).toHaveTextContent(
        "node_binding_unknown"
      )
    );
    fireEvent.click(screen.getByText("定位首个发布问题"));
    await waitFor(() =>
      expect(calls).toEqual([
        "group",
        "form",
        "variant",
        "pronunciation",
        "focus"
      ])
    );
    expect(screen.getByTestId("active-pos")).toHaveTextContent("pos-2");
    expect(screen.getByTestId("publication-issues")).toHaveTextContent(
      "node_binding_unknown"
    );
  });

  it("activates a non-current T4 POS tab and focuses its exact pronunciation field", async () => {
    const secondForm = commonFormFixture({
      id: UUIDS.form_2,
      variant_id: UUIDS.common_variant_2,
      pronunciations: [
        pronunciationFixture({ id: UUIDS.pronunciation_3 }),
        pronunciationFixture({ id: UUIDS.pronunciation_2 })
      ]
    });
    const initialWord = word();
    initialWord.forms.pos.push(
      formsFixture({
        pos_id: UUIDS.pos_2,
        pos: "verb",
        forms: [secondForm],
        groups: [
          {
            id: UUIDS.group_2,
            is_regular: true,
            members: [{ id: UUIDS.membership_2, form_id: UUIDS.form_2 }]
          }
        ]
      }).pos[0]!
    );
    const issue: V3DraftValidationIssue = {
      ...validationIssue(),
      node_id: UUIDS.pronunciation_2,
      node_location: {
        node_role: "pronunciation",
        ancestor_node_ids: [
          UUIDS.pos_2,
          UUIDS.group_2,
          UUIDS.form_2,
          UUIDS.common_variant_2
        ],
        pos_id: UUIDS.pos_2,
        form_group_id: UUIDS.group_2,
        form_id: UUIDS.form_2,
        variant_id: UUIDS.common_variant_2,
        dialect: "common",
        pronunciation_id: UUIDS.pronunciation_2
      }
    };
    const source = requests({
      validate: vi.fn(async () => ({
        schema_version: 3 as const,
        validated_revision: 1,
        valid: false,
        issues: [issue]
      }))
    });
    const { container } = renderWizard(source, {
      initialWord,
      renderStep: (context) => (
        <>
          <V3FormsAndPronunciationStep
            activePosId={context.activePosId}
            issues={context.issues}
            onActivePosChange={context.setActivePosId}
            onChange={context.setDraftForms}
            value={context.draftForms}
          />
          <button
            type="button"
            onClick={() => void context.actions.navigateIssue(issue)}
          >
            定位 T4
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("定位 T4"));

    const target = await waitFor(() => {
      const element = container.querySelector<HTMLInputElement>(
        `input[data-v3-node-id="${UUIDS.pronunciation_2}"][data-v3-field="actual_pron"]`
      );
      expect(element).not.toBeNull();
      return element!;
    });
    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /动词/ })).toHaveAttribute(
        "aria-selected",
        "true"
      )
    );
    await waitFor(() => expect(target).toHaveFocus());
  });

  it("focuses a shared form issue inside the exact membership group", async () => {
    const initialWord = word();
    const pos = initialWord.forms.pos[0]!;
    const sharedForm = pos.forms[0]!;
    pos.form_groups.push({
      id: UUIDS.group_2,
      is_regular: false,
      members: [{ id: UUIDS.membership_2, form_id: sharedForm.id }]
    });
    const variant = sharedForm.regional_variants;
    if (variant.mode !== "common") throw new Error("expected common form");
    const pronunciation = variant.common.pronunciations[0]!;
    const issue: V3DraftValidationIssue = {
      ...validationIssue(),
      node_id: pronunciation.id,
      node_location: {
        node_role: "pronunciation",
        ancestor_node_ids: [
          pos.pos_id,
          UUIDS.group_2,
          sharedForm.id,
          variant.common.id
        ],
        pos_id: pos.pos_id,
        form_group_id: UUIDS.group_2,
        membership_id: UUIDS.membership_2,
        form_id: sharedForm.id,
        variant_id: variant.common.id,
        dialect: "common",
        pronunciation_id: pronunciation.id
      }
    };
    const ambiguousIssue: V3DraftValidationIssue = {
      ...issue,
      node_location: {
        node_role: issue.node_location.node_role,
        ancestor_node_ids: issue.node_location.ancestor_node_ids,
        pos_id: pos.pos_id,
        form_id: sharedForm.id,
        variant_id: variant.common.id,
        dialect: "common",
        pronunciation_id: pronunciation.id
      }
    };
    renderWizard(
      requests({
        validate: vi.fn(async () => ({
          schema_version: 3 as const,
          validated_revision: 1,
          valid: false,
          issues: [issue]
        }))
      }),
      {
        initialWord,
        renderStep: (context) => (
          <>
            <V3FormsAndPronunciationStep
              activePosId={context.activePosId}
              issues={context.issues}
              onActivePosChange={context.setActivePosId}
              onChange={context.setDraftForms}
              value={context.draftForms}
            />
            <button
              type="button"
              onClick={() => void context.actions.navigateIssue(ambiguousIssue)}
            >
              定位无分组共享词形
            </button>
            <button
              type="button"
              onClick={() => void context.actions.navigateIssue(issue)}
            >
              定位共享词形
            </button>
          </>
        )
      }
    );

    fireEvent.click(screen.getByLabelText("收起第 2 组词形变化"));
    expect(screen.getByLabelText("展开第 2 组词形变化")).toBeVisible();
    const ambiguousButton = screen.getByText("定位无分组共享词形");
    ambiguousButton.focus();
    fireEvent.click(ambiguousButton);
    await screen.findByLabelText("收起第 2 组词形变化");
    const ambiguousMatches = screen.getAllByLabelText("第 1 条发音的实际发音");
    expect(ambiguousMatches).toHaveLength(2);
    expect(ambiguousButton).toHaveFocus();

    fireEvent.click(screen.getByText("定位共享词形"));

    await waitFor(() =>
      expect(screen.getAllByLabelText("第 1 条发音的实际发音")).toHaveLength(2)
    );
    const matches = screen.getAllByLabelText("第 1 条发音的实际发音");
    expect(matches).toHaveLength(2);
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute(
        "data-v3-node-id",
        pronunciation.id
      )
    );
    expect(document.activeElement).toHaveAttribute(
      "data-v3-field",
      "actual_pron"
    );
    expect(
      document.activeElement?.closest<HTMLElement>("[data-group-id]")
    ).toHaveAttribute("data-group-id", UUIDS.group_2);
  });

  it("routes a meanings publication issue to its POS and backend text-variant locator", async () => {
    const initialWord = word();
    const secondPosId = "meaning-pos-2";
    initialWord.forms.pos.push(
      formsFixture({ pos_id: secondPosId, pos: "verb" }).pos[0]!
    );
    const initialMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [],
      pos: [
        { pos_id: UUIDS.pos, grammar_structures: [], senses: [] },
        {
          pos_id: secondPosId,
          grammar_structures: [],
          senses: [
            {
              id: "meaning-sense-1",
              sub_pos: "transitive",
              level: "A1",
              depends_on_context: false,
              definitions: [],
              sentences: [],
              relations: []
            },
            {
              id: "meaning-sense-2",
              sub_pos: "transitive",
              level: "A1",
              depends_on_context: false,
              definitions: [
                {
                  id: "definition-en-2",
                  level: "A1",
                  definition_mode: "en_definition" as const,
                  content: {
                    mode: "unified" as const,
                    common: {
                      id: "meaning-text-variant-2",
                      origin: "manual" as const,
                      value: {
                        version: 2 as const,
                        text: "before",
                        annotations: []
                      }
                    }
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
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "meanings",
      node_id: "meaning-text-variant-2",
      field: "value",
      code: "definition_invalid",
      message: "第二词性的英文释义无效",
      node_location: {
        node_role: "text_variant",
        ancestor_node_ids: [secondPosId, "meaning-sense-2", "definition-en-2"],
        pos_id: secondPosId
      }
    };
    const source = requests({
      validate: vi.fn(async () => ({
        schema_version: 3 as const,
        validated_revision: 1,
        valid: false,
        issues: [issue]
      }))
    });

    function MeaningsSlot({ context }: { context: V3WizardSlotContext }) {
      const [content, setContent] = useState(initialMeanings);
      return (
        <>
          <V3MeaningsAndExamplesStep
            activePosId={context.activePosId}
            issues={context.issues}
            onActivePosChange={context.setActivePosId}
            onChange={setContent}
            onSave={context.actions.saveMeanings}
            value={content}
          />
          <button onClick={() => void context.actions.navigateIssue(issue)}>
            定位词义
          </button>
        </>
      );
    }

    const { container } = renderWizard(source, {
      initialWord,
      renderStep: (context) => <MeaningsSlot context={context} />
    });
    const secondTab = container.querySelector<HTMLElement>(
      `.ant-tabs-tab[data-node-key="${secondPosId}"] .ant-tabs-tab-btn`
    );
    expect(secondTab).not.toBeNull();
    fireEvent.click(secondTab!);
    const secondSenseHeader = screen
      .getByText(/^2\./u)
      .closest<HTMLElement>('[role="button"]');
    expect(secondSenseHeader).not.toBeNull();
    fireEvent.click(secondSenseHeader!);
    fireEvent.change(screen.getByLabelText("定义 1 通用内容"), {
      target: { value: "local unsaved" }
    });
    const secondSense = secondSenseHeader!.closest<HTMLElement>(
      '[data-v3-node-id="meaning-sense-2"]'
    );
    const collapseDefinitions = secondSense?.querySelector<HTMLElement>(
      'button[aria-label="收起多维释义"]'
    );
    expect(collapseDefinitions).not.toBeNull();
    fireEvent.click(collapseDefinitions!);
    fireEvent.click(secondSenseHeader!);
    const firstTab = container.querySelector<HTMLElement>(
      `.ant-tabs-tab[data-node-key="${UUIDS.pos}"] .ant-tabs-tab-btn`
    );
    expect(firstTab).not.toBeNull();
    fireEvent.click(firstTab!);

    fireEvent.click(screen.getByText("定位词义"));

    await waitFor(() =>
      expect(screen.getByLabelText("定义 1 通用内容")).toHaveFocus()
    );
    expect(secondTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("定义 1 通用内容")).toHaveValue(
      "local unsaved"
    );
  });

  it("completes forms before meanings with the accepted canonical revision and exact live drafts", async () => {
    const initialWord = word();
    const requestOrder: string[] = [];
    let formsCanonical: AdminWordV3 | undefined;
    let expectedForms = structuredClone(initialWord.forms);
    let expectedMeanings = toWritableMeanings(initialWord.meanings);
    const saveForms = vi.fn(
      async (
        _wordId: string,
        input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => {
        requestOrder.push(`forms:${input.base_revision}:${input.intent}`);
        formsCanonical = {
          ...initialWord,
          revision: 2,
          forms: input.content,
          completed_steps: ["basics", "forms"],
          max_reachable_step: "meanings"
        };
        return { word: formsCanonical };
      }
    );
    const saveMeanings = vi.fn(
      async (
        _wordId: string,
        input: Parameters<V3WordRequests["saveMeanings"]>[1]
      ) => {
        requestOrder.push(`meanings:${input.base_revision}:${input.intent}`);
        const nextWord: AdminWordV3 = {
          ...formsCanonical!,
          revision: 3,
          meanings: {
            ...initialWord.meanings,
            sense_groups: input.content.sense_groups
          },
          completed_steps: ["basics", "forms", "meanings"],
          max_reachable_step: "preview"
        };
        return { word: nextWord };
      }
    );
    const onWordChange = vi.fn();
    renderWizard(requests({ saveForms, saveMeanings }), {
      initialWord,
      onWordChange,
      initialStep: "meanings",
      renderStep: (context) => (
        <>
          <output data-testid="complete-step">{context.activeStep}</output>
          <output data-testid="complete-revision">
            {context.word.revision}
          </output>
          <output data-testid="complete-dirty">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <button
            type="button"
            onClick={() => {
              const forms = structuredClone(context.draftForms);
              const variants = forms.pos[0]!.forms[0]!.regional_variants;
              if (variants.mode === "common") {
                variants.common.spelling = "preview-boundary-form";
              }
              const meanings = structuredClone(context.draftMeanings);
              meanings.sense_groups[0]!.name_zh = "预览边界词义";
              context.setDraftForms(forms);
              context.setDraftMeanings(meanings);
            }}
          >
            编辑两步完成草稿
          </button>
          <button
            type="button"
            onClick={() => {
              expectedForms = structuredClone(context.draftForms);
              expectedMeanings = structuredClone(context.draftMeanings);
              void context.actions.saveMeanings(
                context.draftMeanings,
                "complete"
              );
            }}
          >
            完成两步并预览
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑两步完成草稿"));
    expect(screen.getByTestId("complete-dirty")).toHaveTextContent("true/true");
    fireEvent.click(screen.getByText("完成两步并预览"));

    await waitFor(() => expect(saveMeanings).toHaveBeenCalledTimes(1));
    expect(requestOrder).toEqual(["forms:1:complete", "meanings:2:complete"]);
    expect(saveForms.mock.calls[0]![1].content).toEqual(expectedForms);
    expect(saveMeanings.mock.calls[0]![1].content).toEqual(expectedMeanings);
    expect(screen.getByTestId("complete-revision")).toHaveTextContent("3");
    expect(screen.getByTestId("complete-dirty")).toHaveTextContent(
      "false/false"
    );
    expect(screen.getByTestId("complete-step")).toHaveTextContent("preview");
    expect(onWordChange.mock.calls.map(([next]) => next.revision)).toEqual([
      2, 3
    ]);
  });

  it("prunes removed POS meanings before sequential forms and meanings saves", async () => {
    const initialWord = word();
    const firstPosId = initialWord.forms.pos[0]!.pos_id;
    const secondPosId = "removed-pos-2";
    initialWord.forms.pos.push(
      formsFixture({ pos_id: secondPosId, pos: "verb" }).pos[0]!
    );
    initialWord.meanings.pos.push({
      pos_id: secondPosId,
      grammar_structures: [],
      senses: []
    });
    const savedFormsWord: AdminWordV3 = {
      ...initialWord,
      revision: 2,
      forms: { pos: [initialWord.forms.pos[0]!] },
      meanings: {
        ...initialWord.meanings,
        pos: [initialWord.meanings.pos[0]!]
      }
    };
    const saveForms = vi.fn<V3WordRequests["saveForms"]>(async () => ({
      word: savedFormsWord
    }));
    const saveMeanings = vi.fn<V3WordRequests["saveMeanings"]>(async () => ({
      word: { ...savedFormsWord, revision: 3 }
    }));

    renderWizard(requests({ saveForms, saveMeanings }), {
      initialWord,
      renderStep: (context) => (
        <>
          <output data-testid="meaning-pos-ids">
            {context.draftMeanings.pos.map((pos) => pos.pos_id).join(",")}
          </output>
          <button
            onClick={() =>
              context.setDraftMeanings({
                ...context.draftMeanings,
                sense_groups: context.draftMeanings.sense_groups.map(
                  (group, index) =>
                    index === 0 ? { ...group, name_zh: "本地编辑" } : group
                )
              })
            }
          >
            编辑词义
          </button>
          <button
            onClick={() =>
              context.setDraftForms({ pos: [context.draftForms.pos[0]!] })
            }
          >
            删除第二词性
          </button>
          <button
            onClick={async () => {
              await context.actions.saveForms("save");
              await context.actions.saveMeanings(context.draftMeanings, "save");
            }}
          >
            顺序保存
          </button>
        </>
      )
    });

    expect(screen.getByTestId("meaning-pos-ids")).toHaveTextContent(
      `${firstPosId},${secondPosId}`
    );
    fireEvent.click(screen.getByText("编辑词义"));
    fireEvent.click(screen.getByText("删除第二词性"));
    expect(screen.getByTestId("meaning-pos-ids")).toHaveTextContent(firstPosId);
    expect(screen.getByTestId("meaning-pos-ids")).not.toHaveTextContent(
      secondPosId
    );
    fireEvent.click(screen.getByText("顺序保存"));

    await waitFor(() => expect(saveMeanings).toHaveBeenCalledTimes(1));
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveMeanings.mock.calls[0]![1]).toMatchObject({
      base_revision: 2,
      intent: "save",
      content: {
        pos: [expect.objectContaining({ pos_id: firstPosId })]
      }
    });
    expect(saveMeanings.mock.calls[0]![1].content.pos).toHaveLength(1);
  });

  it("keeps completion validation errors out of publication navigation state", async () => {
    const issue = validationIssue();
    const calls: string[] = [];
    const navigationAdapter = {
      expandGroup: vi.fn(async () => {
        calls.push("group");
      }),
      revealForm: vi.fn(async () => {
        calls.push("form");
      }),
      revealVariant: vi.fn(async () => {
        calls.push("variant");
      }),
      revealPronunciation: vi.fn(async () => {
        calls.push("pronunciation");
      }),
      focusField: vi.fn(async () => {
        calls.push("focus");
      })
    };
    const saveForms = vi.fn(
      async (
        _wordId: string,
        _input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => {
        throw new HttpError(422, "invalid", [], "validation_failed", [issue]);
      }
    );
    const saveMeanings = vi.fn(async () => envelope(2, "must not save"));
    renderWizard(requests({ saveForms, saveMeanings }), {
      initialStep: "meanings",
      navigationAdapter,
      renderStep: (context) => (
        <>
          <output data-testid="forms-error-step">{context.activeStep}</output>
          <output data-testid="forms-error-pos">{context.activePosId}</output>
          <output data-testid="forms-error-revision">
            {context.word.revision}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              const meanings = structuredClone(context.draftMeanings);
              meanings.sense_groups[0]!.name_zh = "仍需保留";
              context.setDraftMeanings(meanings);
            }}
          >
            编辑失败草稿
          </button>
          <button
            type="button"
            onClick={() =>
              void context.actions.saveMeanings(
                context.draftMeanings,
                "complete"
              )
            }
          >
            触发词形完成校验
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑失败草稿"));
    fireEvent.click(screen.getByText("触发词形完成校验"));

    await waitFor(() => expect(saveForms).toHaveBeenCalledTimes(1));
    expect(calls).toEqual([]);
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveForms.mock.calls[0]![1]).toMatchObject({
      base_revision: 1,
      intent: "complete"
    });
    expect(saveMeanings).not.toHaveBeenCalled();
    expect(screen.getByTestId("forms-error-step")).toHaveTextContent(
      "meanings"
    );
    expect(screen.getByTestId("forms-error-pos")).toHaveTextContent(UUIDS.pos);
    expect(screen.getByTestId("forms-error-revision")).toHaveTextContent("1");
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
  });

  it("keeps one forms and one meanings request under same-tick complete calls", async () => {
    const initialWord = word();
    const saveForms = vi.fn(
      async (
        _wordId: string,
        input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => {
        const nextWord: AdminWordV3 = {
          ...initialWord,
          revision: 2,
          forms: input.content,
          completed_steps: ["basics", "forms"],
          max_reachable_step: "meanings"
        };
        return { word: nextWord };
      }
    );
    const saveMeanings = vi.fn(
      async (
        _wordId: string,
        _input: Parameters<V3WordRequests["saveMeanings"]>[1]
      ) => {
        const nextWord: AdminWordV3 = {
          ...initialWord,
          revision: 3,
          completed_steps: ["basics", "forms", "meanings"],
          max_reachable_step: "preview"
        };
        return { word: nextWord };
      }
    );
    renderWizard(requests({ saveForms, saveMeanings }), {
      initialWord,
      renderStep: (context) => (
        <button
          type="button"
          onClick={() => {
            void context.actions.saveMeanings(
              context.draftMeanings,
              "complete"
            );
            void context.actions.saveMeanings(
              context.draftMeanings,
              "complete"
            );
          }}
        >
          同 tick 完成两步
        </button>
      )
    });

    fireEvent.click(screen.getByText("同 tick 完成两步"));

    await waitFor(() => expect(saveMeanings).toHaveBeenCalledTimes(1));
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveForms.mock.calls[0]![1].base_revision).toBe(1);
    expect(saveMeanings.mock.calls[0]![1].base_revision).toBe(2);
  });

  it("stops before meanings and keeps both drafts when preview-boundary forms completion conflicts", async () => {
    const saveForms = vi.fn(
      async (
        _wordId: string,
        _input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => {
        throw new HttpError(409, "stale", [], "revision_conflict");
      }
    );
    const saveMeanings = vi.fn(async () => envelope(2, "must not save"));
    renderWizard(requests({ saveForms, saveMeanings }), {
      initialStep: "meanings",
      renderStep: (context) => (
        <>
          <output data-testid="forms-conflict-step">
            {context.activeStep}
          </output>
          <output data-testid="forms-conflict-revision">
            {context.word.revision}
          </output>
          <output data-testid="forms-conflict-dirty">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              const meanings = structuredClone(context.draftMeanings);
              meanings.sense_groups[0]!.name_zh = "冲突本地词义";
              context.setDraftMeanings(meanings);
            }}
          >
            编辑冲突草稿
          </button>
          <button
            type="button"
            onClick={() =>
              void context.actions.saveMeanings(
                context.draftMeanings,
                "complete"
              )
            }
          >
            触发词形 revision 冲突
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑冲突草稿"));
    fireEvent.click(screen.getByText("触发词形 revision 冲突"));

    expect(
      await screen.findByRole("button", { name: "刷新并比较" })
    ).toBeInTheDocument();
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveMeanings).not.toHaveBeenCalled();
    expect(screen.getByTestId("forms-conflict-step")).toHaveTextContent(
      "meanings"
    );
    expect(screen.getByTestId("forms-conflict-revision")).toHaveTextContent(
      "1"
    );
    expect(screen.getByTestId("forms-conflict-dirty")).toHaveTextContent(
      "true/true"
    );
  });

  it("keeps the accepted forms canonical when the following meanings complete fails", async () => {
    const initialWord = word();
    const meaningsIssue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "meanings",
      node_id: "sense-canonical",
      field: "level",
      code: "definition_invalid",
      message: "词义仍不完整",
      node_location: {
        node_role: "sense",
        ancestor_node_ids: [UUIDS.pos],
        pos_id: UUIDS.pos
      }
    };
    const saveForms = vi.fn(
      async (
        _wordId: string,
        input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => {
        const nextWord: AdminWordV3 = {
          ...initialWord,
          revision: 2,
          forms: input.content,
          completed_steps: ["basics", "forms"],
          max_reachable_step: "meanings"
        };
        return { word: nextWord };
      }
    );
    const saveMeanings = vi.fn(
      async (
        _wordId: string,
        _input: Parameters<V3WordRequests["saveMeanings"]>[1]
      ) => {
        throw new HttpError(422, "invalid", [], "validation_failed", [
          meaningsIssue
        ]);
      }
    );
    renderWizard(requests({ saveForms, saveMeanings }), {
      initialWord,
      initialStep: "meanings",
      renderStep: (context) => (
        <>
          <output data-testid="partial-complete-step">
            {context.activeStep}
          </output>
          <output data-testid="partial-complete-revision">
            {context.word.revision}
          </output>
          <output data-testid="partial-complete-dirty">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <output data-testid="partial-complete-issues">
            {context.issues.map((issue) => issue.code).join(",")}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              const meanings = structuredClone(context.draftMeanings);
              meanings.sense_groups[0]!.name_zh = "待修正词义";
              context.setDraftMeanings(meanings);
            }}
          >
            编辑分步草稿
          </button>
          <button
            type="button"
            onClick={() =>
              void context.actions.saveMeanings(
                context.draftMeanings,
                "complete"
              )
            }
          >
            完成后续失败
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑分步草稿"));
    fireEvent.click(screen.getByText("完成后续失败"));

    expect(await screen.findByText("仍有内容需要完成")).toBeInTheDocument();
    expect(screen.getByTestId("partial-complete-issues")).toBeEmptyDOMElement();
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveMeanings).toHaveBeenCalledTimes(1);
    expect(saveMeanings.mock.calls[0]![1].base_revision).toBe(2);
    expect(screen.getByTestId("partial-complete-revision")).toHaveTextContent(
      "2"
    );
    expect(screen.getByTestId("partial-complete-dirty")).toHaveTextContent(
      "false/true"
    );
    expect(screen.getByTestId("partial-complete-step")).toHaveTextContent(
      "meanings"
    );
  });

  it("maps its live context directly to T5B and returns paged terminal tokens to the one save flow", async () => {
    const initialWord = word();
    initialWord.capabilities.publication = {
      mode: "migration_canary",
      whitelisted: true
    };
    initialWord.completed_steps = ["basics", "forms", "meanings"];
    initialWord.max_reachable_step = "preview";
    const firstPage = impactSurfacePage("cursor-2");
    const terminalPage = impactSurfacePage(null);
    const impactResponse: FormsImpactResponseV3 = {
      schema_version: 3,
      base_revision: 1,
      requires_confirmation: true,
      affected: [],
      surface_match_page: firstPage
    };
    const validate = vi.fn(async () => ({
      schema_version: 3 as const,
      validated_revision: 1,
      valid: true,
      issues: []
    }));
    const impact = vi.fn(async () => impactResponse);
    const surfacePage = vi.fn(async () => terminalPage);
    const saveForms = vi.fn(async () => envelope(2, "saved"));
    const source = requests({ validate, impact, surfacePage, saveForms });

    renderWizard(source, {
      initialWord,
      renderStep: (context) => {
        const controller = {
          ...(context.validation ? { validation: context.validation } : {}),
          ...(context.impact ? { impact: context.impact } : {}),
          impactConfirmed: context.impactConfirmed,
          issues: context.issues,
          ...(context.problem ? { problem: context.problem } : {}),
          isPending: (command) => context.isPending(command),
          actions: {
            validate: context.actions.validate,
            previewFormsImpact: context.actions.previewFormsImpact,
            publish: context.actions.publish,
            confirmImpact: context.actions.confirmImpact,
            confirmImpactSurface: context.actions.confirmImpactSurface,
            fetchSurfacePage: context.actions.fetchSurfacePage
          }
        } satisfies V3PreviewPublishController;
        const page = context.impactSurfacePage;
        return (
          <>
            <output data-testid="impact-snapshot">
              {page?.snapshot_id ?? "none"}
            </output>
            <V3PreviewAndPublishStep
              controller={controller}
              word={context.word}
            />
            <button
              type="button"
              onClick={() => {
                if (!page) return;
                const confirmation = {
                  snapshot_id: page.snapshot_id,
                  policy_name: page.policy_name,
                  policy_epoch: page.policy_epoch
                };
                void context.actions.saveForms("save", confirmation);
                void context.actions.saveForms("save", confirmation);
              }}
            >
              双击保存已确认影响
            </button>
          </>
        );
      }
    });

    const prepare = screen.getByRole("button", { name: "检查发布条件" });
    fireEvent.click(prepare);
    fireEvent.click(prepare);

    await waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(impact).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("impact-snapshot")).toHaveTextContent(
      "impact-snapshot"
    );
    await waitFor(() =>
      expect(surfacePage).toHaveBeenCalledWith(
        "impact-snapshot",
        "cursor-2",
        expect.any(AbortSignal)
      )
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "确认影响并允许发布"
      })
    );
    expect(
      await screen.findByRole("button", { name: "发布词条" })
    ).toBeEnabled();

    fireEvent.click(screen.getByText("双击保存已确认影响"));
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveForms).toHaveBeenCalledWith(
      "word-1",
      expect.objectContaining({
        confirmed_surface_match_token: "surface-terminal-token",
        confirmed_impact_token: "impact-terminal-token"
      })
    );
  });

  it("confirms a token-only impact through the controlled T5B mapping", async () => {
    const initialWord = word();
    initialWord.capabilities.publication = {
      mode: "migration_canary",
      whitelisted: true
    };
    initialWord.completed_steps = ["basics", "forms", "meanings"];
    initialWord.max_reachable_step = "preview";
    const impact = vi.fn(async () => ({
      schema_version: 3 as const,
      base_revision: 1,
      requires_confirmation: true,
      confirmation_token: "impact-token",
      affected: []
    }));

    renderWizard(requests({ impact }), {
      initialWord,
      renderStep: (context) => (
        <V3PreviewAndPublishStep
          word={context.word}
          controller={{
            ...(context.validation ? { validation: context.validation } : {}),
            ...(context.impact ? { impact: context.impact } : {}),
            impactConfirmed: context.impactConfirmed,
            issues: context.issues,
            isPending: (command) => context.isPending(command),
            actions: {
              validate: context.actions.validate,
              previewFormsImpact: context.actions.previewFormsImpact,
              publish: context.actions.publish,
              confirmImpact: context.actions.confirmImpact,
              confirmImpactSurface: context.actions.confirmImpactSurface,
              fetchSurfacePage: context.actions.fetchSurfacePage
            }
          }}
        />
      )
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "检查发布条件" })
    );
    fireEvent.click(
      await screen.findByRole("button", {
        name: "确认影响并允许发布"
      })
    );

    expect(
      await screen.findByRole("button", { name: "发布词条" })
    ).toBeEnabled();
  });

  it("invalidates prepared publication state when publish returns fresh validation issues", async () => {
    const initialWord = word();
    initialWord.capabilities.publication = {
      mode: "migration_canary",
      whitelisted: true
    };
    initialWord.completed_steps = ["basics", "forms", "meanings"];
    initialWord.max_reachable_step = "preview";
    const issue = validationIssue();
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValueOnce(
        new HttpError(422, "invalid", [], "validation_failed", [issue])
      )
      .mockResolvedValueOnce({
        word: { ...initialWord, revision: 3, status: "published" }
      });
    const saveForms = vi.fn<V3WordRequests["saveForms"]>(
      async (_wordId, input) => ({
        word: { ...initialWord, revision: 2, forms: input.content }
      })
    );
    const validate = vi
      .fn<V3WordRequests["validate"]>()
      .mockResolvedValueOnce({
        schema_version: 3,
        validated_revision: 1,
        valid: true,
        issues: []
      })
      .mockResolvedValueOnce({
        schema_version: 3,
        validated_revision: 2,
        valid: true,
        issues: []
      });
    const idempotencyKeyFactory = vi
      .fn<() => string>()
      .mockReturnValueOnce("publish-key-1")
      .mockReturnValueOnce("publish-key-2");

    renderWizard(requests({ publish, saveForms, validate }), {
      initialWord,
      idempotencyKeyFactory,
      renderStep: (context) => (
        <>
          <output data-testid="publish-revision">
            {context.word.revision}
          </output>
          <V3PreviewAndPublishStep
            word={context.word}
            controller={{
              ...(context.validation ? { validation: context.validation } : {}),
              ...(context.impact ? { impact: context.impact } : {}),
              impactConfirmed: context.impactConfirmed,
              issues: context.issues,
              ...(context.problem ? { problem: context.problem } : {}),
              isPending: (command) => context.isPending(command),
              actions: {
                validate: context.actions.validate,
                previewFormsImpact: context.actions.previewFormsImpact,
                publish: context.actions.publish,
                navigateIssue: context.actions.navigateIssue,
                confirmImpact: context.actions.confirmImpact,
                confirmImpactSurface: context.actions.confirmImpactSurface,
                fetchSurfacePage: context.actions.fetchSurfacePage
              }
            }}
          />
          <button onClick={() => context.setDraftForms(editedForms(context))}>
            编辑修复
          </button>
          <button onClick={() => void context.actions.saveForms("save")}>
            保存修复
          </button>
          <button
            onClick={async () => {
              const result = await context.actions.validate();
              if (result?.valid) {
                await context.actions.previewFormsImpact();
              }
            }}
          >
            重新准备发布
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));

    expect(
      await screen.findByRole("heading", { name: "还有 1 项待完成" })
    ).toBeVisible();
    expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();
    expect(screen.getByText("有待完成内容")).toBeVisible();

    fireEvent.click(screen.getByText("编辑修复"));
    fireEvent.click(screen.getByText("保存修复"));
    await waitFor(() => expect(saveForms).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.getByTestId("publish-revision")).toHaveTextContent("2")
    );
    fireEvent.click(screen.getByText("重新准备发布"));
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));

    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(publish.mock.calls.map((call) => call[1])).toEqual([
      "publish-key-1",
      "publish-key-2"
    ]);
    expect(publish.mock.calls.map((call) => call[2].base_revision)).toEqual([
      1, 2
    ]);
  });

  it.each([409, 410])(
    "recovers a %s publish confirmation with a new key and the shared paged surface loader",
    async (status) => {
      const firstPage = {
        ...impactSurfacePage("publish-cursor"),
        snapshot_id: "publish-snapshot"
      };
      const terminalPage = {
        ...impactSurfacePage(null),
        snapshot_id: "publish-snapshot",
        surface_confirmation_token: "publish-surface-token"
      };
      const publish = vi
        .fn<V3WordRequests["publish"]>()
        .mockRejectedValueOnce(
          new HttpError(
            status,
            "surface changed",
            [],
            "surface_matches_changed",
            [],
            { surface_match_page: firstPage }
          )
        )
        .mockResolvedValueOnce(envelope(2, "published after confirmation"));
      const surfacePage = vi.fn(async () => terminalPage);
      renderWizard(requests({ publish, surfacePage }), {
        renderStep: (context) => {
          const controller = {
            ...(context.validation ? { validation: context.validation } : {}),
            ...(context.impact ? { impact: context.impact } : {}),
            impactConfirmed: context.impactConfirmed,
            issues: context.issues,
            ...(context.problem ? { problem: context.problem } : {}),
            isPending: (command) => context.isPending(command),
            actions: {
              validate: context.actions.validate,
              previewFormsImpact: context.actions.previewFormsImpact,
              publish: context.actions.publish,
              confirmImpactSurface: context.actions.confirmImpactSurface,
              fetchSurfacePage: context.actions.fetchSurfacePage
            }
          } satisfies V3PreviewPublishController;
          return (
            <>
              <output data-testid="publish-snapshot">
                {context.publishSurfacePage?.snapshot_id ?? "none"}
              </output>
              <button
                type="button"
                onClick={() => {
                  void context.actions.publish();
                  void context.actions.publish();
                }}
              >
                双击触发发布确认
              </button>
              <V3PreviewAndPublishStep
                controller={controller}
                word={context.word}
              />
            </>
          );
        }
      });

      fireEvent.click(screen.getByText("双击触发发布确认"));

      expect(publish).toHaveBeenCalledTimes(1);
      await waitFor(() =>
        expect(screen.getByTestId("publish-snapshot")).toHaveTextContent(
          "publish-snapshot"
        )
      );
      await waitFor(() =>
        expect(surfacePage).toHaveBeenCalledWith(
          "publish-snapshot",
          "publish-cursor",
          expect.any(AbortSignal)
        )
      );
      fireEvent.click(
        await screen.findByRole("button", {
          name: "确认同形提示并重试发布"
        })
      );
      await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
      expect(publish.mock.calls[1]![1]).not.toBe(publish.mock.calls[0]![1]);
      expect(publish.mock.calls[1]![2]).toEqual({
        schema_version: 3,
        base_revision: 1,
        confirmed_surface_match_token: "publish-surface-token"
      });
    }
  );

  it("refreshes canonical before rotating a publish idempotency key and requires a fresh controlled prepare", async () => {
    const initialWord = word();
    initialWord.capabilities.publication = {
      mode: "migration_canary",
      whitelisted: true
    };
    initialWord.completed_steps = ["basics", "forms", "meanings"];
    initialWord.max_reachable_step = "preview";
    initialWord.published_revision = 0;
    const refreshed = {
      ...initialWord,
      revision: 8,
      published_revision: 7,
      presentation: {
        ...initialWord.presentation,
        label: "refreshed wizard canonical"
      }
    };
    let resolveGet!: (value: AdminWordDraftV3Envelope) => void;
    const get = vi.fn(
      () =>
        new Promise<AdminWordDraftV3Envelope>((resolve) => {
          resolveGet = resolve;
        })
    );
    const publishPage = {
      ...impactSurfacePage("publish-cursor"),
      snapshot_id: "publish-refresh-snapshot"
    };
    const publishTerminal = {
      ...impactSurfacePage(null),
      snapshot_id: "publish-refresh-snapshot",
      surface_confirmation_token: "latest-wizard-surface-token"
    };
    const validate = vi.fn(async (_wordId, input) => ({
      schema_version: 3 as const,
      validated_revision: input.base_revision,
      valid: true,
      issues: []
    }));
    const impact = vi.fn(async (_wordId, input) => ({
      schema_version: 3 as const,
      base_revision: input.base_revision,
      requires_confirmation: false,
      affected: []
    }));
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValueOnce(
        new HttpError(409, "reused", [], "idempotency_conflict")
      )
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "surface changed",
          [],
          "surface_matches_changed",
          [],
          { surface_match_page: publishPage }
        )
      )
      .mockResolvedValueOnce({
        word: { ...refreshed, revision: 9, status: "published" }
      });
    renderWizard(
      requests({
        get,
        impact,
        publish,
        surfacePage: vi.fn(async () => publishTerminal),
        validate
      }),
      {
        initialWord,
        renderStep: (context) => (
          <>
            <output data-testid="publish-refresh-revision">
              {context.word.revision}
            </output>
            <V3PreviewAndPublishStep
              word={context.word}
              controller={{
                ...(context.validation
                  ? { validation: context.validation }
                  : {}),
                ...(context.impact ? { impact: context.impact } : {}),
                impactConfirmed: context.impactConfirmed,
                issues: context.issues,
                ...(context.problem ? { problem: context.problem } : {}),
                isPending: (command) => context.isPending(command),
                actions: {
                  validate: context.actions.validate,
                  previewFormsImpact: context.actions.previewFormsImpact,
                  publish: context.actions.publish,
                  confirmImpact: context.actions.confirmImpact,
                  confirmImpactSurface: context.actions.confirmImpactSurface,
                  fetchSurfacePage: context.actions.fetchSurfacePage
                }
              }}
            />
          </>
        )
      }
    );

    fireEvent.click(screen.getByText("检查发布条件").closest("button")!);
    const publishButton = (await screen.findByText("发布词条")).closest(
      "button"
    )!;
    fireEvent.click(publishButton);
    await waitFor(() => expect(get).toHaveBeenCalledWith("word-1"));
    fireEvent.click(publishButton);
    expect(publish).toHaveBeenCalledTimes(1);

    await act(async () =>
      resolveGet({ word: refreshed, retired_stable_nodes: [] })
    );
    expect(screen.getByTestId("publish-refresh-revision")).toHaveTextContent(
      "8"
    );
    expect(screen.queryByText("发布词条")).toBeNull();

    const prepareAfterRefresh = screen
      .getByText("检查发布条件")
      .closest("button")!;
    await waitFor(() => expect(prepareAfterRefresh).toBeEnabled());
    fireEvent.click(prepareAfterRefresh);
    fireEvent.click((await screen.findByText("发布词条")).closest("button")!);
    const confirmSurface = (
      await screen.findByText("确认同形提示并重试发布")
    ).closest("button")!;
    await waitFor(() => expect(confirmSurface).toBeEnabled());
    fireEvent.click(confirmSurface);
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(3));

    expect(validate.mock.calls[1]?.[1]).toEqual({
      schema_version: 3,
      base_revision: 8
    });
    expect(impact.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ base_revision: 8 })
    );
    expect(publish.mock.calls[1]![1]).not.toBe(publish.mock.calls[0]![1]);
    expect(publish.mock.calls[1]![2]).toEqual({
      schema_version: 3,
      base_revision: 8
    });
    expect(publish.mock.calls[2]![1]).not.toBe(publish.mock.calls[1]![1]);
    expect(publish.mock.calls[2]![2]).toEqual({
      schema_version: 3,
      base_revision: 8,
      confirmed_surface_match_token: "latest-wizard-surface-token"
    });
  });

  it("reconciles a publish revision conflict before allowing a new revision and key", async () => {
    const initialWord = word();
    initialWord.capabilities.publication = {
      mode: "migration_canary",
      whitelisted: true
    };
    initialWord.completed_steps = ["basics", "forms", "meanings"];
    initialWord.max_reachable_step = "preview";
    const refreshed = {
      ...initialWord,
      revision: 9,
      presentation: {
        ...initialWord.presentation,
        label: "wizard revision reconciled"
      }
    };
    let resolveGet!: (value: AdminWordDraftV3Envelope) => void;
    const get = vi.fn(
      () =>
        new Promise<AdminWordDraftV3Envelope>((resolve) => {
          resolveGet = resolve;
        })
    );
    const validate = vi.fn(async (_wordId, input) => ({
      schema_version: 3 as const,
      validated_revision: input.base_revision,
      valid: true,
      issues: []
    }));
    const impact = vi.fn(async (_wordId, input) => ({
      schema_version: 3 as const,
      base_revision: input.base_revision,
      requires_confirmation: false,
      affected: []
    }));
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValueOnce(
        new HttpError(409, "stale", [], "revision_conflict")
      )
      .mockResolvedValueOnce(envelope(10, "published latest"));
    renderWizard(requests({ get, impact, publish, validate }), {
      initialWord,
      renderStep: (context) => (
        <>
          <output data-testid="revision-conflict-revision">
            {context.word.revision}
          </output>
          <V3PreviewAndPublishStep
            word={context.word}
            controller={{
              ...(context.validation ? { validation: context.validation } : {}),
              ...(context.impact ? { impact: context.impact } : {}),
              impactConfirmed: context.impactConfirmed,
              issues: context.issues,
              ...(context.problem ? { problem: context.problem } : {}),
              isPending: (command) => context.isPending(command),
              actions: {
                validate: context.actions.validate,
                previewFormsImpact: context.actions.previewFormsImpact,
                publish: context.actions.publish,
                confirmImpact: context.actions.confirmImpact,
                confirmImpactSurface: context.actions.confirmImpactSurface,
                fetchSurfacePage: context.actions.fetchSurfacePage
              }
            }}
          />
        </>
      )
    });

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    const stalePublishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(stalePublishButton);
    await waitFor(() => expect(get).toHaveBeenCalledWith("word-1"));
    fireEvent.click(stalePublishButton);
    expect(publish).toHaveBeenCalledTimes(1);

    await act(async () =>
      resolveGet({ word: refreshed, retired_stable_nodes: [] })
    );
    expect(screen.getByTestId("revision-conflict-revision")).toHaveTextContent(
      "9"
    );
    expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();

    const prepareAfterRevisionRefresh = screen
      .getByText("检查发布条件")
      .closest("button")!;
    await waitFor(() => expect(prepareAfterRevisionRefresh).toBeEnabled());
    fireEvent.click(prepareAfterRevisionRefresh);
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(validate.mock.calls[1]?.[1]).toEqual({
      schema_version: 3,
      base_revision: 9
    });
    expect(impact.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ base_revision: 9 })
    );
    expect(publish.mock.calls[1]![1]).not.toBe(publish.mock.calls[0]![1]);
    expect(publish.mock.calls[1]![2]).toEqual({
      schema_version: 3,
      base_revision: 9
    });
  });

  it("offers a current-scope reconciliation retry after a pending GET is superseded", async () => {
    const getResolvers: Array<(value: AdminWordDraftV3Envelope) => void> = [];
    const get = vi.fn(
      () =>
        new Promise<AdminWordDraftV3Envelope>((resolve) => {
          getResolvers.push(resolve);
        })
    );
    const validate = vi.fn(async (_wordId, input) => ({
      schema_version: 3 as const,
      validated_revision: input.base_revision,
      valid: true,
      issues: []
    }));
    const impact = vi.fn(async (_wordId, input) => ({
      schema_version: 3 as const,
      base_revision: input.base_revision,
      requires_confirmation: false,
      affected: []
    }));
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValueOnce(
        new HttpError(409, "stale", [], "revision_conflict")
      )
      .mockResolvedValueOnce(envelope(11, "published after scope retry"));
    const saveForms = vi.fn(async () => envelope(10, "local edit"));
    renderWizard(requests({ get, impact, publish, saveForms, validate }), {
      renderStep: (context) => (
        <>
          <output data-testid="superseded-reconcile-revision">
            {context.word.revision}
          </output>
          <output data-testid="superseded-reconcile-prepared">
            {context.validation?.validated_revision ?? "none"}/
            {context.impact?.base_revision ?? "none"}
          </output>
          <output data-testid="superseded-reconcile-draft">
            {spellingOf(context)}/{String(context.dirtySteps.forms)}
          </output>
          <button type="button" onClick={() => void context.actions.validate()}>
            重新验证
          </button>
          <button
            type="button"
            onClick={() => void context.actions.previewFormsImpact()}
          >
            重新预览影响
          </button>
          <button type="button" onClick={() => void context.actions.publish()}>
            scope 发布
          </button>
          <button
            type="button"
            onClick={() => context.setDraftForms(editedForms(context))}
          >
            supersede scope
          </button>
          <button
            type="button"
            onClick={() => void context.actions.saveForms("save")}
          >
            保存 superseded draft
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("重新验证"));
    await waitFor(() =>
      expect(
        screen.getByTestId("superseded-reconcile-prepared")
      ).toHaveTextContent("1/none")
    );
    fireEvent.click(screen.getByText("重新预览影响"));
    await waitFor(() =>
      expect(
        screen.getByTestId("superseded-reconcile-prepared")
      ).toHaveTextContent("1/1")
    );
    fireEvent.click(screen.getByText("scope 发布"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("supersede scope"));
    await act(async () => getResolvers[0]!(draftEnvelope(8, "stale scope")));

    fireEvent.click(await screen.findByRole("button", { name: /重\s*试/ }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(publish).toHaveBeenCalledTimes(1);
    await act(async () =>
      getResolvers[1]!(draftEnvelope(9, "current scope canonical"))
    );
    expect(
      screen.getByTestId("superseded-reconcile-revision")
    ).toHaveTextContent("9");
    expect(screen.getByTestId("superseded-reconcile-draft")).toHaveTextContent(
      "local edit/true"
    );
    expect(
      screen.getByTestId("superseded-reconcile-prepared")
    ).toHaveTextContent("none/none");

    fireEvent.click(screen.getByText("保存 superseded draft"));
    await waitFor(() =>
      expect(
        screen.getByTestId("superseded-reconcile-revision")
      ).toHaveTextContent("10")
    );
    expect(screen.getByTestId("superseded-reconcile-draft")).toHaveTextContent(
      "local edit/false"
    );

    fireEvent.click(screen.getByText("重新验证"));
    await waitFor(() =>
      expect(
        screen.getByTestId("superseded-reconcile-prepared")
      ).toHaveTextContent("10/none")
    );
    fireEvent.click(screen.getByText("重新预览影响"));
    await waitFor(() =>
      expect(
        screen.getByTestId("superseded-reconcile-prepared")
      ).toHaveTextContent("10/10")
    );
    fireEvent.click(screen.getByText("scope 发布"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(validate.mock.calls.at(-1)?.[1]).toEqual({
      schema_version: 3,
      base_revision: 10
    });
    expect(impact.mock.calls.at(-1)?.[1]).toEqual(
      expect.objectContaining({ base_revision: 10 })
    );
    expect(publish.mock.calls[1]![1]).not.toBe(publish.mock.calls[0]![1]);
    expect(publish.mock.calls[1]![2]).toEqual({
      schema_version: 3,
      base_revision: 10
    });
  });

  it("keeps wizard revision reconciliation blocked until a failed refresh is retried", async () => {
    const get = vi
      .fn<V3WordRequests["get"]>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(draftEnvelope(9, "refreshed after conflict"));
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValue(new HttpError(409, "stale", [], "revision_conflict"));
    renderWizard(requests({ get, publish }), {
      renderStep: (context) => (
        <>
          <output data-testid="revision-refresh-retry">
            {context.word.revision}
          </output>
          <button type="button" onClick={() => void context.actions.publish()}>
            发布并刷新 revision
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("发布并刷新 revision"));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByText("发布并刷新 revision"));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    await waitFor(() =>
      expect(screen.getByTestId("revision-refresh-retry")).toHaveTextContent(
        "9"
      )
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("does not apply a late publish reconciliation after the Wizard route scope changes", async () => {
    const initialWord = word();
    const nextWord = word();
    nextWord.id = "word-2";
    nextWord.presentation = {
      ...nextWord.presentation,
      label: "next route scope"
    };
    let resolveGet!: (value: AdminWordDraftV3Envelope) => void;
    const source = requests({
      get: vi.fn(
        () =>
          new Promise<AdminWordDraftV3Envelope>((resolve) => {
            resolveGet = resolve;
          })
      ),
      publish: vi
        .fn()
        .mockRejectedValue(new HttpError(409, "stale", [], "revision_conflict"))
    });
    const onWordChange = vi.fn();
    const renderStep = (context: V3WizardSlotContext) => (
      <>
        <output data-testid="route-scope-label">
          {context.word.presentation.label}
        </output>
        <button type="button" onClick={() => void context.actions.publish()}>
          发布并切换路由
        </button>
      </>
    );
    const view = render(
      inRouter(
        <V3WordCreationWizard
          initialWord={initialWord}
          requests={source}
          onWordChange={onWordChange}
          renderStep={renderStep}
        />
      )
    );

    fireEvent.click(screen.getByText("发布并切换路由"));
    await waitFor(() => expect(source.get).toHaveBeenCalledWith("word-1"));
    view.rerender(
      inRouter(
        <V3WordCreationWizard
          initialWord={nextWord}
          requests={source}
          onWordChange={onWordChange}
          renderStep={renderStep}
        />
      )
    );
    expect(screen.getByTestId("route-scope-label")).toHaveTextContent(
      "next route scope"
    );

    await act(async () =>
      resolveGet(draftEnvelope(9, "stale route reconciliation"))
    );
    expect(screen.getByTestId("route-scope-label")).toHaveTextContent(
      "next route scope"
    );
    expect(onWordChange).not.toHaveBeenCalled();
  });

  it.each([
    ["revision", 5, 1],
    ["lifecycle revision", 1, 3]
  ])(
    "supersedes a late publish GET with a same-ID newer initialWord %s without dropping dirty drafts",
    async (_versionKind, revision, lifecycleRevision) => {
      const initialWord = word();
      const newerWord = word(revision, "newer query canonical");
      newerWord.lifecycle_revision = lifecycleRevision;
      let resolveGet!: (value: AdminWordDraftV3Envelope) => void;
      const source = requests({
        get: vi.fn(
          () =>
            new Promise<AdminWordDraftV3Envelope>((resolve) => {
              resolveGet = resolve;
            })
        ),
        publish: vi
          .fn()
          .mockRejectedValue(
            new HttpError(409, "stale", [], "revision_conflict")
          )
      });
      const onWordChange = vi.fn();
      const renderStep = (context: V3WizardSlotContext) => (
        <>
          <output data-testid="same-id-prop-revision">
            {context.word.revision}/{context.word.lifecycle_revision}
          </output>
          <output data-testid="same-id-prop-draft">
            {spellingOf(context)}
          </output>
          <output data-testid="same-id-prop-dirty">
            {String(context.dirtySteps.forms)}
          </output>
          <button type="button" onClick={() => void context.actions.publish()}>
            发布后 refetch
          </button>
          <button
            type="button"
            onClick={() => context.setDraftForms(editedForms(context))}
          >
            在 GET pending 时编辑
          </button>
        </>
      );
      const view = render(
        inRouter(
          <V3WordCreationWizard
            initialWord={initialWord}
            requests={source}
            onWordChange={onWordChange}
            renderStep={renderStep}
          />
        )
      );

      fireEvent.click(screen.getByText("发布后 refetch"));
      await waitFor(() => expect(source.get).toHaveBeenCalledTimes(1));
      fireEvent.click(screen.getByText("在 GET pending 时编辑"));
      view.rerender(
        inRouter(
          <V3WordCreationWizard
            initialWord={newerWord}
            requests={source}
            onWordChange={onWordChange}
            renderStep={renderStep}
          />
        )
      );

      await waitFor(() =>
        expect(screen.getByTestId("same-id-prop-revision")).toHaveTextContent(
          `${revision}/${lifecycleRevision}`
        )
      );
      expect(screen.getByTestId("same-id-prop-draft")).toHaveTextContent(
        "local edit"
      );
      expect(screen.getByTestId("same-id-prop-dirty")).toHaveTextContent(
        "true"
      );

      await act(async () =>
        resolveGet(draftEnvelope(4, "older reconciliation response"))
      );
      expect(screen.getByTestId("same-id-prop-revision")).toHaveTextContent(
        `${revision}/${lifecycleRevision}`
      );
      expect(screen.getByTestId("same-id-prop-draft")).toHaveTextContent(
        "local edit"
      );
      expect(screen.getByTestId("same-id-prop-dirty")).toHaveTextContent(
        "true"
      );
      expect(onWordChange).not.toHaveBeenCalled();
    }
  );

  it("blocks wizard publish after an idempotency reconciliation refresh fails", async () => {
    const latest = draftEnvelope(8, "refreshed after retry");
    const get = vi
      .fn<V3WordRequests["get"]>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(latest);
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValueOnce(
        new HttpError(409, "reused", [], "idempotency_conflict")
      )
      .mockResolvedValueOnce(envelope(9, "must not publish"));
    renderWizard(requests({ get, publish }), {
      renderStep: (context) => (
        <>
          <output data-testid="failed-refresh-revision">
            {context.word.revision}
          </output>
          <button type="button" onClick={() => void context.actions.publish()}>
            发布并对账
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("发布并对账"));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByText("发布并对账"));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    await waitFor(() =>
      expect(screen.getByTestId("failed-refresh-revision")).toHaveTextContent(
        "8"
      )
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("keeps edits after a 500 and permits an explicit retry", async () => {
    const saveForms = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500, "boom"))
      .mockResolvedValueOnce(envelope(2, "server saved"));
    renderWizard(requests({ saveForms }));

    fireEvent.click(screen.getByText("编辑"));
    fireEvent.click(screen.getByText("保存"));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    expect(screen.getByTestId("spelling")).toHaveTextContent("local edit");
    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));

    await waitFor(() =>
      expect(screen.getByTestId("revision")).toHaveTextContent("2")
    );
    expect(saveForms).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("有未保存的草稿")).toBeNull();
  });

  it("keeps read-only navigation inert and safely handles absent preview, conflict, POS, and issue POS", async () => {
    const initialWord = word();
    initialWord.status = "published";
    initialWord.forms = { pos: [] };
    const source = requests();
    const results: boolean[] = [];
    const focusField = vi.fn();
    const issueWithoutPos: V3DraftValidationIssue = {
      ...validationIssue(),
      node_id: "orphan-form",
      field: "spelling",
      node_location: {
        node_role: "concrete_form",
        ancestor_node_ids: [],
        form_id: "orphan-form"
      }
    };
    renderWizard(source, {
      initialWord,
      navigationAdapter: { focusField },
      renderStep: (context) => (
        <>
          <output data-testid="read-only">{String(context.readOnly)}</output>
          <output data-testid="active-step">{context.activeStep}</output>
          <output data-testid="optional-pos">
            {context.activePosId ?? "none"}
          </output>
          <button
            type="button"
            onClick={() => context.setActiveStep("meanings")}
          >
            只读切步
          </button>
          <button
            type="button"
            onClick={() => {
              results.push(context.actions.confirmImpact());
              results.push(
                context.actions.confirmImpactSurface(impactSurfacePage(null))
              );
              void context.actions.refreshConflict();
              void context.actions.navigateIssue(issueWithoutPos);
            }}
          >
            无状态安全操作
          </button>
        </>
      )
    });

    expect(screen.getByTestId("read-only")).toHaveTextContent("true");
    expect(screen.getByTestId("optional-pos")).toHaveTextContent("none");
    fireEvent.click(screen.getByText("只读切步"));
    fireEvent.click(screen.getByText("无状态安全操作"));

    expect(screen.getByTestId("active-step")).toHaveTextContent("forms");
    expect(results).toEqual([false, false]);
    expect(source.get).not.toHaveBeenCalled();
    await waitFor(() => expect(focusField).toHaveBeenCalledTimes(1));
  });

  it("passes a surface token to publish and turns the live session read-only", async () => {
    const published = word(2, "published");
    published.status = "published";
    const publish = vi.fn(async () => ({ word: published }));
    renderWizard(requests({ publish }), {
      renderStep: (context) => (
        <>
          <output data-testid="live-read-only">
            {String(context.readOnly)}
          </output>
          <output data-testid="live-step">{context.activeStep}</output>
          <button
            type="button"
            onClick={() => void context.actions.publish("surface-token")}
          >
            带令牌发布
          </button>
          <button
            type="button"
            onClick={() => context.setActiveStep("meanings")}
          >
            发布后切步
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("带令牌发布"));

    await waitFor(() =>
      expect(screen.getByTestId("live-read-only")).toHaveTextContent("true")
    );
    expect(publish).toHaveBeenCalledWith("word-1", expect.any(String), {
      schema_version: 3,
      base_revision: 1,
      confirmed_surface_match_token: "surface-token"
    });
    fireEvent.click(screen.getByText("发布后切步"));
    expect(screen.getByTestId("live-step")).toHaveTextContent("forms");
  });

  it("reuses one publish attempt key when the main publish entry retries an unknown outcome", async () => {
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(envelope(2, "published after retry"));
    renderWizard(requests({ publish }), {
      renderStep: (context) => (
        <button type="button" onClick={() => void context.actions.publish()}>
          主发布入口
        </button>
      )
    });

    fireEvent.click(screen.getByText("主发布入口"));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();

    fireEvent.click(screen.getByText("主发布入口"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));

    expect(publish.mock.calls[1]![1]).toBe(publish.mock.calls[0]![1]);
  });

  it("reuses one publish attempt key when the error panel retries an unknown outcome", async () => {
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockRejectedValueOnce(new HttpError(500, "upstream timeout"))
      .mockResolvedValueOnce(envelope(2, "published after retry"));
    renderWizard(requests({ publish }), {
      renderStep: (context) => (
        <button type="button" onClick={() => void context.actions.publish()}>
          错误面板发布
        </button>
      )
    });

    fireEvent.click(screen.getByText("错误面板发布"));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));

    expect(publish.mock.calls[1]![1]).toBe(publish.mock.calls[0]![1]);
  });

  it("starts a new publish attempt key after a known successful response", async () => {
    const publish = vi
      .fn<V3WordRequests["publish"]>()
      .mockResolvedValueOnce(envelope(2, "first publish"))
      .mockResolvedValueOnce(envelope(3, "second publish"));
    renderWizard(requests({ publish }), {
      renderStep: (context) => (
        <>
          <output data-testid="publish-revision">
            {context.word.revision}
          </output>
          <button type="button" onClick={() => void context.actions.publish()}>
            连续发布
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("连续发布"));
    await waitFor(() =>
      expect(screen.getByTestId("publish-revision")).toHaveTextContent("2")
    );
    fireEvent.click(screen.getByText("连续发布"));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));

    expect(publish.mock.calls[1]![1]).not.toBe(publish.mock.calls[0]![1]);
    expect(publish.mock.calls[1]![2].base_revision).toBe(2);
  });

  it("rejects a non-terminal impact page and accepts its matching terminal page", async () => {
    const firstPage = impactSurfacePage("cursor-2");
    const terminalPage = impactSurfacePage(null);
    const confirmations: boolean[] = [];
    renderWizard(
      requests({
        impact: vi.fn(async () => ({
          schema_version: 3 as const,
          base_revision: 1,
          requires_confirmation: true,
          affected: [],
          surface_match_page: firstPage
        }))
      }),
      {
        renderStep: (context) => (
          <>
            <output data-testid="surface-impact">
              {context.impact ? "present" : "none"}
            </output>
            <button
              type="button"
              onClick={() => void context.actions.previewFormsImpact()}
            >
              预览 surface 影响
            </button>
            <button
              type="button"
              onClick={() => {
                confirmations.push(context.actions.confirmImpact());
                confirmations.push(
                  context.actions.confirmImpactSurface(firstPage)
                );
                confirmations.push(
                  context.actions.confirmImpactSurface(terminalPage)
                );
              }}
            >
              验证 surface 终页
            </button>
          </>
        )
      }
    );

    fireEvent.click(screen.getByText("预览 surface 影响"));
    await waitFor(() =>
      expect(screen.getByTestId("surface-impact")).toHaveTextContent("present")
    );
    fireEvent.click(screen.getByText("验证 surface 终页"));

    expect(confirmations).toEqual([false, false, true]);
  });

  it("clears a no-effect impact without auto-focusing the first validation issue", async () => {
    const issue = validationIssue();
    const focusField = vi.fn();
    const validate = vi.fn(async () => ({
      schema_version: 3 as const,
      validated_revision: 1,
      valid: false,
      issues: [issue]
    }));
    renderWizard(requests({ validate }), {
      navigationAdapter: { focusField },
      renderStep: (context) => (
        <>
          <output data-testid="validation-state">
            {context.validation?.valid === false ? "invalid" : "none"}
          </output>
          <output data-testid="impact-state">
            {context.impact ? "present" : "none"}/
            {String(context.impactConfirmed)}
          </output>
          <button
            type="button"
            onClick={() => void context.actions.previewFormsImpact()}
          >
            预览无影响
          </button>
          <button type="button" onClick={() => void context.actions.validate()}>
            验证无效
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("预览无影响"));
    await waitFor(() =>
      expect(screen.getByTestId("impact-state")).toHaveTextContent(
        "present/true"
      )
    );
    fireEvent.click(screen.getByText("验证无效"));

    await waitFor(() =>
      expect(screen.getByTestId("validation-state")).toHaveTextContent(
        "invalid"
      )
    );
    expect(screen.getByTestId("impact-state")).toHaveTextContent("none/false");
    expect(focusField).not.toHaveBeenCalled();
  });

  it("drops stale validate and impact responses after a POS supersede", async () => {
    let resolveValidate!: (value: DraftValidationResponseV3) => void;
    let resolveImpact!: (value: FormsImpactResponseV3) => void;
    const validate = vi.fn(
      () =>
        new Promise<DraftValidationResponseV3>((resolve) => {
          resolveValidate = resolve;
        })
    );
    const impact = vi.fn(
      () =>
        new Promise<FormsImpactResponseV3>((resolve) => {
          resolveImpact = resolve;
        })
    );
    renderWizard(requests({ validate, impact }), {
      renderStep: (context) => (
        <>
          <output data-testid="stale-preview-state">
            {context.validation ? "validation" : "none"}/
            {context.impact ? "impact" : "none"}
          </output>
          <button type="button" onClick={() => void context.actions.validate()}>
            延迟验证
          </button>
          <button
            type="button"
            onClick={() => void context.actions.previewFormsImpact()}
          >
            延迟影响
          </button>
          <button
            type="button"
            onClick={() =>
              context.setActivePosId(
                context.activePosId === "pos-2" ? "pos-3" : "pos-2"
              )
            }
          >
            作废预览
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("延迟验证"));
    fireEvent.click(screen.getByText("作废预览"));
    await act(async () =>
      resolveValidate({
        schema_version: 3,
        validated_revision: 1,
        valid: true,
        issues: []
      })
    );
    fireEvent.click(screen.getByText("延迟影响"));
    fireEvent.click(screen.getByText("作废预览"));
    await act(async () =>
      resolveImpact({
        schema_version: 3,
        base_revision: 1,
        requires_confirmation: false,
        affected: []
      })
    );

    expect(screen.getByTestId("stale-preview-state")).toHaveTextContent(
      "none/none"
    );
  });

  it("keeps impact input through a server error and retries that exact command", async () => {
    const impact = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500, "impact failed"))
      .mockResolvedValueOnce({
        schema_version: 3 as const,
        base_revision: 1,
        requires_confirmation: false,
        affected: []
      });
    renderWizard(requests({ impact }), {
      renderStep: (context) => (
        <>
          <output data-testid="retried-impact">
            {context.impact ? "present" : "none"}
          </output>
          <button
            type="button"
            onClick={() => void context.actions.previewFormsImpact()}
          >
            预览失败后重试
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("预览失败后重试"));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByText("重 试").closest("button")!);

    await waitFor(() =>
      expect(screen.getByTestId("retried-impact")).toHaveTextContent("present")
    );
    expect(impact).toHaveBeenCalledTimes(2);
  });

  it("drops resolved and rejected stale meaning saves", async () => {
    const deferred: Array<{
      resolve: (value: AdminWordV3Envelope) => void;
      reject: (error: unknown) => void;
    }> = [];
    const saveMeanings = vi.fn(
      () =>
        new Promise<AdminWordV3Envelope>((resolve, reject) => {
          deferred.push({ resolve, reject });
        })
    );
    const content: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [],
      pos: []
    };
    renderWizard(requests({ saveMeanings }), {
      renderStep: (context) => (
        <>
          <output data-testid="stale-meaning-problem">
            {context.problem?.kind ?? "none"}
          </output>
          <output data-testid="stale-meaning-revision">
            {context.word.revision}
          </output>
          <button
            type="button"
            onClick={() => void context.actions.saveMeanings(content, "save")}
          >
            延迟保存释义
          </button>
          <button type="button" onClick={() => context.setActivePosId("pos-2")}>
            作废释义一
          </button>
          <button type="button" onClick={() => context.setActivePosId("pos-3")}>
            作废释义二
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("延迟保存释义"));
    fireEvent.click(screen.getByText("作废释义一"));
    await act(async () => deferred[0]!.resolve(envelope(2, "stale")));
    fireEvent.click(screen.getByText("延迟保存释义"));
    fireEvent.click(screen.getByText("作废释义二"));
    await act(async () => deferred[1]!.reject(new HttpError(500, "stale")));

    expect(screen.getByTestId("stale-meaning-revision")).toHaveTextContent("1");
    expect(screen.getByTestId("stale-meaning-problem")).toHaveTextContent(
      "none"
    );
  });

  it("retries a failed conflict refresh without discarding the local comparison", async () => {
    let resolveGet!: (value: AdminWordDraftV3Envelope) => void;
    const get = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500, "get failed"))
      .mockImplementationOnce(
        () =>
          new Promise<AdminWordDraftV3Envelope>((resolve) => {
            resolveGet = resolve;
          })
      );
    renderWizard(
      requests({
        saveForms: vi.fn(async () => {
          throw new HttpError(409, "stale", [], "revision_conflict");
        }),
        get
      })
    );

    fireEvent.click(screen.getByText("保存"));
    fireEvent.click(await screen.findByRole("button", { name: "刷新并比较" }));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    const retryButton = screen.getByText("重 试").closest("button")!;
    await waitFor(() => expect(retryButton).not.toHaveClass("ant-btn-loading"));
    fireEvent.click(retryButton);

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await act(async () => resolveGet(draftEnvelope(4, "server latest")));
    expect(screen.getByTestId("revision")).toHaveTextContent("4");
  });

  it("ignores a conflict refresh superseded before its response", async () => {
    let resolveGet!: (value: AdminWordDraftV3Envelope) => void;
    const get = vi.fn(
      () =>
        new Promise<AdminWordDraftV3Envelope>((resolve) => {
          resolveGet = resolve;
        })
    );
    const onWordChange = vi.fn();
    renderWizard(
      requests({
        saveForms: vi.fn(async () => {
          throw new HttpError(409, "stale", [], "revision_conflict");
        }),
        get
      }),
      { onWordChange }
    );

    fireEvent.click(screen.getByText("保存"));
    fireEvent.click(await screen.findByRole("button", { name: "刷新并比较" }));
    fireEvent.click(screen.getByText("切换词性"));
    await act(async () => resolveGet(draftEnvelope(4, "stale server")));

    expect(screen.getByTestId("revision")).toHaveTextContent("1");
    expect(onWordChange).not.toHaveBeenCalled();
  });

  it("adopts the first canonical POS when the optional active POS is empty", async () => {
    const initialWord = word();
    initialWord.forms = { pos: [] };
    renderWizard(requests(), {
      initialWord,
      renderStep: (context) => (
        <>
          <output data-testid="canonical-pos">
            {context.activePosId ?? "none"}
          </output>
          <button
            type="button"
            onClick={() => void context.actions.saveForms("save")}
          >
            保存空词性
          </button>
        </>
      )
    });

    expect(screen.getByTestId("canonical-pos")).toHaveTextContent("none");
    fireEvent.click(screen.getByText("保存空词性"));

    await waitFor(() =>
      expect(screen.getByTestId("canonical-pos")).toHaveTextContent(UUIDS.pos)
    );
  });

  it("blocks same-tick canonical preview and publish after a live draft edit", async () => {
    const source = requests();
    renderWizard(source, {
      renderStep: (context) => (
        <>
          <output data-testid="same-tick-dirty">
            {String(context.hasUnsavedChanges)}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              void context.actions.validate();
              void context.actions.previewFormsImpact();
              void context.actions.publish();
            }}
          >
            同步编辑并检查
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("同步编辑并检查"));

    await waitFor(() =>
      expect(screen.getByTestId("same-tick-dirty")).toHaveTextContent("true")
    );
    expect(source.validate).not.toHaveBeenCalled();
    expect(source.impact).not.toHaveBeenCalled();
    expect(source.publish).not.toHaveBeenCalled();
  });

  it("clears live dirty state when both drafts are restored to canonical content", async () => {
    const source = requests();
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "local-group", name_zh: "本地释义", name_en: "Local meaning" }
      ],
      pos: []
    };
    renderWizard(source, {
      renderStep: (context) => (
        <>
          <output data-testid="restored-dirty-state">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              context.setDraftMeanings(localMeanings);
            }}
          >
            编辑再还原
          </button>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(structuredClone(context.word.forms));
              context.setDraftMeanings(
                toWritableMeanings(context.word.meanings)
              );
            }}
          >
            还原 canonical
          </button>
          <button type="button" onClick={() => void context.actions.validate()}>
            还原后校验
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑再还原"));
    expect(screen.getByTestId("restored-dirty-state")).toHaveTextContent(
      "true/true"
    );
    fireEvent.click(screen.getByText("还原 canonical"));
    expect(screen.getByTestId("restored-dirty-state")).toHaveTextContent(
      "false/false"
    );
    fireEvent.click(screen.getByText("还原后校验"));
    await waitFor(() => expect(source.validate).toHaveBeenCalledTimes(1));
  });

  it("syncs canonical meanings projected by a forms save when meanings are clean", async () => {
    const initialWord = word();
    initialWord.meanings = canonicalMeanings(initialWord.forms.pos[0]!.pos_id);
    initialWord.meanings.sense_groups[0] = {
      id: "initial-group",
      name_zh: "旧释义",
      name_en: "Old"
    };
    initialWord.meanings.pos[0]!.senses[0]!.sense_group_id = "initial-group";
    const canonical = word(2, "forms normalized");
    canonical.meanings.sense_groups[0] = {
      id: "projected-group",
      name_zh: "服务端投影释义",
      name_en: "Projected"
    };
    canonical.meanings.pos[0]!.senses[0]!.sense_group_id = "projected-group";
    renderWizard(
      requests({ saveForms: vi.fn(async () => ({ word: canonical })) }),
      {
        initialWord,
        renderStep: (context) => (
          <>
            <output data-testid="forms-save-projected-meaning">
              {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
            </output>
            <output data-testid="forms-save-projected-dirty">
              {String(context.dirtySteps.forms)}/
              {String(context.dirtySteps.meanings)}
            </output>
            <output data-testid="forms-save-projected-revision">
              {context.word.revision}
            </output>
            <button
              type="button"
              onClick={() => context.setDraftForms(editedForms(context))}
            >
              编辑待保存词形
            </button>
            <button
              type="button"
              onClick={() => void context.actions.saveForms("save")}
            >
              保存并投影释义
            </button>
          </>
        )
      }
    );

    fireEvent.click(screen.getByText("编辑待保存词形"));
    fireEvent.click(screen.getByText("保存并投影释义"));

    await waitFor(() =>
      expect(
        screen.getByTestId("forms-save-projected-revision")
      ).toHaveTextContent("2")
    );
    expect(
      screen.getByTestId("forms-save-projected-meaning")
    ).toHaveTextContent("服务端投影释义");
    expect(screen.getByTestId("forms-save-projected-dirty")).toHaveTextContent(
      "false/false"
    );
  });

  it("syncs canonical forms projected by a meanings save when forms are clean", async () => {
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "local-group", name_zh: "待保存释义", name_en: "Local" }
      ],
      pos: []
    };
    const canonical = word(2, "服务端投影词形");
    canonical.meanings.sense_groups[0] = {
      id: "normalized-group",
      name_zh: "服务端规范释义",
      name_en: "Normalized"
    };
    canonical.meanings.pos[0]!.senses[0]!.sense_group_id = "normalized-group";
    renderWizard(
      requests({ saveMeanings: vi.fn(async () => ({ word: canonical })) }),
      {
        renderStep: (context) => (
          <>
            <output data-testid="meanings-save-projected-form">
              {spellingOf(context)}
            </output>
            <output data-testid="meanings-save-normalized-meaning">
              {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
            </output>
            <output data-testid="meanings-save-projected-dirty">
              {String(context.dirtySteps.forms)}/
              {String(context.dirtySteps.meanings)}
            </output>
            <output data-testid="meanings-save-projected-revision">
              {context.word.revision}
            </output>
            <button
              type="button"
              onClick={() => context.setDraftMeanings(localMeanings)}
            >
              编辑待保存释义
            </button>
            <button
              type="button"
              onClick={() =>
                void context.actions.saveMeanings(context.draftMeanings, "save")
              }
            >
              保存并投影词形
            </button>
          </>
        )
      }
    );

    fireEvent.click(screen.getByText("编辑待保存释义"));
    fireEvent.click(screen.getByText("保存并投影词形"));

    await waitFor(() =>
      expect(
        screen.getByTestId("meanings-save-projected-revision")
      ).toHaveTextContent("2")
    );
    expect(
      screen.getByTestId("meanings-save-projected-form")
    ).toHaveTextContent("服务端投影词形");
    expect(
      screen.getByTestId("meanings-save-normalized-meaning")
    ).toHaveTextContent("服务端规范释义");
    expect(
      screen.getByTestId("meanings-save-projected-dirty")
    ).toHaveTextContent("false/false");
  });

  it("clears only the successfully saved step while retaining the other live draft", async () => {
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "local-group", name_zh: "本地释义", name_en: "Local meaning" }
      ],
      pos: []
    };
    const savedMeanings = word(3, "forms saved");
    savedMeanings.meanings.sense_groups = localMeanings.sense_groups;
    savedMeanings.meanings.pos[0]!.senses[0]!.sense_group_id = "local-group";
    const validate = vi.fn(async () => ({
      schema_version: 3 as const,
      validated_revision: 3,
      valid: true,
      issues: []
    }));
    const savedForms = word(2, "forms saved");
    savedForms.meanings = {
      sense_groups: [
        {
          id: "projected-group",
          name_zh: "不应覆盖",
          name_en: "Must not replace"
        }
      ],
      pos: []
    };
    const source = requests({
      saveForms: vi.fn(async () => ({ word: savedForms })),
      saveMeanings: vi.fn(async () => ({ word: savedMeanings })),
      validate
    });
    renderWizard(source, {
      renderStep: (context) => (
        <>
          <output data-testid="step-dirty-state">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <output data-testid="live-meaning-name">
            {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
          </output>
          <output data-testid="mixed-save-revision">
            {context.word.revision}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              context.setDraftMeanings(localMeanings);
            }}
          >
            编辑两步
          </button>
          <button
            type="button"
            onClick={() => void context.actions.saveForms("save")}
          >
            仅保存词形
          </button>
          <button
            type="button"
            onClick={() =>
              void context.actions.saveMeanings(context.draftMeanings, "save")
            }
          >
            仅保存释义
          </button>
          <button type="button" onClick={() => void context.actions.validate()}>
            尝试校验
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑两步"));
    expect(screen.getByTestId("step-dirty-state")).toHaveTextContent(
      "true/true"
    );
    fireEvent.click(screen.getByText("仅保存词形"));

    await waitFor(() =>
      expect(screen.getByTestId("mixed-save-revision")).toHaveTextContent("2")
    );
    expect(screen.getByTestId("step-dirty-state")).toHaveTextContent(
      "false/true"
    );
    expect(screen.getByTestId("live-meaning-name")).toHaveTextContent(
      "本地释义"
    );
    fireEvent.click(screen.getByText("尝试校验"));
    expect(validate).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("仅保存释义"));
    await waitFor(() =>
      expect(screen.getByTestId("mixed-save-revision")).toHaveTextContent("3")
    );
    expect(screen.getByTestId("step-dirty-state")).toHaveTextContent(
      "false/false"
    );
    fireEvent.click(screen.getByText("尝试校验"));
    await waitFor(() => expect(validate).toHaveBeenCalledTimes(1));
  });

  it("saves dirty forms before an ordinary meanings save and uses the accepted revision", async () => {
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "local-group", name_zh: "待规范释义", name_en: "Local" }
      ],
      pos: []
    };
    const initialWord = word();
    const requestOrder: string[] = [];
    let formsCanonical: AdminWordV3 | undefined;
    const saveForms = vi.fn(
      async (
        _wordId: string,
        input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => {
        requestOrder.push(`forms:${input.base_revision}:${input.intent}`);
        formsCanonical = {
          ...initialWord,
          revision: 2,
          forms: input.content
        };
        return { word: formsCanonical };
      }
    );
    const canonical = word(3, "已顺序保存两步");
    canonical.meanings.sense_groups[0] = {
      id: "normalized-group",
      name_zh: "规范后释义",
      name_en: "Normalized"
    };
    canonical.meanings.pos[0]!.senses[0]!.sense_group_id = "normalized-group";
    const saveMeanings = vi.fn(
      async (
        _wordId: string,
        input: Parameters<V3WordRequests["saveMeanings"]>[1]
      ) => {
        requestOrder.push(`meanings:${input.base_revision}:${input.intent}`);
        return { word: { ...canonical, forms: formsCanonical!.forms } };
      }
    );
    renderWizard(requests({ saveForms, saveMeanings }), {
      renderStep: (context) => (
        <>
          <output data-testid="dirty-form-after-meanings-save">
            {spellingOf(context)}
          </output>
          <output data-testid="normalized-meaning-after-save">
            {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
          </output>
          <output data-testid="dirty-form-after-save-state">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <output data-testid="dirty-form-save-revision">
            {context.word.revision}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              context.setDraftMeanings(localMeanings);
            }}
          >
            编辑词形和释义
          </button>
          <button
            type="button"
            onClick={() =>
              void context.actions.saveMeanings(context.draftMeanings, "save")
            }
          >
            顺序保存词形和释义
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑词形和释义"));
    fireEvent.click(screen.getByText("顺序保存词形和释义"));

    await waitFor(() =>
      expect(screen.getByTestId("dirty-form-save-revision")).toHaveTextContent(
        "3"
      )
    );
    expect(requestOrder).toEqual(["forms:1:save", "meanings:2:save"]);
    expect(saveMeanings.mock.calls[0]![1].content).toEqual(localMeanings);
    expect(
      screen.getByTestId("dirty-form-after-meanings-save")
    ).toHaveTextContent("local edit");
    expect(
      screen.getByTestId("normalized-meaning-after-save")
    ).toHaveTextContent("规范后释义");
    expect(screen.getByTestId("dirty-form-after-save-state")).toHaveTextContent(
      "false/false"
    );
  });

  it("stops an ordinary meanings save when dirty forms fail and preserves both drafts", async () => {
    const saveForms = vi.fn(
      async (
        _wordId: string,
        _input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => {
        throw new HttpError(409, "stale", [], "revision_conflict");
      }
    );
    const saveMeanings = vi.fn(async () => envelope(2, "must not save"));
    renderWizard(requests({ saveForms, saveMeanings }), {
      initialStep: "meanings",
      renderStep: (context) => (
        <>
          <output data-testid="ordinary-failure-dirty">
            {String(context.dirtySteps.forms)}/
            {String(context.dirtySteps.meanings)}
          </output>
          <output data-testid="ordinary-failure-spelling">
            {spellingOf(context)}
          </output>
          <button
            type="button"
            onClick={() => {
              context.setDraftForms(editedForms(context));
              const meanings = structuredClone(context.draftMeanings);
              meanings.sense_groups[0]!.name_zh = "普通保存仍需保留";
              context.setDraftMeanings(meanings);
            }}
          >
            编辑普通保存草稿
          </button>
          <button
            type="button"
            onClick={() =>
              void context.actions.saveMeanings(context.draftMeanings, "save")
            }
          >
            普通保存失败
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("编辑普通保存草稿"));
    fireEvent.click(screen.getByText("普通保存失败"));

    expect(
      await screen.findByRole("button", { name: "刷新并比较" })
    ).toBeInTheDocument();
    expect(saveForms).toHaveBeenCalledTimes(1);
    expect(saveForms.mock.calls[0]![1].intent).toBe("save");
    expect(saveMeanings).not.toHaveBeenCalled();
    expect(screen.getByTestId("ordinary-failure-dirty")).toHaveTextContent(
      "true/true"
    );
    expect(screen.getByTestId("ordinary-failure-spelling")).toHaveTextContent(
      "local edit"
    );
  });

  it("does not apply an in-flight publish response after meanings become dirty", async () => {
    let resolvePublish!: (value: AdminWordV3Envelope) => void;
    const publish = vi.fn(
      () =>
        new Promise<AdminWordV3Envelope>((resolve) => {
          resolvePublish = resolve;
        })
    );
    const published = word(2, "published canonical");
    published.status = "published";
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "late-group", name_zh: "发布中编辑", name_en: "Late edit" }
      ],
      pos: []
    };
    renderWizard(requests({ publish }), {
      renderStep: (context) => (
        <>
          <output data-testid="stale-publish-status">
            {context.word.status}
          </output>
          <output data-testid="stale-publish-dirty">
            {String(context.dirtySteps.meanings)}
          </output>
          <output data-testid="stale-publish-meaning">
            {context.draftMeanings.sense_groups[0]?.name_zh ?? "none"}
          </output>
          <button type="button" onClick={() => void context.actions.publish()}>
            延迟发布
          </button>
          <button
            type="button"
            onClick={() => context.setDraftMeanings(localMeanings)}
          >
            发布中编辑释义
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("延迟发布"));
    expect(publish).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("发布中编辑释义"));
    await act(async () => resolvePublish({ word: published }));

    expect(screen.getByTestId("stale-publish-status")).toHaveTextContent(
      "draft"
    );
    expect(screen.getByTestId("stale-publish-dirty")).toHaveTextContent("true");
    expect(screen.getByTestId("stale-publish-meaning")).toHaveTextContent(
      "发布中编辑"
    );
  });

  it("invalidates a confirmed impact token after canonical save advances revision", async () => {
    const impact = vi.fn(async () => ({
      schema_version: 3 as const,
      base_revision: 1,
      requires_confirmation: true,
      confirmation_token: "one-save-only-token",
      affected: []
    }));
    const saveForms = vi
      .fn()
      .mockResolvedValueOnce(envelope(2, "first save"))
      .mockResolvedValueOnce(envelope(3, "second save"));
    renderWizard(requests({ impact, saveForms }), {
      renderStep: (context) => (
        <>
          <output data-testid="token-impact-ready">
            {context.impact ? "ready" : "none"}
          </output>
          <output data-testid="token-save-revision">
            {context.word.revision}
          </output>
          <button
            type="button"
            onClick={() => void context.actions.previewFormsImpact()}
          >
            准备一次性影响
          </button>
          <button
            type="button"
            onClick={() => {
              if (context.actions.confirmImpact()) {
                void context.actions.saveForms("save");
              }
            }}
          >
            确认并保存一次
          </button>
          <button
            type="button"
            onClick={() => void context.actions.saveForms("save")}
          >
            不预览再次保存
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("准备一次性影响"));
    await waitFor(() =>
      expect(screen.getByTestId("token-impact-ready")).toHaveTextContent(
        "ready"
      )
    );
    fireEvent.click(screen.getByText("确认并保存一次"));
    await waitFor(() =>
      expect(screen.getByTestId("token-save-revision")).toHaveTextContent("2")
    );
    fireEvent.click(screen.getByText("不预览再次保存"));
    await waitFor(() => expect(saveForms).toHaveBeenCalledTimes(2));

    expect(saveForms.mock.calls[0]![1]).toMatchObject({
      confirmed_impact_token: "one-save-only-token"
    });
    expect(saveForms.mock.calls[1]![1]).not.toHaveProperty(
      "confirmed_impact_token"
    );
    expect(saveForms.mock.calls[1]![1]).not.toHaveProperty(
      "confirmed_surface_match_token"
    );
  });

  it("invalidates prepared forms tokens after a meanings save advances canonical revision", async () => {
    const impact = vi.fn(async () => ({
      schema_version: 3 as const,
      base_revision: 1,
      requires_confirmation: true,
      confirmation_token: "pre-meanings-save-token",
      affected: []
    }));
    const saveForms = vi.fn(
      async (
        _wordId: string,
        _input: Parameters<V3WordRequests["saveForms"]>[1]
      ) => envelope(3, "forms saved later")
    );
    const localMeanings: DraftMeaningsStepContentWritableV3 = {
      sense_groups: [
        { id: "local-group", name_zh: "推进 revision", name_en: "Advance" }
      ],
      pos: []
    };
    renderWizard(
      requests({
        impact,
        saveMeanings: vi.fn(async () => envelope(2, "meanings saved")),
        saveForms
      }),
      {
        renderStep: (context) => (
          <>
            <output data-testid="meanings-token-impact-ready">
              {context.impact ? "ready" : "none"}
            </output>
            <output data-testid="meanings-token-revision">
              {context.word.revision}
            </output>
            <button
              type="button"
              onClick={() => void context.actions.previewFormsImpact()}
            >
              准备跨步骤 token
            </button>
            <button
              type="button"
              onClick={() => context.actions.confirmImpact()}
            >
              确认跨步骤 token
            </button>
            <button
              type="button"
              onClick={() =>
                void context.actions.saveMeanings(localMeanings, "save")
              }
            >
              保存释义推进 revision
            </button>
            <button
              type="button"
              onClick={() => void context.actions.saveForms("save")}
            >
              revision 后保存词形
            </button>
          </>
        )
      }
    );

    fireEvent.click(screen.getByText("准备跨步骤 token"));
    await waitFor(() =>
      expect(
        screen.getByTestId("meanings-token-impact-ready")
      ).toHaveTextContent("ready")
    );
    fireEvent.click(screen.getByText("确认跨步骤 token"));
    fireEvent.click(screen.getByText("保存释义推进 revision"));
    await waitFor(() =>
      expect(screen.getByTestId("meanings-token-revision")).toHaveTextContent(
        "2"
      )
    );
    fireEvent.click(screen.getByText("revision 后保存词形"));
    await waitFor(() => expect(saveForms).toHaveBeenCalledTimes(1));

    expect(saveForms.mock.calls[0]![1]).toMatchObject({ base_revision: 2 });
    expect(saveForms.mock.calls[0]![1]).not.toHaveProperty(
      "confirmed_impact_token"
    );
    expect(saveForms.mock.calls[0]![1]).not.toHaveProperty(
      "confirmed_surface_match_token"
    );
  });

  it("uses the save flow synchronous lock for same-tick duplicate commands", async () => {
    let resolve!: (value: AdminWordV3Envelope) => void;
    const saveForms = vi.fn(
      () =>
        new Promise<AdminWordV3Envelope>((done) => {
          resolve = done;
        })
    );
    const impact = vi.fn(async () => ({
      schema_version: 3 as const,
      base_revision: 2,
      requires_confirmation: false,
      affected: []
    }));
    const publish = vi.fn(async () => envelope(3, "published"));
    renderWizard(requests({ saveForms, impact, publish }));

    fireEvent.click(screen.getByText("双击保存"));
    expect(saveForms).toHaveBeenCalledTimes(1);
    await act(async () => resolve(envelope(2, "saved")));
    fireEvent.click(screen.getByText("保存"));
    expect(saveForms).toHaveBeenCalledTimes(2);
    await waitFor(() =>
      expect(screen.getByTestId("revision")).toHaveTextContent("2")
    );

    fireEvent.click(screen.getByText("双击影响预览"));
    expect(impact).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(impact).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText("双击发布"));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("does not write a pending response after POS supersede or unmount", async () => {
    const resolvers: Array<(value: AdminWordV3Envelope) => void> = [];
    const saveForms = vi.fn(
      () =>
        new Promise<AdminWordV3Envelope>((done) => {
          resolvers.push(done);
        })
    );
    const onWordChange = vi.fn();
    const view = renderWizard(requests({ saveForms }), { onWordChange });

    fireEvent.click(screen.getByText("保存"));
    fireEvent.click(screen.getByText("切换词性"));
    await act(async () => resolvers[0]!(envelope(2, "stale")));
    expect(screen.getByTestId("revision")).toHaveTextContent("1");
    expect(onWordChange).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("保存"));
    view.unmount();
    await act(async () => resolvers[1]!(envelope(3, "after unmount")));
    expect(onWordChange).not.toHaveBeenCalled();
  });

  it.each([
    "save_forms",
    "save_meanings",
    "impact",
    "validate",
    "publish"
  ] as const)(
    "refreshes an archived canonical after %s returns entry_archived and blocks the stale action",
    async (command) => {
      const archived = word(6, "archived canonical");
      archived.status = "archived";
      archived.archived_at = "2026-08-25T12:00:00Z";
      archived.archived_by = "admin-2";
      const rejected = vi
        .fn()
        .mockRejectedValue(
          new HttpError(409, "entry archived", [], "entry_archived")
        );
      const source = requests({
        ...(command === "save_forms" ? { saveForms: rejected } : {}),
        ...(command === "save_meanings" ? { saveMeanings: rejected } : {}),
        ...(command === "impact" ? { impact: rejected } : {}),
        ...(command === "validate" ? { validate: rejected } : {}),
        ...(command === "publish" ? { publish: rejected } : {}),
        get: vi.fn().mockResolvedValue({
          word: archived,
          retired_stable_nodes: []
        })
      });
      renderWizard(source, {
        renderStep: (context) => (
          <>
            <output data-testid="archived-command-status">
              {context.word.status}
            </output>
            <output data-testid="archived-command-readonly">
              {String(context.readOnly)}
            </output>
            <button
              type="button"
              onClick={() => {
                if (command === "save_forms") {
                  void context.actions.saveForms("save");
                } else if (command === "save_meanings") {
                  void context.actions.saveMeanings(
                    context.draftMeanings,
                    "save"
                  );
                } else if (command === "impact") {
                  void context.actions.previewFormsImpact();
                } else if (command === "validate") {
                  void context.actions.validate();
                } else {
                  void context.actions.publish();
                }
              }}
            >
              触发归档命令
            </button>
          </>
        )
      });

      fireEvent.click(screen.getByText("触发归档命令"));

      await waitFor(() =>
        expect(screen.getByTestId("archived-command-status")).toHaveTextContent(
          "archived"
        )
      );
      expect(screen.getByTestId("archived-command-readonly")).toHaveTextContent(
        "true"
      );
      expect(source.get).toHaveBeenCalledWith("word-1");
      expect(rejected).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("触发归档命令"));
      expect(rejected).toHaveBeenCalledTimes(1);
    }
  );

  it("restarts an archived canonical refresh after a newer dirty edit and preserves that draft", async () => {
    const archived = word(7, "archived after concurrent edit");
    archived.status = "archived";
    archived.archived_at = "2026-08-25T12:00:00Z";
    archived.archived_by = "admin-2";
    let resolveFirstGet!: (value: AdminWordDraftV3Envelope) => void;
    const get = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AdminWordDraftV3Envelope>((resolve) => {
            resolveFirstGet = resolve;
          })
      )
      .mockResolvedValue({ word: archived, retired_stable_nodes: [] });
    const saveForms = vi
      .fn()
      .mockRejectedValue(
        new HttpError(409, "entry archived", [], "entry_archived")
      );
    renderWizard(requests({ get, saveForms }), {
      renderStep: (context) => {
        const setSpelling = (spelling: string) => {
          const next = structuredClone(context.draftForms);
          const variants = next.pos[0]!.forms[0]!.regional_variants;
          if (variants.mode === "common") variants.common.spelling = spelling;
          context.setDraftForms(next);
        };
        return (
          <>
            <output data-testid="archived-dirty-status">
              {context.word.status}/{String(context.readOnly)}
            </output>
            <output data-testid="archived-dirty-spelling">
              {spellingOf(context)}/{String(context.dirtySteps.forms)}
            </output>
            <button type="button" onClick={() => setSpelling("first edit")}>
              第一次编辑
            </button>
            <button
              type="button"
              onClick={() => void context.actions.saveForms("save")}
            >
              保存触发归档
            </button>
            <button type="button" onClick={() => setSpelling("latest edit")}>
              刷新中继续编辑
            </button>
          </>
        );
      }
    });

    fireEvent.click(screen.getByText("第一次编辑"));
    fireEvent.click(screen.getByText("保存触发归档"));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByText("刷新中继续编辑"));
    await act(async () =>
      resolveFirstGet({ word: archived, retired_stable_nodes: [] })
    );

    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId("archived-dirty-status")).toHaveTextContent(
        "archived/true"
      )
    );
    expect(screen.getByTestId("archived-dirty-spelling")).toHaveTextContent(
      "latest edit/true"
    );
  });

  it("keeps archived commands fail-closed until a failed canonical GET is retried", async () => {
    const archived = word(8, "archived after retry");
    archived.status = "archived";
    archived.archived_at = "2026-08-25T12:00:00Z";
    archived.archived_by = "admin-2";
    const get = vi
      .fn()
      .mockRejectedValueOnce(new HttpError(500, "refresh failed"))
      .mockResolvedValueOnce({ word: archived, retired_stable_nodes: [] });
    const saveForms = vi
      .fn()
      .mockRejectedValue(
        new HttpError(409, "entry archived", [], "entry_archived")
      );
    renderWizard(requests({ get, saveForms }), {
      renderStep: (context) => (
        <>
          <output data-testid="archived-retry-status">
            {context.word.status}
          </output>
          <button
            type="button"
            onClick={() => void context.actions.saveForms("save")}
          >
            保存并刷新归档态
          </button>
        </>
      )
    });

    fireEvent.click(screen.getByText("保存并刷新归档态"));
    expect(await screen.findByText("服务暂时不可用")).toBeInTheDocument();
    fireEvent.click(screen.getByText("保存并刷新归档态"));
    expect(saveForms).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    await waitFor(() =>
      expect(screen.getByTestId("archived-retry-status")).toHaveTextContent(
        "archived"
      )
    );
    expect(get).toHaveBeenCalledTimes(2);
    expect(saveForms).toHaveBeenCalledTimes(1);
  });
});
