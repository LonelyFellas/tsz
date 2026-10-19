import type {
  CreateLearningTask,
  PreviewLearningTask,
  StartLearningRun,
  SubmitLearningAnswer,
  LearningTask,
  LearningTaskDetail,
  LearningTaskPage,
  LearningPreview,
  LearningRun,
  LearningRunPage,
  LearningQuestionPage,
  LearningAnswerReceipt,
  LearningPageQuery
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";
type Options = { signal?: AbortSignal };
function decode<T>(root: RuntimeSchemaRoot, value: unknown): T {
  const result = validateRuntimeSchema(root, value);
  if (!result.valid)
    throw new Error(
      `学习响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}
function query(q: LearningPageQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined) p.set(k, String(v));
  return p.size ? `?${p}` : "";
}
export function createLearningTaskEndpoints(http: HttpClient) {
  return {
    preview: (data: PreviewLearningTask, o?: Options) =>
      http
        .post<unknown>("/me/learning-tasks/preview", data, o)
        .then((v) => decode<LearningPreview>("LearningPreview", v)),
    create: (data: CreateLearningTask, o?: Options) =>
      http
        .post<unknown>("/me/learning-tasks", data, o)
        .then((v) => decode<LearningTask>("LearningTask", v)),
    list: (q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/me/learning-tasks${query(q)}`, o)
        .then((v) => decode<LearningTaskPage>("LearningTaskPage", v)),
    detail: (id: string, o?: Options) =>
      http
        .get<unknown>(`/me/learning-tasks/${id}`, o)
        .then((v) => decode<LearningTaskDetail>("LearningTaskDetail", v)),
    rename: (
      id: string,
      data: { expected_revision: number; name: string },
      o?: Options
    ) =>
      http
        .patch<unknown>(`/me/learning-tasks/${id}`, data, o)
        .then((v) => decode<LearningTask>("LearningTask", v)),
    archive: (id: string, data: { expected_revision: number }, o?: Options) =>
      http
        .post<unknown>(`/me/learning-tasks/${id}/archive`, data, o)
        .then((v) => decode<LearningTask>("LearningTask", v)),
    start: (id: string, data: StartLearningRun, o?: Options) =>
      http
        .post<unknown>(`/me/learning-tasks/${id}/runs`, data, o)
        .then((v) => decode<LearningRun>("LearningRun", v)),
    history: (id: string, q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/me/learning-tasks/${id}/runs${query(q)}`, o)
        .then((v) => decode<LearningRunPage>("LearningRunPage", v)),
    run: (id: string, o?: Options) =>
      http
        .get<unknown>(`/me/learning-runs/${id}`, o)
        .then((v) => decode<LearningRun>("LearningRun", v)),
    questions: (id: string, q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/me/learning-runs/${id}/questions${query(q)}`, o)
        .then((v) => decode<LearningQuestionPage>("LearningQuestionPage", v)),
    answer: (id: string, data: SubmitLearningAnswer, o?: Options) =>
      http
        .post<unknown>(`/me/learning-runs/${id}/answers`, data, o)
        .then((v) => decode<LearningAnswerReceipt>("LearningAnswerReceipt", v))
  };
}
