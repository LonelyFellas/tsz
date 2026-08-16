import { describe, expect, it } from "vitest";
import type {
  LexiconSurfaceMatchV2,
  MatchedEntryContextV2,
  SurfaceMatchPageV2
} from "@tsz/types";
import {
  EMPTY_SURFACE_SNAPSHOT_STATE,
  aggregateSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot,
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
  options: { disabled?: boolean; token?: string } = {}
): SurfaceMatchPageV2 {
  const base = {
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
    surface_confirmation_token: options.token ?? "token-1"
  };
}

describe("surfaceSnapshotReducer", () => {
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
      page: page([match("m2", "word-2")], null, { token: "terminal-token" })
    });
    expect(terminal.items.map((item) => item.match_id)).toEqual(["m1", "m2"]);
    expect(terminal.matched_entry_contexts.map((item) => item.word_id)).toEqual(
      ["word-1", "word-2"]
    );
    expect(terminal.surface_confirmation_token).toBe("terminal-token");
    expect(canAcknowledgeSurfaceSnapshot(terminal)).toBe(true);
  });

  it("reset 与 generation 会丢弃晚到响应并清除旧 token", () => {
    const terminal = surfaceSnapshotReducer(EMPTY_SURFACE_SNAPSHOT_STATE, {
      type: "start",
      generation: 1,
      page: {
        ...page([match("m1", "word-1"), match("m2", "word-2")], null),
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
  });

  it("页失败/过期、snapshot identity 变化均 fail closed 并清 token", () => {
    const first = surfaceSnapshotReducer(EMPTY_SURFACE_SNAPSHOT_STATE, {
      type: "start",
      generation: 1,
      page: page([match("m1", "word-1")], "cursor-2")
    });
    const failed = surfaceSnapshotReducer(first, {
      type: "page_failed",
      generation: 1,
      requested_cursor: "cursor-2",
      error: new Error("expired"),
      expired: true
    });
    expect(failed.phase).toBe("expired");
    expect(canAcknowledgeSurfaceSnapshot(failed)).toBe(false);

    const mismatched = surfaceSnapshotReducer(first, {
      type: "page_loaded",
      generation: 1,
      requested_cursor: "cursor-2",
      page: { ...page([match("m2", "word-2")], null), policy_epoch: 5 }
    });
    expect(mismatched.phase).toBe("error");
    expect(mismatched.surface_confirmation_token).toBeUndefined();
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

  it.each([
    [409, "surface_matches_changed", true],
    [410, "surface_match_snapshot_expired", true],
    [409, "revision_conflict", false],
    [503, "service_unavailable", false]
  ])("业务错误决定是否轮换 Idempotency-Key", (status, code, expected) => {
    expect(requiresNewIdempotencyKey(status, code)).toBe(expected);
  });
});
