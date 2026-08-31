import type {
  AdminWordV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  V3DraftValidationIssue,
  WordCreationStep
} from "@tsz/types";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  commonFormFixture,
  formsFixture,
  ukUsFormFixture,
  uuidFromInt
} from "./fixtures";
import type { V3Problem } from "./problem";
import type { V3IssueNavigationTarget } from "./issueNavigation";
import {
  V3WordCreationLayout,
  type V3ConflictComparison
} from "./V3WordCreationLayout";

const dialectPreference = vi.hoisted(() => ({ value: "uk" as "uk" | "us" }));

vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({
    preference: dialectPreference.value,
    savePreference: vi.fn()
  })
}));

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
    activeStep?: WordCreationStep;
    draftForms?: DraftFormsStepContentV3;
    draftMeanings?: DraftMeaningsStepContentWritableV3;
    onStepChange?: (step: WordCreationStep) => void;
    onProgressNavigate?: (target: V3IssueNavigationTarget) => void;
    onIssueNavigate?: (issue: V3DraftValidationIssue) => void;
    onRefreshConflict?: () => void;
    word?: AdminWordV3;
  } = {}
) {
  const issues = options.issues ?? [];
  return render(
    <MemoryRouter>
      <V3WordCreationLayout
        word={options.word ?? word()}
        activeStep={options.activeStep ?? "forms"}
        draftForms={options.draftForms}
        draftMeanings={options.draftMeanings}
        readOnly={options.readOnly}
        dirtySteps={options.dirtySteps}
        issues={issues}
        problem={options.problem}
        conflict={options.conflict}
        onStepChange={(step) => options.onStepChange?.(step)}
        onProgressNavigate={(target) => options.onProgressNavigate?.(target)}
        onIssueNavigate={(issue) => options.onIssueNavigate?.(issue)}
        onRefreshConflict={options.onRefreshConflict}
      >
        <div>step body</div>
      </V3WordCreationLayout>
    </MemoryRouter>
  );
}

describe("V3WordCreationLayout", () => {
  beforeEach(() => {
    dialectPreference.value = "uk";
  });

  it("does not repeat publication issues in the wizard layout", () => {
    renderLayout({ activeStep: "forms", issues: [issue()] });

    expect(screen.queryByRole("region", { name: "待完成项" })).toBeNull();
    expect(screen.getByText("step body")).toBeVisible();
  });

  it("shows stable completion validation guidance and navigates its first issue", () => {
    const currentIssue = issue();
    const onIssueNavigate = vi.fn();
    renderLayout({
      problem: {
        kind: "validation",
        status: 422,
        code: "validation_failed",
        issues: [currentIssue],
        operation: "save_meanings",
        retryable: false
      },
      onIssueNavigate
    });

    expect(screen.getByText("仍有内容需要完成")).toBeVisible();
    expect(screen.getByText("内容来源无法确认，请刷新后重试")).toBeVisible();
    expect(screen.queryByText("spelling is invalid")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "去处理首项" }));
    expect(onIssueNavigate).toHaveBeenCalledWith(currentIssue);
  });

  it("shows the seven product completion rows without engineering step copy", () => {
    const current = word();
    current.completed_steps = ["basics", "forms"];
    current.forms = formsFixture({
      forms: [
        commonFormFixture(),
        commonFormFixture({
          id: uuidFromInt(903),
          form_type: "plural",
          spelling: "centres"
        })
      ]
    });
    current.meanings = {
      sense_groups: [
        { id: uuidFromInt(909), name_zh: "位置", name_en: "Position" }
      ],
      pos: [
        {
          pos_id: current.forms.pos[0]!.pos_id,
          grammar_structures: [{ id: uuidFromInt(904), variants: [] }],
          senses: [
            {
              id: uuidFromInt(905),
              sub_pos: "countable",
              level: "A1",
              sense_group_id: uuidFromInt(909),
              depends_on_context: false,
              definitions: [],
              sentences: [
                {
                  id: uuidFromInt(906),
                  level: "A1",
                  en_text: {
                    mode: "unified",
                    common: {
                      id: uuidFromInt(907),
                      value: { version: 2, text: "A centre.", annotations: [] },
                      origin: "manual"
                    }
                  },
                  zh_text_id: uuidFromInt(908),
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

    const view = renderLayout({ word: current });
    const rows = Array.from(
      view.container.querySelectorAll<HTMLElement>(
        ".word-creation-progress-row"
      )
    );

    expect(
      rows.map((row) => row.querySelector(".word-progress-label")?.textContent)
    ).toEqual([
      "方言识别",
      "基本词性",
      "词形变化",
      "语义区间",
      "语法结构",
      "多维词义",
      "多维例句"
    ]);
    expect(rows.map((row) => row.textContent)).toEqual([
      "方言识别完成",
      "基本词性1",
      "词形变化1",
      "4语义区间1",
      "5语法结构1",
      "6多维词义1",
      "7多维例句1"
    ]);
    expect(
      rows.slice(0, 3).every((row) => row.dataset.readinessState === "complete")
    ).toBe(true);
    expect(
      rows.slice(3).every((row) => row.dataset.readinessState === "incomplete")
    ).toBe(true);
    expect(
      rows.slice(0, 3).every((row) => row.querySelector(".word-progress-done"))
    ).toBe(true);
    expect(
      rows
        .slice(3)
        .map((row) => row.querySelector(".word-progress-index")?.textContent)
    ).toEqual(["4", "5", "6", "7"]);

    const progressText = rows.map((row) => row.textContent).join(" ");
    for (const forbidden of [
      "基础信息",
      "词形编辑",
      "词义编辑",
      "发布检查",
      "原形发音",
      "待完成",
      "未保存",
      "待核对"
    ]) {
      expect(progressText).not.toContain(forbidden);
    }
    expect(progressText).not.toMatch(/\d+\/\d+/u);
  });

  it("routes all seven completion questions to native V3 steps and stable nodes", () => {
    const current = word();
    current.forms = formsFixture({
      forms: [
        commonFormFixture(),
        commonFormFixture({
          id: uuidFromInt(921),
          form_type: "plural"
        })
      ]
    });
    current.meanings = {
      sense_groups: [
        { id: uuidFromInt(924), name_zh: "位置", name_en: "Position" }
      ],
      pos: [
        {
          pos_id: current.forms.pos[0]!.pos_id,
          grammar_structures: [{ id: uuidFromInt(922), variants: [] }],
          senses: [
            {
              id: uuidFromInt(923),
              sub_pos: "countable",
              level: "A1",
              sense_group_id: uuidFromInt(924),
              depends_on_context: false,
              definitions: [],
              sentences: [],
              relations: []
            }
          ]
        }
      ]
    };
    const onProgressNavigate = vi.fn();
    renderLayout({ word: current, onProgressNavigate });

    for (const label of [
      "方言识别",
      "基本词性",
      "词形变化",
      "语义区间",
      "语法结构",
      "多维词义",
      "多维例句"
    ]) {
      fireEvent.click(screen.getByText(label));
    }

    expect(
      onProgressNavigate.mock.calls.map(
        (call) => (call[0] as V3IssueNavigationTarget).step
      )
    ).toEqual([
      "basics",
      "forms",
      "forms",
      "meanings",
      "meanings",
      "meanings",
      "meanings"
    ]);
    expect(onProgressNavigate.mock.calls[2]![0]).toMatchObject({
      form_id: uuidFromInt(921),
      node_id: uuidFromInt(921),
      field: "form_type"
    });
    expect(onProgressNavigate.mock.calls[3]![0]).toMatchObject({
      node_id: uuidFromInt(924),
      field: "name_zh"
    });
    expect(onProgressNavigate.mock.calls[4]![0]).toMatchObject({
      node_id: uuidFromInt(922),
      field: "variants"
    });
    expect(onProgressNavigate.mock.calls[5]![0]).toMatchObject({
      node_id: uuidFromInt(923),
      field: "sense"
    });
  });

  it("当前词条只展示第一个原形，不拼接后续原形或其他词形", () => {
    const current = word();
    current.presentation.label = "center / centers";
    current.presentation.matched_surfaces = ["center", "centers"];
    current.forms = formsFixture({
      forms: [
        commonFormFixture({ spelling: "center" }),
        commonFormFixture({
          id: uuidFromInt(901),
          spelling: "alternate-base"
        }),
        commonFormFixture({
          id: uuidFromInt(902),
          form_type: "plural",
          spelling: "centers"
        })
      ]
    });

    renderLayout({ word: current });

    const summary = within(screen.getByRole("region", { name: "词条摘要" }));
    expect(summary.getByText("center", { exact: true })).toBeVisible();
    expect(summary.queryByText("center / centers")).toBeNull();
    expect(summary.queryByText("alternate-base")).toBeNull();
    expect(summary.queryByText("centers", { exact: true })).toBeNull();
  });

  it("英美原形按偏好分行并把检测基准标在真实命中侧", () => {
    const current = word();
    current.detection_basis_dialect = "us";
    current.forms = formsFixture({
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      },
      forms: [
        ukUsFormFixture({
          uk: { spelling: "centre" },
          us: { spelling: "center" }
        })
      ]
    });

    const view = renderLayout({ word: current });

    const summaryRegion = screen.getByRole("region", { name: "词条摘要" });
    const summary = within(summaryRegion);
    expect(summary.getByText("centre", { exact: true })).toBeVisible();
    expect(summary.getByText("center", { exact: true })).toBeVisible();
    expect(summary.getByText("英式英语 · BrE", { exact: true })).toBeVisible();
    expect(
      summary.getByText("美式英语 · AmE · 检测基准", { exact: true })
    ).toBeVisible();
    expect(summary.queryByText("centre / center", { exact: true })).toBeNull();
    expect(summaryRegion.querySelector(".dialect-dot-common")).toBeNull();

    view.unmount();
    dialectPreference.value = "us";
    const usView = renderLayout({ word: current });
    const rows = Array.from(
      usView.container.querySelectorAll<HTMLElement>(
        ".word-creation-summary-headword"
      )
    );
    expect(rows[0]!.querySelector("strong")?.textContent).toBe("center");
    expect(rows[0]).toHaveTextContent("美式英语 · AmE · 检测基准");
    expect(rows[1]).toHaveTextContent("centre");
    expect(rows[1]).not.toHaveTextContent("检测基准");
  });

  it("缺少原始检测证据时仍分行展示但不猜测检测基准", () => {
    const current = word();
    current.forms = formsFixture({
      dialect_rules: {
        spelling_mode: "distinguish",
        phonetic_mode: "distinguish"
      },
      forms: [
        ukUsFormFixture({
          uk: { spelling: "centre" },
          us: { spelling: "center" }
        })
      ]
    });

    const view = renderLayout({ word: current });

    expect(
      view.container.querySelectorAll(".word-creation-summary-headword")
    ).toHaveLength(2);
    expect(screen.queryByText(/检测基准/u)).toBeNull();
  });

  it("第一个原形为同拼写英美结构时摘要只显示一次", () => {
    const current = word();
    current.forms = formsFixture({
      dialect_rules: {
        spelling_mode: "unified",
        phonetic_mode: "distinguish"
      },
      forms: [
        ukUsFormFixture({
          uk: { spelling: "center" },
          us: { spelling: "center" }
        })
      ]
    });

    renderLayout({ word: current });

    const summary = within(screen.getByRole("region", { name: "词条摘要" }));
    expect(summary.getByText("center", { exact: true })).toBeVisible();
    expect(summary.queryByText("center / center")).toBeNull();
  });

  it("没有原形时回退后端 presentation label", () => {
    const current = word();
    current.presentation.label = "fallback-label";
    current.forms = formsFixture({
      forms: [commonFormFixture({ form_type: "plural" })]
    });

    renderLayout({ word: current });

    const summary = within(screen.getByRole("region", { name: "词条摘要" }));
    expect(summary.getByText("fallback-label", { exact: true })).toBeVisible();
  });

  it("第一个原形为空白时回退后端 presentation label", () => {
    const current = word();
    current.presentation.label = "fallback-for-blank-base";
    current.forms = formsFixture({
      forms: [commonFormFixture({ spelling: "  " })]
    });

    renderLayout({ word: current });

    const summary = within(screen.getByRole("region", { name: "词条摘要" }));
    expect(
      summary.getByText("fallback-for-blank-base", { exact: true })
    ).toBeVisible();
  });

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

  it("routes writable step clicks to their handlers", () => {
    const onStepChange = vi.fn();
    renderLayout({
      issues: [issue()],
      onStepChange
    });

    fireEvent.click(screen.getByText("词义与例句"));

    expect(onStepChange).toHaveBeenCalledWith("meanings");
  });

  it("shows dirty steps only for writable sessions", () => {
    const dirtySteps = { forms: true, meanings: true };
    const writable = renderLayout({ dirtySteps });

    expect(screen.getByText("有未保存的草稿")).toBeInTheDocument();
    expect(screen.getByText(/词形与发音、词义与例句/)).toBeInTheDocument();

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

    expect(screen.getByText("词义与例句冲突")).toBeInTheDocument();
    expect(onRefreshConflict).toHaveBeenCalledTimes(1);
  });
});
