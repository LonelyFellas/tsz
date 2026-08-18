import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WordCreationLayout } from "./WordCreationLayout";
import { completeMeanings, wordFixture } from "./wordCreation.test.helper";

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderLayout(
  props: Omit<Parameters<typeof WordCreationLayout>[0], "children">
) {
  return render(
    <MemoryRouter initialEntries={["/words/word-center/wizard/forms"]}>
      <WordCreationLayout {...props}>
        <div>step-content</div>
      </WordCreationLayout>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("WordCreationLayout", () => {
  it("创建态区分单词、短语，未知意图使用中性文案", () => {
    const neutral = renderLayout({ currentStep: "basics" });
    expect(screen.getByText("创建词条")).toBeInTheDocument();

    neutral.unmount();
    const word = renderLayout({ currentStep: "basics", entryKind: "word" });
    expect(screen.getByText("创建单词")).toBeInTheDocument();

    word.unmount();
    renderLayout({ currentStep: "basics", entryKind: "phrase" });
    expect(screen.getByText("创建短语")).toBeInTheDocument();
  });

  it("Step 1 也展示词条摘要和完成情况", () => {
    renderLayout({ currentStep: "basics" });

    expect(
      screen.getByRole("region", { name: "词条摘要" })
    ).toBeInTheDocument();
    expect(screen.getByText("完成检测后显示")).toBeInTheDocument();
    expect(screen.getByText("完成情况")).toBeInTheDocument();
  });

  it("创建态展示实时摘要并在未创建草稿前禁用后续步骤", () => {
    const onStepChange = vi.fn();
    const view = renderLayout({
      currentStep: "basics",
      draftHeadwords: {
        mode: "distinguish",
        uk: "centre",
        us: "center",
        source_dialect: "us"
      },
      onStepChange
    });

    expect(screen.getByText("step-content")).toBeInTheDocument();
    const laterStep = screen.getByText("词形与发音").closest(".ant-steps-item");
    expect(laterStep).toHaveClass("ant-steps-item-disabled");

    fireEvent.click(screen.getByText("词形与发音"));
    expect(onStepChange).not.toHaveBeenCalled();
    expect(
      view.container.querySelector(".word-creation-summary")
    ).not.toBeNull();
    expect(
      view.container.querySelector(".word-creation-shell")
    ).not.toHaveClass("word-creation-shell--basics");
  });

  it("顶部摘要在缺少 canonical word 时安全展示空状态或统一草稿主词", () => {
    const empty = renderLayout({ currentStep: "forms" });
    expect(screen.getByText("完成检测后显示")).toBeInTheDocument();
    expect(screen.getByText("方言识别").parentElement).toHaveTextContent(
      "待完成"
    );
    expect(screen.getByText("基本词性").parentElement).toHaveTextContent("0");

    empty.unmount();
    renderLayout({
      currentStep: "forms",
      draftHeadwords: { mode: "unified", common: "far" }
    });
    expect(screen.getByText("far", { exact: true })).toBeInTheDocument();
  });

  it("草稿汇总有效完成数，并只允许点击 max_reachable_step 内步骤", () => {
    const onStepChange = vi.fn();
    const word = wordFixture({
      ready: true,
      max_reachable_step: "meanings",
      completed_steps: ["basics", "forms"]
    });
    const view = renderLayout({ word, currentStep: "forms", onStepChange });
    const summary = view.container.querySelector(".word-creation-summary")!;

    expect(summary).toHaveTextContent("方言识别完成");
    expect(summary).toHaveTextContent("基本词性2/2");
    expect(summary).toHaveTextContent("词形变化5/5");
    expect(summary).toHaveTextContent("语义区间1/1");
    expect(summary).toHaveTextContent("语法结构2/2");
    expect(summary).toHaveTextContent("多维词义2/2");
    expect(summary).toHaveTextContent("多维例句2/2");

    fireEvent.click(screen.getByText("词义与例句"));
    expect(onStepChange).toHaveBeenCalledWith("meanings");
    fireEvent.click(screen.getByText("预览并生效"));
    expect(onStepChange).toHaveBeenCalledTimes(1);
  });

  it("旧草稿尚无语义区间时显示未开始，不虚构默认首行", () => {
    const word = wordFixture();
    word.meanings.sense_groups = [];
    const view = renderLayout({ word, currentStep: "meanings" });
    const summary = view.container.querySelector(".word-creation-summary")!;

    expect(summary).toHaveTextContent("语义区间0/1");
    expect(screen.getByText("语义区间").parentElement).toHaveAttribute(
      "data-readiness-state",
      "incomplete"
    );
  });

  it("空白初始化节点显示 0/总数且不使用完成图标", () => {
    const word = wordFixture({
      completed_steps: ["basics", "forms"],
      max_reachable_step: "meanings"
    });
    renderLayout({ word, currentStep: "meanings" });

    for (const [label, value] of [
      ["语义区间", "0/1"],
      ["语法结构", "0/2"],
      ["多维词义", "0/2"],
      ["多维例句", "0/2"]
    ] as const) {
      const row = screen.getByText(label).parentElement!;
      expect(row).toHaveTextContent(value);
      expect(row).toHaveAttribute("data-readiness-state", "incomplete");
      expect(row.querySelector(".word-progress-done")).toBeNull();
    }
  });

  it("优先使用当前未保存草稿实时计算摘要", () => {
    const word = wordFixture({
      completed_steps: ["basics", "forms"],
      max_reachable_step: "meanings"
    });
    const meanings = completeMeanings(word.meanings, word.headwords);
    renderLayout({
      word,
      currentStep: "meanings",
      readinessDraft: { meanings }
    });

    expect(screen.getByText("语义区间").parentElement).toHaveTextContent("1/1");
    expect(screen.getByText("语法结构").parentElement).toHaveTextContent("2/2");
    expect(screen.getByText("多维词义").parentElement).toHaveTextContent("2/2");
    expect(screen.getByText("多维例句").parentElement).toHaveTextContent("2/2");
  });

  it("点击待完善项交出稳定定位目标", () => {
    const word = wordFixture({
      completed_steps: ["basics", "forms"],
      max_reachable_step: "meanings"
    });
    const onReadinessNavigate = vi.fn();
    renderLayout({
      word,
      currentStep: "meanings",
      onReadinessNavigate
    });

    fireEvent.click(screen.getByText("语法结构"));
    expect(onReadinessNavigate).toHaveBeenCalledWith({
      step: "meanings",
      pos_id: word.meanings.pos[0]!.pos_id,
      node_id: word.meanings.pos[0]!.grammar_structures[0]!.id,
      field: "content.uk"
    });
  });

  it("published 只读态在顶部摘要显示准确标识，并可返回词库", () => {
    const word = wordFixture({ status: "published", ready: true });
    const view = renderLayout({ word, currentStep: "preview", readOnly: true });

    expect(screen.getByText("已发布 · 只读")).toBeInTheDocument();
    expect(screen.getByText("centre · 预览并生效")).toBeInTheDocument();
    const summary = view.container.querySelector<HTMLElement>(
      ".word-creation-summary"
    )!;
    fireEvent.click(within(summary).getByText("返回智能词库"));
    expect(screen.getByTestId("location")).toHaveTextContent("/words");
  });

  it("published 编辑态与 archived 只读态显示各自状态，不误报只读或可编辑", () => {
    const editing = wordFixture({
      status: "published",
      ready: true,
      revision: 4,
      published_revision: 3,
      has_unpublished_changes: true
    });
    const view = renderLayout({
      word: editing,
      currentStep: "forms",
      readOnly: false
    });
    expect(screen.getByText("已发布 · 编辑未发布修改")).toBeInTheDocument();
    expect(screen.queryByText("已发布 · 只读")).toBeNull();

    view.unmount();
    renderLayout({
      word: wordFixture({ status: "archived", ready: true }),
      currentStep: "preview",
      readOnly: true
    });
    expect(screen.getByText("已归档 · 只读")).toBeInTheDocument();
  });
});
