export interface RelatedEntrySuggestion {
  entry_id: string;
  publication_id: string;
  label: string;
  glosses: string[];
  sense_count: number;
}
export interface RelatedEntrySuggestions {
  items: RelatedEntrySuggestion[];
}
export interface RelatedEntrySenses {
  entry_id: string;
  publication_id: string;
  senses: { sense_id: string; gloss: string }[];
}
