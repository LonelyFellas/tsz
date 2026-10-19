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
export function useRelatedSuggestions(
  q: string,
  open: boolean,
  excludeEntryId?: string
) {
  const normalized = q.trim();
  const [debounced, setDebounced] = useState(normalized);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(normalized), 250);
    return () => clearTimeout(timer);
  }, [normalized]);
  const enabled = open && !!normalized && debounced === normalized;
  const result = useQuery({
    queryKey: ["admin-words", "related-suggestions", debounced, excludeEntryId],
    queryFn: ({ signal }) =>
      adminWordsDataSource.relatedSuggestions(debounced, {
        exclude_entry_id: excludeEntryId,
        signal
      }),
    enabled
  });
  const words: RelatedWordChoice[] = enabled
    ? (result.data?.items ?? []).map((item) => ({
        word_id: item.entry_id,
        headword: item.label,
        matchedHeadword: item.label,
        status: "published",
        publicationId: item.publication_id,
        senseCount: item.sense_count,
        preview: item.glosses.join("；"),
        senses: []
      }))
    : [];
  return {
    words,
    isFetching:
      open && !!normalized && (debounced !== normalized || result.isFetching),
    isError: enabled && result.isError,
    refetch: result.refetch
  };
}
export function useRelatedWordSenses(id?: string, publicationId?: string) {
  return useQuery({
    queryKey: ["admin-words", "relation-senses", id, publicationId],
    queryFn: ({ signal }) =>
      adminWordsDataSource.relatedSenses(id!, {
        publication_id: publicationId,
        signal
      }),
    enabled: !!id,
    retry: false,
    refetchOnWindowFocus: false
  });
}
