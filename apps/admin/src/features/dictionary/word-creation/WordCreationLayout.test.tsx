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
  it("创建态显示检测中的双方言主词，未创建草稿前禁用后续步骤", () => {
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

    expect(screen.getByText("centre")).toBeInTheDocument();
    expect(screen.getByText("center")).toBeInTheDocument();
    expect(screen.getByText("step-content")).toBeInTheDocument();
    const laterStep = screen.getByText("词形与发音").closest(".ant-steps-item");
    expect(laterStep).toHaveClass("ant-steps-item-disabled");

    fireEvent.click(screen.getByText("词形与发音"));
    expect(onStepChange).not.toHaveBeenCalled();
    expect(
      view.container.querySelector(".word-creation-summary")
    ).toHaveTextContent(
      "方言识别待完成基本词性0词形变化0语法结构0多维词义0多维例句0"
    );
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
    expect(summary).toHaveTextContent("语法结构2");
    expect(summary).toHaveTextContent("多维词义2");
    expect(summary).toHaveTextContent("多维例句2");

    fireEvent.click(screen.getByText("词义与例句"));
    expect(onStepChange).toHaveBeenCalledWith("meanings");
    fireEvent.click(screen.getByText("预览并生效"));
    expect(onStepChange).toHaveBeenCalledTimes(1);
  });

  it("published 显示只读标识，侧栏和面包屑均可返回词库", () => {
    const word = wordFixture({ status: "published", ready: true });
    const view = renderLayout({ word, currentStep: "preview" });

    expect(screen.getByText("已发布 · 只读")).toBeInTheDocument();
    expect(screen.getByText("centre · 预览并生效")).toBeInTheDocument();
    const aside = view.container.querySelector<HTMLElement>(
      ".word-creation-summary"
    )!;
    fireEvent.click(within(aside).getByText("返回智能词库"));
    expect(screen.getByTestId("location")).toHaveTextContent("/words");
  });
});
