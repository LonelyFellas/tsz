import { SENTENCE_FORMATTING_HEADERS } from "./sentence-formatting";
import type {
  CreateWordlistTip,
  WordlistTip,
  WordlistTipPage
} from "@tsz/types";
import { checkInteger } from "./coins";
import type {
  Wordlist,
  WordlistPage,
  WordlistQuery,
  WordlistItemsQuery,
  CreateWordlist,
  UpdateWordlist,
  WordlistEditSnapshot,
  WordlistItems,
  MyWordlistItems,
  WordlistCatalog,
  SubmitWordlist,
  WordlistReview,
  WordlistReviews,
  WordlistDecision
} from "@tsz/types";
import type { HttpClient } from "./http";
import {
  validateRuntimeSchema,
  type RuntimeSchemaRoot
} from "./runtime-schema";
export function decodeWordlistResponse<T>(
  name: RuntimeSchemaRoot,
  value: unknown
): T {
  const result = validateRuntimeSchema(name, value);
  if (!result.valid)
    throw new Error(
      `词表响应不符合接口契约：${result.path} (${result.reason})`
    );
  return value as T;
}
function query(q: WordlistQuery) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined) p.set(k, String(v));
  return p.size ? `?${p}` : "";
}
type Options = { signal?: AbortSignal };
export function createWordlistEndpoints(http: HttpClient) {
  return {
    tipReceipt: (eventId: string, o?: Options) =>
      http.get<unknown>(`/me/wordlist-tips/${eventId}`, o).then((v) => {
        const result = decodeWordlistResponse<WordlistTip>("WordlistTip", v);
        checkInteger(result.amount);
        return result;
      }),
    tip: (id: string, data: CreateWordlistTip, options?: Options) =>
      http.post<unknown>(`/wordlists/${id}/tips`, data, options).then((v) => {
        const result = decodeWordlistResponse<WordlistTip>("WordlistTip", v);
        checkInteger(result.amount);
        return result;
      }),
    tips: (q: WordlistQuery = {}, o?: Options) =>
      http.get<unknown>(`/me/wordlist-tips${query(q)}`, o).then((v) => {
        const result = decodeWordlistResponse<WordlistTipPage>(
          "WordlistTipPage",
          v
        );
        for (const item of result.items) checkInteger(item.amount);
        return result;
      }),
    list: (q: WordlistQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/wordlists${query(q)}`, o)
        .then((v) => decodeWordlistResponse<WordlistPage>("WordlistPage", v)),
    get: (id: string, o?: Options) =>
      http
        .get<unknown>(`/wordlists/${id}`, o)
        .then((v) => decodeWordlistResponse<Wordlist>("Wordlist", v)),
    items: (id: string, q: WordlistItemsQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/wordlists/${id}/items${query(q)}`, {
          ...o,
          headers: SENTENCE_FORMATTING_HEADERS
        })
        .then((v) => decodeWordlistResponse<WordlistItems>("WordlistItems", v)),
    catalog: (q: WordlistQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/wordlists/catalog${query(q)}`, o)
        .then((v) =>
          decodeWordlistResponse<WordlistCatalog>("WordlistCatalog", v)
        ),
    mine: (q: WordlistQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/me/wordlists${query(q)}`, o)
        .then((v) => decodeWordlistResponse<WordlistPage>("WordlistPage", v)),
    myDetail: (id: string, o?: Options) =>
      http
        .get<unknown>(`/me/wordlists/${id}`, o)
        .then((v) => decodeWordlistResponse<Wordlist>("Wordlist", v)),
    myItems: (id: string, q: WordlistItemsQuery = {}, o?: Options) =>
      http
        .get<unknown>(`/me/wordlists/${id}/items${query(q)}`, {
          ...o,
          headers: SENTENCE_FORMATTING_HEADERS
        })
        .then((v) =>
          decodeWordlistResponse<MyWordlistItems>("MyWordlistItems", v)
        ),
    edit: (id: string, o?: Options) =>
      http
        .get<unknown>(`/me/wordlists/${id}/edit`, o)
        .then((v) =>
          decodeWordlistResponse<WordlistEditSnapshot>(
            "WordlistEditSnapshot",
            v
          )
        ),
    create: (data: CreateWordlist) =>
      http
        .post<unknown>("/me/wordlists", data)
        .then((v) => decodeWordlistResponse<Wordlist>("Wordlist", v)),
    update: (id: string, data: UpdateWordlist) =>
      http
        .put<unknown>(`/me/wordlists/${id}`, data)
        .then((v) => decodeWordlistResponse<Wordlist>("Wordlist", v)),
    submit: (id: string, data: SubmitWordlist) =>
      http
        .post<unknown>(`/me/wordlists/${id}/review-requests`, data)
        .then((v) =>
          decodeWordlistResponse<WordlistReview>("WordlistReview", v)
        ),
    withdraw: (id: string, data: { expected_revision: number }) =>
      http
        .post<unknown>(`/me/wordlists/${id}/withdraw`, data)
        .then((v) => decodeWordlistResponse<Wordlist>("Wordlist", v)),
    reviews: (id: string, o?: Options) =>
      http
        .get<unknown>(`/me/wordlists/${id}/review-requests`, o)
        .then((v) =>
          decodeWordlistResponse<WordlistReviews>("WordlistReviews", v)
        )
  };
}
export function createAdminWordlistEndpoints(http: HttpClient) {
  return {
    list: (
      q: WordlistQuery & { state?: Wordlist["state"] } = {},
      o?: Options
    ) =>
      http
        .get<unknown>(`/wordlists${query(q)}`, o)
        .then((v) => decodeWordlistResponse<WordlistPage>("WordlistPage", v)),
    reviews: (id: string, o?: Options) =>
      http
        .get<unknown>(`/wordlists/${id}/review-requests`, o)
        .then((v) =>
          decodeWordlistResponse<WordlistReviews>("WordlistReviews", v)
        ),
    items: (id: string, request: string, q: WordlistQuery = {}, o?: Options) =>
      http
        .get<unknown>(
          `/wordlists/${id}/review-requests/${request}/items${query(q)}`,
          { ...o, headers: SENTENCE_FORMATTING_HEADERS }
        )
        .then((v) => decodeWordlistResponse<WordlistItems>("WordlistItems", v)),
    decision: (id: string, request: string, data: WordlistDecision) =>
      http
        .post<unknown>(
          `/wordlists/${id}/review-requests/${request}/decision`,
          data
        )
        .then((v) => decodeWordlistResponse<Wordlist>("Wordlist", v)),
    withdraw: (
      id: string,
      data: { expected_revision: number; reason: string }
    ) =>
      http
        .post<unknown>(`/wordlists/${id}/withdraw`, data)
        .then((v) => decodeWordlistResponse<Wordlist>("Wordlist", v))
  };
}
