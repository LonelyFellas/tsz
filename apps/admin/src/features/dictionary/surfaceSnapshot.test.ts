import { describe, expect, it } from "vitest";
import type {
  LexiconSurfaceMatchV2,
  MatchedEntryContextV3,
  MatchedEntryContextV2,
  SurfaceMatchItemV3,
  SurfaceMatchPageAny,
  SurfaceMatchPageV3,
  SurfaceMatchPageV2
} from "@tsz/types";
import {
  EMPTY_SURFACE_SNAPSHOT_STATE,
  aggregateLifecycleSurfaceMatchCards,
  aggregateSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  createEmptySurfaceSnapshotState,
  isSurfaceMatchPageV2,
  requiresNewIdempotencyKey,
  surfaceSnapshotReducer
} from "./surfaceSnapshot";

function match(
  match_id: string,
  word_id: string,
  source_id = match_id,
  reasons: LexiconSurfaceMatchV2["confirmation_reasons"] = [
    "unacknowledged_surface_matches"
  ]
): LexiconSurfaceMatchV2 {
  return {
    match_id,
    match_category: "exact_headword",
    severity: "warning",
    attention_level: "high",
    can_continue: true,
    confirmation_reasons: reasons,
    candidate: {
      candidate_type: "headword",
      candidate_ref: "headword:common",
      surface: "workspace",
      normalized_surface: "workspace",
      dialect: "common",
      entry_kind: "word"
    },
    existing: {
      word_id,
      headword: "workspace",
      kind: "word",
      status: "draft",
      source: {
        source_kind: "headword",
        source_id,
        content_scope: "draft",
        surface: "workspace",
        dialect: "common"
      }
    }
  };
}

describe("surface page version guard", () => {
  it("只接受 V2 page，V3 与缺失值均 fail closed", () => {
    const v3Page: SurfaceMatchPageV3 = {
      schema_version: 3,
      snapshot_id: "019c0000-0000-7000-8000-000000000003",
      items: [],
      total: 0,
      matched_entry_contexts: [],
      confirmation_reasons: ["unacknowledged_surface_matches"],
      policy_name: "allow_new_exact_headword_entries",
      policy_epoch: 1,
      continuation_policy: "enabled",
      next_cursor: null,
      surface_confirmation_token: "v3-token"
    };

    expect(isSurfaceMatchPageV2(page([], null))).toBe(true);
    expect(isSurfaceMatchPageV2(v3Page)).toBe(false);
    expect(isSurfaceMatchPageV2(undefined)).toBe(false);
  });
});

function context(word_id: string): MatchedEntryContextV2 {
  return {
    word_id,
    pos_labels: ["noun"],
    gloss_previews: ["工作空间"],
    updated_at: "2026-08-15T00:00:00Z",
    inbound_relations: {
      total: 0,
      by_type: { synonym: 0, antonym: 0, derivative: 0 },
      previews: [],
      truncated: false
    }
  };
}

function page(
  items: LexiconSurfaceMatchV2[],
  next_cursor: string | null,
  options: { disabled?: boolean; token?: string; impactToken?: string } = {}
): SurfaceMatchPageV2 {
  const base = {
    schema_version: 2 as const,
    snapshot_id: "snapshot-1",
    items,
    total: 2,
    matched_entry_contexts: items.map((item) => context(item.existing.word_id)),
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    policy_name: "allow_new_exact_headword_entries" as const,
    policy_epoch: 4
  };
  if (options.disabled) {
    return {
      ...base,
      continuation_policy: "temporarily_disabled",
      next_cursor,
      policy_block_code: "exact_headword_creation_temporarily_disabled"
    };
  }
  if (next_cursor !== null) {
    return { ...base, continuation_policy: "enabled", next_cursor };
  }
  return {
    ...base,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: options.token ?? "token-1",
    ...(options.impactToken
      ? { impact_confirmation_token: options.impactToken }
      : {})
  };
}

function v3Item(
  entryId: string,
  variantId: string,
  spelling = `surface-${entryId}`
): SurfaceMatchItemV3 {
  return {
    match_kind: "form_variant_v3",
    match: {
      source_schema_version: 3,
      entry_id: entryId,
      entry_kind: "word",
      status: "published",
      content_scope: "current_publication",
      pos_id: `pos-${entryId}`,
      group_ids: [],
      form_id: `form-${entryId}`,
      variant_id: variantId,
      form_type: "base",
      dialect: "common",
      spelling
    }
  };
}

function v3Context(entryId: string): MatchedEntryContextV3 {
  return {
    entry_id: entryId,
    presentation: {
      label: `V3 ${entryId}`,
      matched_surfaces: [`surface-${entryId}`],
      strategy_version: "surface_summary_v1"
    },
    pos_labels: ["noun"],
    gloss_previews: ["释义"],
    updated_at: "2026-08-25T00:00:00Z",
    inbound_relations: {
      total: 0,
      by_type: { synonym: 0, antonym: 0, derivative: 0 },
      previews: [],
      truncated: false
    }
  };
}

function v3Page(
  items: SurfaceMatchItemV3[],
  nextCursor: string | null,
  token = "v3-terminal-token",
  total = 2
): SurfaceMatchPageV3 {
  const base = {
    schema_version: 3 as const,
    snapshot_id: "v3-snapshot",
    items,
    total,
    matched_entry_contexts: items.map((item) =>
      v3Context(
        item.match_kind === "form_variant_v3"
          ? item.match.entry_id
          : item.match.existing.word_id
      )
    ),
    confirmation_reasons: ["visibility_activation" as const],
    policy_name: "allow_multiple_active_exact_headword_publications" as const,
    policy_epoch: 8
  };
  return nextCursor === null
    ? {
        ...base,
        continuation_policy: "enabled",
        next_cursor: null,
        surface_confirmation_token: token
      }
    : { ...base, continuation_policy: "enabled", next_cursor: nextCursor };
}

describe("surfaceSnapshotReducer", () => {
  it("V3 顺序合并分页、按 V3 identity 去重并只在终页开放 token", () => {
    const first = surfaceSnapshotReducer(
      createEmptySurfaceSnapshotState<SurfaceMatchPageAny>(),
      {
        type: "start",
        generation: 3,
        page: v3Page([v3Item("entry-1", "variant-1")], "v3-cursor-2")
      }
    );
    const terminal = surfaceSnapshotReducer(first, {
      type: "page_loaded",
      generation: 3,
      requested_cursor: "v3-cursor-2",
      page: v3Page(
        [v3Item("entry-1", "variant-1"), v3Item("entry-2", "variant-2")],
        null
      )
    });

    expect(terminal.schema_version).toBe(3);
    expect(terminal.items).toHaveLength(2);
    expect(terminal.matched_entry_contexts).toHaveLength(2);
    expect(terminal.surface_confirmation_token).toBe("v3-terminal-token");
    expect(canAcknowledgeSurfaceSnapshot(terminal)).toBe(true);
  });
  it("V3 同 entry+variant 的不同公开 row 不碰撞，完全相同行跨页才去重", () => {
    const original = v3Item("entry-1", "variant-1");
    if (original.match_kind !== "form_variant_v3") throw new Error("fixture");
    const distinctRows: SurfaceMatchItemV3[] = [
      original,
      {
        ...original,
        match: { ...original.match, content_scope: "draft" }
      },
      {
        ...original,
        match: { ...original.match, publication_id: "publication-2" }
      },
      {
        ...original,
        match: { ...original.match, form_id: "form-2" }
      },
      {
        ...original,
        match: { ...original.match, status: "archived" }
      },
      {
        ...original,
        match: { ...original.match, spelling: "surface-collision" }
      }
    ];
    const first = surfaceSnapshotReducer(
      createEmptySurfaceSnapshotState<SurfaceMatchPageAny>(),
      {
        type: "start",
        generation: 4,
        page: v3Page([original], "v3-cursor-2", undefined, distinctRows.length)
      }
    );
    const terminal = surfaceSnapshotReducer(first, {
      type: "page_loaded",
      generation: 4,
      requested_cursor: "v3-cursor-2",
      page: v3Page(
        [structuredClone(original), ...distinctRows.slice(1)],
        null,
        "collision-token",
        distinctRows.length
      )
    });

    expect(terminal.items).toHaveLength(distinctRows.length);
    expect(canAcknowledgeSurfaceSnapshot(terminal)).toBe(true);
  });
  it("顺序合并全部页，终页前不暴露 token，终页后才允许确认", () => {
    const first = surfaceSnapshotReducer(EMPTY_SURFACE_SNAPSHOT_STATE, {
      type: "start",
      generation: 1,
      page: page([match("m1", "word-1")], "cursor-2")
    });
    expect(first).toMatchObject({
      phase: "loading",
      next_cursor: "cursor-2"
    });
    expect(first.surface_confirmation_token).toBeUndefined();
    expect(canAcknowledgeSurfaceSnapshot(first)).toBe(false);

    const terminal = surfaceSnapshotReducer(first, {
      type: "page_loaded",
      generation: 1,
      requested_cursor: "cursor-2",
      page: page([match("m2", "word-2")], null, {
        token: "terminal-token",
        impactToken: "terminal-impact-token"
      })
    });
    expect(terminal.items.map((item) => item.match_id)).toEqual(["m1", "m2"]);
    expect(terminal.matched_entry_contexts.map((item) => item.word_id)).toEqual(
      ["word-1", "word-2"]
    );
    expect(terminal.surface_confirmation_token).toBe("terminal-token");
    expect(terminal.impact_confirmation_token).toBe("terminal-impact-token");
    expect(canAcknowledgeSurfaceSnapshot(terminal)).toBe(true);
  });

  it("reset 与 generation 会丢弃晚到响应并清除旧 token", () => {
    const terminal = surfaceSnapshotReducer(EMPTY_SURFACE_SNAPSHOT_STATE, {
      type: "start",
      generation: 1,
      page: {
        ...page([match("m1", "word-1"), match("m2", "word-2")], null, {
          impactToken: "old-impact-token"
        }),
        total: 2
      }
    });
    const reset = surfaceSnapshotReducer(terminal, {
      type: "reset",
      generation: 2
    });
    const late = surfaceSnapshotReducer(reset, {
      type: "page_loaded",
      generation: 1,
      requested_cursor: "cursor-2",
      page: page([match("late", "word-late")], null)
    });
    expect(late).toEqual(reset);
    expect(late.surface_confirmation_token).toBeUndefined();
    expect(late.impact_confirmation_token).toBeUndefined();
  });

  it("页失败/过期、snapshot identity 变化均 fail closed 并清 token", () => {
    const first = surfaceSnapshotReducer(EMPTY_SURFACE_SNAPSHOT_STATE, {
      type: "start",
      generation: 1,
      page: page([match("m1", "word-1")], "cursor-2")
    });
    const failed = surfaceSnapshotReducer(
      { ...first, impact_confirmation_token: "stale-impact-token" },
      {
        type: "page_failed",
        generation: 1,
        requested_cursor: "cursor-2",
        error: new Error("expired"),
        expired: true
      }
    );
    expect(failed.phase).toBe("expired");
    expect(failed.impact_confirmation_token).toBeUndefined();
    expect(canAcknowledgeSurfaceSnapshot(failed)).toBe(false);

    const mismatched = surfaceSnapshotReducer(
      { ...first, impact_confirmation_token: "stale-impact-token" },
      {
        type: "page_loaded",
        generation: 1,
        requested_cursor: "cursor-2",
        page: { ...page([match("m2", "word-2")], null), policy_epoch: 5 }
      }
    );
    expect(mismatched.phase).toBe("error");
    expect(mismatched.surface_confirmation_token).toBeUndefined();
    expect(mismatched.impact_confirmation_token).toBeUndefined();
  });

  it("disabled snapshot 可加载完全部页，但任何阶段都不允许确认", () => {
    const first = surfaceSnapshotReducer(EMPTY_SURFACE_SNAPSHOT_STATE, {
      type: "start",
      generation: 1,
      page: page([match("m1", "word-1")], "cursor-2", { disabled: true })
    });
    const terminal = surfaceSnapshotReducer(first, {
      type: "page_loaded",
      generation: 1,
      requested_cursor: "cursor-2",
      page: page([match("m2", "word-2")], null, { disabled: true })
    });
    expect(terminal.phase).toBe("disabled");
    expect(terminal.items).toHaveLength(2);
    expect(terminal.surface_confirmation_token).toBeUndefined();
    expect(canAcknowledgeSurfaceSnapshot(terminal)).toBe(false);
  });
});

describe("surface snapshot selectors", () => {
  it("V3 lifecycle 卡片按 entry 归并并只返回产品化候选详情", () => {
    const state = surfaceSnapshotReducer(
      createEmptySurfaceSnapshotState<SurfaceMatchPageAny>(),
      {
        type: "start",
        generation: 1,
        page: {
          ...v3Page(
            [
              v3Item("entry-1", "variant-1"),
              v3Item("entry-1", "variant-2", "second-surface")
            ],
            null
          ),
          total: 2
        }
      }
    );

    expect(aggregateLifecycleSurfaceMatchCards(state)).toEqual([
      expect.objectContaining({
        key: "entry-1",
        entry_id: "entry-1",
        label: "V3 entry-1",
        kind: "word",
        status: "published",
        match_count: 2,
        membership: "visibility",
        source_labels: [
          "词形 · surface-entry-1 · 原形 · 通用",
          "词形 · second-surface · 原形 · 通用"
        ],
        pos_labels: ["名词"],
        gloss_previews: ["释义"]
      })
    ]);
  });
  it("按 candidate + word_id 聚合卡片且保留同 entry 多 source/reason membership", () => {
    const cards = aggregateSurfaceMatchCards(
      [
        match("m1", "word-1", "source-headword"),
        match("m2", "word-1", "source-form", ["visibility_activation"]),
        match("m3", "word-2")
      ],
      [context("word-1"), context("word-2")]
    );
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({
      key: "headword:common:word-1",
      membership: "composite",
      context: { word_id: "word-1" }
    });
    expect(cards[0]!.matches.map((item) => item.match_id)).toEqual([
      "m1",
      "m2"
    ]);
  });

  it("兼容历史词条候选、缺失摘要与词形来源并使用产品回退", () => {
    const formSource = match("form-match", "legacy-word");
    formSource.existing.source = {
      source_kind: "form",
      source_id: "legacy-form",
      source_node_id: "legacy-form-node",
      content_scope: "draft",
      surface: "workspaces",
      dialect: "common",
      form_type: "plural",
      pos_id: "legacy-pos",
      pos: "noun"
    };
    const v2State = surfaceSnapshotReducer(
      createEmptySurfaceSnapshotState<SurfaceMatchPageAny>(),
      {
        type: "start",
        generation: 1,
        page: {
          ...page([formSource], null),
          total: 1,
          matched_entry_contexts: [
            {
              ...context("legacy-word"),
              pos_labels: ["自定义词性", "future-pos"]
            }
          ]
        }
      }
    );
    expect(aggregateLifecycleSurfaceMatchCards(v2State)[0]).toMatchObject({
      source_labels: ["词形 · workspaces · 复数 · 通用"],
      pos_labels: ["自定义词性", "其他词性"]
    });

    const legacyItem: SurfaceMatchItemV3 = {
      match_kind: "legacy_v2",
      match: {
        source_schema_version: 2,
        existing: {
          ...formSource.existing,
          headword: "legacy phrase",
          kind: "phrase",
          status: "archived"
        }
      }
    };
    const withoutContext = surfaceSnapshotReducer(
      createEmptySurfaceSnapshotState<SurfaceMatchPageAny>(),
      {
        type: "start",
        generation: 2,
        page: {
          ...v3Page(
            [v3Item("no-context", "variant-no-context"), legacyItem],
            null,
            "fallback-token",
            2
          ),
          matched_entry_contexts: []
        }
      }
    );
    expect(aggregateLifecycleSurfaceMatchCards(withoutContext)).toEqual([
      expect.objectContaining({
        label: "surface-no-context",
        kind: "word",
        pos_labels: [],
        gloss_previews: []
      }),
      expect.objectContaining({
        label: "legacy phrase",
        kind: "phrase",
        status: "archived",
        source_labels: ["词形 · workspaces · 复数 · 通用"]
      })
    ]);
  });

  it.each([
    [409, "surface_matches_changed", true],
    [410, "surface_match_snapshot_expired", true],
    [409, "revision_conflict", false],
    [503, "service_unavailable", false]
  ])("业务错误决定是否轮换 Idempotency-Key", (status, code, expected) => {
    expect(requiresNewIdempotencyKey(status, code)).toBe(expected);
  });
});
