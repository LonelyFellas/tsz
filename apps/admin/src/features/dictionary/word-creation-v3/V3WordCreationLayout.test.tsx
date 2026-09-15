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
import { mockPageWidthObserver } from "../word-creation/wordCreation.test.helper";
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
    annotation: null,
    annotation_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: "centre",
      matched_surfaces: ["centre"],
      strategy_version: "v3"
    },
    capabilities: {
      publication: {
        mode: "native" as const
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
    onIssueNavigate?: (issue: V3DraftValidationIssue) => void;
    onRefreshConflict?: () => void;
    remoteUpdate?: AdminWordV3;
    remoteUpdateNotice?: number;
    onKeepLocalChanges?: () => void;
    onDiscardLocalChanges?: () => void;
    word?: AdminWordV3;
  } = {}
) {
  return render(
    <MemoryRouter>
      <V3WordCreationLayout
        word={options.word ?? word()}
        activeStep={options.activeStep ?? "forms"}
        draftForms={options.draftForms}
        draftMeanings={options.draftMeanings}
        readOnly={options.readOnly}
        dirtySteps={options.dirtySteps}
        problem={options.problem}
        conflict={options.conflict}
        onStepChange={(step) => options.onStepChange?.(step)}
        onIssueNavigate={(issue) => options.onIssueNavigate?.(issue)}
        onRefreshConflict={options.onRefreshConflict}
        remoteUpdate={options.remoteUpdate}
        remoteUpdateNotice={options.remoteUpdateNotice}
        onKeepLocalChanges={options.onKeepLocalChanges}
        onDiscardLocalChanges={options.onDiscardLocalChanges}
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

  it("引用冲突 409 展示后端原因与引用列表，而不是「操作未完成」", () => {
    renderLayout({
      problem: {
        kind: "inbound_reference",
        status: 409,
        code: "inbound_reference_conflict",
        detail:
          "本次修改会破坏其他内容对本词条的引用，请先解除或调整这些引用。",
        references: [
          {
            id: "draft_relation:relation-1",
            kind: "draft_relation",
            target: { sense_id: "sense-1" },
            stale: true,
            source: {
              entry_id: "entry-2",
              entry_headword: "circle",
              entry_status: "draft",
              sense_gloss: "圆圈",
              node_id: "relation-1",
              relation_type: "antonym"
            }
          }
        ],
        retryable: false
      }
    });

    expect(
      screen.getByText("本次修改会破坏其他内容对本词条的引用")
    ).toBeVisible();
    expect(screen.queryByText("操作未完成")).toBeNull();
    expect(screen.getByText("反义词")).toBeVisible();
    expect(screen.getByText("circle")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "打开来源词条" }).getAttribute("href")
    ).toBe("/words/entry-2/v3/wizard/meanings?focus_node=relation-1");
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
      "语言识别",
      "基本词性",
      "词形变化",
      "语义区间",
      "语法结构",
      "多维词义",
      "多维例句"
    ]);
    expect(rows.map((row) => row.textContent)).toEqual([
      "语言识别完成",
      "基本词性1",
      "词形变化2",
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
    expect(rows[2]).toHaveTextContent("词形变化2");
  });

  it("完成情况默认收起，点击行展开该行明细、再点收起", () => {
    renderLayout({ word: word() });

    const row = (label: string) =>
      screen
        .getByText(label)
        .closest<HTMLButtonElement>(".word-creation-progress-row")!;
    const detailsOf = (label: string) =>
      row(label)
        .closest(".v3-product-progress-group")!
        .querySelector(".v3-product-progress-details");

    // 默认全部收起：一条明细都不渲染
    expect(
      document.querySelectorAll(".v3-product-progress-details")
    ).toHaveLength(0);
    for (const label of [
      "语言识别",
      "基本词性",
      "词形变化",
      "语义区间",
      "语法结构",
      "多维词义",
      "多维例句"
    ]) {
      expect(row(label)).toHaveAttribute("aria-expanded", "false");
    }

    fireEvent.click(row("多维词义"));
    expect(row("多维词义")).toHaveAttribute("aria-expanded", "true");
    expect(detailsOf("多维词义")).not.toBeNull();
    // 展开互不影响：其余行仍旧收起
    expect(
      document.querySelectorAll(".v3-product-progress-details")
    ).toHaveLength(1);
    expect(row("语义区间")).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(row("语法结构"));
    expect(
      document.querySelectorAll(".v3-product-progress-details")
    ).toHaveLength(2);

    fireEvent.click(row("多维词义"));
    expect(row("多维词义")).toHaveAttribute("aria-expanded", "false");
    expect(detailsOf("多维词义")).toBeNull();
    expect(
      document.querySelectorAll(".v3-product-progress-details")
    ).toHaveLength(1);
  });

  it("窄屏入口按完成的行数报计数，清单本身不再占首屏", () => {
    const observer = mockPageWidthObserver(900);
    try {
      renderLayout({ word: word() });

      // fixture 里「语言识别」「基本词性」两行已完成
      expect(
        screen.getByRole("button", { name: "完成情况 2/7" })
      ).toBeInTheDocument();
      expect(screen.queryByText("多维例句")).not.toBeInTheDocument();
    } finally {
      observer.restore();
    }
  });

  it("左栏只保留返回和完成情况，面包屑保留第一个原形", () => {
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
    expect(summary.queryByText("center", { exact: true })).toBeNull();
    expect(summary.queryByText("当前词条")).toBeNull();
    expect(summary.queryByText("所属语言")).toBeNull();
    expect(
      summary.getByRole("button", { name: /返回智能词库/u })
    ).toBeVisible();
    expect(screen.getByText("center · 词形与发音")).toBeVisible();
    expect(summary.queryByText("center / centers")).toBeNull();
    expect(summary.queryByText("alternate-base")).toBeNull();
    expect(summary.queryByText("centers", { exact: true })).toBeNull();
  });

  it("语言识别展示英美类型色点，不重复展示原形与检测基准", () => {
    const current = word();
    current.detection_basis_dialect = "us";
    current.forms = formsFixture({ forms: [ukUsFormFixture()] });
    renderLayout({ word: current });
    // 明细默认收起，先展开「语言识别」
    fireEvent.click(screen.getByRole("button", { name: "展开语言识别" }));
    const summary = screen.getByRole("region", { name: "语言识别摘要" });
    expect(within(summary).getByText("英语 English")).toBeVisible();
    expect(within(summary).getByText("BrE")).toBeVisible();
    expect(within(summary).getByText("AmE")).toBeVisible();
    expect(summary.querySelector(".dialect-dot-uk")).not.toBeNull();
    expect(summary.querySelector(".dialect-dot-us")).not.toBeNull();
    expect(screen.queryByText(/检测基准/u)).toBeNull();
  });

  it("类型子行只依据当前草稿配置，不依赖原始检测证据", () => {
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
    // 明细默认收起，先展开「语言识别」
    fireEvent.click(screen.getByRole("button", { name: "展开语言识别" }));

    expect(
      view.container.querySelectorAll(".word-creation-summary-headword")
    ).toHaveLength(0);
    expect(screen.getByText("BrE")).toBeVisible();
    expect(screen.getByText("AmE")).toBeVisible();
    expect(screen.queryByText(/检测基准/u)).toBeNull();
  });

  it("拼写相同但发音区分时仍展示两种语言类型", () => {
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
    // 明细默认收起，先展开「语言识别」
    fireEvent.click(screen.getByRole("button", { name: "展开语言识别" }));

    const summary = within(screen.getByRole("region", { name: "词条摘要" }));
    expect(summary.queryByText("center", { exact: true })).toBeNull();
    expect(summary.queryByText("当前词条")).toBeNull();
    expect(summary.queryByText("所属语言")).toBeNull();
    expect(
      summary.getByRole("button", { name: /返回智能词库/u })
    ).toBeVisible();
    expect(screen.getByText("center · 词形与发音")).toBeVisible();
    expect(summary.queryByText("center / center")).toBeNull();
    expect(summary.getByText("BrE")).toBeVisible();
    expect(summary.getByText("AmE")).toBeVisible();
  });

  it("没有原形时回退后端 presentation label", () => {
    const current = word();
    current.presentation.label = "fallback-label";
    current.forms = formsFixture({
      forms: [commonFormFixture({ form_type: "plural" })]
    });

    renderLayout({ word: current });

    const summary = within(screen.getByRole("region", { name: "词条摘要" }));
    expect(summary.queryByText("fallback-label", { exact: true })).toBeNull();
    expect(screen.getByText("fallback-label · 词形与发音")).toBeVisible();
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
      summary.queryByText("fallback-for-blank-base", { exact: true })
    ).toBeNull();
    expect(
      screen.getByText("fallback-for-blank-base · 词形与发音")
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

  it("服务端新版本待决时给出保留或放弃本地修改的选择", async () => {
    const onKeepLocalChanges = vi.fn();
    const onDiscardLocalChanges = vi.fn();
    renderLayout({
      remoteUpdate: { ...word(), revision: 3 },
      dirtySteps: { forms: true, meanings: true },
      onKeepLocalChanges,
      onDiscardLocalChanges
    });

    expect(screen.getByText("版本冲突")).toBeVisible();
    expect(
      screen.getByText(
        "词条已在别处保存为第 3 版；你在「词形与发音、词义与例句」的修改尚未保存，本地输入仍已保留。"
      )
    ).toBeVisible();
    // 待决时不能再提示「请先保存草稿」：做出选择前保存会被拦下。
    expect(screen.queryByText("有未保存的草稿")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "保留本地修改" }));
    expect(onKeepLocalChanges).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "放弃本地修改" }));
    expect(onDiscardLocalChanges).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "放弃修改" }));
    expect(onDiscardLocalChanges).toHaveBeenCalledTimes(1);
  });

  it("只读会话不显示服务端新版本的冲突选择", () => {
    renderLayout({
      remoteUpdate: { ...word(), revision: 3 },
      readOnly: true,
      onKeepLocalChanges: vi.fn(),
      onDiscardLocalChanges: vi.fn()
    });

    expect(screen.queryByText("版本冲突")).toBeNull();
    expect(screen.queryByRole("button", { name: "保留本地修改" })).toBeNull();
  });

  it("每次被拦下的写操作都把冲突提示滚回视野", () => {
    const scrollIntoView = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    const layout = (notice: number) => (
      <MemoryRouter>
        <V3WordCreationLayout
          word={word()}
          activeStep="forms"
          dirtySteps={{ forms: true, meanings: false }}
          remoteUpdate={{ ...word(), revision: 3 }}
          remoteUpdateNotice={notice}
          onStepChange={() => {}}
        >
          <div>step body</div>
        </V3WordCreationLayout>
      </MemoryRouter>
    );
    try {
      const view = render(layout(0));
      expect(scrollIntoView).not.toHaveBeenCalled();
      view.rerender(layout(1));
      expect(scrollIntoView).toHaveBeenCalledTimes(1);
      view.rerender(layout(2));
      expect(scrollIntoView).toHaveBeenCalledTimes(2);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it("刷新并比较取回服务端内容后也可以放弃本地修改", async () => {
    const onDiscardLocalChanges = vi.fn();
    renderLayout({
      problem: {
        kind: "revision_conflict",
        status: 409,
        retryable: false,
        invalidates_confirmation: true
      },
      conflict: {
        step: "forms",
        baseRevision: 1,
        localForms: formsFixture(),
        serverWord: { ...word(), revision: 4 }
      },
      onRefreshConflict: vi.fn(),
      onDiscardLocalChanges
    });

    expect(screen.getByText("已获取服务端最新内容。")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "放弃本地修改" }));
    fireEvent.click(await screen.findByRole("button", { name: "放弃修改" }));
    expect(onDiscardLocalChanges).toHaveBeenCalledTimes(1);
  });

  it("服务端新版本待决时不再并列显示同名的 409 冲突提示", () => {
    renderLayout({
      problem: {
        kind: "revision_conflict",
        status: 409,
        retryable: false,
        invalidates_confirmation: true
      },
      conflict: {
        step: "forms",
        baseRevision: 1,
        localForms: formsFixture(),
        serverWord: { ...word(), revision: 2 }
      },
      remoteUpdate: { ...word(), revision: 3 },
      dirtySteps: { forms: true, meanings: false },
      onRefreshConflict: vi.fn(),
      onKeepLocalChanges: vi.fn(),
      onDiscardLocalChanges: vi.fn()
    });

    expect(screen.getAllByText("版本冲突")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "刷新并比较" })).toBeNull();
    expect(
      screen.getAllByRole("button", { name: "放弃本地修改" })
    ).toHaveLength(1);
  });
});
