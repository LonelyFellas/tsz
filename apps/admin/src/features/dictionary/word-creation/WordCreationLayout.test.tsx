import { fireEvent, render, screen, within } from "@testing-library/react";
import { Typography } from "@tsz/ui/admin/display";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WordCreationLayout } from "./WordCreationLayout";

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
}

type LayoutProps = Omit<Parameters<typeof WordCreationLayout>[0], "children">;

function presentation(
  overrides: Partial<LayoutProps["presentation"]> = {}
): LayoutProps["presentation"] {
  return {
    wordExists: true,
    breadcrumbTitle: "centre · 词形与发音",
    completedSteps: ["basics"],
    showEntrySummary: false,
    progress: <div data-testid="progress-list">清单</div>,
    ...overrides
  };
}

function renderLayout(
  props: LayoutProps,
  initialEntry = "/words/word-center/v3/wizard/forms"
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <WordCreationLayout {...props}>
        <div>step-content</div>
      </WordCreationLayout>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe("WordCreationLayout", () => {
  it("面包屑与词条摘要都由调用方给定，壳不自行拼词条信息", () => {
    const view = renderLayout({
      currentStep: "basics",
      presentation: presentation({
        breadcrumbTitle: "创建词条",
        showEntrySummary: true,
        summaryHeadword: (
          <Typography.Text className="word-summary-pending-detection">
            待检测
          </Typography.Text>
        ),
        status: <span>草稿</span>
      })
    });

    expect(
      within(
        view.container.querySelector<HTMLElement>(".word-creation-breadcrumb")!
      ).getByText("创建词条")
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "展开词条概览" }));
    expect(screen.getByRole("region", { name: "词条摘要" })).toBe(
      document.querySelector(".word-creation-summary")
    );
    expect(screen.getByText("待检测")).toHaveClass(
      "word-summary-pending-detection"
    );
    expect(screen.getByText("草稿")).toBeInTheDocument();
    expect(screen.getByText("所属语言")).toBeInTheDocument();
  });

  it("showEntrySummary=false 时只留返回入口与完成情况", () => {
    renderLayout({ currentStep: "forms", presentation: presentation() });

    expect(screen.queryByText("当前词条")).toBeNull();
    expect(screen.getByTestId("progress-list")).toBeInTheDocument();
    expect(screen.getByText("step-content")).toBeInTheDocument();
  });

  it("草稿还没创建时后续步骤不可点", () => {
    const onStepChange = vi.fn();
    renderLayout({
      currentStep: "basics",
      onStepChange,
      presentation: presentation({
        wordExists: false,
        breadcrumbTitle: "创建词条",
        completedSteps: []
      })
    });

    const laterStep = screen.getByText("词形与发音").closest("button");
    expect(laterStep).toBeDisabled();
    fireEvent.click(screen.getByText("词形与发音"));
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("草稿已创建后不能返回创建步骤，后续步骤不受完成进度限制", () => {
    const onStepChange = vi.fn();
    renderLayout({
      currentStep: "forms",
      onStepChange,
      presentation: presentation({ completedSteps: ["basics"] })
    });

    expect(
      document.querySelectorAll(".word-editor-step:disabled")
    ).toHaveLength(1);
    expect(screen.getByText("创建词条").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("创建词条"));
    expect(onStepChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("词义与例句"));
    expect(onStepChange).toHaveBeenNthCalledWith(1, "meanings");
    // 进度只到 forms，preview 越过当前进度——门禁取消后照样点得动。
    fireEvent.click(screen.getByText("预览并生效"));
    expect(onStepChange).toHaveBeenNthCalledWith(2, "preview");
  });

  it("越步进入靠后步骤时，跳过的步骤不画成已完成", () => {
    // 门禁取消后能直接跳到第 4 步；此时第 2、3 步排在当前步之前但并未完成，
    // 步骤条只能按 completed_steps 如实显示，不能凭位置推断成绿勾。
    renderLayout({
      currentStep: "preview",
      presentation: presentation({ completedSteps: ["basics"] })
    });

    const nav = within(
      screen.getByRole("navigation", { name: "词条编辑步骤" })
    );
    expect(
      nav.getByRole("button", { name: /创建词条.*已完成/ })
    ).toBeDisabled();
    expect(nav.getAllByText("已完成")).toHaveLength(1);
    expect(nav.getByRole("button", { current: "step" })).toHaveTextContent(
      "预览并生效"
    );
  });

  it("readOnly 时步骤条整体禁用，但仍可返回词库", () => {
    const view = renderLayout({
      currentStep: "preview",
      readOnly: true,
      presentation: presentation({
        completedSteps: ["basics", "forms", "meanings"]
      })
    });

    expect(
      view.container.querySelectorAll(".word-editor-step:disabled").length
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "展开词条概览" }));
    const summary = document.querySelector<HTMLElement>(
      ".word-creation-summary"
    )!;
    fireEvent.click(within(summary).getByText("返回智能词库V1"));
    expect(screen.getByTestId("location")).toHaveTextContent("/words");
  });

  it("概览默认收起，展开后显示计数和清单，关闭后保留内容状态", () => {
    renderLayout({
      currentStep: "forms",
      presentation: presentation({ progressBadge: "1/7" })
    });
    expect(screen.getByTestId("progress-list")).not.toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "展开词条概览" }));
    expect(screen.getByTestId("progress-list")).toBeVisible();
    expect(screen.getByText("1/7")).toBeVisible();
    fireEvent.click(
      within(screen.getByRole("dialog", { name: "词条概览" })).getByRole(
        "button",
        { name: "收起词条概览" }
      )
    );
    expect(screen.getByTestId("progress-list")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "展开词条概览" })).toHaveFocus();
  });
});
