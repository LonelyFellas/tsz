import { validateRuntimeSchema } from "./runtime-schema";
import type {
  CreateSharedSentence,
  SentenceListQuery,
  SentenceRevision,
  SentencePublication,
  SentencePublicationInput,
  SentenceWithdrawalImpact,
  WithdrawSentenceInput,
  SentenceVisibilityInput,
  SentenceVisibilityResponse,
  SharedSentence,
  SharedSentenceList,
  UpdateSharedSentence,
  SentenceEntryTargets,
  SentenceTargetQuery
} from "@tsz/types";
import type { HttpClient } from "./http";

function decodeContract<T>(
  root:
    | "SentencePublication"
    | "SentenceWithdrawalImpact"
    | "SentenceVisibilityResponse",
  value: unknown
): T {
  const result = validateRuntimeSchema(root, value);
  if (!result.valid)
    throw new Error(
      `例句响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}
function decodeSentence(value: unknown): SharedSentence {
  const result = validateRuntimeSchema("SharedSentence", value);
  if (!result.valid)
    throw new Error(
      `例句响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as SharedSentence;
}
function decodeList(value: unknown): SharedSentenceList {
  const result = validateRuntimeSchema("SharedSentenceList", value);
  if (!result.valid)
    throw new Error(
      `例句列表响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as SharedSentenceList;
}
export function createSharedSentenceEndpoints(http: HttpClient) {
  const root = "/lexicon/sentences";
  return {
    list: (query: SentenceListQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return http.get<unknown>(`${root}?${params}`).then(decodeList);
    },
    get: (id: string, view: "draft" | "published" = "published") =>
      http.get<unknown>(`${root}/${id}?view=${view}`).then(decodeSentence),
    create: (input: CreateSharedSentence) =>
      http.post<unknown>(root, input).then(decodeSentence),
    update: (id: string, input: UpdateSharedSentence) =>
      http.put<unknown>(`${root}/${id}`, input).then(decodeSentence),
    delete: (id: string, input: SentenceRevision) =>
      http.del<void>(`${root}/${id}`, input),
    setVisibility: (
      entryId: string,
      id: string,
      input: SentenceVisibilityInput
    ) =>
      http
        .put<unknown>(
          `/lexicon/entries/${entryId}/sentences/${id}/visibility`,
          input
        )
        .then((value) =>
          decodeContract<SentenceVisibilityResponse>(
            "SentenceVisibilityResponse",
            value
          )
        ),
    publications: (id: string, beforeNumber?: number) =>
      http
        .get<unknown>(
          `${root}/${id}/publications${beforeNumber === undefined ? "" : `?before_number=${beforeNumber}`}`
        )
        .then((value) => {
          if (!Array.isArray(value)) throw new Error("例句历史响应必须为数组");
          return value.map((item) =>
            decodeContract<SentencePublication>("SentencePublication", item)
          );
        }),
    publication: (id: string, publicationId: string) =>
      http
        .get<unknown>(`${root}/${id}/publications/${publicationId}`)
        .then((value) =>
          decodeContract<SentencePublication>("SentencePublication", value)
        ),
    publish: (id: string, key: string, input: SentencePublicationInput) =>
      http
        .post<unknown>(`${root}/${id}/publications`, input, {
          headers: { "Idempotency-Key": key }
        })
        .then(decodeSentence),
    rollback: (
      id: string,
      publicationId: string,
      key: string,
      input: SentencePublicationInput
    ) =>
      http
        .post<unknown>(
          `${root}/${id}/publications/${publicationId}/rollback`,
          input,
          { headers: { "Idempotency-Key": key } }
        )
        .then(decodeSentence),
    withdrawalImpact: (id: string) =>
      http
        .get<unknown>(`${root}/${id}/withdrawal-impact`)
        .then((value) =>
          decodeContract<SentenceWithdrawalImpact>(
            "SentenceWithdrawalImpact",
            value
          )
        ),
    withdraw: (id: string, key: string, input: WithdrawSentenceInput) =>
      http
        .post<unknown>(`${root}/${id}/withdraw`, input, {
          headers: { "Idempotency-Key": key }
        })
        .then(decodeSentence),
    restore: (id: string, key: string, input: SentencePublicationInput) =>
      http
        .post<unknown>(`${root}/${id}/restore`, input, {
          headers: { "Idempotency-Key": key }
        })
        .then(decodeSentence),
    targets: (query: SentenceTargetQuery) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return http.get<unknown>(`${root}/targets?${params}`).then((value) => {
        const result = validateRuntimeSchema("SentenceEntryTargets", value);
        if (!result.valid)
          throw new Error(
            `关联候选响应不符合接口契约：${result.path} (${result.reason})`
          );
        return value as SentenceEntryTargets;
      });
    }
  };
}
