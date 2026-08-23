import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within
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
  surfacePage: vi.fn(),
  getWord: vi.fn()
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
    surfaceMatchSnapshotPage: mutations.surfacePage,
    get: mutations.getWord
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

async function expectSourceResult(
  testId: "builtin-dictionary-result" | "smart-dictionary-result",
  source: "内置词典" | "智能词库",
  status: "已匹配" | "未匹配" | "不可继续"
) {
  const result = await screen.findByTestId(testId);
  const cardStatus = document.querySelector(
    ".word-detection-result-card .ant-card-extra"
  );
  if (testId === "smart-dictionary-result") {
    expect(result).toHaveTextContent(
      status === "已匹配"
        ? "已发现"
        : status === "未匹配"
          ? "未发现"
          : "暂时不可用"
    );
  }
  if (testId === "builtin-dictionary-result") {
    expect(cardStatus).toHaveTextContent(status);
  }
  return result;
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

function renderStep(initialEntry = "/words/new") {
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
    { initialEntries: [initialEntry] }
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

  it("命中双拼写时恢复英美开关与双主词输入，并可手动切换", async () => {
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
    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");
    await expectSourceResult("smart-dictionary-result", "智能词库", "未匹配");
    expect(onHeadwordsChange).toHaveBeenLastCalledWith(
      detection.builtin_dictionary.status === "matched"
        ? detection.builtin_dictionary.headwords
        : undefined
    );

    const dialectSwitch = screen.getByRole("switch", {
      name: "区分英美词形"
    });
    const ukInput = screen.getByLabelText("英式主词");
    const usInput = screen.getByLabelText("美式主词");
    expect(dialectSwitch).toBeChecked();
    expect(ukInput).toHaveValue("centre");
    expect(ukInput).toBeEnabled();
    expect(usInput).toHaveValue("center");
    expect(usInput).toBeDisabled();
    expect(
      screen.getByText(
        "美式主词来自本次输入，暂不可修改。请确认英式主词；如无差异，保持相同即可。"
      )
    ).toBeVisible();

    fireEvent.click(dialectSwitch);
    expect(dialectSwitch).not.toBeChecked();
    expect(ukInput).toHaveValue("center");
    expect(usInput).toHaveValue("center");
    expect(ukInput).toBeDisabled();
    expect(usInput).toBeDisabled();

    fireEvent.click(dialectSwitch);
    expect(dialectSwitch).toBeChecked();
    expect(ukInput).toHaveValue("centre");
    expect(usInput).toHaveValue("center");

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
    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");

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
    expect(screen.queryByTestId("builtin-dictionary-result")).toBeNull();
    expect(screen.getByText("等待检测")).toBeVisible();
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
  });

  it.each([
    ["colour", "已匹配"],
    ["smart-unavailable", "不可继续"]
  ] as const)("%s 检测阻断创建并只展示来源状态", async (headword, status) => {
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

    await expectSourceResult("smart-dictionary-result", "智能词库", status);
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("重复词条只展示词头与生命周期状态，不展开内部详情", async () => {
    mutations.detect.mockResolvedValue(duplicateDetectionFixture());
    mutations.getWord.mockResolvedValue({
      word: wordFixture({
        id: "word-colour-archived",
        status: "archived",
        ready: true
      })
    });
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "colour" }
    });
    fireEvent.click(button("词典检测"));

    await expectSourceResult("smart-dictionary-result", "智能词库", "已匹配");
    expect(screen.queryByText(/colour \(uk\)/)).toBeNull();
    expect(screen.getByText("colour")).toBeVisible();
    expect(screen.getByText("color")).toBeVisible();
    expect(screen.getByText("已发布")).toBeVisible();
    expect(screen.getByText("已归档")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /查看重复词条/ })
    ).toHaveLength(2);
    fireEvent.click(
      screen.getAllByRole("button", { name: /查看重复词条/ })[0]!
    );
    expect(await screen.findByText("重复词条详情")).toBeInTheDocument();
    expect(mutations.getWord).toHaveBeenCalledWith("word-colour-archived");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("主词")).toBeInTheDocument();
    expect(within(dialog).getByText("状态")).toBeInTheDocument();
    expect(within(dialog).getByText("词条类型")).toBeInTheDocument();
    expect(within(dialog).getByText("基本词性")).toBeInTheDocument();
    expect(within(dialog).getByText("释义预览")).toBeInTheDocument();
    expect(within(dialog).getByText("已归档")).toBeInTheDocument();
    expect(within(dialog).getByText("单词")).toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/words/new");
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByRole("dialog")).toHaveClass("ant-zoom-leave");
    expect(screen.getByTestId("smart-dictionary-result")).toHaveTextContent(
      "已发现"
    );
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("同一已有词条合并英美主词，共用主词只显示一个", async () => {
    const detection = detectionFixture("center");
    detection.smart_dictionary = {
      status: "duplicate",
      duplicates: [
        {
          word_id: "word-center",
          headword: "center",
          dialect: "us",
          status: "published"
        },
        {
          word_id: "word-center",
          headword: "centre",
          dialect: "uk",
          status: "published"
        },
        {
          word_id: "word-garden",
          headword: "garden",
          dialect: "common",
          status: "draft"
        }
      ]
    };
    mutations.detect.mockResolvedValue(detection);
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    const entries = await screen.findAllByTestId("smart-dictionary-entry");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toHaveTextContent("center / centre");
    expect(entries[0]).toHaveTextContent("已发布");
    expect(entries[1]).toHaveTextContent("garden");
    expect(entries[1]).not.toHaveTextContent("/");
    expect(entries[1]).toHaveTextContent("草稿");
    expect(
      screen.getAllByRole("button", { name: /查看重复词条/ })
    ).toHaveLength(2);
  });

  it("多个归档重复词条仍只汇总为一条智能词库状态", async () => {
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

    await expectSourceResult("smart-dictionary-result", "智能词库", "已匹配");
    expect(screen.getAllByTestId("smart-dictionary-result")).toHaveLength(1);
    expect(screen.queryByText(/colours \(uk\)/)).toBeNull();
    expect(
      screen.getAllByRole("button", { name: /查看重复词条/ })
    ).toHaveLength(3);
    expect(screen.queryByText("确认并进入词形与发音")).toBeNull();
    expect(mutations.create).not.toHaveBeenCalled();
  });

  it("同名 workspace 展示重复状态与关联来源，确认后仍携终页 token 创建", async () => {
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

    await expectSourceResult("smart-dictionary-result", "智能词库", "已匹配");
    expect(screen.queryByText("可创建")).toBeNull();
    expect(screen.queryByText("已存在同名主词")).toBeNull();
    expect(screen.getAllByText("关联词")).toHaveLength(3);
    expect(
      screen.getAllByRole("button", { name: /查看重复词条/ })
    ).toHaveLength(3);
    const relationLinks = screen.getAllByRole("button", {
      name: "查看关联来源"
    });
    expect(relationLinks).toHaveLength(3);
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
  }, 10_000);

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

    await expectSourceResult("smart-dictionary-result", "智能词库", "已匹配");
    expect(
      screen.queryByText("noun · plural · common · current_publication")
    ).toBeNull();
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

    await expectSourceResult("builtin-dictionary-result", "内置词典", "未匹配");
    await expectSourceResult("smart-dictionary-result", "智能词库", "已匹配");
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

    await expectSourceResult("smart-dictionary-result", "智能词库", "已匹配");
    expect(screen.queryByText(/匹配来源/)).toBeNull();
    expect(button("仍继续创建")).toBeDisabled();
    expect(mutations.surfacePage).toHaveBeenCalledWith(
      "snapshot-workspace",
      "cursor-2",
      expect.any(AbortSignal)
    );
    await act(async () => pending.resolve(terminal));
    await waitFor(() => expect(button("仍继续创建")).toBeEnabled());
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
    expect(screen.getByTestId("smart-dictionary-result")).toHaveTextContent(
      "已发现"
    );
    expect(
      screen.getByRole("button", {
        name: /workspace.*查看重复词条/
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
  }, 10_000);

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

  it("creation gate 关闭时展示必要阻断提示，但不展开匹配详情", async () => {
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
    await expectSourceResult("smart-dictionary-result", "智能词库", "已匹配");
    expect(screen.queryByText(/匹配来源/)).toBeNull();
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
    await expectSourceResult("builtin-dictionary-result", "内置词典", "未匹配");
    expect(
      document.querySelector(
        ".word-detection-result-card .ant-card-extra .ant-tag"
      )
    ).toHaveClass("ant-tag-error");
    expect(
      screen.queryByText("内置词典没有匹配项，将创建空白短语草稿")
    ).toBeNull();
    expect(screen.queryByText("可创建")).toBeNull();
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

  it("未命中内置词典的全新单词显示未匹配且仍可创建空白草稿", async () => {
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

    await expectSourceResult("builtin-dictionary-result", "内置词典", "未匹配");
    expect(
      document.querySelector(
        ".word-detection-result-card .ant-card-extra .ant-tag"
      )
    ).toHaveClass("ant-tag-error");
    expect(
      screen.queryByText(
        "内置词典对该词条没有任何依据：基本词性、词形、字典音标与实际发音、释义和例句都需要在后续步骤按平台教学口径自行录入。"
      )
    ).toBeNull();
    expect(screen.queryByText("可创建")).toBeNull();
    expect(onHeadwordsChange).toHaveBeenLastCalledWith({
      mode: "unified",
      common: "not-found"
    });
    // 无检测依据时保留统一的确认框架，但不开放人工拆分。
    expect(screen.getByRole("switch", { name: "区分英美词形" })).toBeDisabled();
    expect(screen.getByLabelText("英式主词")).toHaveValue("not-found");
    expect(screen.getByLabelText("英式主词")).toBeDisabled();
    expect(screen.getByLabelText("美式主词")).toHaveValue("not-found");
    expect(screen.getByLabelText("美式主词")).toBeDisabled();

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

    await expectSourceResult(
      "builtin-dictionary-result",
      "内置词典",
      "不可继续"
    );
    expect(button("确认并进入词形与发音")).toBeDisabled();
  });

  it("词典未命中时保留英美确认框架但禁用拆分", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("BRAND NEW PHRASE"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "BRAND NEW PHRASE" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).toBeDisabled();
    expect(screen.getByLabelText("英式主词")).toHaveValue("BRAND NEW PHRASE");
    expect(screen.getByLabelText("美式主词")).toHaveValue("BRAND NEW PHRASE");
  });

  it("词典命中但无地区差异时允许管理员开启英美拆分", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("far"));
    renderStep();
    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "far" }
    });
    fireEvent.click(button("词典检测"));

    const dialectSwitch = await screen.findByRole("switch", {
      name: "区分英美词形"
    });
    expect(dialectSwitch).toBeEnabled();
    expect(dialectSwitch).not.toBeChecked();
    expect(screen.getByLabelText("英式主词")).toHaveValue("far");
    expect(screen.getByLabelText("美式主词")).toHaveValue("far");

    fireEvent.click(dialectSwitch);
    expect(dialectSwitch).toBeChecked();
    expect(screen.getByLabelText("英式主词")).toBeEnabled();
    expect(screen.getByLabelText("美式主词")).toBeDisabled();
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
    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");
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
    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");
    fireEvent.click(button("确认并进入词形与发音"));

    expect(await screen.findByText(text)).toBeInTheDocument();
    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");
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
    await expectSourceResult(
      "builtin-dictionary-result",
      "内置词典",
      "不可继续"
    );
    expect(button("确认并进入词形与发音")).toBeDisabled();
  });

  it("命中且全覆盖时只展示两条来源状态，不展示内容计数", async () => {
    mutations.detect.mockResolvedValue(detectionFixture("center"));
    renderStep();

    fireEvent.change(screen.getByLabelText("录入词条"), {
      target: { value: "center" }
    });
    fireEvent.click(button("词典检测"));

    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");
    await expectSourceResult("smart-dictionary-result", "智能词库", "未匹配");
    expect(screen.queryByText(/派生词形 5 个/)).toBeNull();
    expect(screen.queryByText(/完整读音 14 组/)).toBeNull();
  });

  it("覆盖不全时仍只展示来源状态且不显示覆盖详情", async () => {
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

    expect(screen.queryByText("识别了 2 个词性")).toBeNull();
    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");
    expect(screen.queryByText("部分匹配")).toBeNull();
    expect(
      screen.queryByText(
        "词形、读音、释义和例句等内容不完整，请在后续步骤补充。"
      )
    ).toBeNull();
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

    await expectSourceResult("builtin-dictionary-result", "内置词典", "已匹配");
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
    expect(screen.getAllByText(/custom-pos/)).toHaveLength(2);
    expect(button("确认并进入词形与发音")).toBeDisabled();
    expect(mutations.create).not.toHaveBeenCalled();
  });
});
