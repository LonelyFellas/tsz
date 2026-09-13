import { validateRuntimeSchema } from "./runtime-schema";
import type {
  CreateSharedSentence,
  SentenceListQuery,
  SentenceRevision,
  UnlinkSentenceSense,
  SharedSentence,
  SharedSentenceList,
  UpdateSharedSentence,
  SentenceEntryTargets,
  SentenceTargetQuery
} from "@tsz/types";
import type { HttpClient } from "./http";

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
    get: (id: string) =>
      http.get<unknown>(`${root}/${id}`).then(decodeSentence),
    create: (input: CreateSharedSentence) =>
      http.post<unknown>(root, input).then(decodeSentence),
    update: (id: string, input: UpdateSharedSentence) =>
      http.put<unknown>(`${root}/${id}`, input).then(decodeSentence),
    delete: (id: string, input: SentenceRevision) =>
      http.del<void>(`${root}/${id}`, input),
    unlink: (id: string, entryId: string, input: UnlinkSentenceSense) =>
      http.del<void>(`${root}/${id}/associations/${entryId}`, input),
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
