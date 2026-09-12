import { fireEvent, render, screen } from "@testing-library/react";
import { App } from "antd";
import { describe, expect, it, vi } from "vitest";
import type { SurfaceMatchItemV3, SurfaceMatchPageV3 } from "@tsz/types";
import { LifecycleSurfaceConfirmation } from "./LifecycleSurfaceConfirmation";
import type { SurfaceSnapshotState } from "./surfaceSnapshot";

function item(id: string): SurfaceMatchItemV3 {
  return {
    match_kind: "form_variant_v3",
    match: {
      source_schema_version: 3,
      entry_id: `entry-${id}`,
      entry_kind: "word",
      status: "published",
      content_scope: "current_publication",
      pos_id: `pos-${id}`,
      group_ids: [],
      form_id: `form-${id}`,
      variant_id: `variant-${id}`,
      form_type: "base",
      dialect: "common",
      spelling: id
    }
  };
}

function renderPanel(
  state: SurfaceSnapshotState<SurfaceMatchPageV3>,
  onConfirm = vi.fn(),
  onRestart = vi.fn(),
  action: "restore" | "activate" = "restore"
) {
  render(
    <App>
      <LifecycleSurfaceConfirmation
        state={{ ...state, retry: vi.fn() }}
        confirming={false}
        action={action}
        onConfirm={onConfirm}
        onRestart={onRestart}
      />
    </App>
  );
  return onConfirm;
}

describe("LifecycleSurfaceConfirmation", () => {
  it("V3 confirmation 忠实展示服务端 presentation 与 form source", () => {
    const state: SurfaceSnapshotState<SurfaceMatchPageV3> = {
      generation: 1,
      schema_version: 3,
      phase: "ready",
      items: [
        {
          match_kind: "form_variant_v3",
          match: {
            source_schema_version: 3,
            entry_id: "v3-entry-12345678",
            entry_kind: "word",
            status: "published",
            content_scope: "current_publication",
            pos_id: "pos-1",
            group_ids: [],
            form_id: "form-1",
            variant_id: "variant-1",
            form_type: "base",
            dialect: "common",
            spelling: "colour"
          }
        }
      ],
      matched_entry_contexts: [
        {
          entry_id: "v3-entry-12345678",
          annotation: null,
          annotation_revision: 1,
          presentation: {
            label: "colour · color",
            matched_surfaces: ["colour", "color"],
            strategy_version: "surface_summary_v1"
          },
          pos_labels: ["noun"],
          gloss_previews: ["颜色"],
          updated_at: "2026-08-25T00:00:00Z",
          inbound_relations: {
            total: 0,
            by_type: { synonym: 0, antonym: 0, derivative: 0 },
            previews: [],
            truncated: false
          }
        }
      ],
      total: 1,
      confirmation_reasons: ["visibility_activation"],
      surface_confirmation_token: "v3-token"
    };

    renderPanel(state);
    expect(screen.getByText("colour · color")).toBeVisible();
    expect(screen.getByText("单词")).toBeVisible();
    expect(screen.getByText("已发布")).toBeVisible();
    fireEvent.click(screen.getByText("查看候选详情"));
    expect(screen.getByText("词形 · colour · 原形 · 通用")).toBeInTheDocument();
    expect(screen.getByText("名词")).toBeInTheDocument();
    expect(screen.getByText("释义：颜色")).toBeInTheDocument();
    expect(screen.queryByText("12345678")).toBeNull();
    expect(screen.getByText("恢复前需要确认同名公开范围")).toBeVisible();
    expect(screen.getByText(/确认后将按当前结果继续恢复/)).toBeInTheDocument();
    expect(screen.getByText("确认并恢复")).toBeEnabled();
  });
  it("disabled gate 展示能力限制且不提供确认入口", () => {
    renderPanel({
      generation: 1,
      phase: "disabled",
      items: [item("visible")],
      matched_entry_contexts: [],
      total: 1,
      confirmation_reasons: ["visibility_activation"],
      policy_block_code:
        "multiple_active_exact_headword_publications_not_enabled"
    });
    expect(screen.getByText("学习端暂不支持多个同名公开词条")).toBeVisible();
    expect(screen.getByText(/当前不能继续恢复/)).toBeInTheDocument();
    expect(screen.queryByText("确认并恢复")).toBeNull();
  });

  it("快照级 reasons 同时命中两类时归入 composite 分组，单 token 确认", () => {
    const onConfirm = renderPanel({
      generation: 1,
      schema_version: 3,
      phase: "ready",
      items: [item("alpha"), item("beta")],
      matched_entry_contexts: [],
      total: 2,
      confirmation_reasons: [
        "unacknowledged_surface_matches",
        "visibility_activation"
      ],
      surface_confirmation_token: "one-composite-token"
    });
    expect(screen.getByLabelText("公开可见性 + 普通同形提示")).toBeVisible();
    expect(screen.queryByLabelText("仅普通同形提示")).toBeNull();
    expect(screen.queryByLabelText("仅公开可见性")).toBeNull();
    fireEvent.click(screen.getByText("确认并恢复"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("快照级 reasons 只命中普通同形时归入 ordinary 分组", () => {
    renderPanel({
      generation: 1,
      schema_version: 3,
      phase: "ready",
      items: [item("alpha")],
      matched_entry_contexts: [],
      total: 1,
      confirmation_reasons: ["unacknowledged_surface_matches"],
      surface_confirmation_token: "ordinary-token"
    });
    expect(screen.getByLabelText("仅普通同形提示")).toBeVisible();
    expect(screen.queryByLabelText("仅公开可见性")).toBeNull();
  });

  it("snapshot 过期时重新发起命令而不是重试旧分页", () => {
    const onRestart = vi.fn();
    renderPanel(
      {
        generation: 1,
        phase: "expired",
        items: [item("expired")],
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

  it("activate 模式使用激活语义且保持确认回调", () => {
    const onConfirm = vi.fn();
    renderPanel(
      {
        generation: 1,
        phase: "ready",
        items: [item("activate")],
        matched_entry_contexts: [],
        total: 1,
        confirmation_reasons: ["visibility_activation"],
        surface_confirmation_token: "activate-token"
      },
      onConfirm,
      vi.fn(),
      "activate"
    );

    expect(screen.getByText("激活前需要确认同名公开范围")).toBeVisible();
    expect(screen.getByText(/确认后将按当前结果继续激活/)).toBeInTheDocument();
    expect(screen.queryByText(/恢复/)).toBeNull();
    fireEvent.click(screen.getByText("确认并激活"));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("activate 模式的过期快照要求重新检查激活条件", () => {
    const onRestart = vi.fn();
    renderPanel(
      {
        generation: 1,
        phase: "expired",
        items: [item("expired-activate")],
        matched_entry_contexts: [],
        total: 1,
        confirmation_reasons: ["visibility_activation"]
      },
      vi.fn(),
      onRestart,
      "activate"
    );

    fireEvent.click(screen.getByText("重新检查激活条件"));
    expect(onRestart).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/恢复/)).toBeNull();
  });

  it("activate 模式的 disabled gate 不泄漏恢复语义", () => {
    renderPanel(
      {
        generation: 1,
        phase: "disabled",
        items: [item("disabled-activate")],
        matched_entry_contexts: [],
        total: 1,
        confirmation_reasons: ["visibility_activation"],
        policy_block_code:
          "multiple_active_exact_headword_publications_not_enabled"
      },
      vi.fn(),
      vi.fn(),
      "activate"
    );

    expect(screen.getByText(/当前不能继续激活/)).toBeInTheDocument();
    expect(screen.queryByText(/恢复/)).toBeNull();
    expect(screen.queryByText("确认并激活")).toBeNull();
  });
});
