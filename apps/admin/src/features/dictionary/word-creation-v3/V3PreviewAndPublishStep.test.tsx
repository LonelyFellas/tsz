import { HttpError } from "@tsz/api-client";
import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  FormsImpactResponseV3,
  PublishAdminWordV3Input,
  SurfaceMatchPageV3,
  V3DraftValidationIssue
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
import {
  commonFormFixture,
  formsFixture,
  pronunciationFixture,
  ukUsFormFixture,
  uuidFromInt,
  UUIDS
} from "./fixtures";
import { createV3SaveFlow } from "./saveFlow";
import {
  V3PreviewAndPublishStep,
  type V3PreviewPublishController
} from "./V3PreviewAndPublishStep";

function peerForms(): DraftFormsStepContentV3 {
  const first = commonFormFixture({ spelling: "learn", form_type: "base" });
  const second = commonFormFixture({
    id: UUIDS.form_2,
    variant_id: UUIDS.common_variant_2,
    spelling: "learnt",
    form_type: "base"
  });
  return formsFixture({ forms: [first, second] });
}

function word(
  publication: AdminWordV3["capabilities"]["publication"] = {
    mode: "shadow_only",
    blocked_code: "phase2_consumers_not_ready"
  }
): AdminWordV3 {
  return {
    schema_version: 3,
    id: "word-v3",
    language: "en",
    kind: "word",
    status: "draft",
    revision: 7,
    lifecycle_revision: 2,
    has_unpublished_changes: true,
    presentation: {
      label: "learn / learnt",
      matched_surfaces: ["learn", "learnt"],
      strategy_version: "surface_summary_v1"
    },
    capabilities: {
      publication,
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    compatibility: {
      legacy_headwords: { mode: "unified", common: "legacy-learn" }
    },
    forms: peerForms(),
    meanings: { sense_groups: [], pos: [] },
    completed_steps: ["basics", "forms", "meanings"],
    max_reachable_step: "preview",
    created_by: "admin-1",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
}

function surfacePage(
  nextCursor: string | null,
  tokens: { surface?: string; impact?: string } = {}
): SurfaceMatchPageV3 {
  return {
    schema_version: 3,
    snapshot_id: "impact-snapshot",
    items: [],
    total: 0,
    matched_entry_contexts: [],
    confirmation_reasons: ["unacknowledged_surface_matches"],
    policy_name: "surface_warning_acknowledgement",
    policy_epoch: 8,
    continuation_policy: "enabled",
    next_cursor: nextCursor,
    ...(nextCursor === null
      ? {
          surface_confirmation_token: tokens.surface ?? "surface-token",
          ...(tokens.impact ? { impact_confirmation_token: tokens.impact } : {})
        }
      : {})
  } as SurfaceMatchPageV3;
}

function allowedRequests(overrides: Record<string, unknown> = {}) {
  return {
    get: vi.fn().mockResolvedValue({
      word: word({ mode: "migration_canary", whitelisted: true }),
      retired_stable_nodes: []
    }),
    validate: vi.fn().mockResolvedValue({
      schema_version: 3,
      validated_revision: 7,
      valid: true,
      issues: []
    }),
    impact: vi.fn().mockResolvedValue({
      schema_version: 3,
      base_revision: 7,
      requires_confirmation: false,
      affected: []
    } satisfies FormsImpactResponseV3),
    surfacePage: vi.fn(),
    publish: vi.fn().mockResolvedValue({
      word: {
        ...word({ mode: "migration_canary", whitelisted: true }),
        status: "published",
        revision: 8
      }
    }),
    ...overrides
  };
}

function validationIssue(): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id: UUIDS.form,
    field: "form_type",
    code: "invalid_form_type_for_part_of_speech",
    message: "form type is not allowed",
    node_location: {
      node_role: "concrete_form",
      ancestor_node_ids: [UUIDS.pos],
      pos_id: UUIDS.pos,
      form_id: UUIDS.form,
      form_type: "base"
    }
  };
}

describe("V3PreviewAndPublishStep", () => {
  it("uses only controlled Wizard state/actions and never creates a second request flow", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    let resolvePublish!: () => void;
    const publish = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePublish = resolve;
        })
    );
    const controller: V3PreviewPublishController = {
      validation: {
        schema_version: 3,
        validated_revision: 7,
        valid: true,
        issues: []
      },
      impact: {
        schema_version: 3,
        base_revision: 7,
        requires_confirmation: false,
        affected: []
      },
      issues: [],
      isPending: () => false,
      actions: {
        validate: vi.fn().mockResolvedValue({
          schema_version: 3,
          validated_revision: 7,
          valid: true,
          issues: []
        }),
        previewFormsImpact: vi.fn().mockResolvedValue({
          schema_version: 3,
          base_revision: 7,
          requires_confirmation: false,
          affected: []
        }),
        publish
      }
    };
    const directRequests = allowedRequests();
    const createFlow = vi.fn(() => createV3SaveFlow(current));

    render(
      <V3PreviewAndPublishStep
        word={current}
        controller={controller}
        requests={directRequests}
        createFlow={createFlow}
      />
    );
    expect(screen.getByText("影响预览：0 项")).toBeInTheDocument();
    expect(screen.getByText("未发现需要确认的影响。")).toBeInTheDocument();
    expect(screen.queryByTestId(/^impact-item-/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    await waitFor(() =>
      expect(controller.actions.validate).toHaveBeenCalledTimes(1)
    );
    expect(controller.actions.previewFormsImpact).toHaveBeenCalledTimes(1);
    expect(directRequests.validate).not.toHaveBeenCalled();
    expect(directRequests.impact).not.toHaveBeenCalled();
    expect(createFlow).not.toHaveBeenCalled();

    const publishButton = screen.getByRole("button", { name: "发布词条" });
    fireEvent.click(publishButton);
    fireEvent.click(publishButton);
    expect(publish).toHaveBeenCalledTimes(1);
    resolvePublish();
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
    expect(directRequests.publish).not.toHaveBeenCalled();
  });

  it("renders every base as a peer and stably blocks shadow-only publication", () => {
    render(
      <V3PreviewAndPublishStep
        word={word()}
        requests={allowedRequests()}
        onPublished={vi.fn()}
      />
    );

    expect(screen.getByText("learn")).toBeInTheDocument();
    expect(screen.getByText("learnt")).toBeInTheDocument();
    expect(screen.getAllByText("原形")).toHaveLength(2);
    expect(screen.queryByText(/主词|主形|主原形/)).not.toBeInTheDocument();
    expect(
      screen.getByText("学习端尚未完成该词条结构的发布准备。")
    ).toBeInTheDocument();
    expect(screen.queryByText("phase2_consumers_not_ready")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /发布/ })
    ).not.toBeInTheDocument();
  });

  it("renders group membership order, shared forms once, regional sides, and every pronunciation style", () => {
    const shared = commonFormFixture({
      spelling: "centre",
      pronunciations: [
        pronunciationFixture({
          id: UUIDS.pronunciation,
          style: "normal",
          dict_phonetic: "sen-tre",
          actual_pron: "centre"
        }),
        pronunciationFixture({
          id: UUIDS.pronunciation_2,
          style: "strong",
          dict_phonetic: "sen-tr",
          actual_pron: "centr"
        })
      ]
    });
    const regional = ukUsFormFixture({
      uk: {
        pronunciations: [
          pronunciationFixture({
            id: uuidFromInt(904),
            style: "normal",
            dict_phonetic: "sen-tre-uk",
            actual_pron: "centre-uk"
          })
        ]
      },
      us: {
        pronunciations: [
          pronunciationFixture({
            id: UUIDS.pronunciation_3,
            style: "weak",
            dict_phonetic: "sen-ter",
            actual_pron: "center"
          })
        ]
      }
    });
    const current = word();
    current.forms = formsFixture({
      forms: [shared, regional],
      groups: [
        {
          id: UUIDS.group,
          is_regular: true,
          members: [
            { id: UUIDS.membership, form_id: shared.id },
            { id: UUIDS.membership_2, form_id: regional.id }
          ]
        },
        {
          id: UUIDS.group_2,
          is_regular: false,
          members: [{ id: UUIDS.membership_3, form_id: shared.id }]
        }
      ]
    });

    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests()}
        onPublished={vi.fn()}
      />
    );

    expect(
      screen.getByTestId(`preview-group-${UUIDS.group}`)
    ).toHaveTextContent("变化组 1");
    expect(
      screen.getByTestId(`preview-group-${UUIDS.group_2}`)
    ).toHaveTextContent("变化组 2");
    expect(
      screen.getByTestId(`preview-membership-${UUIDS.membership}`)
    ).toHaveTextContent("1. 原形 · centre");
    expect(
      screen.getByTestId(`preview-membership-${UUIDS.membership_3}`)
    ).toHaveTextContent("1. 原形 · centre");
    expect(screen.getAllByTestId(`preview-form-${shared.id}`)).toHaveLength(1);
    expect(screen.getByTestId(`preview-form-${regional.id}`)).toHaveTextContent(
      "英式"
    );
    expect(screen.getByTestId(`preview-form-${regional.id}`)).toHaveTextContent(
      "美式"
    );
    expect(
      screen.getByTestId(`preview-pronunciation-${UUIDS.pronunciation}`)
    ).toHaveTextContent("常规 · 词典音标 sen-tre · 实际发音 centre");
    expect(
      screen.getByTestId(`preview-pronunciation-${UUIDS.pronunciation_2}`)
    ).toHaveTextContent("强读 · 词典音标 sen-tr · 实际发音 centr");
    expect(
      screen.getByTestId(`preview-pronunciation-${UUIDS.pronunciation_3}`)
    ).toHaveTextContent("弱读 · 词典音标 sen-ter · 实际发音 center");
    expect(
      screen.getByTestId(`preview-pronunciation-${uuidFromInt(904)}`)
    ).toHaveTextContent("常规 · 词典音标 sen-tre-uk · 实际发音 centre-uk");
  });

  it("keeps an empty group list and an empty pronunciation list explicit", () => {
    const formWithoutPronunciation = commonFormFixture({
      spelling: "plain",
      pronunciations: []
    });
    const formWithPendingStyle = commonFormFixture({
      id: UUIDS.form_2,
      variant_id: UUIDS.common_variant_2,
      spelling: "pending-style",
      pronunciations: [
        pronunciationFixture({
          id: uuidFromInt(905),
          style: undefined,
          dict_phonetic: "pending-phonetic",
          actual_pron: "pending-pronunciation"
        })
      ]
    });
    const current = word();
    current.forms = formsFixture({
      forms: [formWithoutPronunciation, formWithPendingStyle],
      groups: []
    });

    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests()}
        onPublished={vi.fn()}
      />
    );

    expect(screen.getByText("暂无变化组")).toBeInTheDocument();
    expect(
      screen.getByTestId(`preview-form-${formWithoutPronunciation.id}`)
    ).toHaveTextContent("原形");
    expect(
      screen.getByTestId(`preview-form-${formWithoutPronunciation.id}`)
    ).toHaveTextContent("通用");
    expect(
      screen.getByTestId(`preview-form-${formWithoutPronunciation.id}`)
    ).toHaveTextContent("plain");
    expect(screen.getByText("暂无发音")).toBeInTheDocument();
    expect(
      screen.getByTestId(`preview-pronunciation-${uuidFromInt(905)}`)
    ).toHaveTextContent(
      "未选择发音方式 · 词典音标 pending-phonetic · 实际发音 pending-pronunciation"
    );
  });

  it("缺失成员、空音标与未入灰度能力使用产品回退", () => {
    const current = word({ mode: "migration_canary", whitelisted: false });
    const form = commonFormFixture({
      pronunciations: [
        pronunciationFixture({
          id: uuidFromInt(906),
          style: "normal",
          dict_phonetic: "",
          actual_pron: ""
        })
      ]
    });
    current.forms = formsFixture({
      forms: [form],
      groups: [
        {
          id: uuidFromInt(907),
          is_regular: false,
          members: [{ id: uuidFromInt(908), form_id: "missing-form-id" }]
        }
      ]
    });

    render(<V3PreviewAndPublishStep word={current} onPublished={vi.fn()} />);

    expect(
      screen.getByTestId(`preview-membership-${uuidFromInt(908)}`)
    ).toHaveTextContent("1. 未知词形");
    expect(
      screen.getByTestId(`preview-pronunciation-${uuidFromInt(906)}`)
    ).toHaveTextContent("常规");
    expect(
      screen.getByText("该词条暂未进入允许发布的迁移范围。")
    ).toBeVisible();
  });

  it("受控校验问题统一按稳定 code 展示中文并隐藏内部代码", () => {
    const controller: V3PreviewPublishController = {
      issues: [
        { ...validationIssue(), message: "词形内容需要修正" },
        { ...validationIssue(), node_id: UUIDS.form_2 }
      ],
      isPending: () => false,
      actions: {
        validate: vi.fn(),
        previewFormsImpact: vi.fn(),
        publish: vi.fn()
      }
    };
    render(
      <V3PreviewAndPublishStep
        word={word({ mode: "migration_canary", whitelisted: true })}
        controller={controller}
      />
    );

    expect(screen.getByText("发布校验未通过")).toBeVisible();
    expect(screen.getByText("当前词性不支持该词形类型")).toBeVisible();
    expect(screen.queryByText(/词形内容需要修正/)).toBeNull();
    expect(
      screen.queryByText("invalid_form_type_for_part_of_speech")
    ).toBeNull();
  });

  it("按原始总数、基本词性和问题类型汇总重复校验项并定位首项", () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const positions = [
      { code: "adjective", id: uuidFromInt(1001), count: 8 },
      { code: "noun", id: uuidFromInt(1002), count: 10 },
      { code: "verb", id: uuidFromInt(1003), count: 11 }
    ];
    current.forms = {
      pos: positions.map(({ code, id }) => ({
        ...formsFixture({ pos: code, pos_id: id }).pos[0]!,
        pos: code,
        pos_id: id
      }))
    };
    const issues = positions.flatMap(({ id, count }, positionIndex) =>
      Array.from({ length: count }, (_, issueIndex) => {
        const pronunciationId = uuidFromInt(
          1100 + positionIndex * 20 + issueIndex
        );
        return {
          schema_version: 3,
          step: "forms",
          node_id: pronunciationId,
          field: "actual_pron",
          code: "pronunciation_required",
          message: "actual pronunciation is missing",
          node_location: {
            node_role: "pronunciation",
            ancestor_node_ids: [id],
            pos_id: id,
            form_id: current.forms.pos[positionIndex]!.forms[0]!.id,
            form_type: "base",
            pronunciation_id: pronunciationId
          }
        } satisfies V3DraftValidationIssue;
      })
    );
    const navigateIssue = vi.fn();
    const controller: V3PreviewPublishController = {
      issues,
      isPending: () => false,
      actions: {
        validate: vi.fn(),
        previewFormsImpact: vi.fn(),
        publish: vi.fn(),
        navigateIssue
      }
    };

    render(<V3PreviewAndPublishStep word={current} controller={controller} />);

    const summary = screen.getByRole("region", {
      name: "发布待完成摘要"
    });
    expect(
      within(summary).getByRole("heading", { name: "还有 29 项待完成" })
    ).toBeVisible();
    expect(
      within(summary).getByTestId("issue-pos-adjective")
    ).toHaveTextContent("形容词8 项待完成");
    expect(within(summary).getByTestId("issue-pos-noun")).toHaveTextContent(
      "名词10 项待完成"
    );
    expect(within(summary).getByTestId("issue-pos-verb")).toHaveTextContent(
      "动词11 项待完成"
    );
    expect(
      within(summary).getAllByText("请完整填写发音方式、字典音标和实际发音", {
        exact: true
      })
    ).toHaveLength(1);

    fireEvent.click(
      within(summary).getByRole("button", { name: "填写形容词未完成项" })
    );
    expect(navigateIssue).toHaveBeenCalledWith(issues[0]);
  });

  it("passes an inferred non-current POS to publication issue navigation", () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const verbPosId = uuidFromInt(1301);
    current.forms.pos.push(
      formsFixture({ pos: "verb", pos_id: verbPosId }).pos[0]!
    );
    current.meanings.pos = [
      {
        pos_id: verbPosId,
        grammar_structures: [],
        senses: [
          {
            id: uuidFromInt(1302),
            sub_pos: "transitive",
            level: "A1",
            depends_on_context: false,
            definitions: [],
            sentences: [],
            relations: []
          }
        ]
      }
    ];
    const issue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "meanings",
      node_id: uuidFromInt(1302),
      field: "definitions",
      code: "definition_required",
      message: "definition is required",
      node_location: {
        node_role: "sense",
        ancestor_node_ids: []
      }
    };
    const navigateIssue = vi.fn();

    render(
      <V3PreviewAndPublishStep
        word={current}
        controller={{
          issues: [issue],
          isPending: () => false,
          actions: {
            validate: vi.fn(),
            previewFormsImpact: vi.fn(),
            publish: vi.fn(),
            navigateIssue
          }
        }}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "填写动词未完成项" }));
    expect(navigateIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        node_location: expect.objectContaining({ pos_id: verbPosId })
      })
    );
  });

  it("shows every concrete impact item instead of only the affected count", () => {
    const affected: FormsImpactResponseV3["affected"] = [
      { node_type: "sense", node_id: "sense-1", reason: "词义仍引用词形" },
      {
        node_type: "sentence",
        node_id: "sentence-1",
        reason: "例句仍引用词形"
      },
      {
        node_type: "relation",
        node_id: "relation-1",
        reason: "关系仍引用词形"
      },
      {
        node_type: "surface",
        node_id: "surface-1",
        reason: "同形面发生变化"
      },
      {
        node_type: "publication",
        node_id: "publication-1",
        reason: "已发布快照受影响"
      }
    ];
    const controller: V3PreviewPublishController = {
      validation: {
        schema_version: 3,
        validated_revision: 7,
        valid: true,
        issues: []
      },
      impact: {
        schema_version: 3,
        base_revision: 7,
        requires_confirmation: false,
        affected
      },
      issues: [],
      isPending: () => false,
      actions: {
        validate: vi.fn(),
        previewFormsImpact: vi.fn(),
        publish: vi.fn()
      }
    };

    render(
      <V3PreviewAndPublishStep
        word={word({ mode: "migration_canary", whitelisted: true })}
        controller={controller}
      />
    );

    for (const item of affected) {
      const impactItem = screen.getByTestId(
        `impact-item-${item.node_type}-${item.node_id}`
      );
      expect(impactItem).toHaveTextContent(item.reason);
      expect(impactItem).not.toHaveTextContent(item.node_id);
    }
  });

  it("shows publish controls for native or a whitelisted migration canary", () => {
    const { rerender } = render(
      <V3PreviewAndPublishStep
        word={word({
          mode: "migration_canary",
          whitelisted: false,
          blocked_code: "migration_canary_not_whitelisted"
        })}
        requests={allowedRequests()}
        onPublished={vi.fn()}
      />
    );
    expect(
      screen.getByText("该词条暂未进入允许发布的迁移范围。")
    ).toBeInTheDocument();
    expect(screen.queryByText("migration_canary_not_whitelisted")).toBeNull();
    expect(
      screen.queryByRole("button", { name: /发布/ })
    ).not.toBeInTheDocument();

    rerender(
      <V3PreviewAndPublishStep
        word={word({ mode: "migration_canary", whitelisted: true })}
        requests={allowedRequests()}
        onPublished={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "检查发布条件" })
    ).toBeInTheDocument();

    rerender(
      <V3PreviewAndPublishStep
        word={word({ mode: "native" })}
        requests={allowedRequests()}
        onPublished={vi.fn()}
      />
    );
    expect(
      screen.getByRole("button", { name: "检查发布条件" })
    ).toBeInTheDocument();
  });

  it("loads paged impact confirmation and binds both pages through the V3 save flow", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const impact = {
      schema_version: 3,
      base_revision: 7,
      requires_confirmation: true,
      affected: [
        { node_id: UUIDS.form, node_type: "form", reason: "referenced" }
      ],
      surface_match_page: surfacePage("cursor-2")
    } satisfies FormsImpactResponseV3;
    const requests = allowedRequests({
      impact: vi.fn().mockResolvedValue(impact),
      surfacePage: vi
        .fn()
        .mockResolvedValue(
          surfacePage(null, { surface: "surface-2", impact: "impact-2" })
        )
    });
    const flow = createV3SaveFlow(current);
    const bindFirst = vi.spyOn(flow, "bindImpactConfirmation");
    const bindTerminal = vi.spyOn(flow, "bindImpactSurfaceConfirmation");

    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        flow={flow}
        onPublished={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));

    await waitFor(() =>
      expect(bindFirst).toHaveBeenCalledWith(impact, current.forms)
    );
    await waitFor(() =>
      expect(requests.surfacePage).toHaveBeenCalledWith(
        "impact-snapshot",
        "cursor-2",
        expect.any(AbortSignal)
      )
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "确认影响并允许发布" })
    );
    expect(bindTerminal).toHaveBeenCalledWith(
      expect.objectContaining({
        next_cursor: null,
        surface_confirmation_token: "surface-2",
        impact_confirmation_token: "impact-2"
      })
    );
    expect(screen.getByRole("button", { name: "发布词条" })).toBeEnabled();
  });

  it("keeps compatibility read-only, omits it from publish, and single-flights a double click", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    let resolvePublish!: (value: { word: AdminWordV3 }) => void;
    const publish = vi.fn(
      (
        _wordId: string,
        _idempotencyKey: string,
        _input: PublishAdminWordV3Input
      ) =>
        new Promise<{ word: AdminWordV3 }>((resolve) => {
          resolvePublish = resolve;
        })
    );
    const requests = allowedRequests({ publish });

    render(
      <StrictMode>
        <V3PreviewAndPublishStep
          word={current}
          requests={requests}
          onPublished={vi.fn()}
        />
      </StrictMode>
    );
    expect(screen.queryByText("legacy-learn")).toBeNull();
    expect(screen.queryByText("兼容桥（只读）")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    expect(await screen.findByText("影响预览：0 项")).toBeInTheDocument();
    expect(screen.getByText("未发现需要确认的影响。")).toBeInTheDocument();
    expect(screen.queryByTestId(/^impact-item-/)).toBeNull();
    const publishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(publishButton);
    fireEvent.click(publishButton);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0]?.[2]).toEqual({
      schema_version: 3,
      base_revision: 7
    });
    expect(JSON.stringify(publish.mock.calls[0]?.[2])).not.toContain(
      "compatibility"
    );

    resolvePublish({ word: { ...current, revision: 8, status: "published" } });
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(1));
  });

  it("reuses the standalone publish key when the main entry retries an unknown outcome", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const publish = vi
      .fn<
        (
          wordId: string,
          idempotencyKey: string,
          input: PublishAdminWordV3Input
        ) => Promise<{ word: AdminWordV3 }>
      >()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ word: { ...current, revision: 8 } });

    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests({ publish })}
        onPublished={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    const publishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(publishButton);
    expect(
      await screen.findByText("网络异常，发布失败，可原样重试。")
    ).toBeInTheDocument();
    fireEvent.click(publishButton);
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));

    expect(publish.mock.calls[1]?.[1]).toBe(publish.mock.calls[0]?.[1]);
  });

  it("starts a new standalone publish key after a known successful response", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const publish = vi
      .fn<
        (
          wordId: string,
          idempotencyKey: string,
          input: PublishAdminWordV3Input
        ) => Promise<{ word: AdminWordV3 }>
      >()
      .mockResolvedValueOnce({ word: { ...current, revision: 8 } })
      .mockResolvedValueOnce({ word: { ...current, revision: 9 } });
    const onPublished = vi.fn();

    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests({ publish })}
        onPublished={onPublished}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    const publishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(publishButton);
    await waitFor(() => expect(onPublished).toHaveBeenCalledTimes(1));
    fireEvent.click(publishButton);
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));

    expect(publish.mock.calls[1]?.[1]).not.toBe(publish.mock.calls[0]?.[1]);
  });

  it("paginates a publication surface warning, retries with its bound token, and preserves preview on failure", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const warning = new HttpError(
      409,
      "surface warning",
      [],
      "surface_match_acknowledgement_required",
      [],
      { surface_match_page: surfacePage("cursor-2") }
    );
    const publish = vi
      .fn<
        (
          wordId: string,
          idempotencyKey: string,
          input: PublishAdminWordV3Input
        ) => Promise<{ word: AdminWordV3 }>
      >()
      .mockRejectedValueOnce(warning)
      .mockRejectedValueOnce(new TypeError("offline"));
    const requests = allowedRequests({
      publish,
      surfacePage: vi
        .fn()
        .mockResolvedValue(surfacePage(null, { surface: "publish-token" }))
    });

    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        onPublished={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /检查发布条件/ }));
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));

    const retry = await screen.findByRole("button", {
      name: "确认同形提示并重试发布"
    });
    await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry);
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(publish.mock.calls[1]?.[2]).toEqual({
      schema_version: 3,
      base_revision: 7,
      confirmed_surface_match_token: "publish-token"
    });
    expect(
      await screen.findByText("网络异常，发布失败，可原样重试。")
    ).toBeInTheDocument();
    expect(screen.getByText("learn / learnt")).toBeInTheDocument();
    expect(screen.queryByText("legacy-learn")).toBeNull();
  });

  it("renders a distinguish bridge and UK/US variants without deriving either into a request", () => {
    const current = word();
    current.compatibility = {
      legacy_headwords: {
        mode: "distinguish",
        uk: "legacy-uk",
        us: "legacy-us",
        source_dialect: "uk"
      }
    };
    current.forms = formsFixture({
      forms: [
        {
          id: UUIDS.form,
          form_type: "base",
          regional_variants: {
            mode: "uk_us",
            uk: {
              id: UUIDS.uk_variant,
              dialect: "uk",
              spelling: "colour",
              origin: "manual",
              pronunciations: []
            },
            us: {
              id: UUIDS.us_variant,
              dialect: "us",
              spelling: "color",
              origin: "manual",
              pronunciations: []
            }
          }
        }
      ]
    });
    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests()}
        onPublished={vi.fn()}
      />
    );
    expect(screen.queryByText("UK legacy-uk / US legacy-us")).toBeNull();
    expect(screen.getByText("colour")).toBeInTheDocument();
    expect(screen.getByText("color")).toBeInTheDocument();
  });

  it("renders authoritative V3 validation issues and does not preview impact", async () => {
    const issue = validationIssue();
    const requests = allowedRequests({
      validate: vi.fn().mockResolvedValue({
        schema_version: 3,
        validated_revision: 7,
        valid: false,
        issues: [issue]
      })
    });
    render(
      <V3PreviewAndPublishStep
        word={word({ mode: "migration_canary", whitelisted: true })}
        requests={requests}
        onPublished={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: /检查发布条件/ }));
    expect(
      await screen.findByText("当前词性不支持该词形类型")
    ).toBeInTheDocument();
    expect(requests.impact).not.toHaveBeenCalled();
  });

  it("clears a standalone publish attempt and prepared state after a 422", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const issue = validationIssue();
    const publish = vi
      .fn()
      .mockRejectedValueOnce(
        new HttpError(422, "invalid", [], "validation_failed", [issue])
      )
      .mockResolvedValueOnce({
        word: { ...current, revision: 8, status: "published" }
      });
    const requests = allowedRequests({ publish });

    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        onPublished={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));
    expect(await screen.findByText("当前词性不支持该词形类型")).toBeVisible();
    expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /检查发布条件/ }));
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(publish.mock.calls[1]![1]).not.toBe(publish.mock.calls[0]![1]);
  });

  it("accepts a top-level impact token before publishing the canonical response", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const published = { ...current, status: "published" as const, revision: 8 };
    const onPublished = vi.fn();
    const requests = allowedRequests({
      impact: vi.fn().mockResolvedValue({
        schema_version: 3,
        base_revision: 7,
        requires_confirmation: true,
        affected: [
          { node_id: UUIDS.form, node_type: "form", reason: "referenced" }
        ],
        confirmation_token: "impact-token"
      } satisfies FormsImpactResponseV3),
      publish: vi.fn().mockResolvedValue({ word: published })
    });
    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        onPublished={onPublished}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    expect(
      await screen.findByTestId(`impact-item-form-${UUIDS.form}`)
    ).toHaveTextContent("词形关联内容将随本次调整受到影响。");
    expect(screen.queryByText(UUIDS.form)).toBeNull();
    fireEvent.click(
      await screen.findByRole("button", { name: "确认影响并允许发布" })
    );
    fireEvent.click(screen.getByRole("button", { name: "发布词条" }));
    await waitFor(() => expect(onPublished).toHaveBeenCalledWith(published));
    expect(requests.publish.mock.calls[0]?.[2]).toEqual({
      schema_version: 3,
      base_revision: 7
    });
  });

  it.each([
    [new HttpError(401, "expired"), "登录已失效，请重新登录。"],
    [new HttpError(403, "forbidden"), "当前账号没有发布权限。"],
    [new HttpError(503, "off"), "发布服务暂不可用，请稍后重试。"]
  ])(
    "maps preparation errors without dropping the preview",
    async (failure, message) => {
      const requests = allowedRequests({
        validate: vi.fn().mockRejectedValue(failure)
      });
      render(
        <V3PreviewAndPublishStep
          word={word({ mode: "migration_canary", whitelisted: true })}
          requests={requests}
          onPublished={vi.fn()}
        />
      );
      fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
      expect(await screen.findByText(message)).toBeInTheDocument();
      expect(screen.getByText("learn / learnt")).toBeInTheDocument();
    }
  );

  it("refreshes canonical before rotating an idempotency-conflict key and requires a fresh prepare", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    current.published_revision = 6;
    const refreshed = {
      ...current,
      revision: 8,
      published_revision: 7,
      presentation: { ...current.presentation, label: "refreshed canonical" }
    };
    let resolveGet!: (value: {
      word: AdminWordV3;
      retired_stable_nodes: [];
    }) => void;
    const get = vi.fn(
      () =>
        new Promise<{ word: AdminWordV3; retired_stable_nodes: [] }>(
          (resolve) => {
            resolveGet = resolve;
          }
        )
    );
    const surfaceWarning = new HttpError(
      409,
      "surface changed",
      [],
      "surface_matches_changed",
      [],
      { surface_match_page: surfacePage("latest-cursor") }
    );
    const publish = vi
      .fn<
        (
          wordId: string,
          idempotencyKey: string,
          input: PublishAdminWordV3Input
        ) => Promise<{ word: AdminWordV3 }>
      >()
      .mockRejectedValueOnce(
        new HttpError(409, "reused", [], "idempotency_conflict")
      )
      .mockRejectedValueOnce(surfaceWarning)
      .mockResolvedValueOnce({
        word: { ...refreshed, revision: 9, status: "published" }
      });
    const requests = allowedRequests({
      get,
      publish,
      surfacePage: vi
        .fn()
        .mockResolvedValue(
          surfacePage(null, { surface: "latest-surface-token" })
        )
    });
    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        onPublished={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    const publishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(publishButton);
    await waitFor(() => expect(get).toHaveBeenCalledWith("word-v3"));
    fireEvent.click(publishButton);
    expect(publish).toHaveBeenCalledTimes(1);

    await act(async () =>
      resolveGet({ word: refreshed, retired_stable_nodes: [] })
    );
    expect(await screen.findByText("refreshed canonical")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();

    const prepareAfterRefresh = screen
      .getByText("检查发布条件")
      .closest("button")!;
    await waitFor(() => expect(prepareAfterRefresh).toBeEnabled());
    fireEvent.click(prepareAfterRefresh);
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));
    const confirmSurface = await screen.findByRole("button", {
      name: "确认同形提示并重试发布"
    });
    await waitFor(() => expect(confirmSurface).toBeEnabled());
    fireEvent.click(confirmSurface);
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(3));

    expect(publish.mock.calls[1]?.[1]).not.toBe(publish.mock.calls[0]?.[1]);
    expect(publish.mock.calls[1]?.[2]).toEqual({
      schema_version: 3,
      base_revision: 8
    });
    expect(publish.mock.calls[2]?.[1]).not.toBe(publish.mock.calls[1]?.[1]);
    expect(publish.mock.calls[2]?.[2]).toEqual({
      schema_version: 3,
      base_revision: 8,
      confirmed_surface_match_token: "latest-surface-token"
    });
  });

  it("reconciles a publish revision conflict before allowing a new revision and key", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const refreshed = {
      ...current,
      revision: 9,
      presentation: { ...current.presentation, label: "revision reconciled" }
    };
    let resolveGet!: (value: {
      word: AdminWordV3;
      retired_stable_nodes: [];
    }) => void;
    const get = vi.fn(
      () =>
        new Promise<{ word: AdminWordV3; retired_stable_nodes: [] }>(
          (resolve) => {
            resolveGet = resolve;
          }
        )
    );
    const publish = vi
      .fn<
        (
          wordId: string,
          idempotencyKey: string,
          input: PublishAdminWordV3Input
        ) => Promise<{ word: AdminWordV3 }>
      >()
      .mockRejectedValueOnce(
        new HttpError(409, "stale", [], "revision_conflict")
      )
      .mockResolvedValueOnce({
        word: { ...refreshed, revision: 10, status: "published" }
      });
    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests({ get, publish })}
        onPublished={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    const stalePublishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(stalePublishButton);
    await waitFor(() => expect(get).toHaveBeenCalledWith("word-v3"));
    fireEvent.click(stalePublishButton);
    expect(publish).toHaveBeenCalledTimes(1);

    await act(async () =>
      resolveGet({ word: refreshed, retired_stable_nodes: [] })
    );
    expect(await screen.findByText("revision reconciled")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();

    const prepareAfterRevisionRefresh = screen
      .getByText("检查发布条件")
      .closest("button")!;
    await waitFor(() => expect(prepareAfterRevisionRefresh).toBeEnabled());
    fireEvent.click(prepareAfterRevisionRefresh);
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));
    await waitFor(() => expect(publish).toHaveBeenCalledTimes(2));
    expect(publish.mock.calls[1]?.[1]).not.toBe(publish.mock.calls[0]?.[1]);
    expect(publish.mock.calls[1]?.[2]).toEqual({
      schema_version: 3,
      base_revision: 9
    });
  });

  it("keeps standalone revision reconciliation blocked until a failed refresh is retried", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const refreshed = { ...current, revision: 9 };
    const get = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce({ word: refreshed, retired_stable_nodes: [] });
    const publish = vi
      .fn()
      .mockRejectedValue(new HttpError(409, "stale", [], "revision_conflict"));
    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests({ get, publish })}
        onPublished={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    const stalePublishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(stalePublishButton);
    expect(
      await screen.findByText("刷新最新词条失败，请先重试对账。")
    ).toBeInTheDocument();
    fireEvent.click(stalePublishButton);
    expect(publish).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "重新刷新最新词条" }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();
  });

  it("does not apply a late revision reconciliation after the word prop changes", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const replacement = {
      ...current,
      presentation: { ...current.presentation, label: "replacement scope" }
    };
    const stale = {
      ...current,
      revision: 9,
      presentation: { ...current.presentation, label: "stale reconciliation" }
    };
    let resolveGet!: (value: {
      word: AdminWordV3;
      retired_stable_nodes: [];
    }) => void;
    const requests = allowedRequests({
      get: vi.fn(
        () =>
          new Promise<{ word: AdminWordV3; retired_stable_nodes: [] }>(
            (resolve) => {
              resolveGet = resolve;
            }
          )
      ),
      publish: vi
        .fn()
        .mockRejectedValue(new HttpError(409, "stale", [], "revision_conflict"))
    });
    const view = render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        onPublished={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));
    await waitFor(() => expect(requests.get).toHaveBeenCalledTimes(1));
    view.rerender(
      <V3PreviewAndPublishStep
        word={replacement}
        requests={requests}
        onPublished={vi.fn()}
      />
    );
    expect(await screen.findByText("replacement scope")).toBeInTheDocument();

    await act(async () =>
      resolveGet({ word: stale, retired_stable_nodes: [] })
    );
    expect(screen.getByText("replacement scope")).toBeInTheDocument();
    expect(screen.queryByText("stale reconciliation")).toBeNull();
  });

  it("does not install a late revision reconciliation after unmount", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    let resolveGet!: (value: {
      word: AdminWordV3;
      retired_stable_nodes: [];
    }) => void;
    const createFlow = vi.fn((candidate: AdminWordV3) =>
      createV3SaveFlow(candidate)
    );
    const requests = allowedRequests({
      get: vi.fn(
        () =>
          new Promise<{ word: AdminWordV3; retired_stable_nodes: [] }>(
            (resolve) => {
              resolveGet = resolve;
            }
          )
      ),
      publish: vi
        .fn()
        .mockRejectedValue(new HttpError(409, "stale", [], "revision_conflict"))
    });
    const view = render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        createFlow={createFlow}
        onPublished={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    fireEvent.click(await screen.findByRole("button", { name: "发布词条" }));
    await waitFor(() => expect(requests.get).toHaveBeenCalledTimes(1));
    const flowCreationsBeforeUnmount = createFlow.mock.calls.length;
    view.unmount();
    await act(async () =>
      resolveGet({
        word: { ...current, revision: 9 },
        retired_stable_nodes: []
      })
    );

    expect(createFlow).toHaveBeenCalledTimes(flowCreationsBeforeUnmount);
  });

  it("keeps standalone publish blocked when idempotency reconciliation fails", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const publish = vi
      .fn<
        (
          wordId: string,
          idempotencyKey: string,
          input: PublishAdminWordV3Input
        ) => Promise<{ word: AdminWordV3 }>
      >()
      .mockRejectedValueOnce(
        new HttpError(409, "reused", [], "idempotency_conflict")
      )
      .mockResolvedValueOnce({ word: { ...current, revision: 8 } });
    const get = vi.fn().mockRejectedValue(new TypeError("offline"));
    render(
      <V3PreviewAndPublishStep
        word={current}
        requests={allowedRequests({ get, publish })}
        onPublished={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    const publishButton = await screen.findByRole("button", {
      name: "发布词条"
    });
    fireEvent.click(publishButton);
    expect(
      await screen.findByText("刷新最新词条失败，请先重试对账。")
    ).toBeInTheDocument();
    fireEvent.click(publishButton);

    expect(get).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("button", { name: "重新刷新最新词条" })
    ).toBeInTheDocument();
  });

  it.each(["validate", "impact", "publish"] as const)(
    "refreshes and renders an archived canonical when standalone %s returns entry_archived",
    async (command) => {
      const current = word({ mode: "migration_canary", whitelisted: true });
      const archived = {
        ...current,
        status: "archived" as const,
        revision: 9,
        archived_at: "2026-08-25T12:00:00Z",
        archived_by: "admin-2",
        presentation: {
          ...current.presentation,
          label: "standalone archived canonical"
        }
      };
      const rejected = vi
        .fn()
        .mockRejectedValue(
          new HttpError(409, "entry archived", [], "entry_archived")
        );
      const requests = allowedRequests({
        ...(command === "validate" ? { validate: rejected } : {}),
        ...(command === "impact" ? { impact: rejected } : {}),
        ...(command === "publish" ? { publish: rejected } : {}),
        get: vi.fn().mockResolvedValue({
          word: archived,
          retired_stable_nodes: []
        })
      });
      const onPublished = vi.fn();
      render(
        <StrictMode>
          <V3PreviewAndPublishStep
            word={current}
            requests={requests}
            onPublished={onPublished}
          />
        </StrictMode>
      );

      fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
      if (command === "publish") {
        fireEvent.click(
          await screen.findByRole("button", { name: "发布词条" })
        );
      }

      expect(
        await screen.findByText("standalone archived canonical")
      ).toBeInTheDocument();
      expect(requests.get).toHaveBeenCalledWith("word-v3");
      expect(rejected).toHaveBeenCalledTimes(1);
      expect(onPublished).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: "检查发布条件" })).toBeNull();
      expect(screen.queryByRole("button", { name: "发布词条" })).toBeNull();
      expect(screen.getByText("垃圾桶中的词条不能发布。")).toBeInTheDocument();
      expect(screen.queryByText("entry_archived")).toBeNull();
    }
  );

  it("ignores a late standalone entry_archived response after the word prop scope changes", async () => {
    const current = word({ mode: "migration_canary", whitelisted: true });
    const next = {
      ...current,
      lifecycle_revision: 3,
      presentation: {
        ...current.presentation,
        label: "new prop canonical"
      }
    };
    let rejectValidate!: (error: unknown) => void;
    const requests = allowedRequests({
      validate: vi.fn(
        () =>
          new Promise((_, reject) => {
            rejectValidate = reject;
          })
      )
    });
    const view = render(
      <V3PreviewAndPublishStep
        word={current}
        requests={requests}
        onPublished={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "检查发布条件" }));
    view.rerender(
      <V3PreviewAndPublishStep
        word={next}
        requests={requests}
        onPublished={vi.fn()}
      />
    );
    await act(async () =>
      rejectValidate(new HttpError(409, "entry archived", [], "entry_archived"))
    );

    expect(await screen.findByText("new prop canonical")).toBeInTheDocument();
    expect(requests.get).not.toHaveBeenCalled();
  });
});
