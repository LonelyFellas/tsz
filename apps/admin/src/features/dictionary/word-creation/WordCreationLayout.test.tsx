import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WordCreationLayout } from "./WordCreationLayout";
import { wordFixture } from "./wordCreation.test.helper";

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

  it("草稿汇总结构数量，并只允许点击 max_reachable_step 内步骤", () => {
    const onStepChange = vi.fn();
    const word = wordFixture({
      ready: true,
      max_reachable_step: "meanings",
      completed_steps: ["basics", "forms"]
    });
    const view = renderLayout({ word, currentStep: "forms", onStepChange });
    const summary = view.container.querySelector(".word-creation-summary")!;

    expect(summary).toHaveTextContent("方言识别完成");
    expect(summary).toHaveTextContent("基本词性2");
    expect(summary).toHaveTextContent("词形变化5");
    expect(summary).toHaveTextContent("语义区间1");
    expect(summary).toHaveTextContent("语法结构2");
    expect(summary).toHaveTextContent("多维词义2");
    expect(summary).toHaveTextContent("多维例句2");

    fireEvent.click(screen.getByText("词义与例句"));
    expect(onStepChange).toHaveBeenCalledWith("meanings");
    fireEvent.click(screen.getByText("预览并生效"));
    expect(onStepChange).toHaveBeenCalledTimes(1);
  });

  it("旧草稿尚无语义区间时，完成情况与默认首行一致显示 1", () => {
    const word = wordFixture();
    word.meanings.sense_groups = [];
    const view = renderLayout({ word, currentStep: "meanings" });
    const summary = view.container.querySelector(".word-creation-summary")!;

    expect(summary).toHaveTextContent("语义区间1");
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
