import { App } from "@tsz/ui/admin/overlays";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  LexiconAssistantInput,
  LexiconAssistantResponse
} from "@tsz/types";
import {
  dropEmptySentenceTranslations,
  prepareTextLinksForSave,
  stripBlankRelations,
  stripSenseComponentUsages,
  newSentenceTranslations
} from "../word-creation-v3/meaningsModel";
import { formsFixture } from "../word-creation-v3/fixtures";
import { LexiconAssistant } from "./LexiconAssistant";
import { assistantSnapshot, type AssistantEditorContext } from "./context";

const requests = vi.hoisted(() => ({
  askStream: vi.fn(),
  capability: vi.fn()
}));
vi.mock("@/lib/auth", () => ({ api: { lexiconAssistant: requests } }));

function context(label = "bank"): AssistantEditorContext {
  const forms = formsFixture();
  const meanings = { sense_groups: [], pos: [] };
  return {
    word: {
      schema_version: 3,
      id: "00000000-0000-4000-8000-000000000001",
      language: "en",
      kind: "word",
      status: "draft",
      revision: 2,
      lifecycle_revision: 1,
      annotation: null,
      annotation_revision: 1,
      has_unpublished_changes: true,
      presentation: {
        label,
        matched_surfaces: [label],
        strategy_version: "v3"
      },
      capabilities: {
        publication: { mode: "native" },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      },
      forms,
      meanings,
      completed_steps: ["basics"],
      max_reachable_step: "meanings",
      created_by: "admin-1",
      created_at: "2026-10-31T00:00:00Z",
      updated_at: "2026-10-31T00:00:00Z"
    },
    step: "meanings",
    forms,
    meanings,
    dirtySteps: { forms: true, meanings: true },
    progress: [{ label: "词义", completed: false }]
  };
}

function response(input: LexiconAssistantInput): LexiconAssistantResponse {
  return {
    entry_id: input.entry_id,
    context_id: input.context_id,
    answer: "建议把金融机构和河岸拆分为两个词义。",
    sources: [
      {
        kind: "builtin_dictionary",
        label: "内置词典：bank",
        entry_id: null,
        version: "fixture-v1",
        truncated: false
      }
    ],
    usage: {
      model: "fixture-model",
      model_calls: 2,
      tool_calls: 1,
      input_tokens: 10,
      output_tokens: 20
    },
    requires_human_review: true
  };
}

function surface(value: AssistantEditorContext) {
  return (
    <App>
      <MemoryRouter>
        <LexiconAssistant key={value.word.id} context={value} />
      </MemoryRouter>
    </App>
  );
}

async function openAndAsk(question = "请核对这个词义") {
  fireEvent.click(screen.getByRole("button", { name: "打开词库小精灵" }));
  await waitFor(() => expect(requests.capability).toHaveBeenCalled());
  fireEvent.change(screen.getByRole("textbox", { name: "向词库小精灵提问" }), {
    target: { value: question }
  });
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /发送/ })).toBeEnabled()
  );
  fireEvent.click(screen.getByRole("button", { name: /发送/ }));
}

beforeEach(() => {
  requests.askStream.mockReset();
  requests.capability.mockReset().mockResolvedValue({
    available: true,
    features: { structured_draft: true, history_summary: true }
  });
});

describe("词库只读助手", () => {
  it("逐段显示内容与查询进度，停止后保留未完成回答", async () => {
    let onEvent!: (event: import("@tsz/types").LexiconAssistantEvent) => void;
    requests.askStream.mockImplementationOnce((_input, onChunk) => {
      onEvent = onChunk;
      return new Promise(() => {});
    });
    render(surface(context()));
    await openAndAsk();
    act(() => {
      onEvent({ event: "status", message: "正在查询内置词典…" });
      onEvent({ event: "delta", text: "bank 有银行" });
    });
    expect(screen.getByText("正在查询内置词典…")).toBeInTheDocument();
    expect(screen.getByText("bank 有银行")).toBeInTheDocument();
    act(() => onEvent({ event: "delta", text: "和河岸两个义项。" }));
    expect(screen.getByText("bank 有银行和河岸两个义项。")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    expect(screen.getByText("bank 有银行和河岸两个义项。")).toBeInTheDocument();
    expect(
      screen.getByText("回答未完成，已保留收到的内容。")
    ).toBeInTheDocument();
  });
  it("以当前未保存内容提问，显示工具来源，编辑变化后标记旧回答", async () => {
    const value = context();
    const forms = formsFixture();
    forms.pos[0]!.forms[0]!.regional_variants = {
      mode: "common",
      common: {
        id: "v1",
        spelling: "unsaved-bank",
        pronunciations: [],
        dialect: "common",
        origin: "manual"
      }
    };
    value.forms = forms;
    requests.askStream.mockImplementation(
      async (input: LexiconAssistantInput) => response(input)
    );
    const view = render(surface(value));
    expect(requests.capability).not.toHaveBeenCalled();
    await openAndAsk();
    await screen.findByText("建议把金融机构和河岸拆分为两个词义。");
    const sent = requests.askStream.mock.calls[0]![0] as LexiconAssistantInput;
    expect(sent.local_content).toContain("unsaved-bank");
    expect(sent.draft?.forms).toBe(forms);
    expect(sent.draft?.meanings).toEqual(value.meanings);
    expect(sent.step).toBe("meanings");
    expect(sent.base_revision).toBe(2);
    expect(sent.history).toEqual([]);
    expect(screen.getByText("内置词典：bank")).toBeInTheDocument();
    const next = { ...value, step: "forms" as const };
    view.rerender(surface(next));
    expect(screen.getByText("基于此前的词义与例句内容")).toBeInTheDocument();
  });

  it("失败保留问题，停止后忽略迟到回答并可重提", async () => {
    requests.askStream.mockRejectedValueOnce(new Error("offline"));
    render(surface(context()));
    await openAndAsk("我的例句准确吗");
    await screen.findByText(/这次未能完成回答/);
    expect(screen.getByRole("textbox")).toHaveValue("我的例句准确吗");
    let resolve!: (value: LexiconAssistantResponse) => void;
    requests.askStream.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    const call = requests.askStream.mock.calls[1]!;
    expect((call[2] as AbortSignal).aborted).toBe(true);
    await act(async () => resolve(response(call[0])));
    expect(
      screen.queryByText("建议把金融机构和河岸拆分为两个词义。")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("textbox")).toHaveValue("我的例句准确吗");
  });

  it("切换词条取消在途请求，旧结果和对话不会进入新词条", async () => {
    let resolve!: (value: LexiconAssistantResponse) => void;
    requests.askStream.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        })
    );
    const view = render(surface(context()));
    await openAndAsk();
    const call = requests.askStream.mock.calls[0]!;
    const next = context("apple");
    next.word.id = "00000000-0000-4000-8000-000000000002";
    view.rerender(surface(next));
    expect((call[2] as AbortSignal).aborted).toBe(true);
    await act(async () => resolve(response(call[0])));
    expect(
      screen.queryByText("建议把金融机构和河岸拆分为两个词义。")
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "打开词库小精灵" }));
    await screen.findByText("apple");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("旧后端不发送扩展字段，新后端保留资料摘要与字段定位", async () => {
    requests.capability.mockResolvedValueOnce({ available: true });
    requests.askStream.mockImplementation(
      async (input: LexiconAssistantInput) => response(input)
    );
    const view = render(surface(context()));
    await openAndAsk();
    await screen.findByText("建议把金融机构和河岸拆分为两个词义。");
    expect(requests.askStream.mock.calls[0]![0]).not.toHaveProperty("draft");
    expect(requests.askStream.mock.calls[0]![0]).not.toHaveProperty(
      "extensions"
    );
    view.unmount();
    const value = context();
    value.navigateField = vi.fn();
    requests.askStream.mockImplementation(
      async (input: LexiconAssistantInput) => ({
        ...response(input),
        context_summary: "内置词典英音 /bæŋk/",
        field_refs: [
          {
            path: "meanings.pos[0].senses[0].level",
            label: "名词 · 义项 1 · 等级"
          }
        ]
      })
    );
    render(surface(value));
    await openAndAsk();
    await screen.findByRole("button", { name: "定位：名词 · 义项 1 · 等级" });
    fireEvent.change(
      screen.getByRole("textbox", { name: "向词库小精灵提问" }),
      { target: { value: "那美音呢" } }
    );
    fireEvent.click(screen.getByRole("button", { name: /发送/ }));
    await waitFor(() => expect(requests.askStream).toHaveBeenCalledTimes(3));
    expect(requests.askStream.mock.calls[2]![0].history[1].content).toContain(
      "内置词典英音 /bæŋk/"
    );
  });

  it("服务不可用时允许继续编辑并重试连接", async () => {
    requests.capability.mockResolvedValueOnce({ available: false });
    render(surface(context()));
    fireEvent.click(screen.getByRole("button", { name: "打开词库小精灵" }));
    await screen.findByText("助手暂未就绪");
    expect(screen.getByRole("button", { name: /发送/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "重试连接" }));
    await waitFor(() => expect(requests.capability).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByText("助手暂未就绪")).not.toBeInTheDocument()
    );
    expect(requests.askStream).not.toHaveBeenCalled();
  });
});

it("助手校验清除空译文录入位并保留实际译文身份", () => {
  const value = context();
  let id = 0;
  const rows = newSentenceTranslations(() => `translation-${++id}`);
  rows[1]!.content.text = "明天见。";
  value.meanings = {
    sense_groups: [],
    pos: [
      {
        pos_id: value.forms.pos[0]!.pos_id,
        grammar_structures: [],
        senses: [
          {
            id: "sense",
            sub_pos: "",
            level: "A1",
            depends_on_context: false,
            definitions: [],
            relations: [],
            sentences: [
              {
                id: "sentence",
                level: "A1",
                en_text: {
                  mode: "unified",
                  common: {
                    id: "en",
                    origin: "manual",
                    value: {
                      version: 2,
                      text: "See you tomorrow.",
                      annotations: []
                    }
                  }
                },
                zh_text_id: rows[0]!.id,
                zh_text: rows[0]!.content,
                zh_translations: rows,
                links: []
              }
            ]
          }
        ]
      }
    ]
  };
  const sent =
    assistantSnapshot(value).draft.meanings.pos[0]!.senses[0]!.sentences[0]!;
  expect(sent.zh_translations).toEqual([rows[1]]);
  expect(sent.zh_text_id).toBe(rows[1]!.id);
  expect(
    value.meanings.pos[0]!.senses[0]!.sentences[0]!.zh_translations
  ).toHaveLength(4);
});

it("上下文去除对象地址和音频资料，超长文本明确标记截断", () => {
  const value = context();
  const projected = assistantSnapshot({
    ...value,
    progress: [{ label: "词义".repeat(14000), completed: false }]
  });
  expect(projected.context_truncated).toBe(true);
  expect(Array.from(projected.local_content)).toHaveLength(24000);
  expect(projected.local_content).not.toContain("created_by");
  expect(projected.draft.meanings).toEqual(
    prepareTextLinksForSave(
      stripBlankRelations(
        dropEmptySentenceTranslations(stripSenseComponentUsages(value.meanings))
      ),
      false
    )
  );
  const changed = assistantSnapshot({
    ...value,
    progress: [{ label: "词义".repeat(14000), completed: false }],
    meanings: {
      ...value.meanings,
      sense_groups: [{ id: "group", name_zh: "新内容", name_en: "new" }]
    }
  });
  expect(changed.local_content).toBe(projected.local_content);
  expect(changed.fingerprint).not.toBe(projected.fingerprint);
});
