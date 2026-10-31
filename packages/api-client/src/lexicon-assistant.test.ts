import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  LexiconAssistantInput,
  LexiconAssistantResponse
} from "@tsz/types";
import { createAdminEndpoints } from "./admin";
import { createHttpClient, RequestTimeoutError } from "./http";
import snapshot from "./openapi.snapshot.json";

const input: LexiconAssistantInput = {
  entry_id: "00000000-0000-4000-8000-000000000001",
  context_id: "00000000-0000-4000-8000-000000000002",
  base_revision: 1,
  step: "meanings",
  local_content: "未保存的释义",
  context_truncated: false,
  question: "帮我核对",
  history: []
};
function response(): LexiconAssistantResponse {
  return {
    entry_id: input.entry_id,
    context_id: input.context_id,
    answer: "建议核对词义。",
    sources: [],
    usage: {
      model: "fixture-model",
      model_calls: 1,
      tool_calls: 0,
      input_tokens: null,
      output_tokens: null
    },
    requires_human_review: true
  };
}
function endpoints() {
  return createAdminEndpoints(
    createHttpClient({
      baseUrl: "https://fixture.test/api/v1/admin",
      getToken: () => "test-admin-token"
    })
  );
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("词库助手契约", () => {
  it("候选接口严格核对词条、目录、版本和模型字段", async () => {
    const candidateInput = {
      entry_id: input.entry_id,
      base_revision: 1,
      context_id: input.context_id,
      catalog_version: 1,
      headword: "bank",
      local_content: "当前草稿"
    };
    const candidateResponse = {
      entry_id: input.entry_id,
      base_revision: 1,
      context_id: input.context_id,
      catalog_version: 1,
      headword: "bank",
      pos: [
        {
          pos: "noun",
          forms: [
            {
              form_type: "base",
              is_regular: true,
              uk: { spelling: "bank", dict_phonetic: "/bæŋk/" },
              us: { spelling: "bank", dict_phonetic: "/bæŋk/" }
            }
          ]
        }
      ],
      notes: [],
      usage: response().usage,
      requires_human_review: true
    };
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify(candidateResponse), { status: 200 })
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await endpoints().lexiconAssistant.formCandidates(candidateInput)
    ).toEqual(candidateResponse);
    expect(fetcher.mock.calls[0]![0]).toBe(
      "https://fixture.test/api/v1/admin/lexicon/assistant/form-candidates"
    );
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string)).toEqual(
      candidateInput
    );
    for (const extra of [
      { context_id: input.entry_id },
      { base_revision: 2 },
      { catalog_version: 2 },
      { headword: "river" },
      { requires_human_review: false },
      { saved: true }
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ ...candidateResponse, ...extra }), {
              status: 200
            })
        )
      );
      await expect(
        endpoints().lexiconAssistant.formCandidates(candidateInput)
      ).rejects.toThrow();
    }
  });
  it("在完整回答前交付真实增量，跨 UTF-8 分片解码并核对最终上下文", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(value) {
                controller = value;
              }
            }),
            { headers: { "Content-Type": "application/x-ndjson" } }
          )
      )
    );
    const onEvent = vi.fn();
    let complete = false;
    const promise = endpoints()
      .lexiconAssistant.askStream(input, onEvent)
      .then((value) => {
        complete = true;
        return value;
      });
    await vi.waitFor(() => expect(controller).toBeDefined());
    const bytes = new TextEncoder().encode(
      JSON.stringify({ event: "delta", text: "银行" }) + "\n"
    );
    controller.enqueue(bytes.slice(0, 26));
    controller.enqueue(bytes.slice(26));
    await vi.waitFor(() =>
      expect(onEvent).toHaveBeenCalledWith({ event: "delta", text: "银行" })
    );
    expect(complete).toBe(false);
    controller.enqueue(
      new TextEncoder().encode(
        JSON.stringify({ event: "complete", response: response() }) + "\n"
      )
    );
    expect(await promise).toEqual(response());
  });

  it("流提前断开不会伪装成完整回答", async () => {
    const events = JSON.stringify({ event: "delta", text: "尚未完成" }) + "\n";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(events, {
            headers: { "Content-Type": "application/x-ndjson" }
          })
      )
    );
    const onEvent = vi.fn();
    await expect(
      endpoints().lexiconAssistant.askStream(input, onEvent)
    ).rejects.toThrow("提前结束");
    expect(onEvent).toHaveBeenCalledWith({ event: "delta", text: "尚未完成" });
  });
  it("请求与权威端点一致，保留 snake_case 和取消信号", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response(JSON.stringify(response()), { status: 200 })
    );
    vi.stubGlobal("fetch", fetcher);
    const api = endpoints();
    const controller = new AbortController();
    expect(await api.lexiconAssistant.ask(input, controller.signal)).toEqual(
      response()
    );
    expect(fetcher.mock.calls[0]![0]).toBe(
      "https://fixture.test/api/v1/admin/lexicon/assistant"
    );
    const init = fetcher.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(init.body as string)).toEqual(input);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const paths = snapshot.paths as Record<string, string[]>;
    expect(paths["/admin/lexicon/assistant"]).toContain("post");
    expect(paths["/admin/lexicon/assistant/capability"]).toContain("get");
  });

  it("拒绝其他词条/问题的响应及未声明字段", async () => {
    for (const extra of [
      { entry_id: input.context_id },
      { context_id: input.entry_id },
      { requires_human_review: false },
      { auto_saved: true }
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ ...response(), ...extra }), {
              status: 200
            })
        )
      );
      await expect(endpoints().lexiconAssistant.ask(input)).rejects.toThrow();
    }
  });

  it("为多步问答保留 90 秒预算，超时仍会结束等待", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {}))
    );
    let settled = false;
    const promise = endpoints()
      .lexiconAssistant.ask(input)
      .catch((error: unknown) => {
        settled = true;
        return error;
      });
    await vi.advanceTimersByTimeAsync(30001);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(60000);
    expect(await promise).toBeInstanceOf(RequestTimeoutError);
  });
});
