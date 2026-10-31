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
  LearningPageQuery,
  LearningCapabilities,
  LearningQuestionAudio
} from "@tsz/types";
import type { HttpClient } from "./http";
import { learningOptions } from "./learning-capabilities";
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
    capabilities: (o?: Options) =>
      http
        .get<unknown>("/me/learning-capabilities", learningOptions(o))
        .then((v) => decode<LearningCapabilities>("LearningCapabilities", v)),
    preview: (data: PreviewLearningTask, o?: Options) =>
      http
        .post<unknown>("/me/learning-tasks/preview", data, learningOptions(o))
        .then((v) => decode<LearningPreview>("LearningPreview", v)),
    create: (data: CreateLearningTask, o?: Options) =>
      http
        .post<unknown>("/me/learning-tasks", data, learningOptions(o))
        .then((v) => decode<LearningTask>("LearningTask", v)),
    list: (q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/me/learning-tasks${query(q)}`, learningOptions(o))
        .then((v) => decode<LearningTaskPage>("LearningTaskPage", v)),
    detail: (id: string, o?: Options) =>
      http
        .get<unknown>(`/me/learning-tasks/${id}`, learningOptions(o))
        .then((v) => decode<LearningTaskDetail>("LearningTaskDetail", v)),
    rename: (
      id: string,
      data: { expected_revision: number; name: string },
      o?: Options
    ) =>
      http
        .patch<unknown>(`/me/learning-tasks/${id}`, data, learningOptions(o))
        .then((v) => decode<LearningTask>("LearningTask", v)),
    archive: (id: string, data: { expected_revision: number }, o?: Options) =>
      http
        .post<unknown>(
          `/me/learning-tasks/${id}/archive`,
          data,
          learningOptions(o)
        )
        .then((v) => decode<LearningTask>("LearningTask", v)),
    start: (id: string, data: StartLearningRun, o?: Options) =>
      http
        .post<unknown>(
          `/me/learning-tasks/${id}/runs`,
          data,
          learningOptions(o)
        )
        .then((v) => decode<LearningRun>("LearningRun", v)),
    history: (id: string, q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(
          `/me/learning-tasks/${id}/runs${query(q)}`,
          learningOptions(o)
        )
        .then((v) => decode<LearningRunPage>("LearningRunPage", v)),
    run: (id: string, o?: Options) =>
      http
        .get<unknown>(`/me/learning-runs/${id}`, learningOptions(o))
        .then((v) => decode<LearningRun>("LearningRun", v)),
    questions: (id: string, q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(
          `/me/learning-runs/${id}/questions${query(q)}`,
          learningOptions(o)
        )
        .then((v) => decode<LearningQuestionPage>("LearningQuestionPage", v)),
    audio: (id: string, questionId: string, accent: "uk" | "us", o?: Options) =>
      http
        .get<unknown>(
          `/me/learning-runs/${id}/questions/${questionId}/audio?accent=${accent}`,
          learningOptions(o)
        )
        .then((v) => decode<LearningQuestionAudio>("LearningQuestionAudio", v)),
    answer: (id: string, data: SubmitLearningAnswer, o?: Options) =>
      http
        .post<unknown>(
          `/me/learning-runs/${id}/answers`,
          data,
          learningOptions(o)
        )
        .then((v) => decode<LearningAnswerReceipt>("LearningAnswerReceipt", v))
  };
}
