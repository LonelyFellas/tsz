import type {
  NextWorkspaceQuery,
  NextWorkspaceEntry,
  NextWorkspaceList,
  NextWorkspaceStats,
  NextWorkspaceCreator,
  NextListCommand,
  NextListCommandResult,
  NextAnnotationInput,
  NextAnnotationResult,
  CreateNextEntry,
  NextDetection,
  NextDetectionInput,
  NextEntryMatchInput,
  NextEntryMatches,
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
  const editorOptions = {
    headers: {
      "x-tsz-next-forms": "v1",
      "x-tsz-next-sense-groups": "v1",
      "x-tsz-next-medium-ownership": "v1"
    }
  };
  const entry = (id: string) => `${root}/entries/${encodeURIComponent(id)}`;
  const decode = <T>(
    schema: Parameters<typeof validateRuntimeSchema>[0],
    value: unknown
  ): T => {
    if (!validateRuntimeSchema(schema, value).valid)
      throw new ClientResponseError("智能词库列表响应不符合接口契约");
    return value as T;
  };
  const search = (query: NextWorkspaceQuery) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return params.size ? `?${params}` : "";
  };
  return {
    workspaceList: (query: NextWorkspaceQuery = {}) =>
      http
        .get<unknown>(`${root}/workspace/entries${search(query)}`)
        .then((value) => decode<NextWorkspaceList>("NextWorkspaceList", value)),
    workspaceEntry: (id: string) =>
      http
        .get<unknown>(`${root}/workspace/entries/${encodeURIComponent(id)}`)
        .then((value) =>
          decode<NextWorkspaceEntry>("NextWorkspaceEntry", value)
        ),
    stats: (query: NextWorkspaceQuery = {}) =>
      http
        .get<unknown>(`${root}/workspace/stats${search(query)}`)
        .then((value) =>
          decode<NextWorkspaceStats>("NextWorkspaceStats", value)
        ),
    creators: (query: NextWorkspaceQuery = {}) =>
      http
        .get<unknown>(`${root}/workspace/creators${search(query)}`)
        .then((value) => {
          if (!Array.isArray(value))
            throw new ClientResponseError("智能词库创建人响应不符合接口契约");
          return value.map((row) =>
            decode<NextWorkspaceCreator>("NextWorkspaceCreator", row)
          );
        }),
    command: (input: NextListCommand) =>
      http
        .post<unknown>(`${root}/workspace/commands`, input)
        .then((value) =>
          decode<NextListCommandResult>("NextListCommandResult", value)
        ),
    annotation: (id: string, input: NextAnnotationInput) =>
      http
        .patch<unknown>(
          `${root}/workspace/entries/${encodeURIComponent(id)}/annotation`,
          input
        )
        .then((value) =>
          decode<NextAnnotationResult>("NextAnnotationResult", value)
        ),
    list: (query: NextListQuery = {}) =>
      http
        .get<unknown>(`${root}/entries${search(query)}`)
        .then(decodeNextEntryList),
    capabilities: () =>
      http
        .get<unknown>(`${root}/capabilities`, editorOptions)
        .then(decodeNextCapabilities),
    create: (input: CreateNextEntry) =>
      http
        .post<unknown>(`${root}/entries`, input, editorOptions)
        .then(decodeNextEntry),
    detect: (input: NextDetectionInput) =>
      http
        .post<unknown>(`${root}/detections`, input)
        .then((value) => decode<NextDetection>("NextDetection", value)),
    matchEntries: (input: NextEntryMatchInput) =>
      http
        .post<unknown>(`${root}/entry-matches`, input, editorOptions)
        .then((value) => decode<NextEntryMatches>("NextEntryMatches", value)),
    get: (id: string) =>
      http.get<unknown>(entry(id), editorOptions).then(decodeNextEntry),
    save: (id: string, input: SaveNextDraft) =>
      http.put<unknown>(entry(id), input, editorOptions).then(decodeNextEntry),
    view: (id: string, selection: NextViewQuery) => {
      const params = new URLSearchParams({
        target_locale: selection.target_locale,
        medium_locale: selection.medium_locale
      });
      return http
        .get<unknown>(`${entry(id)}/view?${params}`, editorOptions)
        .then(decodeNextEntryView);
    }
  };
}
