import type {
  MemoryOverview,
  MemoryPage,
  MemoryItem,
  ReviewSession,
  ReviewReceipt,
  StartReview,
  ReviewAnswerInput
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";
type Options = { signal?: AbortSignal };
function decode<T>(root: RuntimeSchemaRoot, value: unknown): T {
  if (!validateRuntimeSchema(root, value).valid)
    throw new Error("复习内容暂时无法读取，请稍后重试");
  return value as T;
}
export function createLearningMemoryEndpoints(http: HttpClient) {
  return {
    overview: (options?: Options) =>
      http
        .get<unknown>("/me/memory/overview", options)
        .then((v) => decode<MemoryOverview>("MemoryOverview", v)),
    enrollment: (enabled: boolean, options?: Options) =>
      http
        .post<unknown>("/me/memory/enrollment", { enabled }, options)
        .then((v) => decode<MemoryOverview>("MemoryOverview", v)),
    items: (filter = "all", after?: string, options?: Options) => {
      const q = new URLSearchParams({ filter, limit: "20" });
      if (after) q.set("after", after);
      return http
        .get<unknown>(`/me/memory/items?${q}`, options)
        .then((v) => decode<MemoryPage>("MemoryPage", v));
    },
    pause: (
      id: string,
      paused: boolean,
      expected_revision: number,
      options?: Options
    ) =>
      http
        .patch<unknown>(
          `/me/memory/items/${encodeURIComponent(id)}`,
          { paused, expected_revision },
          options
        )
        .then((v) => decode<MemoryItem>("MemoryItem", v)),
    start: (input: StartReview, options?: Options) =>
      http
        .post<unknown>("/me/review-sessions", input, options)
        .then((v) => decode<ReviewSession>("ReviewSession", v)),
    session: (id: string, options?: Options) =>
      http
        .get<unknown>(`/me/review-sessions/${encodeURIComponent(id)}`, options)
        .then((v) => decode<ReviewSession>("ReviewSession", v)),
    reveal: (id: string, item: string, options?: Options) =>
      http
        .post<unknown>(
          `/me/review-sessions/${encodeURIComponent(id)}/items/${encodeURIComponent(item)}/reveal`,
          {},
          options
        )
        .then((v) => decode<ReviewSession>("ReviewSession", v)),
    answer: (id: string, input: ReviewAnswerInput, options?: Options) =>
      http
        .post<unknown>(
          `/me/review-sessions/${encodeURIComponent(id)}/answers`,
          input,
          options
        )
        .then((v) => decode<ReviewReceipt>("ReviewReceipt", v))
  };
}
