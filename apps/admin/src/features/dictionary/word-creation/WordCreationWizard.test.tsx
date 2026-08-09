import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import type { AdminWord, AdminWordV2 } from "@tsz/types";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WordCreationWizard } from "./WordCreationWizard";
import { wordFixture } from "./wordCreation.test.helper";

const state = vi.hoisted(() => ({
  detail: {} as Record<string, unknown>,
  remove: vi.fn(),
  refetch: vi.fn(),
  createdWord: undefined as AdminWordV2 | undefined
}));

vi.mock("../api", () => ({
  useWordDetail: vi.fn((wordId: string, enabled: boolean) => ({
    ...state.detail,
    requestedWordId: wordId,
    enabled
  })),
  useDeleteWord: () => ({ mutateAsync: state.remove, isPending: false })
}));

vi.mock("../part-of-speech/api", async () => {
  const { partOfSpeechCatalogQueryResult } =
    await import("./partOfSpeech.test.helper");
  return { usePartOfSpeechCatalog: partOfSpeechCatalogQueryResult };
});

vi.mock("./CreateEntryStep", () => ({
  CreateEntryStep: ({
    onHeadwordsChange,
    onCreated
  }: {
    onHeadwordsChange: (value: AdminWordV2["headwords"]) => void;
    onCreated: (word: AdminWordV2) => void;
  }) => (
    <div>
      create-step
      <button
        onClick={() => {
          if (!state.createdWord) throw new Error("missing created fixture");
          onHeadwordsChange(state.createdWord.headwords);
          onCreated(state.createdWord);
        }}
      >
        mock-create
      </button>
    </div>
  )
}));

vi.mock("./FormsAndPronunciationStep", () => ({
  FormsAndPronunciationStep: ({ word }: { word: AdminWordV2 }) => (
    <div>forms-step-revision-{word.revision}</div>
  )
}));

vi.mock("./MeaningsAndExamplesStep", () => ({
  MeaningsAndExamplesStep: ({ word }: { word: AdminWordV2 }) => (
    <div>meanings-step-revision-{word.revision}</div>
  )
}));

vi.mock("./PreviewAndPublishStep", () => ({
  PreviewAndPublishStep: ({ word }: { word: AdminWordV2 }) => (
    <div>preview-step-{word.status}</div>
  )
}));

vi.mock("./WordCreationLayout", () => ({
  WordCreationLayout: ({
    currentStep,
    onStepChange,
    children
  }: {
    currentStep: string;
    onStepChange?: (step: "basics" | "forms" | "meanings" | "preview") => void;
    children: React.ReactNode;
  }) => (
    <div>
      <span>layout-{currentStep}</span>
      <button onClick={() => onStepChange?.("forms")}>layout-forms</button>
      <button onClick={() => onStepChange?.("meanings")}>
        layout-meanings
      </button>
      <button onClick={() => onStepChange?.("preview")}>layout-preview</button>
      {children}
    </div>
  )
}));

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function renderWizard(mode: "create" | "resume", initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AntApp>
        <Routes>
          <Route
            path="/words/new"
            element={<WordCreationWizard mode={mode} />}
          />
          <Route
            path="/words/:wordId/wizard/:step?"
            element={<WordCreationWizard mode={mode} />}
          />
          <Route
            path="/words/:wordId/edit"
            element={<div>legacy-editor</div>}
          />
          <Route path="/words" element={<div>words-list</div>} />
        </Routes>
        <LocationProbe />
      </AntApp>
    </MemoryRouter>
  );
}

function loaded(word: AdminWord | AdminWordV2) {
  state.detail = {
    data: { word },
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: state.refetch
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.createdWord = wordFixture();
  state.detail = {
    data: undefined,
    isPending: false,
    isFetching: false,
    isError: false,
    error: null,
    refetch: state.refetch
  };
});

describe("WordCreationWizard", () => {
  it("create 模式渲染 basics，创建成功后进入该草稿 forms", () => {
    renderWizard("create", "/words/new");
    expect(screen.getByText("layout-basics")).toBeVisible();
    expect(screen.getByText("create-step")).toBeVisible();

    fireEvent.click(screen.getByText("mock-create"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${state.createdWord!.id}/wizard/forms`
    );
  });

  it("resume 加载中与失败态可重试或返回列表", async () => {
    state.detail = {
      data: undefined,
      isPending: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: state.refetch
    };
    const view = renderWizard("resume", "/words/word-center/wizard/forms");
    expect(screen.getByText("正在恢复词条草稿")).toBeVisible();

    state.detail = {
      data: undefined,
      isPending: false,
      isFetching: false,
      isError: true,
      error: new Error("draft missing"),
      refetch: state.refetch
    };
    view.rerender(
      <MemoryRouter initialEntries={["/words/word-center/wizard/forms"]}>
        <AntApp>
          <Routes>
            <Route
              path="/words/:wordId/wizard/:step?"
              element={<WordCreationWizard mode="resume" />}
            />
          </Routes>
          <LocationProbe />
        </AntApp>
      </MemoryRouter>
    );
    expect(await screen.findByText("词条加载失败")).toBeVisible();
    expect(screen.getByText("draft missing")).toBeVisible();
    fireEvent.click(screen.getByText("重试"));
    expect(state.refetch).toHaveBeenCalled();
    fireEvent.click(screen.getByText("返回智能词库"));
    expect(screen.getByTestId("location")).toHaveTextContent("/words");
  });

  it("legacy detail 离开 V2 向导并重定向旧编辑器", async () => {
    loaded({ id: "legacy-1", schema_version: 1 } as AdminWord);
    renderWizard("resume", "/words/legacy-1/wizard/forms");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words/legacy-1/edit"
      )
    );
    expect(screen.getByText("legacy-editor")).toBeVisible();
  });

  it.each([
    ["/words/word-center/wizard/not-a-step", "meanings"],
    ["/words/word-center/wizard/preview", "forms"]
  ])("不可达路径 %s 归一到 %s", async (path, reachable) => {
    loaded(
      wordFixture({ max_reachable_step: reachable as "forms" | "meanings" })
    );
    renderWizard("resume", path);

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        `/words/word-center/wizard/${reachable}`
      )
    );
  });

  it("published 无论请求何步都锁定 preview", async () => {
    loaded(wordFixture({ status: "published", ready: true }));
    renderWizard("resume", "/words/word-center/wizard/forms");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words/word-center/wizard/preview"
      )
    );
    expect(screen.getByText("preview-step-published")).toBeVisible();
  });

  it("stepper 只允许进入 max_reachable_step 以内步骤", async () => {
    loaded(wordFixture({ max_reachable_step: "meanings", revision: 5 }));
    renderWizard("resume", "/words/word-center/wizard/forms");
    expect(await screen.findByText("forms-step-revision-5")).toBeVisible();

    fireEvent.click(screen.getByText("layout-preview"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/words/word-center/wizard/forms"
    );
    fireEvent.click(screen.getByText("layout-meanings"));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words/word-center/wizard/meanings"
      )
    );
    expect(screen.getByText("meanings-step-revision-5")).toBeVisible();
  });

  it("较旧 detail 响应不会覆盖已加载的更高 revision", async () => {
    loaded(wordFixture({ revision: 9 }));
    const view = renderWizard("resume", "/words/word-center/wizard/forms");
    expect(await screen.findByText("forms-step-revision-9")).toBeVisible();

    loaded(wordFixture({ revision: 8 }));
    view.rerender(
      <MemoryRouter initialEntries={["/words/word-center/wizard/forms"]}>
        <AntApp>
          <Routes>
            <Route
              path="/words/:wordId/wizard/:step?"
              element={<WordCreationWizard mode="resume" />}
            />
          </Routes>
          <LocationProbe />
        </AntApp>
      </MemoryRouter>
    );
    expect(screen.getByText("forms-step-revision-9")).toBeVisible();
    expect(screen.queryByText("forms-step-revision-8")).toBeNull();
  });

  it("只读 basics 可进入 forms；废弃确认后删除并重新创建", async () => {
    const word = wordFixture({ max_reachable_step: "forms" });
    loaded(word);
    state.remove.mockResolvedValue(undefined);
    const view = renderWizard("resume", `/words/${word.id}/wizard/basics`);

    expect(await screen.findByText("检测与确认快照")).toBeVisible();
    fireEvent.click(screen.getByText("进入词形与发音"));
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${word.id}/wizard/forms`
    );

    // 回到 basics 重新挂载并覆盖废弃流程。
    view.unmount();
    loaded(word);
    renderWizard("resume", `/words/${word.id}/wizard/basics`);
    fireEvent.click(await screen.findByText("废弃并重新检测"));
    expect(
      (await screen.findAllByText("废弃当前草稿并重新检测？")).length
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("废弃并重新创建"));
    await waitFor(() => expect(state.remove).toHaveBeenCalledWith(word.id));
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent("/words/new")
    );
  });
});
