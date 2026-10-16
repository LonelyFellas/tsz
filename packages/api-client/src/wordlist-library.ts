import type {
  LibrarySpace,
  LibraryQuery,
  LibraryPage,
  LibraryFolderInput,
  LibraryRename,
  LibraryOperation,
  LibraryImpact
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";
function decode<T>(schema: RuntimeSchemaRoot, value: unknown): T {
  const check = validateRuntimeSchema(schema, value);
  if (!check.valid)
    throw new Error(`目录响应不符合接口契约：${check.path} (${check.reason})`);
  return value as T;
}
export function createWordlistLibraryEndpoints(http: HttpClient) {
  const base = (space: LibrarySpace) => `/me/wordlist-library/${space}`;
  return {
    list: (
      space: LibrarySpace,
      query: LibraryQuery = {},
      options?: { signal?: AbortSignal }
    ) => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query))
        if (value !== undefined) params.set(key, String(value));
      return http
        .get<unknown>(
          `${base(space)}${params.size ? `?${params}` : ""}`,
          options
        )
        .then((value) => decode<LibraryPage>("LibraryPage", value));
    },
    createFolder: (space: LibrarySpace, data: LibraryFolderInput) =>
      http.post<void>(`${base(space)}/folders`, data),
    rename: (space: LibrarySpace, id: string, data: LibraryRename) =>
      http.put<void>(`${base(space)}/nodes/${id}`, data),
    preview: (space: LibrarySpace, data: LibraryOperation) =>
      http
        .post<unknown>(`${base(space)}/preview`, data)
        .then((value) => decode<LibraryImpact>("LibraryImpact", value)),
    operate: (space: LibrarySpace, data: LibraryOperation) =>
      http
        .post<unknown>(`${base(space)}/operations`, data)
        .then((value) => decode<LibraryImpact>("LibraryImpact", value))
  };
}
