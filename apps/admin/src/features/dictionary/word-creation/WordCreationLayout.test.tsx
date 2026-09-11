import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfigProvider, Typography } from "antd";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { WordCreationLayout } from "./WordCreationLayout";
import { mockPageWidthObserver } from "./wordCreation.test.helper";

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
  // 关掉动画：抽屉的退场过渡在 jsdom 里不结束，关闭后面板会一直留在可见态。
  return render(
    <ConfigProvider theme={{ token: { motion: false } }}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <WordCreationLayout {...props}>
          <div>step-content</div>
        </WordCreationLayout>
        <LocationProbe />
      </MemoryRouter>
    </ConfigProvider>
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

    expect(screen.getByText("创建词条")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "词条摘要" })).toBe(
      view.container.querySelector(".word-creation-summary")
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

    const laterStep = screen.getByText("词形与发音").closest(".ant-steps-item");
    expect(laterStep).toHaveClass("ant-steps-item-disabled");
    fireEvent.click(screen.getByText("词形与发音"));
    expect(onStepChange).not.toHaveBeenCalled();
  });

  it("草稿已创建后四步都可点，不受完成进度限制", () => {
    const onStepChange = vi.fn();
    renderLayout({
      currentStep: "forms",
      onStepChange,
      presentation: presentation({ completedSteps: ["basics"] })
    });

    expect(document.querySelectorAll(".ant-steps-item-disabled")).toHaveLength(
      0
    );
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

    const statusOf = (title: string) =>
      screen.getByText(title).closest(".ant-steps-item")!.className;

    expect(statusOf("创建新词条")).toContain("ant-steps-item-finish");
    expect(statusOf("词形与发音")).toContain("ant-steps-item-wait");
    expect(statusOf("词义与例句")).toContain("ant-steps-item-wait");
    expect(statusOf("预览并生效")).toContain("ant-steps-item-process");
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
      view.container.querySelectorAll(".ant-steps-item-disabled").length
    ).toBeGreaterThan(0);
    const summary = view.container.querySelector<HTMLElement>(
      ".word-creation-summary"
    )!;
    fireEvent.click(within(summary).getByText("返回智能词库"));
    expect(screen.getByTestId("location")).toHaveTextContent("/words");
  });

  describe("窄屏的完成情况", () => {
    const narrow = presentation({ progressBadge: "1/7" });

    it("量不到宽度时按宽屏渲染，清单直接摆在左栏", () => {
      renderLayout({ currentStep: "forms", presentation: narrow });

      expect(screen.getByTestId("progress-list")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /完成情况/ })
      ).not.toBeInTheDocument();
    });

    it("窄屏把清单收进抽屉，入口带完成计数", () => {
      const observer = mockPageWidthObserver(900);
      try {
        renderLayout({ currentStep: "forms", presentation: narrow });

        // 清单不再占首屏，顶部只留一个入口
        expect(screen.queryByTestId("progress-list")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "完成情况 1/7" }));
        expect(screen.getByTestId("progress-list")).toBeInTheDocument();
      } finally {
        observer.restore();
      }
    });

    it("抽屉开着时拖宽窗口，清单回到左栏且不会留下第二份", () => {
      const observer = mockPageWidthObserver(900);
      try {
        renderLayout({ currentStep: "forms", presentation: narrow });
        fireEvent.click(screen.getByRole("button", { name: "完成情况 1/7" }));

        act(() => observer.resize(1400));

        expect(
          screen.queryByRole("button", { name: /完成情况/ })
        ).not.toBeInTheDocument();
        expect(screen.getAllByTestId("progress-list")).toHaveLength(1);
      } finally {
        observer.restore();
      }
    });
  });
});
