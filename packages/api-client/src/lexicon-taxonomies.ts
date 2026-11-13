import { validateRuntimeSchema } from "./runtime-schema";
import { ClientResponseError } from "./client-response-error";
import type {
  CreateLexiconTaxonomyInput,
  LexiconTaxonomy,
  LexiconTaxonomyKind,
  LexiconTaxonomyListQuery,
  LexiconTaxonomyListResponse,
  UpdateLexiconTaxonomyInput
} from "@tsz/types";
import type { HttpClient } from "./http";

function decode<T>(
  name: "LexiconTaxonomy" | "PaginatedResponse_LexiconTaxonomy",
  value: unknown
): T {
  const result = validateRuntimeSchema(name, value);
  if (!result.valid)
    throw new ClientResponseError(
      `目录配置响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}

export function createLexiconTaxonomyEndpoints(http: HttpClient) {
  const root = (kind: LexiconTaxonomyKind) => `/lexicon/taxonomies/${kind}`;
  const qs = (query: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query))
      if (value !== undefined) params.set(key, String(value));
    return params.size ? `?${params}` : "";
  };
  return {
    list: (kind: LexiconTaxonomyKind, query: LexiconTaxonomyListQuery = {}) =>
      http
        .get<unknown>(`${root(kind)}${qs({ ...query })}`)
        .then((value) =>
          decode<LexiconTaxonomyListResponse>(
            "PaginatedResponse_LexiconTaxonomy",
            value
          )
        ),
    create: (kind: LexiconTaxonomyKind, input: CreateLexiconTaxonomyInput) =>
      http
        .post<unknown>(root(kind), input)
        .then((value) => decode<LexiconTaxonomy>("LexiconTaxonomy", value)),
    update: (
      kind: LexiconTaxonomyKind,
      id: string,
      input: UpdateLexiconTaxonomyInput
    ) =>
      http
        .patch<unknown>(`${root(kind)}/${encodeURIComponent(id)}`, input)
        .then((value) => decode<LexiconTaxonomy>("LexiconTaxonomy", value)),
    remove: (kind: LexiconTaxonomyKind, id: string, base_revision: number) =>
      http.del<void>(
        `${root(kind)}/${encodeURIComponent(id)}${qs({ base_revision })}`
      )
  };
}
