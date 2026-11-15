import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminWordsDataSource } from "./dataSource";

export interface RelatedWordChoice {
  word_id: string;
  headword: string;
  matchedHeadword: string;
  status: "draft" | "published";
  publicationId?: string;
  senseCount?: number;
  preview?: string;
  senses: { sense_id: string; gloss: string; status: "draft" | "published" }[];
}
export interface RelatedSuggestionsSource {
  key: readonly string[];
  suggestions: (
    query: string,
    excludeEntryId: string | undefined,
    signal: AbortSignal
  ) => Promise<RelatedWordChoice[]>;
  senses: (
    id: string,
    publicationId: string | undefined,
    signal: AbortSignal
  ) => Promise<{
    entry_id: string;
    publication_id?: string;
    senses: { sense_id: string; gloss: string }[];
  }>;
}

export function useRelatedSuggestions(
  q: string,
  open: boolean,
  excludeEntryId?: string,
  source?: RelatedSuggestionsSource
) {
  const normalized = q.trim();
  const [debounced, setDebounced] = useState(normalized);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalized), 250);
    return () => clearTimeout(timer);
  }, [normalized]);
  const enabled = open && !!normalized && debounced === normalized;
  const result = useQuery({
    queryKey: [
      ...(source?.key ?? ["admin-words"]),
      "related-suggestions",
      debounced,
      excludeEntryId
    ],
    queryFn: async ({ signal }) =>
      source
        ? source.suggestions(debounced, excludeEntryId, signal)
        : (
            await adminWordsDataSource.relatedSuggestions(debounced, {
              exclude_entry_id: excludeEntryId,
              signal
            })
          ).items.map((item): RelatedWordChoice => ({
            word_id: item.entry_id,
            headword: item.label,
            matchedHeadword: item.label,
            status: "published",
            publicationId: item.publication_id,
            senseCount: item.sense_count,
            preview: item.glosses.join("；"),
            senses: []
          })),
    enabled
  });
  const words = enabled ? (result.data ?? []) : [];
  return {
    words,
    isFetching:
      open && !!normalized && (debounced !== normalized || result.isFetching),
    isError: enabled && result.isError,
    refetch: result.refetch
  };
}
export function useRelatedWordSenses(
  id?: string,
  publicationId?: string,
  source?: RelatedSuggestionsSource
) {
  return useQuery({
    queryKey: [
      ...(source?.key ?? ["admin-words"]),
      "relation-senses",
      id,
      publicationId
    ],
    queryFn: ({ signal }) =>
      source
        ? source.senses(id!, publicationId, signal)
        : adminWordsDataSource.relatedSenses(id!, {
            publication_id: publicationId,
            signal
          }),
    enabled: !!id,
    retry: false,
    refetchOnWindowFocus: false
  });
}
