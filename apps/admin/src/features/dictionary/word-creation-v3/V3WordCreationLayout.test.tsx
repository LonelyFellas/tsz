import type { AdminWordV3, V3DraftValidationIssue } from "@tsz/types";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formsFixture } from "./fixtures";
import type { V3Problem } from "./problem";
import {
  V3WordCreationLayout,
  type V3ConflictComparison
} from "./V3WordCreationLayout";

function word(): AdminWordV3 {
  return {
    schema_version: 3,
    id: "word-1",
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
      publication: {
        mode: "shadow_only",
        blocked_code: "phase2_consumers_not_ready"
      },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: formsFixture(),
    meanings: { sense_groups: [], pos: [] },
    completed_steps: ["basics"],
    max_reachable_step: "forms",
    created_by: "admin-1",
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
}

function issue(): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id: "form-1",
    field: "spelling",
    code: "node_binding_unknown",
    message: "spelling is invalid",
    node_location: {
      node_role: "concrete_form",
      ancestor_node_ids: ["pos-1"],
      pos_id: "pos-1",
      form_id: "form-1"
    }
  };
}

function renderLayout(
  options: {
    problem?: V3Problem;
    issues?: V3DraftValidationIssue[];
    readOnly?: boolean;
    dirtySteps?: { forms: boolean; meanings: boolean };
    conflict?: V3ConflictComparison;
    onStepChange?: (step: "forms" | "meanings") => void;
    onIssueNavigate?: (issue: V3DraftValidationIssue) => void;
    onRefreshConflict?: () => void;
  } = {}
) {
  const issues = options.issues ?? [];
  return render(
    <V3WordCreationLayout
      word={word()}
      activeStep="forms"
      readOnly={options.readOnly}
      dirtySteps={options.dirtySteps}
      readiness={{
        issue_count: issues.length,
        positions: []
      }}
      issues={issues}
      problem={options.problem}
      conflict={options.conflict}
      onStepChange={(step) =>
        options.onStepChange?.(step as "forms" | "meanings")
      }
      onIssueNavigate={(value) => options.onIssueNavigate?.(value)}
      onRefreshConflict={options.onRefreshConflict}
    >
      <div>step body</div>
    </V3WordCreationLayout>
  );
}

describe("V3WordCreationLayout", () => {
  it.each([
    [
      { kind: "network", error: new TypeError("offline"), retryable: true },
      "服务暂时不可用"
    ],
    [
      { kind: "authentication", status: 401, retryable: false },
      "登录状态已失效"
    ],
    [{ kind: "authorization", status: 403, retryable: false }, "没有操作权限"],
    [
      {
        kind: "client_contract",
        error: new Error("invalid response"),
        retryable: false,
        fail_closed: true
      },
      "响应格式异常，已安全停止"
    ],
    [
      {
        kind: "unexpected_client",
        error: new Error("unexpected"),
        retryable: false,
        fail_closed: true
      },
      "响应格式异常，已安全停止"
    ]
  ] as const)("renders the stable title for %#", (problem, title) => {
    renderLayout({ problem: problem as V3Problem });

    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it("routes writable step and issue clicks to their handlers", () => {
    const onStepChange = vi.fn();
    const onIssueNavigate = vi.fn();
    const validationIssue = issue();
    renderLayout({
      issues: [validationIssue],
      onStepChange,
      onIssueNavigate
    });

    fireEvent.click(screen.getByText("释义与例句"));
    fireEvent.click(
      screen.getByRole("button", { name: "spelling is invalid" })
    );

    expect(onStepChange).toHaveBeenCalledWith("meanings");
    expect(onIssueNavigate).toHaveBeenCalledWith(validationIssue);
  });

  it("shows dirty steps only for writable sessions", () => {
    const dirtySteps = { forms: true, meanings: true };
    const writable = renderLayout({ dirtySteps });

    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
    expect(screen.getByText(/词形与发音、释义与例句/)).toBeInTheDocument();

    writable.unmount();
    renderLayout({ dirtySteps, readOnly: true });
    expect(screen.queryByText("有未保存的草稿")).toBeNull();
  });

  it("only offers refresh when a recoverable step conflict exists", () => {
    const revisionConflict: V3Problem = {
      kind: "revision_conflict",
      status: 409,
      retryable: false,
      invalidates_confirmation: true
    };
    const onRefreshConflict = vi.fn();
    const withoutRecovery = renderLayout({
      problem: revisionConflict,
      onRefreshConflict
    });

    expect(screen.queryByRole("button", { name: "刷新并比较" })).toBeNull();

    withoutRecovery.unmount();
    renderLayout({
      problem: revisionConflict,
      conflict: {
        step: "meanings",
        baseRevision: 1,
        localMeanings: { sense_groups: [], pos: [] }
      },
      onRefreshConflict
    });
    fireEvent.click(screen.getByRole("button", { name: "刷新并比较" }));

    expect(screen.getByText("释义与例句冲突")).toBeInTheDocument();
    expect(onRefreshConflict).toHaveBeenCalledTimes(1);
  });
});
