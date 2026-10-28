import type {
  QuestionCandidatePageQuery,
  QuestionCandidateSearchPage,
  QuestionBatchSelection,
  QuestionBatchPreview,
  CreateQuestionBatch,
  QuestionBatch,
  QuestionBatchPage,
  BankQuestion,
  BankQuestionPage,
  CreateQuestionGeneration,
  EditBankQuestion,
  QuestionBankQuery,
  QuestionCandidatePage,
  QuestionCandidateQuery,
  QuestionGeneration,
  QuestionGenerationPage,
  ReviewBankQuestion
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
      `题库响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}
function query(
  data: QuestionBankQuery | QuestionCandidateQuery | QuestionCandidatePageQuery
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(data))
    if (value !== undefined && value !== "") params.set(key, String(value));
  return params.size ? `?${params}` : "";
}
export function createQuestionBankEndpoints(http: HttpClient) {
  const base = "/question-bank";
  return {
    candidatePage: (q: QuestionCandidatePageQuery, o?: Options) =>
      http
        .get<unknown>(`${base}/candidate-page${query(q)}`, o)
        .then((v) =>
          decode<QuestionCandidateSearchPage>("QuestionCandidateSearchPage", v)
        ),
    batchPreview: (data: QuestionBatchSelection, o?: Options) =>
      http
        .post<unknown>(`${base}/batches/preview`, data, o)
        .then((v) => decode<QuestionBatchPreview>("QuestionBatchPreview", v)),
    createBatch: (data: CreateQuestionBatch, o?: Options) =>
      http
        .post<unknown>(`${base}/batches`, data, o)
        .then((v) => decode<QuestionBatch>("QuestionBatch", v)),
    batches: (q: QuestionBankQuery = {}, o?: Options) =>
      http
        .get<unknown>(`${base}/batches${query(q)}`, o)
        .then((v) => decode<QuestionBatchPage>("QuestionBatchPage", v)),
    batch: (id: string, o?: Options) =>
      http
        .get<unknown>(`${base}/batches/${id}`, o)
        .then((v) => decode<QuestionBatch>("QuestionBatch", v)),
    batchItems: (id: string, q: QuestionBankQuery = {}, o?: Options) =>
      http
        .get<unknown>(`${base}/batches/${id}/items${query(q)}`, o)
        .then((v) =>
          decode<QuestionGenerationPage>("QuestionGenerationPage", v)
        ),
    cancelBatch: (id: string, o?: Options) =>
      http
        .post<unknown>(`${base}/batches/${id}/cancel`, undefined, o)
        .then((v) => decode<QuestionBatch>("QuestionBatch", v)),
    candidates: (q: QuestionCandidateQuery, o?: Options) =>
      http
        .get<unknown>(`${base}/candidates${query(q)}`, o)
        .then((v) => decode<QuestionCandidatePage>("QuestionCandidatePage", v)),
    generations: (q: QuestionBankQuery = {}, o?: Options) =>
      http
        .get<unknown>(`${base}/generations${query(q)}`, o)
        .then((v) =>
          decode<QuestionGenerationPage>("QuestionGenerationPage", v)
        ),
    generate: (data: CreateQuestionGeneration, o?: Options) =>
      http
        .post<unknown>(`${base}/generations`, data, o)
        .then((v) => decode<QuestionGeneration>("QuestionGeneration", v)),
    generation: (id: string, o?: Options) =>
      http
        .get<unknown>(`${base}/generations/${id}`, o)
        .then((v) => decode<QuestionGeneration>("QuestionGeneration", v)),
    cancel: (id: string, data: { expected_revision: number }, o?: Options) =>
      http
        .post<unknown>(`${base}/generations/${id}/cancel`, data, o)
        .then((v) => decode<QuestionGeneration>("QuestionGeneration", v)),
    questions: (q: QuestionBankQuery = {}, o?: Options) =>
      http
        .get<unknown>(`${base}/questions${query(q)}`, o)
        .then((v) => decode<BankQuestionPage>("BankQuestionPage", v)),
    question: (id: string, o?: Options) =>
      http
        .get<unknown>(`${base}/questions/${id}`, o)
        .then((v) => decode<BankQuestion>("BankQuestion", v)),
    edit: (id: string, data: EditBankQuestion, o?: Options) =>
      http
        .patch<unknown>(`${base}/questions/${id}`, data, o)
        .then((v) => decode<BankQuestion>("BankQuestion", v)),
    review: (id: string, data: ReviewBankQuestion, o?: Options) =>
      http
        .post<unknown>(`${base}/questions/${id}/review`, data, o)
        .then((v) => decode<BankQuestion>("BankQuestion", v))
  };
}
