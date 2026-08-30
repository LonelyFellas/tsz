import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  const view = render(
    <AntApp>
      <V3SentenceTargetDiscovery {...props} />
    </AntApp>
  );
  return { ...props, onDiscover, ...view };
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

  it("未发起请求时卸载不会产生取消副作用", () => {
    const { unmount, onDiscover } = renderDiscovery();
    unmount();
    expect(onDiscover).not.toHaveBeenCalled();
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
    fireEvent.click(screen.getByRole("button", { name: "查看 2 个词义" }));
    expect(screen.getAllByText("随短语关联")).toHaveLength(2);
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

  it("请求被切换中止后即使底层迟到拒绝也不显示错误", async () => {
    let rejectRequest!: (reason: unknown) => void;
    const onDiscover = vi.fn(
      () =>
        new Promise<V3SentenceTargetDiscoveryResult>((_resolve, reject) => {
          rejectRequest = reject;
        })
    );
    renderDiscovery({ onDiscover });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    fireEvent.click(screen.getByLabelText("手动选择"));
    await Promise.resolve().then(() => rejectRequest(new Error("stale error")));
    await waitFor(() => expect(screen.queryByText("stale error")).toBeNull());
  });

  it("加载更多拒绝错误 occurrence fingerprint", async () => {
    const first = discoveryResult();
    first.occurrences[0]!.nextCursor = "cursor-next";
    const onDiscover = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({
        complete: true,
        overloaded: false,
        occurrences: [
          {
            id: "wrong-occurrence",
            kind: "word",
            surface: "wrong",
            segments: [{ start: 0, end: 5, surface: "wrong" }],
            candidates: [
              {
                id: "wrong-candidate",
                entryId: "wrong-entry",
                headword: "wrong",
                baseForm: "wrong",
                matchedForm: "wrong",
                posLabel: "名词",
                state: "published",
                senses: [{ id: "wrong-sense", gloss: "错误候选" }],
                senseTotal: 1
              }
            ]
          }
        ]
      } satisfies V3SentenceTargetDiscoveryResult);
    renderDiscovery({ onDiscover });

    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await screen.findByRole("button", { name: "加载更多候选" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多候选" }));
    await waitFor(() => expect(onDiscover).toHaveBeenCalledTimes(2));
    expect(screen.queryByText("wrong")).toBeNull();
  });

  it("加载更多按候选 identity 去重并合并同一 occurrence", async () => {
    const first = discoveryResult();
    first.occurrences[0]!.nextCursor = "cursor-next";
    const duplicate = first.occurrences[0]!.candidates[0]!;
    const additional = {
      ...duplicate,
      id: "candidate-location-extra",
      entryId: "entry-location-extra",
      headword: "location extra",
      baseForm: "location extra",
      matchedForm: "location",
      senses: [{ id: "sense-location-extra", gloss: "额外地点" }],
      senseTotal: 1
    };
    const onDiscover = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce({
        complete: true,
        overloaded: false,
        occurrences: [
          {
            ...first.occurrences[0]!,
            candidates: [duplicate, additional],
            nextCursor: undefined,
            publishedTotal: 2
          }
        ]
      } satisfies V3SentenceTargetDiscoveryResult);
    renderDiscovery({ onDiscover });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await screen.findByRole("button", { name: "加载更多候选" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多候选" }));

    expect(await screen.findByText("location extra")).toBeVisible();
    expect(screen.getAllByText("location").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "加载更多候选" })).toBeNull();
  });

  it("加载更多返回空 occurrence 时保留当前页", async () => {
    const first = discoveryResult();
    first.occurrences[0]!.nextCursor = "cursor-next";
    renderDiscovery({
      onDiscover: vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce({
        complete: true,
        overloaded: false,
        occurrences: []
      })
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await screen.findByRole("button", { name: "加载更多候选" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多候选" }));
    await waitFor(() =>
      expect(screen.getAllByText("location").length).toBeGreaterThan(0)
    );
    expect(screen.getAllByText("location").length).toBeGreaterThan(0);
  });

  it("关闭组件会中止加载更多请求", async () => {
    const first = discoveryResult();
    first.occurrences[0]!.nextCursor = "cursor-next";
    let resolveMore!: (value: V3SentenceTargetDiscoveryResult) => void;
    const onDiscover = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(
        () =>
          new Promise<V3SentenceTargetDiscoveryResult>((resolve) => {
            resolveMore = resolve;
          })
      );
    const view = renderDiscovery({ onDiscover });

    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await screen.findByRole("button", { name: "加载更多候选" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多候选" }));
    await waitFor(() => expect(onDiscover).toHaveBeenCalledTimes(2));
    const loadMoreSignal = onDiscover.mock.calls[1]?.[1] as AbortSignal;
    view.unmount();
    expect(loadMoreSignal.aborted).toBe(true);
    resolveMore({ complete: true, overloaded: false, occurrences: [] });
  });

  it("新的主发现会淘汰并中止在途加载更多", async () => {
    const first = discoveryResult();
    first.occurrences[0]!.nextCursor = "cursor-next";
    let rejectMore!: (reason: unknown) => void;
    const onDiscover = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(
        () =>
          new Promise<V3SentenceTargetDiscoveryResult>((_resolve, reject) => {
            rejectMore = reject;
          })
      )
      .mockResolvedValueOnce({
        complete: true,
        overloaded: false,
        occurrences: []
      });
    renderDiscovery({ onDiscover });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await screen.findByRole("button", { name: "加载更多候选" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多候选" }));
    await waitFor(() => expect(onDiscover).toHaveBeenCalledTimes(2));
    const loadMoreSignal = onDiscover.mock.calls[1]?.[1] as AbortSignal;
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    expect(loadMoreSignal.aborted).toBe(true);
    rejectMore(new Error("stale page"));
    await waitFor(() => expect(onDiscover).toHaveBeenCalledTimes(3));
    expect(screen.getByRole("status")).toHaveTextContent("暂未发现已发布词条");
  });

  it("发现失败、空文本与无候选位置都提供可操作反馈", async () => {
    const failed = renderDiscovery({
      onDiscover: vi.fn().mockRejectedValue(new Error("resolver unavailable"))
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    expect(await screen.findByText("resolver unavailable")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("发现失败");
    failed.unmount();

    const onCreatePending = vi.fn();
    renderDiscovery({
      onCreatePending,
      onDiscover: vi.fn().mockResolvedValue({
        complete: true,
        overloaded: false,
        occurrences: [
          {
            id: "no-candidate",
            kind: "word",
            surface: "unknown",
            segments: [{ start: 0, end: 7, surface: "unknown" }],
            candidates: []
          }
        ]
      })
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "添加待关联词条" })
    );
    expect(onCreatePending).toHaveBeenCalledWith(
      expect.objectContaining({ id: "no-candidate" })
    );
  });

  it("手动 token 可再次取消，候选词义可展开收起且空释义有兜底", async () => {
    const result = discoveryResult();
    result.occurrences[1]!.candidates[0]!.senses[0]!.gloss = "";
    renderDiscovery({ onDiscover: vi.fn().mockResolvedValue(result) });
    fireEvent.click(screen.getByLabelText("手动选择"));
    const turn = screen.getByRole("button", { name: /选择第 2 个词 turn/u });
    fireEvent.click(turn);
    expect(turn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(turn);
    expect(turn).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByLabelText("自动发现"));
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "查看命中位置：central location"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "查看 1 个词义" }));
    expect(screen.getByText("未填写释义")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "收起词义" }));
    expect(screen.queryByText("未填写释义")).toBeNull();
  });

  it("加载更多失败保留当前候选并显示错误", async () => {
    const first = discoveryResult();
    first.occurrences[0]!.nextCursor = "cursor-next";
    const onDiscover = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockRejectedValueOnce(new Error("next page failed"));
    renderDiscovery({ onDiscover });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await screen.findByRole("button", { name: "加载更多候选" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多候选" }));
    expect(await screen.findByText("next page failed")).toBeVisible();
    expect(screen.getAllByText("location").length).toBeGreaterThan(0);
  });

  it("空句、过载默认说明与未加载词义数量都有明确反馈", async () => {
    const empty = renderDiscovery({ sentenceText: "" });
    fireEvent.click(screen.getByLabelText("手动选择"));
    expect(screen.getByText("请先填写英文例句")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "查询所选单词或短语" })
    ).toBeDisabled();
    empty.unmount();

    const overloaded = renderDiscovery({
      onDiscover: vi.fn().mockResolvedValue({
        complete: false,
        overloaded: true,
        occurrences: []
      })
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    expect(
      await screen.findByText("请改用手动选择，缩小查询范围后重试。")
    ).toBeVisible();
    overloaded.unmount();

    const partial = discoveryResult();
    partial.occurrences[1]!.candidates[0]!.senseTotal = 3;
    renderDiscovery({ onDiscover: vi.fn().mockResolvedValue(partial) });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "查看命中位置：central location"
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "查看 3 个词义" }));
    expect(screen.getByText(/还有 2 个词义，请继续加载后选择/u)).toBeVisible();
  });

  it("非 Error 拒绝也使用稳定发现与分页兜底文案", async () => {
    const failed = renderDiscovery({
      onDiscover: vi.fn().mockRejectedValue("invalid failure")
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    expect(await screen.findByText("发现失败，请稍后重试")).toBeVisible();
    failed.unmount();

    const first = discoveryResult();
    first.occurrences[0]!.nextCursor = "cursor-next";
    renderDiscovery({
      onDiscover: vi
        .fn()
        .mockResolvedValueOnce(first)
        .mockRejectedValueOnce("invalid page")
    });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));
    await screen.findByRole("button", { name: "加载更多候选" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多候选" }));
    expect(await screen.findByText("加载更多候选失败")).toBeVisible();
  });

  it("截断候选展示真实总数与当前词形的完整成分用词", async () => {
    const result: V3SentenceTargetDiscoveryResult = {
      complete: true,
      overloaded: false,
      occurrences: [
        {
          id: "phrase-components",
          kind: "phrase",
          surface: "central location",
          segments: [{ start: 0, end: 16, surface: "central location" }],
          publishedTotal: 3,
          candidates: [
            {
              id: "phrase-candidate",
              entryId: "phrase-entry",
              headword: "central location",
              baseForm: "central location",
              matchedForm: "central location",
              posLabel: "短语",
              formTypeLabel: "base",
              state: "published",
              senseTotal: 1,
              senses: [{ id: "phrase-sense", gloss: "中心位置" }],
              componentUsages: [
                {
                  state: "unresolved",
                  id: "component-unresolved",
                  literal: "central"
                },
                {
                  state: "resolved",
                  id: "component-resolved",
                  literal: "location",
                  target_word_id: "location-entry",
                  target_publication_id: "location-publication",
                  target_pos_id: "location-pos",
                  target_base_form_id: "location-base",
                  target_sense_id: "location-sense",
                  target_form_id: "location-form",
                  target_variant_id: "location-variant",
                  target_dialect: "common",
                  target_form_type: "base",
                  target_headword: "location",
                  target_gloss: "位置"
                }
              ]
            }
          ]
        }
      ]
    };
    renderDiscovery({ onDiscover: vi.fn().mockResolvedValue(result) });
    fireEvent.click(screen.getByRole("button", { name: "一键发现" }));

    expect(
      await screen.findByText(/已显示 1 \/ 3 个已发布候选/u)
    ).toBeVisible();
    expect(screen.getByText("当前词形的成分用词")).toBeVisible();
    expect(screen.getByText("待选择词义")).toBeVisible();
    expect(screen.getByText("已关联词义")).toBeVisible();
    expect(screen.getByText(/location · 位置/u)).toBeVisible();
  });
});
