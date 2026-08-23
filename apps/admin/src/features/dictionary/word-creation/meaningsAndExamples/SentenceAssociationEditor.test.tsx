import type { WordSentenceV2 } from "@tsz/types";
import type {
  PendingSentenceAssociationItemV1,
  ResolveSentenceAssociationResponse,
  SharedWordSentenceV1
} from "./sentenceAssociationTypes";
import { HttpError } from "@tsz/api-client/http";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { deferred, wordFixture } from "../wordCreation.test.helper";
import { MultidimensionalSentencesEditor } from "./SentenceAssociationEditor";

const boundary = vi.hoisted(() => ({
  available: true,
  resolve: vi.fn(),
  listPending: vi.fn(),
  claim: vi.fn()
}));
const dialect = vi.hoisted(() => ({ value: "uk" as "uk" | "us" }));
const relatedSearchV2 = vi.hoisted(() => vi.fn());
const relatedWords = vi.hoisted(() => [
  {
    word_id: "word-published-center",
    headword: "center",
    kind: "word" as const,
    dialects: ["uk" as const, "us" as const],
    pos_labels: ["noun"],
    senses: [{ sense_id: "mock-sense-1-1", gloss: "中心" }]
  },
  {
    word_id: "word-center-alternative",
    headword: "center",
    kind: "word" as const,
    dialects: ["common" as const],
    pos_labels: ["verb"],
    senses: [{ sense_id: "sense-center-alternative", gloss: "使居中" }]
  }
]);

vi.mock("../../dataSource", () => ({
  sentenceAssociationsDataSource: boundary
}));
vi.mock("../../api", () => ({
  useRelatedSearchV2: (...args: unknown[]) => relatedSearchV2(...args)
}));
vi.mock("@/features/settings/useDialectPreference", () => ({
  useDialectPreference: () => ({ preference: dialect.value })
}));

const richText = (text: string) => ({
  version: 1 as const,
  text,
  spans: [],
  liaisons: []
});

function sentence(
  associations?: SharedWordSentenceV1["associations"]
): SharedWordSentenceV1 {
  const owner = wordFixture({ ready: true });
  const ownerAssociation = {
    id: "shared-1-owner",
    state: "legacy_unpositioned" as const,
    target_word_id: owner.id,
    target_sense_id: owner.meanings.pos[0]!.senses[0]!.id,
    legacy_role: "focus" as const,
    sort_order: 0
  };
  const nextAssociations = associations ?? [];
  return {
    id: "shared-1",
    level: "A1",
    en_text_id: "shared-1-en",
    en_text: richText("Center the picture on the wall."),
    zh_text_id: "shared-1-zh",
    zh_text: richText("把画挂在墙壁中央。"),
    associations: nextAssociations.some(
      (association) =>
        association.state !== "pending" &&
        association.target_word_id === owner.id &&
        association.target_sense_id === ownerAssociation.target_sense_id
    )
      ? nextAssociations
      : [ownerAssociation, ...nextAssociations]
  };
}

function Harness({
  initial = [sentence()],
  legacyInitial = [],
  status = "draft",
  readOnly = false
}: {
  initial?: SharedWordSentenceV1[];
  legacyInitial?: WordSentenceV2[];
  status?: "draft" | "published";
  readOnly?: boolean;
}) {
  const word = wordFixture({ status, ready: true });
  const [value, setValue] = useState(initial);
  const [legacySentences, setLegacySentences] = useState(legacyInitial);
  return (
    <>
      <MultidimensionalSentencesEditor
        word={word}
        sense={{
          ...word.meanings.pos[0]!.senses[0]!,
          sentences: legacySentences
        }}
        value={value}
        readOnly={readOnly}
        showPendingClaims
        onChange={(nextValue, nextLegacySentences) => {
          setValue(nextValue);
          setLegacySentences(nextLegacySentences);
        }}
      />
      <output data-testid="sentence-editor-state">
        {JSON.stringify({ value, legacySentences })}
      </output>
    </>
  );
}

function renderPanel(options?: Parameters<typeof Harness>[0]) {
  return render(
    <AntApp>
      <Harness {...options} />
    </AntApp>
  );
}

function selectRange(label: string, start: number, end: number) {
  const input = screen.getByLabelText(label) as HTMLTextAreaElement;
  fireEvent.focus(input);
  input.setSelectionRange(start, end);
  fireEvent.mouseUp(input);
}

function openExistingDrawer() {
  fireEvent.click(screen.getByLabelText("编辑多维例句 1"));
}

async function selectAntOption(label: string, optionText: string) {
  const select = screen.getByLabelText(label);
  fireEvent.mouseDown(select);
  const candidates = await screen.findAllByText(optionText, { exact: true });
  const option = candidates.find((item) =>
    item.closest(".ant-select-item-option")
  );
  if (!option) throw new Error(`option not found: ${optionText}`);
  fireEvent.click(option);
}

async function waitForClaimButton() {
  await waitFor(() => {
    const button = screen.getByRole("button", { name: /正式认领/ });
    expect(button).toBeEnabled();
    expect(button).not.toHaveClass("ant-btn-loading");
  });
  return screen.getByRole("button", { name: /正式认领/ });
}

const resolved = {
  resolution: "resolved" as const,
  candidate: {
    pos_id: "pos-noun",
    pos: "noun",
    form_slot_id: "slot-center",
    form_type: "base" as const,
    variants: [
      { dialect: "uk" as const, spelling: "Centre" },
      { dialect: "us" as const, spelling: "Center" }
    ]
  }
};

beforeEach(() => {
  vi.resetAllMocks();
  boundary.available = true;
  boundary.resolve.mockResolvedValue(resolved);
  boundary.listPending.mockResolvedValue({
    results: [],
    total: 0,
    next_cursor: null
  });
  boundary.claim.mockResolvedValue({});
  relatedSearchV2.mockImplementation(
    (query: string, kind: "word" | "phrase", open: boolean) => {
      const normalized = query.trim().toLowerCase();
      const exact =
        open && normalized
          ? relatedWords.filter(
              (word) => word.kind === kind && word.headword === normalized
            )
          : [];
      const contains =
        open && normalized
          ? relatedWords.filter(
              (word) =>
                word.kind === kind &&
                word.headword.includes(normalized) &&
                word.headword !== normalized
            )
          : [];
      const result = (results: typeof relatedWords) => ({
        data: {
          pages: [{ results, total: results.length, next_cursor: null }]
        },
        isFetching: false,
        isFetchingNextPage: false,
        hasNextPage: false,
        fetchNextPage: vi.fn()
      });
      return { exact: result(exact), contains: result(contains) };
    }
  );
  dialect.value = "uk";
});

describe("MultidimensionalSentencesEditor", () => {
  it("真实数据源能力未就绪时保持安静，不开放新写入", () => {
    boundary.available = false;
    renderPanel();
    expect(screen.queryByText(/契约|共享例句/)).not.toBeInTheDocument();
    expect(screen.queryByText("添加例句")).not.toBeInTheDocument();
    expect(boundary.resolve).not.toHaveBeenCalled();
  });

  it("添加例句打开抽屉，取消时不新增且界面不出现共享例句术语", async () => {
    renderPanel({ initial: [] });
    fireEvent.click(screen.getByText("添加例句", { exact: true }));
    expect(
      await screen.findByText("新增多维例句", { exact: true })
    ).toBeVisible();
    expect(screen.getByLabelText("多维例句英文原文")).toBeVisible();
    expect(screen.getByLabelText("多维例句中文译文")).toBeVisible();
    expect(screen.queryByText(/共享例句/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("多维例句英文原文"), {
      target: { value: "Center it." }
    });
    fireEvent.click(screen.getByText(/^取\s*消$/));
    await waitFor(() =>
      expect(screen.queryByText("新增多维例句")).not.toBeInTheDocument()
    );
    expect(screen.queryByLabelText("编辑多维例句 1")).not.toBeInTheDocument();
  });

  it("新增例句必须先关联当前词义，完成后只写入一份根数据", async () => {
    renderPanel({ initial: [] });
    fireEvent.click(screen.getByText("添加例句", { exact: true }));
    fireEvent.change(screen.getByLabelText("多维例句英文原文"), {
      target: { value: "Center it." }
    });
    fireEvent.click(screen.getByText("应用英文原文修改", { exact: true }));
    fireEvent.change(screen.getByLabelText("多维例句中文译文"), {
      target: { value: "把它放中间。" }
    });
    expect(
      screen.getByText("完 成", { exact: true }).closest("button")
    ).toBeDisabled();

    selectRange("多维例句英文原文", 0, 6);
    await selectAntOption(
      "选择词条和具体词义",
      "centre / center · 测试释义 1（当前词义）"
    );
    expect(boundary.resolve).not.toHaveBeenCalled();
    expect(await screen.findByText("词性与词形已自动识别")).toBeVisible();
    fireEvent.click(screen.getByText("确认关联", { exact: true }));
    expect(
      screen.getByText("完 成", { exact: true }).closest("button")
    ).toBeEnabled();
    fireEvent.click(screen.getByText("完 成", { exact: true }));

    await waitFor(() =>
      expect(screen.queryByText("新增多维例句")).not.toBeInTheDocument()
    );
    const state = JSON.parse(
      screen.getByTestId("sentence-editor-state").textContent ?? "{}"
    );
    expect(state.value).toHaveLength(1);
    expect(state.legacySentences).toEqual([]);
    expect(state.value[0].en_text.text).toBe("Center it.");
    expect(screen.getByLabelText("编辑多维例句 1")).toBeVisible();
  });

  it("编辑已有根例句时原位更新，不追加重复对象", async () => {
    const secondSentence = {
      ...sentence(),
      id: "shared-2",
      en_text_id: "shared-2-en",
      zh_text_id: "shared-2-zh"
    };
    renderPanel({ initial: [sentence(), secondSentence] });
    openExistingDrawer();
    fireEvent.change(screen.getByLabelText("多维例句中文译文"), {
      target: { value: "把图片放在墙面中央。" }
    });
    fireEvent.click(screen.getByText("完 成", { exact: true }));

    await waitFor(() =>
      expect(screen.queryByText("编辑多维例句")).not.toBeInTheDocument()
    );
    const state = JSON.parse(
      screen.getByTestId("sentence-editor-state").textContent ?? "{}"
    );
    expect(state.value).toHaveLength(2);
    expect(state.value[0].id).toBe("shared-1");
    expect(state.value[0].zh_text.text).toBe("把图片放在墙面中央。");
    expect(state.value[1]).toEqual(secondSentence);
  });

  it("英文草稿未应用时禁止完成，避免静默丢失输入", () => {
    renderPanel();
    openExistingDrawer();
    fireEvent.change(screen.getByLabelText("多维例句英文原文"), {
      target: { value: "Move the picture to the center." }
    });

    expect(screen.getByText("应用英文原文修改")).toBeVisible();
    expect(
      screen.getByText("完 成", { exact: true }).closest("button")
    ).toBeDisabled();
    expect(screen.getByText("编辑多维例句", { exact: true })).toBeVisible();
  });

  it("编辑时可调整等级、提示非法选区并删除指定位置关联", async () => {
    renderPanel({
      initial: [
        sentence([
          {
            id: "pending-remove",
            state: "pending",
            source_range: { start: 19, end: 21, surface: "on" },
            pending_word: "on"
          }
        ])
      ]
    });
    openExistingDrawer();

    await selectAntOption("多维例句等级", "B1");
    selectRange("多维例句英文原文", 1, 6);
    expect(await screen.findByText("请选择完整的英文单词")).toBeVisible();
    fireEvent.click(screen.getByLabelText("删除位置关联 pending-remove"));
    expect(screen.queryByText("待关联词：on")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("完 成", { exact: true }));

    await waitFor(() =>
      expect(screen.queryByText("编辑多维例句")).not.toBeInTheDocument()
    );
    const state = JSON.parse(
      screen.getByTestId("sentence-editor-state").textContent ?? "{}"
    );
    expect(state.value[0].level).toBe("B1");
    expect(state.value[0].associations).toEqual([
      expect.objectContaining({ state: "legacy_unpositioned" })
    ]);
  });

  it("存量例句从英文区域进入抽屉，完成后无损升级且不双写", async () => {
    const legacy = structuredClone(
      wordFixture({ ready: true }).meanings.pos[0]!.senses[0]!.sentences[0]!
    );
    renderPanel({ initial: [], legacyInitial: [legacy] });

    fireEvent.click(screen.getByLabelText("编辑多维例句 1"));
    expect(
      await screen.findByText("编辑多维例句", { exact: true })
    ).toBeVisible();
    fireEvent.click(screen.getByText("完 成", { exact: true }));

    await waitFor(() => {
      const state = JSON.parse(
        screen.getByTestId("sentence-editor-state").textContent ?? "{}"
      );
      expect(state.legacySentences).toEqual([]);
      expect(state.value).toHaveLength(1);
      expect(state.value[0].id).toBe(legacy.id);
      expect(state.value[0].zh_text_id).toBe(legacy.zh_text_id);
      expect(state.value[0].zh_text).toEqual(legacy.zh_text);
    });
  });

  it("选择原句位置和具体词义后，唯一词形自动识别并确认 linked", async () => {
    renderPanel();
    openExistingDrawer();
    selectRange("多维例句英文原文", 0, 6);
    expect(screen.getByText(/已选择/)).toHaveTextContent("Center");
    await selectAntOption("选择词条和具体词义", "center · 中心");
    expect(await screen.findByText("词性与词形已自动识别")).toBeInTheDocument();
    fireEvent.click(screen.getByText("确认关联", { exact: true }));
    expect(await screen.findByText("正式关联", { exact: true })).toBeVisible();
    expect(screen.getByText(/英式偏好预览：Centre/)).toBeVisible();
    expect(screen.queryByLabelText(/方言/)).not.toBeInTheDocument();
  });

  it("候选固定 word、exact-first，并提供两类分页入口", async () => {
    const fetchExact = vi.fn();
    const fetchContains = vi.fn();
    const currentWord = wordFixture({ ready: true });
    const exact = {
      word_id: "word-exact",
      headword: "Center",
      kind: "word" as const,
      dialects: ["common" as const],
      pos_labels: ["noun"],
      senses: [{ sense_id: "sense-exact", gloss: "精确" }]
    };
    const sameWord = {
      ...exact,
      word_id: currentWord.id,
      headword: "center",
      senses: [
        {
          sense_id: currentWord.meanings.pos[0]!.senses[0]!.id,
          gloss: "测试释义 1"
        },
        { sense_id: "same-word-other-sense", gloss: "同词其他释义" }
      ]
    };
    const contains = {
      ...exact,
      word_id: "word-contains",
      headword: "centerpiece",
      senses: [{ sense_id: "sense-contains", gloss: "包含" }]
    };
    const phrase = {
      ...exact,
      word_id: "phrase-center",
      kind: "phrase" as const,
      senses: [{ sense_id: "sense-phrase", gloss: "短语" }]
    };
    relatedSearchV2.mockImplementation(
      (_query: string, _kind: "word" | "phrase", open: boolean) => ({
        exact: {
          data: {
            pages: [
              {
                results: open ? [exact, sameWord] : [],
                total: 2,
                next_cursor: open ? "exact-next" : null
              }
            ]
          },
          isFetching: false,
          isFetchingNextPage: false,
          hasNextPage: open,
          fetchNextPage: fetchExact
        },
        contains: {
          data: {
            pages: [
              {
                results: open ? [contains, phrase, exact] : [],
                total: 3,
                next_cursor: open ? "contains-next" : null
              }
            ]
          },
          isFetching: false,
          isFetchingNextPage: false,
          hasNextPage: open,
          fetchNextPage: fetchContains
        }
      })
    );
    renderPanel();
    openExistingDrawer();
    selectRange("多维例句英文原文", 0, 6);

    await waitFor(() =>
      expect(relatedSearchV2).toHaveBeenCalledWith("Center", "word", true)
    );
    fireEvent.mouseDown(screen.getByLabelText("选择词条和具体词义"));
    const exactOption = await screen.findByText("Center · 精确");
    const containsOption = await screen.findByText("centerpiece · 包含");
    expect(screen.getByText("center · 同词其他释义")).toBeInTheDocument();
    expect(
      exactOption.compareDocumentPosition(containsOption) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.queryByText(/短语/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("加载更多完全同名词条"));
    fireEvent.click(screen.getByText("加载更多相关候选"));
    expect(fetchExact).toHaveBeenCalledTimes(1);
    expect(fetchContains).toHaveBeenCalledTimes(1);
  });

  it("快速切换目标时忽略较晚返回的旧 resolver 结果", async () => {
    const first = deferred<ResolveSentenceAssociationResponse>();
    const second = deferred<ResolveSentenceAssociationResponse>();
    const secondResolved = {
      resolution: "resolved" as const,
      candidate: {
        ...resolved.candidate,
        pos: "verb",
        form_slot_id: "slot-center-verb",
        form_type: "present_participle" as const,
        variants: [{ dialect: "common" as const, spelling: "centering" }]
      }
    };
    boundary.resolve
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    renderPanel();
    openExistingDrawer();
    selectRange("多维例句英文原文", 0, 6);

    await selectAntOption("选择词条和具体词义", "center · 中心");
    await selectAntOption("选择词条和具体词义", "center · 使居中");
    await act(async () => second.resolve(secondResolved));
    expect(await screen.findByText(/verb · present_participle/)).toBeVisible();

    await act(async () => first.resolve(resolved));
    expect(screen.getByText(/verb · present_participle/)).toBeVisible();
    expect(screen.queryByText(/noun · base/)).not.toBeInTheDocument();
  });

  it("键盘选区同样生成 Unicode 码点位置", () => {
    renderPanel();
    openExistingDrawer();
    const input = screen.getByLabelText(
      "多维例句英文原文"
    ) as HTMLTextAreaElement;
    fireEvent.focus(input);
    input.setSelectionRange(11, 18);
    fireEvent.keyUp(input, { key: "ArrowRight", shiftKey: true });
    expect(screen.getByText(/已选择/)).toHaveTextContent(
      "picture 码点范围 [11, 18)"
    );
  });

  it("真实歧义时必须选择 form slot，未选择前不能确认", async () => {
    boundary.resolve.mockResolvedValue({
      resolution: "ambiguous",
      candidates: [
        resolved.candidate,
        {
          ...resolved.candidate,
          form_slot_id: "slot-center-past",
          form_type: "past_tense"
        }
      ]
    });
    renderPanel();
    openExistingDrawer();
    selectRange("多维例句英文原文", 0, 6);
    await selectAntOption("选择词条和具体词义", "center · 中心");
    const confirm = await screen.findByText("确认关联", { exact: true });
    expect(confirm.closest("button")).toBeDisabled();
    await selectAntOption(
      "选择歧义词形",
      "noun · past_tense · uk: Centre / us: Center"
    );
    expect(confirm.closest("button")).not.toBeDisabled();
    fireEvent.click(confirm);
    expect(await screen.findByText("正式关联", { exact: true })).toBeVisible();
  });

  it("未匹配可保存 pending，同一业务键重复时给去重提示", async () => {
    boundary.resolve.mockResolvedValue({
      resolution: "unmatched",
      candidates: []
    });
    renderPanel({
      initial: [
        sentence([
          {
            id: "linked-center-existing",
            state: "linked",
            source_range: { start: 11, end: 18, surface: "picture" },
            target_word_id: "word-picture-target",
            target_sense_id: "sense-picture-target",
            form_slot_id: "slot-picture",
            sort_order: 0
          }
        ])
      ]
    });
    openExistingDrawer();
    selectRange("多维例句英文原文", 0, 6);
    await selectAntOption("选择词条和具体词义", "center · 中心");
    expect(
      await screen.findByText("所选词义没有可匹配的已发布词形")
    ).toBeVisible();
    fireEvent.click(screen.getByText("保存为预关联", { exact: true }));
    expect(await screen.findByText("预关联", { exact: true })).toBeVisible();

    selectRange("多维例句英文原文", 0, 6);
    fireEvent.click(screen.getByText("保存为预关联", { exact: true }));
    expect(
      await screen.findByText(
        "同一多维例句、同一位置的预关联已存在，未重复添加"
      )
    ).toBeVisible();
    expect(screen.getAllByText("预关联", { exact: true })).toHaveLength(1);
    expect(screen.getByText("正式关联", { exact: true })).toBeVisible();
  });

  it("方言偏好切换只改变预览，不增加例句级方言配置", () => {
    const initial = [
      sentence([
        {
          id: "linked-center-dialect",
          state: "linked",
          source_range: { start: 0, end: 6, surface: "Center" },
          target_word_id: "word-center-target",
          target_sense_id: "sense-center-target",
          form_slot_id: "slot-center",
          sort_order: 0,
          form_variants: resolved.candidate.variants
        }
      ])
    ];
    const view = renderPanel({ initial });
    openExistingDrawer();
    expect(screen.getByText(/英式偏好预览：Centre/)).toBeVisible();
    dialect.value = "us";
    view.rerender(
      <AntApp>
        <Harness initial={initial} />
      </AntApp>
    );
    expect(screen.getByText(/美式偏好预览：Center/)).toBeVisible();
    expect(screen.queryByLabelText(/方言/)).not.toBeInTheDocument();
  });

  it("修改英文原文先展示影响数，确认后旧位置全部待重新标注", async () => {
    renderPanel({
      initial: [
        sentence([
          {
            id: "linked-center",
            state: "linked",
            source_range: { start: 0, end: 6, surface: "Center" },
            target_word_id: "word-center-target",
            target_sense_id: "sense-center-target",
            form_slot_id: "slot-center",
            sort_order: 0,
            form_variants: resolved.candidate.variants
          },
          {
            id: "pending-on",
            state: "pending",
            source_range: { start: 19, end: 21, surface: "on" },
            pending_word: "on"
          }
        ])
      ]
    });
    openExistingDrawer();
    fireEvent.change(screen.getByLabelText("多维例句英文原文"), {
      target: { value: "Place the picture on the wall." }
    });
    fireEvent.click(screen.getByText("应用英文原文修改", { exact: true }));
    expect(
      (await screen.findAllByText("修改多维例句英文原文？")).length
    ).toBeGreaterThan(0);
    expect(
      screen
        .getAllByText(/影响 1 条正式关联和 1 条预关联/)
        .some((item) =>
          item.textContent?.includes("影响 1 条正式关联和 1 条预关联")
        )
    ).toBe(true);
    fireEvent.click(screen.getAllByText(/^取\s*消$/).at(-1)!);
    expect(screen.getByText("正式关联", { exact: true })).toBeVisible();
    expect(screen.getByText("预关联", { exact: true })).toBeVisible();

    fireEvent.click(screen.getByText("应用英文原文修改", { exact: true }));
    expect(
      (await screen.findAllByText("修改多维例句英文原文？")).length
    ).toBeGreaterThan(0);
    fireEvent.click(
      screen.getAllByText("确认修改并重新标注", { exact: true }).at(-1)!
    );
    expect(await screen.findByText("2 项待重新标注")).toBeVisible();
    expect(screen.getByText(/Center → word-center-target/)).toBeVisible();
    expect(screen.getByText(/on → 待关联词 on/)).toBeVisible();
    const complete = screen
      .getByText("完 成", { exact: true })
      .closest("button");
    expect(complete).toBeDisabled();
    expect(
      screen.queryByText("正式关联", { exact: true })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("预关联", { exact: true })
    ).not.toBeInTheDocument();

    selectRange("多维例句英文原文", 0, 5);
    fireEvent.click(screen.getByText("保存为预关联", { exact: true }));
    expect(await screen.findByText("1 项待重新标注")).toBeVisible();
    expect(complete).toBeDisabled();

    selectRange("多维例句英文原文", 18, 20);
    fireEvent.click(screen.getByText("保存为预关联", { exact: true }));
    await waitFor(() =>
      expect(screen.queryByText(/项待重新标注/)).not.toBeInTheDocument()
    );
    expect(complete).toBeEnabled();
  });

  it("已发布词条展示历史 pending，选择具体词义后执行认领", async () => {
    const word = wordFixture({ status: "published", ready: true });
    const item: PendingSentenceAssociationItemV1 = {
      association_id: "pending-history",
      sentence_id: "shared-history",
      owner_entry_id: "owner-history",
      owner_entry_revision: 7,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    boundary.listPending
      .mockResolvedValueOnce({
        results: [item],
        total: 1,
        next_cursor: null
      })
      .mockResolvedValue({ results: [], total: 0, next_cursor: null });
    boundary.claim.mockResolvedValue({
      association: {
        id: item.association_id,
        state: "linked",
        source_range: item.source_range,
        target_word_id: word.id,
        target_sense_id: word.meanings.pos[0]!.senses[0]!.id,
        form_slot_id: resolved.candidate.form_slot_id,
        sort_order: 0
      },
      owner_entry_id: item.owner_entry_id,
      owner_entry_revision: 8
    });
    renderPanel({ status: "published" });
    expect(await screen.findByText("Center it.")).toBeVisible();
    const senseId = word.meanings.pos[0]!.senses[0]!.id;
    const label = `为预关联 ${item.association_id} 选择具体词义`;
    await selectAntOption(label, "测试释义 1");
    fireEvent.click(await waitForClaimButton());
    await waitFor(() =>
      expect(boundary.claim).toHaveBeenCalledWith(
        item.association_id,
        expect.any(String),
        {
          target_word_id: "word-center",
          target_sense_id: senseId,
          form_slot_id: resolved.candidate.form_slot_id,
          base_owner_entry_revision: 7
        }
      )
    );
    await waitFor(() => expect(boundary.listPending).toHaveBeenCalledTimes(2));
  });

  it("正式认领同拍重复触发时只发送一个幂等请求", async () => {
    const item: PendingSentenceAssociationItemV1 = {
      association_id: "pending-double-claim",
      sentence_id: "shared-double-claim",
      owner_entry_id: "owner-double-claim",
      owner_entry_revision: 11,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    const pendingClaim = deferred<unknown>();
    boundary.listPending
      .mockResolvedValueOnce({
        results: [item],
        total: 1,
        next_cursor: null
      })
      .mockResolvedValue({ results: [], total: 0, next_cursor: null });
    boundary.claim.mockReturnValue(pendingClaim.promise);
    renderPanel({ status: "published" });
    expect(await screen.findByText("Center it.")).toBeVisible();
    await selectAntOption(
      `为预关联 ${item.association_id} 选择具体词义`,
      "测试释义 1"
    );
    const claimButton = await waitForClaimButton();
    act(() => {
      claimButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      claimButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(boundary.claim).toHaveBeenCalledTimes(1);
    expect(boundary.claim.mock.calls[0]![1]).toEqual(expect.any(String));

    await act(async () => pendingClaim.resolve({}));
    await waitFor(() => expect(boundary.listPending).toHaveBeenCalledTimes(2));
  });

  it("只读态不查询认领且抽屉不暴露写操作", async () => {
    renderPanel({ status: "published", readOnly: true });
    expect(boundary.listPending).not.toHaveBeenCalled();
    expect(screen.queryByText("待认领例句")).not.toBeInTheDocument();
    openExistingDrawer();

    expect(await screen.findByText("编辑多维例句")).toBeVisible();
    expect(screen.getByLabelText("多维例句英文原文")).toHaveAttribute(
      "readonly"
    );
    expect(screen.getByLabelText("多维例句中文译文")).toHaveAttribute(
      "readonly"
    );
    expect(screen.queryByText("保存为预关联")).not.toBeInTheDocument();
    expect(
      screen.queryByText("完 成", { exact: true })
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/删除位置关联/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByText("编辑多维例句")).not.toBeInTheDocument()
    );
  });

  it("空正文摘要保留中英文编辑入口提示", () => {
    const emptySentence = {
      ...sentence(),
      en_text: richText(""),
      zh_text: richText("")
    };
    renderPanel({ initial: [emptySentence], readOnly: true });

    expect(screen.getByText("点击输入英文例句")).toBeVisible();
    expect(screen.getByText("点击输入汉语译文")).toBeVisible();
  });

  it("pending 列表失败后可重试并恢复真实列表", async () => {
    const item: PendingSentenceAssociationItemV1 = {
      association_id: "pending-retry",
      sentence_id: "shared-retry",
      owner_entry_id: "owner-retry",
      owner_entry_revision: 3,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    boundary.listPending
      .mockRejectedValueOnce(new Error("预关联服务不可用"))
      .mockRejectedValueOnce("网关失败")
      .mockResolvedValue({ results: [item], total: 1, next_cursor: null });

    renderPanel({ status: "published" });
    expect(await screen.findByText("预关联服务不可用")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    expect(await screen.findByText("预关联加载失败")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));

    expect(await screen.findByText("Center it.")).toBeVisible();
    expect(boundary.listPending).toHaveBeenCalledTimes(3);
  });

  it("pending 列表显示服务端总数并按游标加载、去重", async () => {
    const first: PendingSentenceAssociationItemV1 = {
      association_id: "pending-page-1",
      sentence_id: "shared-page-1",
      owner_entry_id: "owner-page-1",
      owner_entry_revision: 3,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    const second = {
      ...first,
      association_id: "pending-page-2",
      sentence_id: "shared-page-2",
      en_text: richText("Center that.")
    };
    boundary.listPending
      .mockResolvedValueOnce({
        results: [first],
        total: 2,
        next_cursor: "page-2"
      })
      .mockResolvedValueOnce({
        results: [first, second],
        total: 2,
        next_cursor: null
      });

    renderPanel({ status: "published" });
    expect(await screen.findByText("Center it.")).toBeVisible();
    expect(screen.getByText("2 条")).toBeVisible();
    fireEvent.click(screen.getByText("加载更多待认领例句"));

    expect(await screen.findByText("Center that.")).toBeVisible();
    expect(screen.getAllByText("Center it.")).toHaveLength(1);
    expect(boundary.listPending).toHaveBeenNthCalledWith(2, "word-center", {
      page_size: 100,
      cursor: "page-2"
    });
  });

  it("pending 下一页失败时提示并可从真实第一页重试", async () => {
    const item: PendingSentenceAssociationItemV1 = {
      association_id: "pending-page-error",
      sentence_id: "shared-page-error",
      owner_entry_id: "owner-page-error",
      owner_entry_revision: 3,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    boundary.listPending
      .mockResolvedValueOnce({
        results: [item],
        total: 2,
        next_cursor: "page-2"
      })
      .mockRejectedValueOnce(new Error("下一页加载失败"))
      .mockResolvedValueOnce({
        results: [item],
        total: 2,
        next_cursor: "page-3"
      })
      .mockRejectedValueOnce("网关失败");

    renderPanel({ status: "published" });
    expect(await screen.findByText("Center it.")).toBeVisible();
    fireEvent.click(screen.getByText("加载更多待认领例句"));
    expect(await screen.findByText("下一页加载失败")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /重\s*试/ }));
    expect(await screen.findByText("Center it.")).toBeVisible();
    fireEvent.click(screen.getByText("加载更多待认领例句"));
    expect(await screen.findByText("预关联加载失败")).toBeVisible();
    expect(boundary.listPending).toHaveBeenCalledTimes(4);
  });

  it("pending 分页中认领刷新会淘汰旧响应并恢复新游标分页", async () => {
    const first: PendingSentenceAssociationItemV1 = {
      association_id: "pending-race-first",
      sentence_id: "shared-race-first",
      owner_entry_id: "owner-race-first",
      owner_entry_revision: 3,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    const refreshed = {
      ...first,
      association_id: "pending-race-refreshed",
      sentence_id: "shared-race-refreshed",
      en_text: richText("Center that.")
    };
    const final = {
      ...first,
      association_id: "pending-race-final",
      sentence_id: "shared-race-final",
      en_text: richText("Center these.")
    };
    const stalePage = deferred<{
      results: PendingSentenceAssociationItemV1[];
      total: number;
      next_cursor: string | null;
    }>();
    boundary.listPending
      .mockResolvedValueOnce({
        results: [first],
        total: 3,
        next_cursor: "stale-page"
      })
      .mockReturnValueOnce(stalePage.promise)
      .mockResolvedValueOnce({
        results: [refreshed],
        total: 2,
        next_cursor: "fresh-page"
      })
      .mockResolvedValueOnce({
        results: [final],
        total: 2,
        next_cursor: null
      });

    renderPanel({ status: "published" });
    expect(await screen.findByText("Center it.")).toBeVisible();
    fireEvent.click(screen.getByText("加载更多待认领例句"));
    await waitFor(() => expect(boundary.listPending).toHaveBeenCalledTimes(2));

    await selectAntOption(
      `为预关联 ${first.association_id} 选择具体词义`,
      "测试释义 1"
    );
    fireEvent.click(await waitForClaimButton());
    expect(await screen.findByText("Center that.")).toBeVisible();

    const loadMore = screen.getByText("加载更多待认领例句").closest("button")!;
    expect(loadMore).toBeEnabled();
    expect(loadMore).not.toHaveClass("ant-btn-loading");
    fireEvent.click(loadMore);
    expect(await screen.findByText("Center these.")).toBeVisible();

    await act(async () =>
      stalePage.resolve({ results: [first], total: 3, next_cursor: null })
    );
    expect(screen.queryByText("Center it.")).not.toBeInTheDocument();
    expect(boundary.listPending).toHaveBeenCalledTimes(4);
  });

  it("pending resolver 歧义时选择具体词形后才能认领", async () => {
    const item: PendingSentenceAssociationItemV1 = {
      association_id: "pending-ambiguous",
      sentence_id: "shared-ambiguous",
      owner_entry_id: "owner-ambiguous",
      owner_entry_revision: 4,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    boundary.listPending
      .mockResolvedValueOnce({
        results: [item],
        total: 1,
        next_cursor: null
      })
      .mockResolvedValue({ results: [], total: 0, next_cursor: null });
    boundary.resolve.mockResolvedValue({
      resolution: "ambiguous",
      candidates: [
        resolved.candidate,
        {
          ...resolved.candidate,
          form_slot_id: "slot-center-alternative",
          form_type: "past_tense"
        }
      ]
    });

    renderPanel({ status: "published" });
    expect(await screen.findByText("Center it.")).toBeVisible();
    await selectAntOption(
      `为预关联 ${item.association_id} 选择具体词义`,
      "测试释义 1"
    );
    expect(
      await screen.findByLabelText(
        `为预关联 ${item.association_id} 选择歧义词形`
      )
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /正式认领/ })).toBeDisabled();
    await selectAntOption(
      `为预关联 ${item.association_id} 选择歧义词形`,
      "noun · base · uk: Centre / us: Center"
    );
    fireEvent.click(await waitForClaimButton());

    await waitFor(() =>
      expect(boundary.claim).toHaveBeenCalledWith(
        item.association_id,
        expect.any(String),
        expect.objectContaining({ form_slot_id: "slot-center" })
      )
    );
    await waitFor(() => expect(boundary.listPending).toHaveBeenCalledTimes(2));
  });

  it("pending resolver 无匹配时保持阻断并展示原因", async () => {
    const item: PendingSentenceAssociationItemV1 = {
      association_id: "pending-unmatched",
      sentence_id: "shared-unmatched",
      owner_entry_id: "owner-unmatched",
      owner_entry_revision: 5,
      en_text: richText("Unknown it."),
      zh_text: richText("未知词。"),
      source_range: { start: 0, end: 7, surface: "Unknown" },
      pending_word: "Unknown",
      created_at: "2026-08-22T00:00:00Z"
    };
    boundary.listPending.mockResolvedValue({
      results: [item],
      total: 1,
      next_cursor: null
    });
    boundary.resolve.mockResolvedValue({
      resolution: "unmatched",
      candidates: []
    });

    renderPanel({ status: "published" });
    expect(await screen.findByText("Unknown it.")).toBeVisible();
    await selectAntOption(
      `为预关联 ${item.association_id} 选择具体词义`,
      "测试释义 1"
    );

    expect(
      await screen.findByText("当前词义没有可匹配的已发布词形")
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /正式认领/ })).toBeDisabled();
    expect(boundary.claim).not.toHaveBeenCalled();
  });

  it.each([
    "pending_sentence_association_claimed",
    "entry_revision_conflict"
  ] as const)("认领 %s 时刷新来源真实状态，不在本地覆盖", async (code) => {
    const item: PendingSentenceAssociationItemV1 = {
      association_id: "pending-conflict",
      sentence_id: "shared-conflict",
      owner_entry_id: "owner-conflict",
      owner_entry_revision: 9,
      en_text: richText("Center it."),
      zh_text: richText("把它放中间。"),
      source_range: { start: 0, end: 6, surface: "Center" },
      pending_word: "Center",
      created_at: "2026-08-22T00:00:00Z"
    };
    boundary.listPending
      .mockResolvedValueOnce({
        results: [item],
        total: 1,
        next_cursor: null
      })
      .mockResolvedValue({ results: [], total: 0, next_cursor: null });
    boundary.claim.mockRejectedValue(
      new HttpError(409, "claim conflict", [], code)
    );
    renderPanel({ status: "published" });
    expect(await screen.findByText("Center it.")).toBeVisible();
    await selectAntOption(
      `为预关联 ${item.association_id} 选择具体词义`,
      "测试释义 1"
    );
    fireEvent.click(await waitForClaimButton());
    await waitFor(() => expect(boundary.claim).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(boundary.listPending).toHaveBeenCalledTimes(2));
    expect(
      await screen.findByText("该预关联或来源词条已更新，正在刷新真实状态")
    ).toBeInTheDocument();
  });
});
