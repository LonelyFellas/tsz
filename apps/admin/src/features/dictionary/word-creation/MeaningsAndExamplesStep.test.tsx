import { HttpError } from "@tsz/api-client/http";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { App as AntApp } from "antd";
import {
  createMemoryRouter,
  RouterProvider,
  useLocation
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeaningsAndExamplesStep } from "./MeaningsAndExamplesStep";
import { deferred, wordFixture } from "./wordCreation.test.helper";

const mutations = vi.hoisted(() => ({
  save: vi.fn(),
  suggest: vi.fn()
}));
const dataSourceCapabilities = vi.hoisted(() => ({
  dialectVariantSuggestions: true
}));

vi.mock("../dataSource", () => ({
  adminWordsDataSourceCapabilities: dataSourceCapabilities
}));

vi.mock("./api", () => ({
  useSaveMeaningsStep: () => ({
    mutateAsync: mutations.save,
    isPending: false
  }),
  useSuggestDialectVariants: () => ({
    mutateAsync: mutations.suggest,
    isPending: false
  })
}));

vi.mock("../api", () => ({
  useRelatedSearch: () => ({ data: { results: [] } })
}));

function button(label: string): HTMLButtonElement {
  // A whole-tree role query is extremely slow for this large AntD editor.
  const result = screen
    .getAllByText(label, { exact: true })
    .map((item) => item.closest("button"))
    .find((item): item is HTMLButtonElement => item !== null);
  if (!result) throw new Error(`button not found: ${label}`);
  return result as HTMLButtonElement;
}

function enabledButton(label: string): HTMLButtonElement {
  const result = screen
    .getAllByText(label, { exact: true })
    .map((item) => item.closest("button"))
    .find((item): item is HTMLButtonElement => item !== null && !item.disabled);
  if (!result) throw new Error(`enabled button not found: ${label}`);
  return result;
}

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}|{JSON.stringify(location.state)}
    </span>
  );
}

function renderStep(word = wordFixture({ ready: true }), readOnly = false) {
  const onSaved = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/words/:wordId/wizard/meanings",
        element: (
          <>
            <MeaningsAndExamplesStep
              word={word}
              readOnly={readOnly}
              onSaved={onSaved}
            />
            <LocationProbe />
          </>
        )
      },
      {
        path: "/words/:wordId/wizard/:step",
        element: <LocationProbe />
      }
    ],
    { initialEntries: [`/words/${word.id}/wizard/meanings`] }
  );
  render(
    <AntApp>
      <RouterProvider router={router} />
    </AntApp>
  );
  return { onSaved, router };
}

beforeEach(() => {
  vi.clearAllMocks();
  dataSourceCapabilities.dialectVariantSuggestions = true;
  mutations.save.mockResolvedValue({
    word: wordFixture({ ready: true, revision: 4 })
  });
  vi.spyOn(window, "confirm").mockReturnValue(false);
});

afterEach(() => vi.restoreAllMocks());

describe("MeaningsAndExamplesStep", () => {
  it("编辑后完成保存并放行到 preview，提交 revision、operation 与完整 content", async () => {
    const word = wordFixture({ ready: true });
    const saved = wordFixture({
      ready: true,
      revision: 4,
      max_reachable_step: "preview"
    });
    mutations.save.mockResolvedValue({ word: saved });
    const { onSaved, router } = renderStep(word);
    const definition = screen.getAllByLabelText("中文释义")[0]!;

    fireEvent.change(definition, { target: { value: "用户修改后的中文释义" } });
    fireEvent.click(button("完成并进入预览"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    expect(mutations.save).toHaveBeenCalledWith(
      expect.objectContaining({
        base_revision: word.revision,
        operation_id: expect.any(String),
        intent: "complete",
        content: expect.objectContaining({
          sense_groups: expect.any(Array),
          pos: expect.any(Array)
        })
      })
    );
    const payload = mutations.save.mock.calls[0]![0];
    expect(payload.content.pos[0].senses[0].definitions[0].content.text).toBe(
      "用户修改后的中文释义"
    );
    expect(onSaved).toHaveBeenCalledWith(saved);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/words/${word.id}/wizard/preview`
      )
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("保存失败保留用户编辑值并停留当前步骤", async () => {
    mutations.save.mockRejectedValue(new Error("meanings save failed"));
    const { router } = renderStep();
    const definition = screen.getAllByLabelText("中文释义")[0]!;
    fireEvent.change(definition, { target: { value: "失败后仍应保留" } });

    fireEvent.click(button("保存草稿"));

    expect(await screen.findByText("meanings save failed")).toBeInTheDocument();
    expect(definition).toHaveValue("失败后仍应保留");
    expect(router.state.location.pathname).toBe(
      "/words/word-center/wizard/meanings"
    );
  });

  it("保存请求在途时锁定编辑区", async () => {
    const pending = deferred<{ word: ReturnType<typeof wordFixture> }>();
    mutations.save.mockReturnValue(pending.promise);
    const saved = wordFixture({ ready: true, revision: 4 });
    const { onSaved } = renderStep();
    const definition = screen.getAllByLabelText("中文释义")[0]!;
    fireEvent.change(definition, { target: { value: "before-request" } });

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(definition).toBeDisabled());

    await act(async () => pending.resolve({ word: saved }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  it("修改已选关联词搜索文本会清空旧目标 ID 并标记为待重新选择", async () => {
    const word = wordFixture({ ready: true });
    word.meanings.pos[0]!.senses[0]!.relations.push({
      id: "relation-selected",
      relation: "synonym",
      target_word_id: "fixture-colour",
      target_sense_id: "fixture-colour-sense",
      target_headword: "colour",
      target_gloss: "颜色",
      score: "90"
    });
    renderStep(word);
    const search = screen.getByLabelText("搜索关联词并选择词义");
    expect(search).toHaveValue("colour");

    fireEvent.change(search, { target: { value: "far" } });
    expect(search).toHaveValue("far");
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const relation =
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].relations[0];
    expect(relation).toEqual(
      expect.objectContaining({
        target_word_id: "",
        target_sense_id: "",
        target_headword: undefined,
        target_gloss: undefined
      })
    );
  });

  it("完成前执行客户端完整性校验，不向后端提交不完整 meanings", async () => {
    renderStep(wordFixture());

    fireEvent.click(button("完成并进入预览"));

    expect(
      await screen.findByText("请完善全部语法结构文本")
    ).toBeInTheDocument();
    expect(mutations.save).not.toHaveBeenCalled();
  });

  it("新增词义后保存，payload 保留新节点和唯一 focus 关联", async () => {
    const word = wordFixture({ ready: true });
    const initialCount = word.meanings.pos[0]!.senses.length;
    renderStep(word);

    fireEvent.click(button("添加词义"));
    fireEvent.click(button("保存草稿"));

    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const senses = mutations.save.mock.calls[0]![0].content.pos[0].senses;
    expect(senses).toHaveLength(initialCount + 1);
    const added = senses.at(-1)!;
    expect(added.id).toEqual(expect.any(String));
    expect(added.sentences[0].links).toEqual([
      { word_id: word.id, sense_id: added.id, role: "focus" }
    ]);
  });

  it("缺失方言例句经服务建议和二次确认后写入 converted 文本", async () => {
    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    sentence.en_text.uk = { state: "missing" };
    mutations.suggest.mockResolvedValue({
      suggestions: [
        {
          client_id: sentence.id,
          field_kind: "example",
          value: {
            version: 1,
            text: "The generated British example.",
            spans: [],
            liaisons: []
          },
          model_version: "mock-v1"
        }
      ]
    });
    renderStep(word);

    fireEvent.click(button("生成英式建议"));
    expect((await screen.findAllByText("确认英式建议")).length).toBeGreaterThan(
      0
    );
    fireEvent.click(button("写入建议"));

    await waitFor(() =>
      expect(
        screen
          .getAllByLabelText("英式英语文本")
          .some(
            (input) =>
              (input as HTMLTextAreaElement).value ===
              "The generated British example."
          )
      ).toBe(true)
    );
    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const savedText =
      mutations.save.mock.calls[0]![0].content.pos[0].senses[0].sentences[0]
        .en_text.uk;
    expect(savedText).toEqual(
      expect.objectContaining({
        state: "ready",
        variant: expect.objectContaining({
          origin: "converted",
          value: expect.objectContaining({
            text: "The generated British example."
          })
        })
      })
    );
  });

  it("真实建议服务未接入时禁用生成按钮并允许手工补齐", () => {
    dataSourceCapabilities.dialectVariantSuggestions = false;
    const word = wordFixture({ ready: true });
    const sentence = word.meanings.pos[0]!.senses[0]!.sentences[0]!;
    if (sentence.en_text.mode !== "distinguish") {
      throw new Error("fixture must distinguish dialects");
    }
    sentence.en_text.uk = { state: "missing" };
    renderStep(word);

    expect(button("生成英式建议")).toBeDisabled();
    expect(button("生成英式建议")).toHaveAttribute(
      "title",
      "真实方言建议服务尚未接入，请手工填写"
    );
    expect(button("手工填写")).toBeEnabled();
    fireEvent.click(button("生成英式建议"));
    expect(mutations.suggest).not.toHaveBeenCalled();
  });

  it("服务端 field issue 切换所属词性并聚焦稳定 node/field", async () => {
    const issue = {
      step: "meanings" as const,
      node_id: "mock-sense-2-1",
      field: "sub_pos",
      code: "required",
      message: "请选择细分词性"
    };
    mutations.save.mockRejectedValue(
      new HttpError(422, "invalid meanings", [], undefined, [issue])
    );
    const { router } = renderStep();

    fireEvent.click(button("保存草稿"));

    await waitFor(() =>
      expect(router.state.location.state).toEqual({
        nodeId: issue.node_id,
        field: issue.field
      })
    );
    await waitFor(() => {
      const target = document.querySelector<HTMLElement>(
        `[data-word-node-id="${issue.node_id}"][data-word-field="${issue.field}"]`
      );
      expect(target).not.toBeNull();
      expect(target).toHaveClass("word-validation-focus");
      expect(target).toContainElement(document.activeElement as HTMLElement);
    });
  });

  it("可组合编辑语法、释义、例句、上下文关联与语义区间", async () => {
    renderStep();

    fireEvent.change(screen.getAllByLabelText("英式语法结构 1")[0]!, {
      target: { value: "an edited centre" }
    });
    fireEvent.change(screen.getAllByLabelText("美式语法结构 1")[0]!, {
      target: { value: "an edited center" }
    });
    fireEvent.click(enabledButton("添加语法结构"));
    fireEvent.click(await screen.findByLabelText("上移语法结构 2"));
    fireEvent.click(screen.getByLabelText("删除语法结构 1"));

    fireEvent.click(enabledButton("添加语义区间"));
    const groupInputs = screen.getAllByLabelText(/^语义区间 \d+$/);
    fireEvent.change(groupInputs.at(-1)!, { target: { value: "新增区间" } });
    fireEvent.click(
      screen.getByLabelText(`删除语义区间 ${groupInputs.length}`)
    );

    fireEvent.click(enabledButton("添加释义"));
    const definitions = screen.getAllByLabelText("中文释义");
    fireEvent.change(definitions.at(-1)!, {
      target: { value: "新增释义" }
    });
    fireEvent.click(await screen.findByLabelText("上移释义 2"));
    fireEvent.click(screen.getByLabelText("删除释义 1"));

    fireEvent.click(enabledButton("添加例句"));
    const translations = screen.getAllByLabelText("汉语译文");
    fireEvent.change(translations.at(-1)!, {
      target: { value: "新增例句译文" }
    });
    fireEvent.click(enabledButton("添加上下文关联"));
    fireEvent.change(screen.getAllByLabelText("上下文词条 ID").at(-1)!, {
      target: { value: "context-word" }
    });
    fireEvent.change(screen.getAllByLabelText("上下文词义 ID").at(-1)!, {
      target: { value: "context-sense" }
    });
    fireEvent.click(screen.getByLabelText("删除上下文关联 1"));
    fireEvent.click(await screen.findByLabelText("上移例句 2"));
    fireEvent.click(screen.getByLabelText("删除例句 1"));

    fireEvent.click(enabledButton("添加近义词"));
    const relationSearch = screen
      .getAllByLabelText("搜索关联词并选择词义")
      .at(-1)!;
    fireEvent.change(relationSearch, { target: { value: "colour" } });
    fireEvent.change(screen.getAllByLabelText("相似度").at(-1)!, {
      target: { value: "75" }
    });
    fireEvent.click(screen.getByLabelText("删除近义词"));

    fireEvent.click(screen.getByLabelText("是否依赖语境"));
    fireEvent.change(screen.getByLabelText("词频"), {
      target: { value: "88" }
    });

    fireEvent.click(button("保存草稿"));
    await waitFor(() => expect(mutations.save).toHaveBeenCalledTimes(1));
    const content = mutations.save.mock.calls[0]![0].content;
    expect(content.pos[0].grammar_structures).toHaveLength(1);
    expect(content.pos[0].senses[0].definitions).toHaveLength(1);
    expect(content.pos[0].senses[0].sentences).toHaveLength(1);
  });

  it("统一词形的已发布内容只读展示 common 文本，不暴露结构编辑操作", () => {
    const word = wordFixture({
      headword: "far",
      ready: true,
      status: "published"
    });
    renderStep(word, true);

    expect(screen.getAllByLabelText("英语文本").length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("中文释义")[0]).toHaveAttribute("readonly");
    expect(screen.queryByText("添加语法结构")).toBeNull();
    expect(screen.queryByText("添加词义")).toBeNull();
    expect(screen.queryByText("保存草稿")).toBeNull();
  });

  it("主关联缺失时只读页明确标错", () => {
    const word = wordFixture({ ready: true, status: "published" });
    word.meanings.pos[0]!.senses[0]!.sentences[0]!.links = [];
    renderStep(word, true);
    expect(screen.getByLabelText("例句主关联")).toHaveValue("主关联缺失");
  });

  it.each([
    [
      "缺少语法结构",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.grammar_structures = [];
      },
      "每个词性至少需要一条语法结构"
    ],
    [
      "缺少词义",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses = [];
      },
      "每个词性至少需要一个词义"
    ],
    [
      "缺少细分词性",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.sub_pos = "";
      },
      "请为每个词义选择细分词性"
    ],
    [
      "缺少中文释义",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.definitions = [];
      },
      "每个词义至少需要一条中文释义"
    ],
    [
      "英文释义方言不完整",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.definitions.push({
          id: "english-definition",
          level: "A1",
          definition_mode: "en_definition",
          content: {
            mode: "distinguish",
            source_dialect: "us",
            uk: { state: "missing" },
            us: {
              state: "ready",
              variant: {
                origin: "manual",
                value: {
                  version: 1,
                  text: "center",
                  spans: [],
                  liaisons: []
                }
              }
            }
          }
        });
      },
      "请补齐英文释义的全部启用方言文本"
    ],
    [
      "例句译文缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.sentences[0]!.zh_text.text = "";
      },
      "请补齐例句的英文文本和汉语译文"
    ],
    [
      "例句主关联缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.sentences[0]!.links = [];
      },
      "每条例句必须保留唯一的当前词义主关联"
    ],
    [
      "关系词目标缺失",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.relations.push({
          id: "missing-target",
          relation: "synonym",
          target_word_id: "",
          target_sense_id: "",
          score: "50"
        });
      },
      "请为每个关系词选择具体词条和词义"
    ],
    [
      "关系词分值越界",
      (word: ReturnType<typeof wordFixture>) => {
        word.meanings.pos[0]!.senses[0]!.relations.push({
          id: "invalid-score",
          relation: "synonym",
          target_word_id: "word-2",
          target_sense_id: "sense-2",
          score: "100.001"
        });
      },
      "关系词分值必须是 0–100 且最多两位小数"
    ]
  ])("完整性校验覆盖%s", async (_name, mutate, expected) => {
    const word = wordFixture({ ready: true });
    mutate(word);
    renderStep(word);
    fireEvent.click(button("完成并进入预览"));
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(mutations.save).not.toHaveBeenCalled();
  });
});
