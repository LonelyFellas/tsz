import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App as AntApp } from "antd";
import { HttpError } from "@tsz/api-client/http";
import type { AdminWordV2 } from "@tsz/types";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WordCreationWizard } from "./WordCreationWizard";
import { wordFixture } from "./wordCreation.test.helper";

const state = vi.hoisted(() => ({
  detail: {} as Record<string, unknown>,
  deleteDraft: vi.fn(),
  restore: vi.fn(),
  refetch: vi.fn(),
  createdWord: undefined as AdminWordV2 | undefined
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

vi.mock("../api", () => ({
  useWordDetail: vi.fn((wordId: string, enabled: boolean) => ({
    ...state.detail,
    requestedWordId: wordId,
    enabled
  })),
  useDeleteWordDraft: () => ({
    mutateAsync: state.deleteDraft,
    isPending: false
  }),
  useRestoreWord: () => ({ mutateAsync: state.restore, isPending: false })
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
  FormsAndPronunciationStep: ({
    word,
    readOnly
  }: {
    word: AdminWordV2;
    readOnly?: boolean;
  }) => (
    <div>
      forms-step-revision-{word.revision}-readonly-{String(readOnly)}
    </div>
  )
}));

vi.mock("./MeaningsAndExamplesStep", () => ({
  MeaningsAndExamplesStep: ({ word }: { word: AdminWordV2 }) => (
    <div>meanings-step-revision-{word.revision}</div>
  )
}));

vi.mock("./PreviewAndPublishStep", () => ({
  PreviewAndPublishStep: ({
    word,
    readOnly
  }: {
    word: AdminWordV2;
    readOnly?: boolean;
  }) => (
    <div>
      preview-step-{word.status}-readonly-{String(readOnly)}
    </div>
  )
}));

vi.mock("./WordCreationLayout", () => ({
  WordCreationLayout: ({
    entryKind,
    currentStep,
    onStepChange,
    children
  }: {
    entryKind?: AdminWordV2["kind"];
    currentStep: string;
    onStepChange?: (step: "basics" | "forms" | "meanings" | "preview") => void;
    children: React.ReactNode;
  }) => (
    <div>
      <span>layout-{currentStep}</span>
      <span>layout-kind-{entryKind ?? "neutral"}</span>
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
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.search}
    </span>
  );
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
          <Route path="/words" element={<div>words-list</div>} />
        </Routes>
        <LocationProbe />
      </AntApp>
    </MemoryRouter>
  );
}

function loaded(word: AdminWordV2) {
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
  it("从 query 恢复创建入口意图，未知或缺失时保持中性", () => {
    const phrase = renderWizard("create", "/words/new?kind=phrase");
    expect(screen.getByText("layout-kind-phrase")).toBeVisible();

    phrase.unmount();
    const word = renderWizard("create", "/words/new?kind=word");
    expect(screen.getByText("layout-kind-word")).toBeVisible();

    word.unmount();
    const unknown = renderWizard("create", "/words/new?kind=legacy");
    expect(screen.getByText("layout-kind-neutral")).toBeVisible();

    unknown.unmount();
    renderWizard("create", "/words/new");
    expect(screen.getByText("layout-kind-neutral")).toBeVisible();
  });

  it("恢复已有草稿时使用后端权威 kind", async () => {
    const phrase = wordFixture();
    phrase.kind = "phrase";
    phrase.detection_snapshot.entry_kind = "phrase";
    loaded(phrase);
    renderWizard("resume", "/words/word-center/wizard/forms?kind=word");

    expect(await screen.findByText("layout-kind-phrase")).toBeVisible();
  });

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
    loaded(
      wordFixture({
        status: "published",
        ready: true,
        revision: 4,
        published_revision: 3,
        has_unpublished_changes: true
      })
    );
    renderWizard("resume", "/words/word-center/wizard/forms");

    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words/word-center/wizard/preview"
      )
    );
    expect(
      screen.getByText("preview-step-published-readonly-true")
    ).toBeVisible();
  });

  it("published 只有显式 edit 模式才可编辑，未发布修改可由列表路由恢复", async () => {
    loaded(wordFixture({ status: "published", ready: true }));
    const view = renderWizard(
      "resume",
      "/words/word-center/wizard/forms?mode=edit"
    );
    expect(
      await screen.findByText("forms-step-revision-3-readonly-false")
    ).toBeVisible();

    view.unmount();
    loaded(
      wordFixture({
        status: "published",
        ready: true,
        revision: 4,
        published_revision: 3,
        has_unpublished_changes: true
      })
    );
    renderWizard("resume", "/words/word-center/wizard/forms?mode=edit");
    expect(
      await screen.findByText("forms-step-revision-4-readonly-false")
    ).toBeVisible();
    fireEvent.click(screen.getByText("layout-preview"));
    expect(
      await screen.findByText("preview-step-published-readonly-false")
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/words/word-center/wizard/preview?mode=edit"
    );
  });

  it("stepper 只允许进入 max_reachable_step 以内步骤", async () => {
    loaded(wordFixture({ max_reachable_step: "meanings", revision: 5 }));
    renderWizard("resume", "/words/word-center/wizard/forms");
    expect(
      await screen.findByText("forms-step-revision-5-readonly-false")
    ).toBeVisible();

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
    expect(
      await screen.findByText("forms-step-revision-9-readonly-false")
    ).toBeVisible();

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
    expect(
      screen.getByText("forms-step-revision-9-readonly-false")
    ).toBeVisible();
    expect(
      screen.queryByText("forms-step-revision-8-readonly-false")
    ).toBeNull();
  });

  it("归档词条全程只读，恢复时提交双 revision 并解除只读", async () => {
    const archived = wordFixture({
      status: "archived",
      lifecycle_revision: 4,
      max_reachable_step: "forms"
    });
    const restored = {
      ...archived,
      status: "draft" as const,
      lifecycle_revision: 5,
      archived_at: undefined,
      archived_by: undefined
    };
    loaded(archived);
    state.restore.mockResolvedValue({ word: restored });
    renderWizard("resume", `/words/${archived.id}/wizard/forms`);

    expect(
      await screen.findByText("该词条已归档，当前为只读状态")
    ).toBeVisible();
    expect(
      screen.getByText(`forms-step-revision-${archived.revision}-readonly-true`)
    ).toBeVisible();

    fireEvent.click(screen.getByText("恢复词条"));
    await waitFor(() =>
      expect(state.restore).toHaveBeenCalledWith({
        wordId: archived.id,
        idempotencyKey: expect.any(String),
        input: {
          base_revision: archived.revision,
          base_lifecycle_revision: archived.lifecycle_revision
        }
      })
    );
    expect(
      await screen.findByText(
        `forms-step-revision-${restored.revision}-readonly-false`
      )
    ).toBeVisible();
  });

  it("归档恢复失败时保持只读并展示服务端错误", async () => {
    const archived = wordFixture({
      status: "archived",
      lifecycle_revision: 2,
      max_reachable_step: "forms"
    });
    loaded(archived);
    state.restore.mockRejectedValue(new Error("引用目标仍不可用"));
    renderWizard("resume", `/words/${archived.id}/wizard/forms`);

    fireEvent.click(await screen.findByText("恢复词条"));
    expect(await screen.findByText("引用目标仍不可用")).toBeInTheDocument();
    expect(
      screen.getByText(`forms-step-revision-${archived.revision}-readonly-true`)
    ).toBeVisible();
  });

  it("非 Error 恢复失败使用稳定兜底文案", async () => {
    const archived = wordFixture({ status: "archived", lifecycle_revision: 2 });
    loaded(archived);
    state.restore.mockRejectedValue("transport failed");
    renderWizard("resume", `/words/${archived.id}/wizard/forms`);
    fireEvent.click(await screen.findByText("恢复词条"));
    expect(await screen.findByText("恢复失败")).toBeInTheDocument();
  });

  it("gate-off 恢复稳定显示学习端能力限制并保持归档状态", async () => {
    const archived = wordFixture({ status: "archived", lifecycle_revision: 2 });
    loaded(archived);
    state.restore.mockRejectedValue(
      new HttpError(
        409,
        "blocked",
        [],
        "multiple_active_exact_headword_publications_not_enabled"
      )
    );
    renderWizard("resume", `/words/${archived.id}/wizard/forms`);
    fireEvent.click(await screen.findByText("恢复词条"));
    expect(
      await screen.findByText("学习端暂不支持多个同名公开词条")
    ).toBeInTheDocument();
    expect(
      screen.getByText(`forms-step-revision-${archived.revision}-readonly-true`)
    ).toBeVisible();
  });

  it("恢复前发现目标状态已变化时清旧命令并采用最新详情", async () => {
    const archived = wordFixture({
      status: "archived",
      lifecycle_revision: 2,
      max_reachable_step: "forms"
    });
    const concurrentlyRestored = {
      ...archived,
      status: "draft" as const,
      lifecycle_revision: 3,
      archived_at: undefined,
      archived_by: undefined
    };
    loaded(archived);
    state.refetch.mockResolvedValue({ data: { word: concurrentlyRestored } });
    renderWizard("resume", `/words/${archived.id}/wizard/forms`);

    fireEvent.click(await screen.findByText("恢复词条"));
    await waitFor(() => expect(state.refetch).toHaveBeenCalledTimes(1));
    expect(state.restore).not.toHaveBeenCalled();
    expect(
      await screen.findByText(
        `forms-step-revision-${concurrentlyRestored.revision}-readonly-false`
      )
    ).toBeVisible();
  });

  it("未收录短语的只读 basics 明确显示空白 V2 草稿来源", async () => {
    const phrase = wordFixture({ max_reachable_step: "forms" });
    phrase.kind = "phrase";
    phrase.detection_snapshot.entry_kind = "phrase";
    phrase.detection_snapshot.builtin_dictionary_status = "not_found";
    loaded(phrase);
    renderWizard("resume", `/words/${phrase.id}/wizard/basics`);

    expect(await screen.findByText("短语草稿已创建")).toBeVisible();
    expect(screen.getByText("短语", { exact: true })).toBeVisible();
    expect(
      screen.getByText("内置词典未收录该短语，已按规范化输入创建空白 V2 草稿。")
    ).toBeVisible();
  });

  it("clear detection snapshot 明确显示创建时未发现重复项", async () => {
    const word = wordFixture({ max_reachable_step: "forms" });
    loaded(word);
    renderWizard("resume", `/words/${word.id}/wizard/basics`);

    expect(await screen.findByText("词典检测已完成")).toBeVisible();
    expect(
      screen.getByText("内置词典已匹配，智能词库创建时未发现重复项。")
    ).toBeVisible();
    expect(
      screen.queryByText("创建时发现同名或同形词条，管理员已确认继续")
    ).toBeNull();
  });

  it("warning detection snapshot 回看确认审计和精确词条入口", async () => {
    const word = wordFixture({ max_reachable_step: "forms" });
    word.detection_snapshot = {
      ...word.detection_snapshot,
      smart_dictionary_status: "warning",
      surface_warning: {
        total: 3,
        match_digest: "sha256:warning-audit",
        acknowledged: true,
        acknowledged_at: "2026-08-16T02:22:08.465Z",
        acknowledged_by: "01a0085f-c222-7cc3-8eb3-158d95ffd3ec",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        preview: [
          {
            match_id: "match-workspace",
            match_category: "headword_form",
            existing_word_id: "01a00492-d889-71e0-a9a3-e053a0a093e6",
            existing_headword: "workspace",
            existing_kind: "word",
            existing_status: "draft",
            existing_dialect: "common",
            pos_labels: ["noun"],
            gloss_previews: ["工作空间"]
          },
          {
            match_id: "match-archived",
            match_category: "exact_headword",
            existing_word_id: "01a00492-d889-71e0-a9a3-e053a0a093e7",
            existing_headword: "workspaces",
            existing_kind: "word",
            existing_status: "archived",
            existing_dialect: "uk",
            pos_labels: ["noun"],
            gloss_previews: ["多个工作空间"]
          }
        ],
        truncated: true
      }
    };
    loaded(word);
    renderWizard("resume", `/words/${word.id}/wizard/basics`);

    expect(
      await screen.findByText("创建时发现同名或同形词条，管理员已确认继续")
    ).toBeVisible();
    expect(
      screen.getByText("已确认 3 条匹配，当前展示 2 条摘要。")
    ).toBeVisible();
    expect(
      screen.getByText("surface_warning_acknowledgement · epoch 7")
    ).toBeVisible();
    expect(
      screen.getByText("01a0085f-c222-7cc3-8eb3-158d95ffd3ec")
    ).toBeVisible();
    expect(screen.getByText("2026-08-16T02:22:08.465Z")).toBeVisible();

    const workspaceLink = screen.getByRole("link", {
      name: "workspace 01a00492-d889-71e0-a9a3-e053a0a093e6，在新标签页打开"
    });
    expect(workspaceLink).toHaveAttribute(
      "href",
      "/words/01a00492-d889-71e0-a9a3-e053a0a093e6/wizard/basics"
    );
    expect(workspaceLink).toHaveAttribute("target", "_blank");
    expect(workspaceLink).toHaveAttribute("rel", "noreferrer");
    expect(
      screen.getByRole("link", {
        name: "workspaces 01a00492-d889-71e0-a9a3-e053a0a093e7，在新标签页打开"
      })
    ).toBeVisible();
    expect(
      screen.queryByText("内置词典已匹配，智能词库创建时未发现重复项。")
    ).toBeNull();
  });

  it("warning detection snapshot 覆盖所有 match category 标签", async () => {
    const word = wordFixture({ max_reachable_step: "forms" });
    word.detection_snapshot = {
      ...word.detection_snapshot,
      smart_dictionary_status: "warning",
      surface_warning: {
        total: 3,
        match_digest: "sha256:warning-category-audit",
        acknowledged: true,
        acknowledged_at: "2026-08-16T02:22:08.465Z",
        acknowledged_by: "01a0085f-c222-7cc3-8eb3-158d95ffd3ec",
        policy_name: "surface_warning_acknowledgement",
        policy_epoch: 7,
        preview: [
          {
            match_id: "match-cross-kind",
            match_category: "cross_kind_headword",
            existing_word_id: "01a00492-d889-71e0-a9a3-e053a0a093e8",
            existing_headword: "workspace",
            existing_kind: "phrase",
            existing_status: "draft",
            existing_dialect: "common",
            pos_labels: ["noun"],
            gloss_previews: ["跨类型同名"]
          },
          {
            match_id: "match-form-headword",
            match_category: "form_headword",
            existing_word_id: "01a00492-d889-71e0-a9a3-e053a0a093e9",
            existing_headword: "workspaces",
            existing_kind: "word",
            existing_status: "draft",
            existing_dialect: "uk",
            pos_labels: ["noun"],
            gloss_previews: ["词形命中主词"]
          },
          {
            match_id: "match-fallback",
            match_category: "unexpected" as never,
            existing_word_id: "01a00492-d889-71e0-a9a3-e053a0a093ea",
            existing_headword: "workspace-x",
            existing_kind: "word",
            existing_status: "archived",
            existing_dialect: "us",
            pos_labels: ["verb"],
            gloss_previews: ["默认兜底"]
          }
        ],
        truncated: false
      }
    };
    loaded(word);
    renderWizard("resume", `/words/${word.id}/wizard/basics`);

    expect(await screen.findByText("跨类型同名主词")).toBeVisible();
    expect(screen.getByText("词形命中已有主词")).toBeVisible();
    expect(screen.getByText("同形词形")).toBeVisible();
  });

  it("只读 basics 展示用户最终确认的主词，而不是词典原建议", async () => {
    const word = wordFixture({ max_reachable_step: "forms" });
    word.headwords = {
      mode: "distinguish",
      uk: "centre-alt",
      us: "center",
      source_dialect: "us"
    };
    loaded(word);
    renderWizard("resume", `/words/${word.id}/wizard/basics`);

    expect(
      await screen.findByText("英式英语 · BrE · centre-alt")
    ).toBeVisible();
    expect(screen.queryByText("英式英语 · BrE · centre")).toBeNull();
  });

  it("只读 basics 可进入 forms；删除未发布草稿后重新创建", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: undefined,
      getRandomValues: vi.fn((bytes: Uint8Array) => {
        bytes.fill(0xaa);
        return bytes;
      })
    });
    const word = wordFixture({ max_reachable_step: "forms" });
    loaded(word);
    state.deleteDraft.mockResolvedValue(undefined);
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
    fireEvent.click(await screen.findByText("删除草稿并重新检测"));
    expect(
      (await screen.findAllByText("删除当前草稿并重新检测？")).length
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("删除并重新创建"));
    await waitFor(() =>
      expect(state.deleteDraft).toHaveBeenCalledWith({
        wordId: word.id,
        baseRevision: word.revision,
        baseLifecycleRevision: word.lifecycle_revision
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/words/new?kind=word"
      )
    );
  });

  it("草稿删除失败时保持当前向导并使用稳定回退文案", async () => {
    const word = wordFixture({ max_reachable_step: "forms" });
    loaded(word);
    state.deleteDraft.mockRejectedValue("offline");
    renderWizard("resume", `/words/${word.id}/wizard/basics`);

    fireEvent.click(await screen.findByText("删除草稿并重新检测"));
    fireEvent.click(screen.getByText("删除并重新创建"));

    expect(await screen.findByText("删除草稿失败")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${word.id}/wizard/basics`
    );
  });

  it("草稿删除失败时展示服务端错误信息", async () => {
    const word = wordFixture({ max_reachable_step: "forms" });
    loaded(word);
    state.deleteDraft.mockRejectedValue(new Error("entry cannot be deleted"));
    renderWizard("resume", `/words/${word.id}/wizard/basics`);

    fireEvent.click(await screen.findByText("删除草稿并重新检测"));
    fireEvent.click(screen.getByText("删除并重新创建"));

    expect(
      await screen.findByText("entry cannot be deleted")
    ).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent(
      `/words/${word.id}/wizard/basics`
    );
  });
});
