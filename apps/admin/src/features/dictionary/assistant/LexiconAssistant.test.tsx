import { App, ConfigProvider } from "antd";
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
    <ConfigProvider>
      <App>
        <MemoryRouter>
          <LexiconAssistant key={value.word.id} context={value} />
        </MemoryRouter>
      </App>
    </ConfigProvider>
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
  requests.capability.mockReset().mockResolvedValue({ available: true });
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

it("上下文去除对象地址和音频资料，超长文本明确标记截断", () => {
  const value = context();
  const projected = assistantSnapshot({
    ...value,
    progress: [{ label: "词义".repeat(14000), completed: false }]
  });
  expect(projected.context_truncated).toBe(true);
  expect(Array.from(projected.local_content)).toHaveLength(24000);
  expect(projected.local_content).not.toContain("created_by");
});
