import type {
  CreateLearningPlan,
  PreviewLearningPlan,
  LearningPlanPreview,
  LearningPlan,
  LearningPlanPage,
  StartLearningRun,
  LearningRun,
  LearningPageQuery,
  PreviewLearningCycle,
  CreateLearningCycle,
  LearningCyclePreview,
  LearningCycle,
  LearningCyclePage,
  LearningPlanRunPage
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
      `学习计划响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}
function query(q: LearningPageQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined) p.set(k, String(v));
  return p.size ? `?${p}` : "";
}
export function createLearningPlanEndpoints(http: HttpClient) {
  const base = "/me/learning-plans";
  return {
    preview: (data: PreviewLearningPlan, o?: Options) =>
      http
        .post<unknown>(`${base}/preview`, data, learningOptions(o))
        .then((v) => decode<LearningPlanPreview>("LearningPlanPreview", v)),
    create: (data: CreateLearningPlan, o?: Options) =>
      http
        .post<unknown>(base, data, learningOptions(o))
        .then((v) => decode<LearningPlan>("LearningPlan", v)),
    list: (q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(`${base}${query(q)}`, learningOptions(o))
        .then((v) => decode<LearningPlanPage>("LearningPlanPage", v)),
    detail: (id: string, o?: Options) =>
      http
        .get<unknown>(`${base}/${id}`, learningOptions(o))
        .then((v) => decode<LearningPlan>("LearningPlan", v)),
    rename: (
      id: string,
      data: { expected_revision: number; name: string },
      o?: Options
    ) =>
      http
        .patch<unknown>(`${base}/${id}`, data, learningOptions(o))
        .then((v) => decode<LearningPlan>("LearningPlan", v)),
    archive: (id: string, data: { expected_revision: number }, o?: Options) =>
      http
        .post<unknown>(`${base}/${id}/archive`, data, learningOptions(o))
        .then((v) => decode<LearningPlan>("LearningPlan", v)),
    start: (id: string, data: StartLearningRun, o?: Options) =>
      http
        .post<unknown>(`${base}/${id}/runs`, data, learningOptions(o))
        .then((v) => decode<LearningRun>("LearningRun", v)),
    history: (id: string, q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(`${base}/${id}/runs${query(q)}`, learningOptions(o))
        .then((v) => decode<LearningPlanRunPage>("LearningPlanRunPage", v)),
    cyclePreview: (id: string, data: PreviewLearningCycle, o?: Options) =>
      http
        .post<unknown>(`${base}/${id}/cycles/preview`, data, learningOptions(o))
        .then((v) => decode<LearningCyclePreview>("LearningCyclePreview", v)),
    cycleCreate: (id: string, data: CreateLearningCycle, o?: Options) =>
      http
        .post<unknown>(`${base}/${id}/cycles`, data, learningOptions(o))
        .then((v) => decode<LearningCycle>("LearningCycle", v)),
    cycles: (id: string, q: LearningPageQuery = {}, o?: Options) =>
      http
        .get<unknown>(`${base}/${id}/cycles${query(q)}`, learningOptions(o))
        .then((v) => decode<LearningCyclePage>("LearningCyclePage", v))
  };
}
