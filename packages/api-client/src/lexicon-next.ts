import type {
  NextPublicationBase,
  NextPublishInput,
  NextPublicationPreview,
  NextPublication,
  NextPublicationState,
  NextEquivalentCatalog,
  NextSentence,
  NextSentenceList,
  NextSentenceQuery,
  CreateNextSentence,
  SaveNextSentence,
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
  NextDraftSchemaCompatibility,
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
export function decodeNextDraftSchemaCompatibility(
  value: unknown
): NextDraftSchemaCompatibility {
  if (!validateRuntimeSchema("NextDraftSchemaCompatibility", value).valid)
    throw new ClientResponseError("新版词库草稿版本兼容性不可用");
  return value as NextDraftSchemaCompatibility;
}
export function decodeNextEntryView(value: unknown): NextEntryView {
  if (!validateRuntimeSchema("NextEntryView", value).valid)
    throw new ClientResponseError("新版词库语言视图响应不符合接口契约");
  return value as NextEntryView;
}

/** Uses the admin HttpClient (baseUrl=/api/v1/admin). Capability failure (including 404 on an old backend) must not fall back to V3. */
export function createLexiconNextEndpoints(http: HttpClient) {
  const root = "/lexicon-next";
  let definitionDetails = false;
  let sentenceDrafts = false;
  let relations = false;
  let dialectPairs = false;
  let grammarFormLinks = false;
  let sentenceAssociations = false;
  let creationSnapshot = false;
  const editorOptions = {
    headers: {
      "x-tsz-next-creation-snapshot": "v1",
      "x-tsz-next-publications": "v1",
      "x-tsz-next-dialect-pairs": "v1",
      "x-tsz-next-relations": "v1",
      "x-tsz-next-definitions": "v1",
      "x-tsz-next-forms": "v1",
      "x-tsz-next-sentences": "v1",
      "x-tsz-next-sentence-details": "v1",
      "x-tsz-next-sentence-drafts": "v1",
      "x-tsz-next-equivalents": "v1",
      "x-tsz-next-sense-metadata": "v1",
      "x-tsz-next-grammar": "v1",
      "x-tsz-next-grammar-audio": "v1",
      "x-tsz-next-grammar-form-links": "v1",
      "x-tsz-next-sentence-associations": "v1",
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
  const search = (query: NextWorkspaceQuery | NextSentenceQuery) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return params.size ? `?${params}` : "";
  };
  const publicationOptions = {
    headers: { "x-tsz-next-publications": "v1", "x-tsz-next-levels": "v1" }
  };
  return {
    publication: (id: string) =>
      http
        .get<unknown>(`${entry(id)}/publication`, {
          headers: { "x-tsz-next-dialect-pairs": "v1" }
        })
        .then((value) =>
          decode<NextPublicationState>("NextPublicationState", value)
        ),
    publicationPreview: (id: string, input: NextPublicationBase) =>
      http
        .post<unknown>(`${entry(id)}/publication-preview`, input)
        .then((value) =>
          decode<NextPublicationPreview>("NextPublicationPreview", value)
        ),
    publish: (id: string, input: NextPublishInput) =>
      http
        .post<unknown>(`${entry(id)}/publications`, input)
        .then((value) => decode<NextPublication>("NextPublication", value)),
    sentences: (query: NextSentenceQuery) =>
      http
        .get<unknown>(`${root}/sentences${search(query)}`)
        .then((value) => decode<NextSentenceList>("NextSentenceList", value)),
    sentence: (id: string) =>
      http
        .get<unknown>(
          `${root}/sentences/${encodeURIComponent(id)}`,
          editorOptions
        )
        .then((value) => decode<NextSentence>("NextSentence", value)),
    createSentence: (input: CreateNextSentence) =>
      !sentenceAssociations && input.variant?.associations !== undefined
        ? Promise.reject(
            new ClientResponseError("例句关联能力尚未确认，请重新打开词条")
          )
        : http
            .post<unknown>(`${root}/sentences`, input, editorOptions)
            .then((value) => decode<NextSentence>("NextSentence", value)),
    saveSentence: (id: string, input: SaveNextSentence) =>
      !sentenceAssociations && input.variant?.associations !== undefined
        ? Promise.reject(
            new ClientResponseError("例句关联能力尚未确认，请重新打开词条")
          )
        : http
            .put<unknown>(
              `${root}/sentences/${encodeURIComponent(id)}`,
              input,
              editorOptions
            )
            .then((value) => decode<NextSentence>("NextSentence", value)),
    equivalentCatalog: () =>
      http
        .get<unknown>(`${root}/equivalent-catalog`)
        .then((value) =>
          decode<NextEquivalentCatalog>("NextEquivalentCatalog", value)
        ),
    workspaceList: (query: NextWorkspaceQuery = {}) =>
      http
        .get<unknown>(`${root}/workspace/entries${search(query)}`, {
          headers: {
            ...publicationOptions.headers,
            "x-tsz-next-name-variants": "v1"
          }
        })
        .then((value) => decode<NextWorkspaceList>("NextWorkspaceList", value)),
    workspaceEntry: (id: string) =>
      http
        .get<unknown>(
          `${root}/workspace/entries/${encodeURIComponent(id)}`,
          publicationOptions
        )
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
    updaters: (query: NextWorkspaceQuery = {}) =>
      http
        .get<unknown>(`${root}/workspace/updaters${search(query)}`)
        .then((value) => {
          if (!Array.isArray(value))
            throw new ClientResponseError(
              "智能词库最后更新人响应不符合接口契约"
            );
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
      http.get<unknown>(`${root}/capabilities`, editorOptions).then((value) => {
        const capabilities = decodeNextCapabilities(value);
        creationSnapshot = capabilities.creation_snapshot === true;
        definitionDetails = capabilities.definition_details === true;
        sentenceDrafts = capabilities.sentence_drafts === true;
        dialectPairs = capabilities.dialect_pairs === true;
        relations = capabilities.relations === true;
        grammarFormLinks = capabilities.grammar_form_links === true;
        sentenceAssociations = capabilities.sentence_associations === true;
        return capabilities;
      }),
    draftSchema: () =>
      http
        .get<unknown>(`${root}/draft-schema`)
        .then(decodeNextDraftSchemaCompatibility),
    create: (input: CreateNextEntry) => {
      const payload = creationSnapshot
        ? input
        : (({ creation_detection: _creationDetection, ...legacy }) => legacy)(
            input
          );
      return http
        .post<unknown>(`${root}/entries`, payload, editorOptions)
        .then(decodeNextEntry);
    },
    detect: (input: NextDetectionInput) =>
      http
        .post<unknown>(`${root}/detections`, input)
        .then((value) => decode<NextDetection>("NextDetection", value)),
    matchEntries: (
      input: NextEntryMatchInput,
      annotationKind?: "word" | "phrase"
    ) =>
      http
        .post<unknown>(`${root}/entry-matches`, input, {
          headers: {
            ...editorOptions.headers,
            "x-tsz-next-annotation-rule": "v1",
            ...(annotationKind
              ? { "x-tsz-next-annotation-kind": annotationKind }
              : {})
          }
        })
        .then((value) => decode<NextEntryMatches>("NextEntryMatches", value)),
    get: (id: string) =>
      http.get<unknown>(entry(id), editorOptions).then(decodeNextEntry),
    save: (id: string, input: SaveNextDraft) => {
      if (input.dialect_changes?.length && !dialectPairs)
        return Promise.reject(
          new ClientResponseError("当前服务未开放方言配对，请重新打开词条")
        );
      if (input.sentence_changes?.length && !sentenceDrafts) {
        return Promise.reject(
          new ClientResponseError("例句统一草稿能力尚未确认，请重新打开词条")
        );
      }
      if (
        !relations &&
        input.draft.senses.some((sense) => sense.relations !== undefined)
      ) {
        return Promise.reject(
          new ClientResponseError("拓展词能力尚未确认，请重新打开词条")
        );
      }
      if (
        !grammarFormLinks &&
        input.draft.grammar_structures?.some((grammar) =>
          grammar.variants.some((variant) => variant.form_links !== undefined)
        )
      ) {
        return Promise.reject(
          new ClientResponseError("语法词形关联能力尚未确认，请重新打开词条")
        );
      }
      if (
        !sentenceAssociations &&
        input.sentence_changes?.some(
          (change) => change.variant.associations !== undefined
        )
      ) {
        return Promise.reject(
          new ClientResponseError("例句关联能力尚未确认，请重新打开词条")
        );
      }
      if (
        !definitionDetails &&
        input.draft.senses.some((sense) =>
          sense.definitions.some(
            (row) =>
              row.level !== undefined ||
              row.grammar_unbound !== undefined ||
              row.content !== undefined ||
              row.voice_profile !== undefined ||
              row.audio_assets !== undefined
          )
        )
      ) {
        return Promise.reject(
          new ClientResponseError("释义扩展能力尚未确认，请重新打开词条")
        );
      }
      return http
        .put<unknown>(entry(id), input, editorOptions)
        .then(decodeNextEntry);
    },
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
