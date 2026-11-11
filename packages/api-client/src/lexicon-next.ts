import type {
  CreateNextEntry,
  NextCapabilities,
  NextEntry,
  NextEntryList,
  NextListQuery,
  NextEntryView,
  NextViewQuery,
  SaveNextDraft
} from "@tsz/types";
import type { HttpClient } from "./http";
import { ClientResponseError } from "./client-response-error";
import { validateRuntimeSchema } from "./runtime-schema";

export function decodeNextEntry(value: unknown): NextEntry {
  if (!validateRuntimeSchema("NextEntry", value).valid)
    throw new ClientResponseError("新版词库草稿响应不符合接口契约");
  return value as NextEntry;
}
export function decodeNextEntryList(value: unknown): NextEntryList {
  if (!validateRuntimeSchema("NextEntryList", value).valid)
    throw new ClientResponseError("智能词库列表响应不符合接口契约");
  return value as NextEntryList;
}
export function decodeNextCapabilities(value: unknown): NextCapabilities {
  if (
    !validateRuntimeSchema("NextCapabilities", value).valid ||
    (value as NextCapabilities).schema_version !== 1
  )
    throw new ClientResponseError("新版词库能力目录不可用");
  return value as NextCapabilities;
}
export function decodeNextEntryView(value: unknown): NextEntryView {
  if (!validateRuntimeSchema("NextEntryView", value).valid)
    throw new ClientResponseError("新版词库语言视图响应不符合接口契约");
  return value as NextEntryView;
}

/** Uses the admin HttpClient (baseUrl=/api/v1/admin). Capability failure (including 404 on an old backend) must not fall back to V3. */
export function createLexiconNextEndpoints(http: HttpClient) {
  const root = "/lexicon-next";
  const entry = (id: string) => `${root}/entries/${encodeURIComponent(id)}`;
  return {
    list: (query: NextListQuery = {}) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== "") params.set(key, String(value));
      }
      return http
        .get<unknown>(`${root}/entries?${params}`)
        .then(decodeNextEntryList);
    },
    capabilities: () =>
      http.get<unknown>(`${root}/capabilities`).then(decodeNextCapabilities),
    create: (input: CreateNextEntry) =>
      http.post<unknown>(`${root}/entries`, input).then(decodeNextEntry),
    get: (id: string) => http.get<unknown>(entry(id)).then(decodeNextEntry),
    save: (id: string, input: SaveNextDraft) =>
      http.put<unknown>(entry(id), input).then(decodeNextEntry),
    view: (id: string, selection: NextViewQuery) => {
      const params = new URLSearchParams({
        target_locale: selection.target_locale,
        medium_locale: selection.medium_locale
      });
      return http
        .get<unknown>(`${entry(id)}/view?${params}`)
        .then(decodeNextEntryView);
    }
  };
}
