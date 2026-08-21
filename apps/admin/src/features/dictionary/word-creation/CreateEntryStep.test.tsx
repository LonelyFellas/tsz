import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { HttpError } from "@tsz/api-client/http";
import type {
  AdminWordV2,
  LexiconSurfaceMatchV2,
  PartOfSpeechCatalogResponse,
  SurfaceMatchPageV2,
  WordHeadwordsV2
} from "@tsz/types";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation,
  useNavigate
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreateEntryStep } from "./CreateEntryStep";
import {
  deferred,
  detectionFixture,
  wordFixture
} from "./wordCreation.test.helper";

const mutations = vi.hoisted(() => ({
  detect: vi.fn(),
  resetDetect: vi.fn(),
  create: vi.fn(),
  surfacePage: vi.fn()
}));
const partOfSpeechCatalogState = vi.hoisted(() => ({
  data: undefined as PartOfSpeechCatalogResponse | null | undefined,
  isError: false
}));

vi.mock("./api", () => ({
  useDetectWordV2: () => ({
    mutateAsync: mutations.detect,
    reset: mutations.resetDetect,
    isPending: false
  }),
  useCreateWordV2: () => ({
    mutateAsync: mutations.create,
    isPending: false
  })
}));

vi.mock("../dataSource", () => ({
  adminWordsDataSource: {
    surfaceMatchSnapshotPage: mutations.surfacePage
  }
}));

vi.mock("../part-of-speech/api", async () => {
  const { partOfSpeechCatalogFixture, partOfSpeechCatalogQueryResult } =
    await import("./partOfSpeech.test.helper");
  return {
    usePartOfSpeechCatalog: () => ({
      ...partOfSpeechCatalogQueryResult(),
      data:
        partOfSpeechCatalogState.data === undefined
          ? partOfSpeechCatalogFixture
          : (partOfSpeechCatalogState.data ?? undefined),
      isError: partOfSpeechCatalogState.isError
    })
  };
});

function button(label: string): HTMLButtonElement {
  const result = screen
    .getAllByRole("button")
    .find((item) => item.textContent?.replaceAll(/\s/g, "") === label);
  if (!result) throw new Error(`button not found: ${label}`);
  return result as HTMLButtonElement;
}

function LocationProbe() {
  return <span data-testid="location">{useLocation().pathname}</span>;
}

function StepHarness({
  onCreated,
  onHeadwordsChange
}: {
  onCreated: (word: AdminWordV2) => void;
  onHeadwordsChange: (headwords?: WordHeadwordsV2) => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <CreateEntryStep
        onHeadwordsChange={onHeadwordsChange}
        onCreated={(word) => {
          onCreated(word);
          navigate(`/words/${word.id}/wizard/forms`);
        }}
      />
      <LocationProbe />
    </>
  );
}

function renderStep() {
  const onHeadwordsChange = vi.fn();
  const onCreated = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/words/new",
        element: (
          <StepHarness
            onHeadwordsChange={onHeadwordsChange}
            onCreated={onCreated}
          />
        )
      },
      {
        path: "/words/:wordId/wizard/forms",
        element: (
          <>
            <span>forms-route</span>
            <LocationProbe />
          </>
        )
      },
      {
        path: "/words",
        element: (
          <>
            <span>words-list</span>
            <LocationProbe />
          </>
        )
      }
    ],
    { initialEntries: ["/words/new"] }
  );
  render(
    <AntApp>
      <RouterProvider router={router} />
    </AntApp>
  );
  return { onCreated, onHeadwordsChange, router };
}

function duplicateDetectionFixture() {
  return {
    ...detectionFixture("colour"),
    smart_dictionary: {
      status: "duplicate" as const,
      duplicates: [
        {
          word_id: "word-colour-archived",
          headword: "colour",
          dialect: "uk" as const,
          status: "archived" as const
        },
        {
          word_id: "word-color-published",
          headword: "color",
          dialect: "us" as const,
          status: "published" as const
        }
      ]
    }
  };
}

function surfaceMatch(
  matchId: string,
  wordId: string,
  options: {
    status?: "draft" | "published" | "archived";
    category?: LexiconSurfaceMatchV2["match_category"];
    sourceKind?: "headword" | "form";
    headword?: string;
  } = {}
): LexiconSurfaceMatchV2 {
  const sourceKind = options.sourceKind ?? "headword";
  return {
    match_id: matchId,
    match_category: options.category ?? "exact_headword",
    severity: "warning",
    attention_level:
      (options.category ?? "exact_headword") === "exact_headword"
        ? "high"
        : "normal",
    can_continue: true,
    confirmation_reasons: ["unacknowledged_surface_matches"],
    candidate: {
      candidate_type: "headword",
      candidate_ref: "headword:common",
      surface:
        options.category === "headword_form" ? "workspaces" : "workspace",
      normalized_surface:
        options.category === "headword_form" ? "workspaces" : "workspace",
      dialect: "common",
      entry_kind: "word"
    },
    existing: {
      word_id: wordId,
      headword: options.headword ?? "workspace",
      kind: "word",
      status: options.status ?? "draft",
      source:
        sourceKind === "headword"
          ? {
              source_kind: "headword",
              source_id: `${wordId}:headword:common`,
              content_scope: "draft",
              surface: "workspace",
              dialect: "common"
            }
          : {
              source_kind: "form",
              source_id: `${wordId}:form:plural`,
              source_node_id: `${wordId}-plural`,
              content_scope: "current_publication",
              surface: "workspaces",
              dialect: "common",
              pos_id: `${wordId}-noun`,
              pos: "noun",
              form_type: "plural"
            }
    }
  };
}

function surfacePage(
  items: LexiconSurfaceMatchV2[],
  options: {
    snapshotId?: string;
    total?: number;
    nextCursor?: string | null;
    token?: string;
    disabled?: boolean;
    epoch?: number;
  } = {}
): SurfaceMatchPageV2 {
  const nextCursor = options.nextCursor ?? null;
  const base = {
    snapshot_id: options.snapshotId ?? "snapshot-workspace",
    items,
    total: options.total ?? items.length,
    matched_entry_contexts: items.map((item) => ({
      word_id: item.existing.word_id,
      pos_labels: ["noun"],
      gloss_previews: ["工作空间"],
      updated_at: "2026-08-15T00:00:00Z",
      inbound_relations: {
        total: 2,
        by_type: { synonym: 1, antonym: 0, derivative: 1 },
        previews: [
          {
            source_word_id: `source-${item.existing.word_id}`,
            source_headword: "work area",
            relation: "synonym" as const
          }
        ],
        truncated: true
      }
    })),
    confirmation_reasons: ["unacknowledged_surface_matches" as const],
    policy_name: "allow_new_exact_headword_entries" as const,
    policy_epoch: options.epoch ?? 1
  };
  if (options.disabled) {
    return {
      ...base,
      continuation_policy: "temporarily_disabled",
      next_cursor: nextCursor,
      policy_block_code: "exact_headword_creation_temporarily_disabled"
    };
  }
  if (nextCursor !== null) {
    return { ...base, continuation_policy: "enabled", next_cursor: nextCursor };
  }
  return {
    ...base,
    continuation_policy: "enabled",
    next_cursor: null,
    surface_confirmation_token: options.token ?? "surface-token-workspace"
  };
}

function warningDetectionFixture(
  headword: "workspace" | "workspaces" = "workspace",
  page = surfacePage([
    surfaceMatch("match-workspace-1", "word-workspace-draft"),
    surfaceMatch("match-workspace-2", "word-workspace-archived", {
      status: "archived"
    })
  ])
) {
  const detection = detectionFixture(headword, `detection-${headword}`);
  detection.smart_dictionary = {
    status: "warning",
    duplicates: [],
    surface_match_page: page,
    matched_entry_contexts: []
  };
  return detection;
}

beforeEach(() => {
  vi.clearAllMocks();
  partOfSpeechCatalogState.data = undefined;
  partOfSpeechCatalogState.isError = false;
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => vi.restoreAllMocks());

describe("CreateEntryStep", () => {
  it("空词条或超过 200 字符时只显示本地校验且不发检测请求", async () => {
    renderStep();
    const input = screen.getByLabelText("录入词条");

    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("请输入词条")).toBeInTheDocument();
    expect(mutations.detect).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "x".repeat(201) } });
    fireEvent.click(button("词典检测"));
    expect(
      await screen.findByText("词条不能超过 200 个字符")
    ).toBeInTheDocument();
    expect(mutations.detect).not.toHaveBeenCalled();
  });

  it("命中双拼写时只读呈现两侧，创建草稿原样提交检测返回的主词", async () => {
    const detection = detectionFixture("center", "det-center");
    const created = wordFixture();
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    vi.mocked(window.confirm).mockReturnValue(false);
    const { onCreated, onHeadwordsChange, router } = renderStep();
    const input = screen.getByLabelText("录入词条");

    fireEvent.change(input, { target: { value: "  center  " } });
    expect(mutations.detect).not.toHaveBeenCalled();
    fireEvent.click(button("词典检测"));

    await waitFor(() =>
      expect(mutations.detect).toHaveBeenCalledWith({
        language: "en",
        headword: "center"
      })
    );
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    expect(screen.getByText("名词", { exact: true })).toBeVisible();
    expect(screen.getByText("动词", { exact: true })).toBeVisible();
    expect(screen.queryByText("n.", { exact: true })).toBeNull();
    expect(screen.queryByText("v.", { exact: true })).toBeNull();
    expect(onHeadwordsChange).toHaveBeenLastCalledWith(
      detection.builtin_dictionary.status === "matched"
        ? detection.builtin_dictionary.headwords
        : undefined
    );

    // A1：双拼写是词典事实，管理员不再决定要不要区分，也不再逐字确认另一侧。
    expect(screen.queryByRole("switch", { name: "区分英美词形" })).toBeNull();
    expect(screen.queryByLabelText("英式主词")).toBeNull();
    expect(screen.queryByLabelText("美式主词")).toBeNull();
    expect(
      screen.getByText(/两种地区拼写，两者都会记录在这条词条上/)
    ).toBeVisible();

    fireEvent.click(button("确认并进入词形与发音"));
    // 关键不变量：提交的 headwords 与检测返回的逐字段相等，不得退化成 unified。
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: "det-center",
        headwords: {
          mode: "distinguish",
          uk: "centre",
          us: "center",
          source_dialect: "us"
        }
      })
    );
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(router.state.location.pathname).toBe(
      `/words/${created.id}/wizard/forms`
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("创建请求在途时锁定表单，避免响应覆盖点击后的继续编辑", async () => {
    const detection = detectionFixture("center", "det-slow-create");
    const created = wordFixture();
    const pending = deferred<{ word: AdminWordV2 }>();
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockReturnValue(pending.promise);
    const { router } = renderStep();

    const input = screen.getByLabelText("录入词条");
    fireEvent.change(input, { target: { value: "center" } });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();

    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() => expect(mutations.create).toHaveBeenCalledTimes(1));
    await waitFor(() => {
      expect(input).toBeDisabled();
      expect(button("确认并进入词形与发音")).toBeDisabled();
    });

    await act(async () => pending.resolve({ word: created }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/words/${created.id}/wizard/forms`
      )
    );
  });

  it("录入后离开会请求确认，拒绝时留在当前页，确认后离开", async () => {
    const { router } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    vi.mocked(window.confirm).mockReturnValue(false);

    await act(async () => router.navigate("/words"));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledTimes(1));
    expect(router.state.location.pathname).toBe("/words/new");

    vi.mocked(window.confirm).mockReturnValue(true);
    await act(async () => router.navigate("/words"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/words"));
  });

  it("输入变化会清空检测并丢弃在途旧响应", async () => {
    const pending = deferred<ReturnType<typeof detectionFixture>>();
    mutations.detect.mockReturnValueOnce(pending.promise);
    const { onHeadwordsChange } = renderStep();
    const input = screen.getByLabelText("录入词条");

    fireEvent.change(input, { target: { value: "center" } });
    fireEvent.click(button("词典检测"));
    await waitFor(() => expect(mutations.detect).toHaveBeenCalledTimes(1));
    fireEvent.change(input, { target: { value: "far" } });
    expect(mutations.resetDetect).toHaveBeenCalled();
    expect(onHeadwordsChange).toHaveBeenLastCalledWith(undefined);

    await act(async () => pending.resolve(detectionFixture("center")));
    expect(screen.queryByText("内置词典已找到规范词条")).toBeNull();
    expect(screen.getByText("等待检测")).toBeVisible();
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
  });

  it.each([
    ["colour", "已存在重复词条"],
    ["smart-unavailable", "智能词库暂时不可用"]
  ])("%s 检测阻断创建并展示原因", async (headword, reason) => {
    mutations.detect.mockResolvedValue(
      headword === "colour"
        ? duplicateDetectionFixture()
        : detectionFixture(headword)
    );
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: headword }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText(reason)).toBeVisible();
    expect(screen.getByText("不可继续")).toBeVisible();
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("重复词条展示生命周期状态，归档项提示可恢复并继续阻断创建", async () => {
    mutations.detect.mockResolvedValue(duplicateDetectionFixture());
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "colour" }
    });
    fireEvent.click(button("词典检测"));

    const duplicate = await screen.findByRole("link", {
      name: /colour \(uk\).*已归档/
    });
    expect(duplicate).toHaveAttribute(
      "href",
      "/words/word-colour-archived/wizard/basics"
    );
    expect(duplicate).toHaveAttribute("target", "_blank");
    expect(duplicate).toHaveAttribute("rel", "noreferrer");
    expect(duplicate).toHaveAccessibleName(
      "colour (uk) 已归档，在新标签页打开"
    );
    expect(screen.queryByText("草稿")).toBeNull();
    expect(screen.getByText("已发布")).toBeVisible();
    expect(screen.getByText("已归档")).toBeVisible();
    expect(screen.getByText("归档词条仍占用词头")).toBeVisible();
    expect(
      screen.getByText(
        "点击上方重复词条会在新标签页打开详情，也可以在归档列表中定位。"
      )
    ).toBeVisible();
    const archivedList = screen.getByRole("link", {
      name: "在归档列表查看（新标签页打开）"
    });
    expect(archivedList).toHaveAttribute(
      "href",
      "/words?keyword=colour&status=archived"
    );
    expect(archivedList).toHaveAttribute("target", "_blank");
    expect(archivedList).toHaveAttribute("rel", "noreferrer");
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("多个归档重复词条都按精确 ID 在新标签页打开", async () => {
    const detection = duplicateDetectionFixture();
    detection.smart_dictionary.duplicates.push({
      word_id: "word-colours-archived",
      headword: "colours",
      dialect: "uk",
      status: "archived"
    });
    mutations.detect.mockResolvedValue(detection);
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "colour" }
    });
    fireEvent.click(button("词典检测"));

    const links = [
      await screen.findByRole("link", { name: /colour \(uk\).*已归档/ }),
      screen.getByRole("link", { name: /colours \(uk\).*已归档/ })
    ];
    expect(links[0]).toHaveAttribute(
      "href",
      "/words/word-colour-archived/wizard/basics"
    );
    expect(links[1]).toHaveAttribute(
      "href",
      "/words/word-colours-archived/wizard/basics"
    );
    for (const link of links) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
      expect(link).toHaveAccessibleName(/在新标签页打开$/);
    }
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("同名 workspace 全量醒目提示，逐 ID 新标签页查看且确认后携终页 token 创建", async () => {
    const page = surfacePage([
      surfaceMatch("match-1", "word-workspace-draft"),
      surfaceMatch("match-2", "word-workspace-archived-1", {
        status: "archived"
      }),
      surfaceMatch("match-3", "word-workspace-archived-2", {
        status: "archived"
      })
    ]);
    const detection = warningDetectionFixture("workspace", page);
    const created = wordFixture({
      headword: "workspace",
      id: "word-workspace-new"
    });
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "workspace" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("发现同名或同形词条，请确认后再继续")
    ).toBeVisible();
    expect(screen.getAllByText("已存在同名主词")).toHaveLength(3);
    expect(
      screen.getAllByText(
        /有效入站关联：共 2 条（同义1、反义0、派生1），以下仅为摘要/
      )
    ).toHaveLength(3);
    expect(
      screen.getAllByRole("link", {
        name: /work area source-word-workspace-.*，在新标签页打开/
      })
    ).toHaveLength(3);
    for (const wordId of [
      "word-workspace-draft",
      "word-workspace-archived-1",
      "word-workspace-archived-2"
    ]) {
      const link = screen.getByRole("link", {
        name: new RegExp(`^workspace ${wordId}，在新标签页打开$`)
      });
      expect(link).toHaveAttribute("href", `/words/${wordId}/wizard/basics`);
      expect(link).toHaveAttribute("target", "_blank");
    }
    await waitFor(() => expect(button("仍继续创建")).toBeEnabled());
    fireEvent.click(button("仍继续创建"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: "detection-workspace",
        headwords: { mode: "unified", common: "workspace" },
        confirmed_surface_match_token: "surface-token-workspace"
      })
    );
  });

  it("workspaces 命中 workspace 的已保存 plural 词形时提示但允许确认继续", async () => {
    const match = surfaceMatch("match-plural", "word-workspace", {
      category: "headword_form",
      sourceKind: "form"
    });
    mutations.detect.mockResolvedValue(
      warningDetectionFixture(
        "workspaces",
        surfacePage([match], { token: "token-plural" })
      )
    );
    mutations.create.mockResolvedValue({
      word: wordFixture({ headword: "workspaces", id: "word-workspaces-new" })
    });
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "workspaces" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("本次主词已作为已有词条的词形存在")
    ).toBeVisible();
    expect(
      screen.getByText("noun · plural · common · current_publication")
    ).toBeVisible();
    await waitFor(() => expect(button("仍继续创建")).toBeEnabled());
    fireEvent.click(button("仍继续创建"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith(
        expect.objectContaining({
          confirmed_surface_match_token: "token-plural"
        })
      )
    );
  });

  it("内置词典未命中但已有 plural surface warning 可继续时允许确认创建", async () => {
    const match = surfaceMatch("match-plural", "word-workspace", {
      category: "headword_form",
      sourceKind: "form"
    });
    const detection = warningDetectionFixture(
      "workspaces",
      surfacePage([match], { token: "token-plural" })
    );
    detection.builtin_dictionary = { status: "not_found" };
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({
      word: wordFixture({ headword: "workspaces", id: "word-workspaces-new" })
    });
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "workspaces" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("本次主词已作为已有词条的词形存在")
    ).toBeVisible();
    await waitFor(() => expect(button("仍继续创建")).toBeEnabled());
    fireEvent.click(button("仍继续创建"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: "detection-workspaces",
        headwords: { mode: "unified", common: "workspaces" },
        confirmed_surface_match_token: "token-plural"
      })
    );
  });

  it("多页 warning 在终页前门禁，按 cursor 顺序加载完才开放继续", async () => {
    const pending = deferred<SurfaceMatchPageV2>();
    const first = surfacePage([surfaceMatch("match-1", "word-1")], {
      total: 2,
      nextCursor: "cursor-2"
    });
    const terminal = surfacePage([surfaceMatch("match-2", "word-2")], {
      total: 2,
      token: "terminal-token"
    });
    mutations.surfacePage.mockReturnValue(pending.promise);
    mutations.detect.mockResolvedValue(
      warningDetectionFixture("workspace", first)
    );
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "workspace" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText(/已加载 1\/2 条匹配来源/)).toBeVisible();
    expect(button("仍继续创建")).toBeDisabled();
    expect(mutations.surfacePage).toHaveBeenCalledWith(
      "snapshot-workspace",
      "cursor-2",
      expect.any(AbortSignal)
    );
    await act(async () => pending.resolve(terminal));
    await waitFor(() =>
      expect(screen.getByText(/已加载 2\/2 条匹配来源/)).toBeVisible()
    );
    expect(button("仍继续创建")).toBeEnabled();
  });

  it("分页期间 policy 变化会清除旧 snapshot/token 并要求重新检测", async () => {
    const first = surfacePage([surfaceMatch("match-1", "word-1")], {
      total: 2,
      nextCursor: "cursor-2"
    });
    mutations.surfacePage.mockRejectedValue(
      new HttpError(409, "policy changed", [], "surface_policy_changed")
    );
    mutations.detect.mockResolvedValue(
      warningDetectionFixture("workspace", first)
    );
    renderStep();
    const input = screen.getByLabelText("录入词条");
    fireEvent.change(input, { target: { value: "workspace" } });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("匹配快照已过期")).toBeVisible();
    expect(input).toHaveValue("workspace");
    expect(screen.getByText("仍继续创建").closest("button")).toBeDisabled();
    fireEvent.click(screen.getByText("重新进行词典检测"));
    await waitFor(() => expect(screen.getByText("等待检测")).toBeVisible());
    expect(mutations.resetDetect).toHaveBeenCalled();
  });

  it("409 changed 使用结构化新首页、轮换 key 且保留表单，重新确认后成功", async () => {
    const changedPage = surfacePage(
      [surfaceMatch("match-new", "word-workspace-new-match")],
      { snapshotId: "snapshot-changed", token: "token-changed", epoch: 2 }
    );
    const created = wordFixture({ headword: "workspace", id: "word-created" });
    mutations.detect.mockResolvedValue(warningDetectionFixture());
    mutations.create
      .mockRejectedValueOnce(
        new HttpError(
          409,
          "surface matches changed",
          [],
          "surface_matches_changed",
          [],
          {
            surface_match_page: changedPage,
            current_policy_name: "allow_new_exact_headword_entries",
            current_policy_epoch: 2
          }
        )
      )
      .mockResolvedValueOnce({ word: created });
    renderStep();
    const input = screen.getByLabelText("录入词条");
    fireEvent.change(input, { target: { value: "workspace" } });
    fireEvent.click(button("词典检测"));
    await waitFor(() => expect(button("仍继续创建")).toBeEnabled());

    fireEvent.click(button("仍继续创建"));
    expect(
      await screen.findByText("匹配结果已更新，请查看全部提示后再次确认")
    ).toBeInTheDocument();
    expect(input).toHaveValue("workspace");
    expect(
      screen.getByRole("link", {
        name: /^workspace word-workspace-new-match，在新标签页打开$/
      })
    ).toBeVisible();
    await waitFor(() => expect(button("仍继续创建")).toBeEnabled());
    fireEvent.click(button("仍继续创建"));
    await waitFor(() => expect(mutations.create).toHaveBeenCalledTimes(2));
    const first = mutations.create.mock.calls[0]![0];
    const second = mutations.create.mock.calls[1]![0];
    expect(second.idempotency_key).not.toBe(first.idempotency_key);
    expect(second.confirmed_surface_match_token).toBe("token-changed");
    expect(await screen.findByText("forms-route")).toBeVisible();
  });

  it("409 policy changed 无新首页时清除 snapshot/token 并保留输入供重新检测", async () => {
    mutations.detect.mockResolvedValue(warningDetectionFixture());
    mutations.create.mockRejectedValue(
      new HttpError(
        409,
        "surface policy changed",
        [],
        "surface_policy_changed",
        [],
        {
          current_policy_name: "allow_new_exact_headword_entries",
          current_policy_epoch: 2
        }
      )
    );
    renderStep();
    const input = screen.getByLabelText("录入词条");
    fireEvent.change(input, { target: { value: "workspace" } });
    fireEvent.click(button("词典检测"));
    await waitFor(() => expect(button("仍继续创建")).toBeEnabled());

    fireEvent.click(button("仍继续创建"));
    expect(
      await screen.findByText("同名创建策略已变化，请重新检测")
    ).toBeInTheDocument();
    expect(input).toHaveValue("workspace");
    expect(screen.getByText("等待检测")).toBeVisible();
    expect(screen.queryByText("仍继续创建")).toBeNull();
    expect(mutations.resetDetect).toHaveBeenCalled();
  });

  it("creation gate 关闭时完整展示 disabled warning，但不出现继续创建按钮", async () => {
    mutations.detect.mockResolvedValue(
      warningDetectionFixture(
        "workspace",
        surfacePage([surfaceMatch("match-1", "word-1")], {
          disabled: true
        })
      )
    );
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "workspace" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("当前暂不开放创建同名主词")).toBeVisible();
    expect(screen.getByText(/已加载 1\/1 条匹配来源/)).toBeVisible();
    expect(screen.queryByText("仍继续创建")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("规范化回显与原输入不同时，未命中短语仍可创建 V2 空白草稿", async () => {
    const rawHeadword = "  ＢＲＡＮＤ   NEW PHRASE  ";
    const detection = detectionFixture(rawHeadword);
    const created = {
      ...wordFixture(),
      kind: "phrase" as const,
      headwords: { mode: "unified" as const, common: "BRAND NEW PHRASE" }
    };
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    const { onCreated } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: rawHeadword }
    });
    fireEvent.click(button("词典检测"));

    await waitFor(() =>
      expect(mutations.detect).toHaveBeenCalledWith({
        language: "en",
        headword: "ＢＲＡＮＤ   NEW PHRASE"
      })
    );
    expect(
      await screen.findByText("内置词典没有匹配项，将创建空白短语草稿")
    ).toBeVisible();
    expect(screen.getByText("可创建")).toBeVisible();
    expect(button("确认并进入词形与发音")).toBeEnabled();
    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: detection.detection_id,
        headwords: { mode: "unified", common: "BRAND NEW PHRASE" }
      })
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("检测错误保留原输入以便重试", async () => {
    mutations.detect.mockRejectedValue(new Error("dictionary timeout"));
    renderStep();
    const input = screen.getByLabelText("录入词条");
    fireEvent.change(input, { target: { value: "center" } });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("dictionary timeout")).toBeInTheDocument();
    expect(input).toHaveValue("center");
  });

  it("未命中内置词典的全新单词仍可创建空白草稿并如实提示无词典依据", async () => {
    const detection = detectionFixture("not-found");
    const created = {
      ...wordFixture({ id: "word-brand-new" }),
      headwords: { mode: "unified" as const, common: "not-found" },
      forms: { pos: [] }
    };
    mutations.detect.mockResolvedValue(detection);
    mutations.create.mockResolvedValue({ word: created });
    const { onCreated, onHeadwordsChange } = renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "not-found" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("内置词典没有匹配项，将创建空白单词草稿")
    ).toBeVisible();
    expect(
      screen.getByText(
        "内置词典对该词条没有任何依据：基本词性、词形、字典音标与实际发音、释义和例句都需要在后续步骤按平台教学口径自行录入。"
      )
    ).toBeVisible();
    expect(screen.getByText("可创建")).toBeVisible();
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "unified",
      common: "not-found"
    });
    // 无检测依据时不许手工造英美差异：A1 之后连开关都不存在了。
    expect(
      screen.queryByRole("switch", { name: "区分英美词形" })
    ).not.toBeInTheDocument();

    expect(button("确认并进入词形与发音")).toBeEnabled();
    fireEvent.click(button("确认并进入词形与发音"));
    await waitFor(() =>
      expect(mutations.create).toHaveBeenCalledWith({
        schema_version: 2,
        idempotency_key: expect.any(String),
        detection_id: detection.detection_id,
        headwords: { mode: "unified", common: "not-found" }
      })
    );
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it("内置词典暂时不可用时仍阻断人工创建", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("builtin-unavailable"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "builtin-unavailable" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("内置词典暂时不可用")).toBeVisible();
    expect(screen.getByText("不可继续")).toBeVisible();
    expect(button("确认并进入词形与发音")).toBeDisabled();
  });

  it("无地区差异时只呈现单一主词，界面不出现任何方言字样", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("BRAND NEW PHRASE"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "BRAND NEW PHRASE" }
    });
    fireEvent.click(button("词典检测"));

    // 词典没收录时不能说成「查过了、没有地区差异」。
    expect(
      await screen.findByText("内置词典未收录该词条，按你输入的拼写建档。")
    ).toBeVisible();
    expect(screen.queryByRole("switch", { name: "区分英美词形" })).toBeNull();
    expect(screen.queryByText("英式")).toBeNull();
    expect(screen.queryByText("美式")).toBeNull();
  });

  it("词典命中但无地区差异时，说明是「查过没差异」而非「未收录」", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("far"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "far" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("内置词典未发现该词有英式 / 美式拼写差异。")
    ).toBeVisible();
    expect(screen.queryByText("英式")).toBeNull();
    expect(screen.queryByText("美式")).toBeNull();
  });

  it("非 Error 检测失败使用稳定回退文案", async () => {
    mutations.detect.mockRejectedValue("offline");
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("词典检测失败")).toBeInTheDocument();
  });

  it("过期检测结果不会进入确认状态", async () => {
    const detection = detectionFixture("center");
    detection.expires_at = new Date(Date.now() - 1_000).toISOString();
    mutations.detect.mockResolvedValue(detection);
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(
      await screen.findByText("检测结果已过期，请重新检测")
    ).toBeInTheDocument();
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
  });

  it("创建时检测凭证过期会清空结果并提示重新检测", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    mutations.create.mockRejectedValue(
      new HttpError(410, "detection expired", [], "detection_expired")
    );
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    fireEvent.click(button("确认并进入词形与发音"));

    expect(
      await screen.findByText("检测结果已过期，请重新检测")
    ).toBeInTheDocument();
    expect(mutations.resetDetect).toHaveBeenCalled();
    expect(screen.getByText("等待检测")).toBeVisible();
  });

  it.each([
    [new Error("create failed"), "create failed"],
    ["offline", "创建草稿失败"]
  ])("创建失败 %p 时显示稳定错误且保留检测结果", async (error, text) => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    mutations.create.mockRejectedValue(error);
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));
    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    fireEvent.click(button("确认并进入词形与发音"));

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(screen.getByText("内置词典已找到规范词条")).toBeVisible();
  });

  it("词性目录加载失败时显示提示并阻断创建", async () => {
    partOfSpeechCatalogState.data = null;
    partOfSpeechCatalogState.isError = true;
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("词性目录暂时不可用")).toBeVisible();
    expect(screen.getByText("不可继续")).toBeVisible();
    expect(button("确认并进入词形与发音")).toBeDisabled();
  });

  it("命中且全覆盖时把原形与派生词形分开计数", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    expect(screen.getByText("已匹配")).toBeVisible();
    expect(
      screen.getByText(
        "词典带回派生词形 5 个、完整读音 14 组；另有 2 个词性的原形拼写来自刚确认的主词，不计为新增词形。释义、例句和词频若未显示，将在后续步骤明确要求人工补充。"
      )
    ).toBeVisible();
  });

  it("覆盖不全时不呈现为完全成功，并点明派生词形为 0", async () => {
    const detection = detectionFixture("center", "det-partial-coverage");
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("fixture must be matched");
    }
    // 真实后端对 center 只带回原形：form_groups 全空 + coverage 非 complete。
    for (const pos of detection.builtin_dictionary.suggested_forms.pos) {
      pos.form_groups = pos.form_groups.map((group) => ({
        ...group,
        slots: []
      }));
    }
    detection.builtin_dictionary.coverage = {
      forms: "partial",
      pronunciations: "missing",
      meanings: "missing",
      examples: "missing",
      frequency: "missing"
    };
    mutations.detect.mockResolvedValue(detection);
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("内置词典只找到部分内容")).toBeVisible();
    expect(screen.getByText("部分匹配")).toBeVisible();
    expect(screen.queryByText("已匹配")).toBeNull();
    expect(
      screen.getByText(
        "词典带回派生词形 0 个、完整读音 4 组；另有 2 个词性的原形拼写来自刚确认的主词，不计为新增词形。本次没有带回任何派生词形，需要在「词形与发音」步骤手工补录。词典覆盖不完整：词形仅部分覆盖；读音、释义、例句、词频缺失，缺口内容需要在后续步骤人工补充。"
      )
    ).toBeVisible();
    // 覆盖不全只是提示，不阻断创建。
    expect(button("确认并进入词形与发音")).not.toBeDisabled();
  });

  it("响应缺 coverage 时按无缺口降级，不让检测卡崩掉", async () => {
    const detection = detectionFixture("center", "det-no-coverage");
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("fixture must be matched");
    }
    // 旧后端或手写桩可能不带 coverage：它只是提示信息，不该白屏整张卡。
    Reflect.deleteProperty(detection.builtin_dictionary, "coverage");
    mutations.detect.mockResolvedValue(detection);
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("内置词典已找到规范词条")).toBeVisible();
    expect(screen.getByText("已匹配")).toBeVisible();
  });

  it("检测结果含未配置词性时显示稳定编码并阻断创建", async () => {
    const detection = detectionFixture("center");
    if (detection.builtin_dictionary.status !== "matched") {
      throw new Error("fixture must be matched");
    }
    detection.builtin_dictionary.suggested_forms.pos[0]!.pos = "custom-pos";
    mutations.detect.mockResolvedValue(detection);
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    expect(await screen.findByText("检测结果包含未配置词性")).toBeVisible();
    expect(screen.getAllByText("custom-pos").length).toBeGreaterThan(0);
    expect(button("确认并进入词形与发音")).toBeDisabled();
    expect(mutations.create).not.toHaveBeenCalled();
  });
});
