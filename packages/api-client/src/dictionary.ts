import type {
  DictionaryEntry,
  DictionaryPage,
  DictionaryAudioUrl
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";
function decode<T>(name: RuntimeSchemaRoot, value: unknown): T {
  const result = validateRuntimeSchema(name, value);
  if (!result.valid) throw new Error("词典内容暂不可用，请稍后重试");
  return value as T;
}
export function createDictionaryEndpoints(http: HttpClient) {
  return {
    search: (q: string, page = 1, options?: { signal?: AbortSignal }) =>
      http
        .get<unknown>(
          `/dictionary?${new URLSearchParams({ q, page: String(page), page_size: "20" })}`,
          {
            ...options,
            headers: {
              "X-TSZ-Voice-Versions": "v4",
              "X-TSZ-Voice-Locales": "v1",
              "X-TSZ-Voice-Models": "v1"
            }
          }
        )
        .then((v) => decode<DictionaryPage>("DictionaryPage", v)),
    get: (id: string, options?: { signal?: AbortSignal }) =>
      http
        .get<unknown>(`/dictionary/entries/${encodeURIComponent(id)}`, {
          ...options,
          headers: {
            "X-TSZ-Voice-Versions": "v4",
            "X-TSZ-Voice-Locales": "v1",
            "X-TSZ-Voice-Models": "v1"
          }
        })
        .then((v) => decode<DictionaryEntry>("DictionaryEntry", v)),
    audio: (id: string, assetId: string, options?: { signal?: AbortSignal }) =>
      http
        .get<unknown>(
          `/dictionary/entries/${encodeURIComponent(id)}/audio/${encodeURIComponent(assetId)}`,
          {
            ...options,
            headers: {
              "X-TSZ-Voice-Versions": "v4",
              "X-TSZ-Voice-Locales": "v1",
              "X-TSZ-Voice-Models": "v1"
            }
          }
        )
        .then((v) => decode<DictionaryAudioUrl>("AudioAssetUrlResponse", v))
  };
}
