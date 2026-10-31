import type {
  LexiconAssistantCapability,
  LexiconFormCandidatesInput,
  LexiconFormCandidatesResponse,
  LexiconAssistantEvent,
  LexiconAssistantInput,
  LexiconAssistantResponse
} from "@tsz/types";
import type { HttpClient } from "./http";
import { HttpError } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";

function decode<T>(root: RuntimeSchemaRoot, value: unknown): T {
  const result = validateRuntimeSchema(root, value);
  if (!result.valid)
    throw new Error(
      `助手响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}

export function createLexiconAssistantEndpoints(http: HttpClient) {
  return {
    formCandidates: (input: LexiconFormCandidatesInput, signal?: AbortSignal) =>
      http
        .post<unknown>("/lexicon/assistant/form-candidates", input, { signal })
        .then((value) => {
          const response = decode<LexiconFormCandidatesResponse>(
            "LexiconFormCandidatesResponse",
            value
          );
          if (
            response.entry_id !== input.entry_id ||
            response.context_id !== input.context_id ||
            response.base_revision !== input.base_revision ||
            response.catalog_version !== input.catalog_version ||
            response.headword !== input.headword ||
            !response.requires_human_review
          )
            throw new Error("候选与当前词条或版本不匹配，请重新生成");
          return response;
        }),
    askStream: (
      input: LexiconAssistantInput,
      onEvent: (event: LexiconAssistantEvent) => void,
      signal?: AbortSignal
    ) =>
      http.postStream<LexiconAssistantResponse>(
        "/lexicon/assistant/stream",
        input,
        async (response, checkSession) => {
          if (
            !response.body ||
            !response.headers
              .get("content-type")
              ?.includes("application/x-ndjson")
          )
            throw new Error("助手流式响应格式异常");
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let total = 0;
          try {
            while (true) {
              const { value, done } = await reader.read();
              checkSession();
              if (done) throw new Error("助手连接提前结束，请重试");
              total += value.byteLength;
              if (total > 1_000_000) throw new Error("助手响应过长");
              buffer += decoder.decode(value, { stream: true });
              let end: number;
              while ((end = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                const event = decode<LexiconAssistantEvent>(
                  "LexiconAssistantEvent",
                  JSON.parse(line)
                );
                checkSession();
                if (event.event === "failed")
                  throw new HttpError(event.status, "助手回答中断，请重试");
                if (event.event === "complete") {
                  const result = event.response;
                  if (
                    result.entry_id !== input.entry_id ||
                    result.context_id !== input.context_id ||
                    result.requires_human_review !== true
                  )
                    throw new Error("助手响应与当前问题不匹配");
                  onEvent(event);
                  return result;
                }
                onEvent(event);
              }
              if (buffer.length > 100_000) throw new Error("助手响应格式异常");
            }
          } finally {
            await reader.cancel().catch(() => undefined);
            reader.releaseLock();
          }
        },
        signal
      ),
    capability: (signal?: AbortSignal) =>
      http
        .get<unknown>("/lexicon/assistant/capability", { signal })
        .then((value) =>
          decode<LexiconAssistantCapability>(
            "LexiconAssistantCapability",
            value
          )
        ),
    ask: (input: LexiconAssistantInput, signal?: AbortSignal) =>
      http
        .post<unknown>("/lexicon/assistant", input, { signal })
        .then((value) => {
          const response = decode<LexiconAssistantResponse>(
            "LexiconAssistantResponse",
            value
          );
          if (
            response.entry_id !== input.entry_id ||
            response.context_id !== input.context_id ||
            response.requires_human_review !== true
          )
            throw new Error("助手响应与当前问题不匹配，请重新提问");
          return response;
        })
  };
}
