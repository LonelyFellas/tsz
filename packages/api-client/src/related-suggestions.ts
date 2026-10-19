import type { RelatedEntrySuggestions, RelatedEntrySenses } from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";
function decode<T>(root: RuntimeSchemaRoot, value: unknown): T {
  const result = validateRuntimeSchema(root, value);
  if (!result.valid)
    throw new Error(
      `关联词响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}
export function createRelatedSuggestionEndpoints(http: HttpClient) {
  return {
    relatedSuggestions: (
      q: string,
      options?: { exclude_entry_id?: string; signal?: AbortSignal }
    ) => {
      const params = new URLSearchParams({ q });
      if (options?.exclude_entry_id)
        params.set("exclude_entry_id", options.exclude_entry_id);
      return http
        .get<unknown>(`/lexicon/entries/related-suggestions?${params}`, {
          signal: options?.signal
        })
        .then((v) =>
          decode<RelatedEntrySuggestions>("RelatedEntrySuggestions", v)
        );
    },
    relatedSenses: (
      id: string,
      options?: { publication_id?: string; signal?: AbortSignal }
    ) => {
      const params = new URLSearchParams();
      if (options?.publication_id)
        params.set("publication_id", options.publication_id);
      return http
        .get<unknown>(
          `/lexicon/entries/${id}/relation-senses${params.size ? `?${params}` : ""}`,
          { signal: options?.signal }
        )
        .then((v) => decode<RelatedEntrySenses>("RelatedEntrySenses", v));
    }
  };
}
