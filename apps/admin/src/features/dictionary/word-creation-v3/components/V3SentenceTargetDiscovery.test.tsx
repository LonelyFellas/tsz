import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { describe, expect, it, vi } from "vitest";
import {
  V3SentenceTargetDiscovery,
  type V3SentenceTargetDiscoveryResult
} from "./V3SentenceTargetDiscovery";

function renderDiscovery(
  overrides: Partial<
    React.ComponentProps<typeof V3SentenceTargetDiscovery>
  > = {}
) {
  const onDiscover = vi.fn().mockResolvedValue({
    complete: true,
    overloaded: false,
    occurrences: []
  } satisfies V3SentenceTargetDiscoveryResult);
  const props = {
    dialect: "common" as const,
    onDiscover,
    sentenceText: "They turn the light off near the central location.",
    ...overrides
  };
  render(
    <AntApp>
      <V3SentenceTargetDiscovery {...props} />
    </AntApp>
  );
  return { ...props, onDiscover };
}

function discoveryResult(): V3SentenceTargetDiscoveryResult {
  return {
    complete: true,
    overloaded: false,
    occurrences: [
      {
        candidates: [
          {
            baseForm: "location",
            entryId: "entry-location",
            headword: "location",
            id: "candidate-location",
            matchedForm: "location",
            posLabel: "名词",
            senseTotal: 2,
            senses: [
              { gloss: "位置；地点", id: "sense-location-1" },
              { gloss: "定位；外景拍摄地", id: "sense-location-2" }
            ],
            state: "published"
          }
        ],
        id: "occurrence-location",
        kind: "word",
        coveredByPhrase: "central location",
        segments: [{ end: 50, start: 42, surface: "location" }],
        surface: "location"
      },
      {
        candidates: [
          {
            baseForm: "central location",
            entryId: "entry-central-location",
            headword: "central location",
            id: "candidate-central-location",
            matchedForm: "central location",
            posLabel: "短语",
            senseTotal: 1,
            senses: [{ gloss: "中心位置", id: "sense-central-location" }],
            state: "published_with_draft"
          }
        ],
        id: "occurrence-central-location",
        kind: "phrase",
        componentWords: ["central", "location"],
        segments: [{ end: 50, start: 34, surface: "central location" }],
        surface: "central location"
      }
    ]
  };
}

describe("V3SentenceTargetDiscovery", () => {
  it("自动模式仅在点击一键发现时发起一次只读查询", async () => {
    const { onDiscover } = renderDiscovery();

    expect(onDiscover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));

    await waitFor(() => expect(onDiscover).toHaveBeenCalledTimes(1));
    expect(onDiscover).toHaveBeenCalledWith(
      expect.objectContaining({
        dialect: "common",
        mode: "all_published_targets",
        sentenceText: "They turn the light off near the central location."
      }),
      expect.any(AbortSignal)
    );
    expect(screen.getByRole("status")).toHaveTextContent("暂未发现已发布词条");
  });

  it("手动选择任意不连续 token，相邻 token 归并，显式查询才回调", async () => {
    const { onDiscover } = renderDiscovery();
    fireEvent.click(screen.getByLabelText("手动选择"));

    const turn = screen.getByRole("button", { name: /选择第 2 个词 turn/u });
    const the = screen.getByRole("button", { name: /选择第 3 个词 the/u });
    const light = screen.getByRole("button", { name: /选择第 4 个词 light/u });
    const off = screen.getByRole("button", { name: /选择第 5 个词 off/u });
    fireEvent.click(turn);
    fireEvent.click(off);

    expect(turn).toHaveAttribute("aria-pressed", "true");
    expect(off).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("turn … off")).toBeVisible();
    expect(onDiscover).not.toHaveBeenCalled();

    fireEvent.click(the);
    fireEvent.click(light);
    expect(screen.getByText("turn the light off")).toBeVisible();
    expect(onDiscover).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    await waitFor(() => expect(onDiscover).toHaveBeenCalledTimes(1));
    expect(onDiscover.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        mode: "selected_segments",
        scope: "published_and_draft",
        segments: [expect.objectContaining({ surface: "turn the light off" })]
      })
    );
  });

  it("为重叠命中提供独立可聚焦位置按钮，并按需展开具体词义", async () => {
    const onSelectSense = vi.fn();
    renderDiscovery({
      onDiscover: vi.fn().mockResolvedValue(discoveryResult()),
      onSelectSense
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));

    const wordLocation = await screen.findByRole("button", {
      name: "查看命中位置：location"
    });
    const phraseLocation = screen.getByRole("button", {
      name: "查看命中位置：central location"
    });
    expect(wordLocation).toBeVisible();
    expect(phraseLocation).toBeVisible();

    fireEvent.click(phraseLocation);
    expect(phraseLocation).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("有未发布修改")).toBeVisible();
    expect(screen.getAllByText("成分用词").length).toBeGreaterThan(0);
    expect(screen.getByText("central")).toBeVisible();
    expect(screen.getAllByText("location").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "查看 1 个词义" }));
    fireEvent.click(screen.getByRole("button", { name: "关联词义：中心位置" }));

    expect(onSelectSense).toHaveBeenCalledWith(
      expect.objectContaining({ id: "occurrence-central-location" }),
      expect.objectContaining({ id: "candidate-central-location" }),
      expect.objectContaining({ id: "sense-central-location" })
    );

    fireEvent.click(wordLocation);
    expect(
      screen.getByText("已作为「central location」的成分用词")
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "关联词义：位置；地点" })
    ).toBeNull();
  });

  it("草稿候选只提供查看或转为待关联词条，且界面不出现英文状态名", async () => {
    const onConvertDraftToPending = vi.fn();
    const onViewDraft = vi.fn();
    const result: V3SentenceTargetDiscoveryResult = {
      complete: true,
      overloaded: false,
      occurrences: [
        {
          candidates: [
            {
              baseForm: "turn off",
              entryId: "entry-turn-off",
              headword: "turn off",
              id: "draft-turn-off",
              matchedForm: "turn … off",
              posLabel: "短语动词",
              senseTotal: 1,
              senses: [{ gloss: "关闭", id: "draft-sense" }],
              state: "draft"
            }
          ],
          id: "occurrence-turn-off",
          kind: "separable_phrase",
          segments: [
            { end: 9, start: 5, surface: "turn" },
            { end: 23, start: 20, surface: "off" }
          ],
          surface: "turn … off"
        }
      ]
    };
    renderDiscovery({
      onConvertDraftToPending,
      onDiscover: vi.fn().mockResolvedValue(result),
      onViewDraft
    });

    fireEvent.click(screen.getByLabelText("手动选择"));
    fireEvent.click(
      screen.getByRole("button", { name: /选择第 2 个词 turn/u })
    );
    fireEvent.click(screen.getByRole("button", { name: /选择第 5 个词 off/u }));
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));

    expect(await screen.findByText("草稿候选")).toBeVisible();
    expect(document.body).not.toHaveTextContent(/\b(?:Linked|Pending)\b/u);
    expect(screen.queryByRole("button", { name: /关联词义/u })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看草稿" }));
    fireEvent.click(screen.getByRole("button", { name: "转为待关联词条" }));
    expect(onViewDraft).toHaveBeenCalledTimes(1);
    expect(onConvertDraftToPending).toHaveBeenCalledTimes(1);
  });

  it("加载、过载和空结果通过 aria-live 清晰反馈", async () => {
    let resolveRequest:
      ((value: V3SentenceTargetDiscoveryResult) => void) | undefined;
    const onDiscover = vi.fn(
      () =>
        new Promise<V3SentenceTargetDiscoveryResult>((resolve) => {
          resolveRequest = resolve;
        })
    );
    renderDiscovery({ onDiscover });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));

    expect(screen.getByRole("status")).toHaveTextContent("正在发现");
    resolveRequest?.({
      complete: false,
      message: "候选较多，请缩小范围后重试",
      occurrences: [],
      overloaded: true
    });
    expect(await screen.findByText("候选较多，请缩小范围后重试")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("发现范围过大");
  });

  it("模式或选择变化后中止旧请求，迟到响应不会覆盖当前结果", async () => {
    let resolveFirst!: (value: V3SentenceTargetDiscoveryResult) => void;
    let resolveSecond!: (value: V3SentenceTargetDiscoveryResult) => void;
    const onDiscover = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<V3SentenceTargetDiscoveryResult>((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise<V3SentenceTargetDiscoveryResult>((resolve) => {
            resolveSecond = resolve;
          })
      );
    renderDiscovery({ onDiscover });

    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    const firstSignal = onDiscover.mock.calls[0]?.[1] as AbortSignal;
    fireEvent.click(screen.getByLabelText("手动选择"));
    expect(firstSignal.aborted).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: /选择第 2 个词 turn/u })
    );
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));

    resolveSecond(discoveryResult());
    expect(
      await screen.findByRole("button", { name: "查看命中位置：location" })
    ).toBeVisible();
    resolveFirst({
      complete: true,
      occurrences: [
        {
          candidates: [],
          id: "stale-occurrence",
          kind: "word",
          segments: [{ end: 5, start: 0, surface: "stale" }],
          surface: "stale"
        }
      ],
      overloaded: false
    });

    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "查看命中位置：stale" })
      ).toBeNull()
    );
  });

  it("手动查询完成后修改 segments 会立即清空旧结果且不自动重查", async () => {
    const onDiscover = vi.fn().mockResolvedValue({
      complete: true,
      overloaded: false,
      occurrences: [
        {
          id: "turn-result",
          kind: "word",
          surface: "turn",
          segments: [{ start: 5, end: 9, surface: "turn" }],
          candidates: []
        }
      ]
    } satisfies V3SentenceTargetDiscoveryResult);
    renderDiscovery({ onDiscover });
    fireEvent.click(screen.getByLabelText("手动选择"));
    fireEvent.click(
      screen.getByRole("button", { name: /选择第 2 个词 turn/u })
    );
    fireEvent.click(screen.getByRole("button", { name: "查询所选单词或短语" }));
    expect(
      await screen.findByRole("button", { name: "查看命中位置：turn" })
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /选择第 5 个词 off/u }));
    expect(
      screen.queryByRole("button", { name: "查看命中位置：turn" })
    ).toBeNull();
    expect(onDiscover).toHaveBeenCalledTimes(1);
  });

  it("修改查询上下文会中止候选分页，迟到失败不会污染新上下文", async () => {
    let rejectPage!: (reason: Error) => void;
    const firstPage = discoveryResult();
    firstPage.occurrences = [
      {
        ...firstPage.occurrences[0]!,
        nextCursor: "cursor-2",
        publishedTotal: 2
      }
    ];
    const onDiscover = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockImplementationOnce(
        () =>
          new Promise<V3SentenceTargetDiscoveryResult>((_resolve, reject) => {
            rejectPage = reject;
          })
      );
    renderDiscovery({ onDiscover });

    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "加载更多候选" })
    );
    const pageSignal = onDiscover.mock.calls[1]?.[1] as AbortSignal;

    fireEvent.click(screen.getByLabelText("手动选择"));
    expect(pageSignal.aborted).toBe(true);
    await act(async () => rejectPage(new Error("旧分页失败")));

    expect(screen.queryByText("旧分页失败")).not.toBeInTheDocument();
  });

  it("候选分页只合并同一命中 ID 和 segments 的响应", async () => {
    const firstPage = discoveryResult();
    const occurrence = firstPage.occurrences[0]!;
    firstPage.occurrences = [
      { ...occurrence, nextCursor: "cursor-2", publishedTotal: 2 }
    ];
    const onDiscover = vi
      .fn()
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce({
        complete: true,
        overloaded: false,
        occurrences: [
          {
            ...occurrence,
            id: "other-occurrence",
            candidates: [
              {
                ...occurrence.candidates[0]!,
                headword: "wrong page candidate",
                id: "wrong-page-candidate"
              }
            ],
            nextCursor: undefined
          },
          {
            ...occurrence,
            segments: [{ end: 4, start: 0, surface: "They" }],
            candidates: [
              {
                ...occurrence.candidates[0]!,
                headword: "wrong segments candidate",
                id: "wrong-segments-candidate"
              }
            ],
            nextCursor: undefined
          }
        ]
      } satisfies V3SentenceTargetDiscoveryResult);
    renderDiscovery({ onDiscover });

    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    const loadMore = await screen.findByRole("button", {
      name: "加载更多候选"
    });
    fireEvent.click(loadMore);

    await waitFor(() => expect(onDiscover).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(loadMore).not.toBeDisabled());
    expect(screen.queryByText("wrong page candidate")).not.toBeInTheDocument();
    expect(
      screen.queryByText("wrong segments candidate")
    ).not.toBeInTheDocument();
  });
});
