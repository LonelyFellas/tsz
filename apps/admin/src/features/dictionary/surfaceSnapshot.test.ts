import { describe, expect, it } from "vitest";
import type {
  MatchedEntryContextV3,
  SurfaceMatchItemV3,
  SurfaceMatchPageV3
} from "@tsz/types";
import {
  aggregateLifecycleSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
  createEmptySurfaceSnapshotState,
  requiresNewIdempotencyKey,
  surfaceSnapshotReducer
} from "./surfaceSnapshot";

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
    annotation: null,
    annotation_revision: 1,
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
  total = 2,
  options: { disabled?: boolean } = {}
): SurfaceMatchPageV3 {
  const base = {
    schema_version: 3 as const,
    snapshot_id: "v3-snapshot",
    items,
    total,
    matched_entry_contexts: items.map((item) => v3Context(item.match.entry_id)),
    confirmation_reasons: ["visibility_activation" as const],
    policy_name: "allow_multiple_active_exact_headword_publications" as const,
    policy_epoch: 8
  };
  if (options.disabled) {
    return {
      ...base,
      continuation_policy: "temporarily_disabled",
      next_cursor: nextCursor,
      policy_block_code: "exact_headword_creation_temporarily_disabled"
    };
  }
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
      createEmptySurfaceSnapshotState<SurfaceMatchPageV3>(),
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
      createEmptySurfaceSnapshotState<SurfaceMatchPageV3>(),
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
    const first = surfaceSnapshotReducer(createEmptySurfaceSnapshotState(), {
      type: "start",
      generation: 1,
      page: v3Page([v3Item("entry-1", "variant-1")], "cursor-2")
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
      page: v3Page([v3Item("entry-2", "variant-2")], null, "terminal-token")
    });
    expect(terminal.items.map((item) => item.match.entry_id)).toEqual([
      "entry-1",
      "entry-2"
    ]);
    expect(
      terminal.matched_entry_contexts.map((item) => item.entry_id)
    ).toEqual(["entry-1", "entry-2"]);
    expect(terminal.surface_confirmation_token).toBe("terminal-token");
    expect(canAcknowledgeSurfaceSnapshot(terminal)).toBe(true);
  });

  it("reset 与 generation 会丢弃晚到响应并清除旧 token", () => {
    const terminal = surfaceSnapshotReducer(createEmptySurfaceSnapshotState(), {
      type: "start",
      generation: 1,
      page: {
        ...v3Page(
          [v3Item("entry-1", "variant-1"), v3Item("entry-2", "variant-2")],
          null
        ),
        continuation_policy: "enabled" as const,
        next_cursor: null,
        surface_confirmation_token: "v3-terminal-token",
        impact_confirmation_token: "old-impact-token",
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
      page: v3Page([v3Item("entry-late", "variant-late")], null)
    });
    expect(late).toEqual(reset);
    expect(late.surface_confirmation_token).toBeUndefined();
    expect(late.impact_confirmation_token).toBeUndefined();
  });

  it("页失败/过期、snapshot identity 变化均 fail closed 并清 token", () => {
    const first = surfaceSnapshotReducer(createEmptySurfaceSnapshotState(), {
      type: "start",
      generation: 1,
      page: v3Page([v3Item("entry-1", "variant-1")], "cursor-2")
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
        page: {
          ...v3Page([v3Item("entry-2", "variant-2")], null),
          policy_epoch: 5
        }
      }
    );
    expect(mismatched.phase).toBe("error");
    expect(mismatched.surface_confirmation_token).toBeUndefined();
    expect(mismatched.impact_confirmation_token).toBeUndefined();
  });

  it("disabled snapshot 可加载完全部页，但任何阶段都不允许确认", () => {
    const first = surfaceSnapshotReducer(createEmptySurfaceSnapshotState(), {
      type: "start",
      generation: 1,
      page: v3Page([v3Item("entry-1", "variant-1")], "cursor-2", undefined, 2, {
        disabled: true
      })
    });
    const terminal = surfaceSnapshotReducer(first, {
      type: "page_loaded",
      generation: 1,
      requested_cursor: "cursor-2",
      page: v3Page([v3Item("entry-2", "variant-2")], null, undefined, 2, {
        disabled: true
      })
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
      createEmptySurfaceSnapshotState<SurfaceMatchPageV3>(),
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

  it("缺少 entry 摘要时回落到匹配词形，词性标签按产品词表归一", () => {
    const withoutContext = surfaceSnapshotReducer(
      createEmptySurfaceSnapshotState<SurfaceMatchPageV3>(),
      {
        type: "start",
        generation: 2,
        page: {
          ...v3Page(
            [v3Item("no-context", "variant-no-context")],
            null,
            "fallback-token",
            1
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
      })
    ]);
  });

  it("未知词性编码回落到「其他词性」，中文自定义词性原样保留", () => {
    const state = surfaceSnapshotReducer(
      createEmptySurfaceSnapshotState<SurfaceMatchPageV3>(),
      {
        type: "start",
        generation: 3,
        page: {
          ...v3Page([v3Item("entry-1", "variant-1")], null, undefined, 1),
          matched_entry_contexts: [
            {
              ...v3Context("entry-1"),
              pos_labels: ["自定义词性", "future-pos"]
            }
          ]
        }
      }
    );
    expect(aggregateLifecycleSurfaceMatchCards(state)[0]).toMatchObject({
      pos_labels: ["自定义词性", "其他词性"]
    });
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
