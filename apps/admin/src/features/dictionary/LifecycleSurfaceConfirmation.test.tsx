import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "antd";
import { describe, expect, it, vi } from "vitest";
import type { LexiconSurfaceMatchV2 } from "@tsz/types";
import { LifecycleSurfaceConfirmation } from "./LifecycleSurfaceConfirmation";
import type { SurfaceSnapshotState } from "./surfaceSnapshot";

function item(
  id: string,
  reasons: LexiconSurfaceMatchV2["confirmation_reasons"]
): LexiconSurfaceMatchV2 {
  return {
    match_id: id,
    match_category: "exact_headword",
    severity: "warning",
    attention_level: "high",
    can_continue: true,
    confirmation_reasons: reasons,
    candidate: {
      candidate_type: "headword",
      candidate_ref: `headword:${id}`,
      surface: id,
      normalized_surface: id,
      dialect: "common",
      entry_kind: "word"
    },
    existing: {
      word_id: `word-${id}`,
      headword: id,
      kind: "word",
      status: "published",
      source: {
        source_kind: "headword",
        source_id: id,
        content_scope: "current_publication",
        surface: id,
        dialect: "common"
      }
    }
  };
}

function renderPanel(
  state: SurfaceSnapshotState,
  onConfirm = vi.fn(),
  onRestart = vi.fn()
) {
  render(
    <App>
      <LifecycleSurfaceConfirmation
        state={{ ...state, retry: vi.fn() }}
        confirming={false}
        onConfirm={onConfirm}
        onRestart={onRestart}
      />
    </App>
  );
  return onConfirm;
}

describe("LifecycleSurfaceConfirmation", () => {
  it("disabled gate 展示能力限制且不提供确认入口", () => {
    renderPanel({
      generation: 1,
      phase: "disabled",
      items: [item("visible", ["visibility_activation"])],
      matched_entry_contexts: [],
      total: 1,
      confirmation_reasons: ["visibility_activation"],
      policy_block_code:
        "multiple_active_exact_headword_publications_not_enabled"
    });
    expect(screen.getByText("学习端暂不支持多个同名公开词条")).toBeVisible();
    expect(screen.queryByText("确认并恢复")).toBeNull();
  });

  it("按 ordinary、visibility、composite 分组且单 token 执行确认", () => {
    const onConfirm = renderPanel({
      generation: 1,
      phase: "ready",
      items: [
        item("ordinary", ["unacknowledged_surface_matches"]),
        item("visibility", ["visibility_activation"]),
        item("both", [
          "unacknowledged_surface_matches",
          "visibility_activation"
        ])
      ],
      matched_entry_contexts: [],
      total: 3,
      confirmation_reasons: [
        "unacknowledged_surface_matches",
        "visibility_activation"
      ],
      surface_confirmation_token: "one-composite-token"
    });
    expect(screen.getByLabelText("仅普通同形提示")).toBeVisible();
    expect(screen.getByLabelText("仅公开可见性")).toBeVisible();
    expect(screen.getByLabelText("公开可见性 + 普通同形提示")).toBeVisible();
    fireEvent.click(screen.getByText("确认并恢复"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("snapshot 过期时重新发起命令而不是重试旧分页", () => {
    const onRestart = vi.fn();
    renderPanel(
      {
        generation: 1,
        phase: "expired",
        items: [item("expired", ["visibility_activation"])],
        matched_entry_contexts: [],
        total: 1,
        confirmation_reasons: ["visibility_activation"]
      },
      vi.fn(),
      onRestart
    );
    fireEvent.click(screen.getByText("重新检查恢复条件"));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("重新加载确认快照")).toBeNull();
  });
});
