import type { Wordlist, WordlistPage } from "./wordlists";
export type LibrarySpace = "owned" | "favorites";
export interface LibraryCrumb {
  id: string;
  name: string;
}
export interface LibraryItem {
  id: string;
  parent_id: string | null;
  wordlist_id: string | null;
  name: string;
  revision: number;
  trashed_at: string | null;
  path: LibraryCrumb[];
  wordlist: Wordlist | null;
}
export interface LibraryPage {
  version: string;
  ancestors: LibraryCrumb[];
  items: LibraryItem[];
  pagination: WordlistPage["pagination"];
}
export interface LibraryQuery {
  wordlist_id?: string;
  parent_id?: string;
  trash?: boolean;
  folders_only?: boolean;
  q?: string;
  page?: number;
  page_size?: number;
}
export interface LibraryFolderInput {
  expected_version: string;
  parent_id: string | null;
  name: string;
}
export interface LibraryRename {
  expected_version: string;
  name: string;
}
export type LibraryAction = "move" | "trash" | "restore" | "purge";
export interface LibraryOperation {
  expected_version: string;
  action: LibraryAction;
  ids: string[];
  target_id?: string | null;
  original_location?: boolean;
  empty_trash?: boolean;
}
export interface LibraryImpact {
  version: string;
  folder_count: number;
  wordlist_count: number;
}
export interface LibrarySelectionInput {
  expected_version: string;
  node_ids: string[];
}
export interface LibrarySelection {
  version: string;
  wordlists: Wordlist[];
}
