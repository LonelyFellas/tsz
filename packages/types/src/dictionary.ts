import type { WordlistEntry, WordlistText, WordlistPage } from "./wordlists";
import type { RichTextV3 } from "./admin-word-v3";

export interface DictionaryAudio {
  target_id: string;
  asset_id: string;
  locale: string;
  accent_group?: "uk" | "us" | "other";
}
export interface DictionaryExample {
  id: string;
  sense_id: string;
  texts: WordlistText[];
  translation: RichTextV3;
}
export interface DictionaryEntry {
  content: WordlistEntry;
  audio: DictionaryAudio[];
  examples: DictionaryExample[];
}
export interface DictionaryPage {
  items: DictionaryEntry[];
  pagination: WordlistPage["pagination"];
}
export interface DictionaryAudioUrl {
  url: string;
  expires_at: string;
  url_expires_in_seconds: number;
}
