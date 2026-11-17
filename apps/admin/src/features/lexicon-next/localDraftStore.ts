import type { NextDialectSense, NextDraft, NextSentence } from "@tsz/types";
import { validateRuntimeSchema } from "@tsz/api-client";

export const NEXT_LOCAL_DRAFT_SCHEMA_VERSION = 1;

export interface NextLocalDraftSnapshot {
  snapshot_version: 1;
  account_id: string;
  entry_id: string;
  target_locale: string;
  medium_locale: string;
  base_revision: number;
  draft_schema_version: 1;
  draft: NextDraft;
  edited_pairs: Record<string, NextDialectSense>;
  sentence_resources: NextSentence[];
  updated_at: string;
}

export interface NextLocalDraftKey {
  account_id: string;
  entry_id: string;
  target_locale: string;
  medium_locale: string;
}

const DB_NAME = "tsz-admin-drafts";
const STORE_NAME = "lexicon-next";
const DB_VERSION = 1;

function isValidSnapshot(
  key: NextLocalDraftKey,
  value: unknown
): value is NextLocalDraftSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<NextLocalDraftSnapshot>;
  if (
    snapshot.snapshot_version !== 1 ||
    snapshot.draft_schema_version !== NEXT_LOCAL_DRAFT_SCHEMA_VERSION ||
    snapshot.account_id !== key.account_id ||
    snapshot.entry_id !== key.entry_id ||
    snapshot.target_locale !== key.target_locale ||
    snapshot.medium_locale !== key.medium_locale ||
    typeof snapshot.base_revision !== "number" ||
    !Number.isInteger(snapshot.base_revision) ||
    snapshot.base_revision < 1 ||
    typeof snapshot.updated_at !== "string" ||
    !Array.isArray(snapshot.sentence_resources) ||
    !snapshot.sentence_resources.every(isValidSentenceResource) ||
    !snapshot.edited_pairs ||
    typeof snapshot.edited_pairs !== "object" ||
    !Object.values(snapshot.edited_pairs).every(isValidDialectSense)
  )
    return false;
  return validateRuntimeSchema("NextEntry", {
    id: snapshot.entry_id,
    target_language: "en",
    kind: "word",
    owner_id: snapshot.account_id,
    revision: snapshot.base_revision,
    updated_at: snapshot.updated_at,
    draft: snapshot.draft
  }).valid;
}

function isValidDialectSense(value: unknown): value is NextDialectSense {
  if (!value || typeof value !== "object") return false;
  const sense = value as Partial<NextDialectSense>;
  const target = sense.target;
  return (
    typeof sense.sense_id === "string" &&
    (sense.usage === "general" ||
      sense.usage === "en-GB" ||
      sense.usage === "en-US") &&
    typeof sense.no_equivalent === "boolean" &&
    typeof sense.note === "string" &&
    typeof sense.paired === "boolean" &&
    (target === null ||
      (!!target &&
        typeof target.entry_id === "string" &&
        typeof target.sense_id === "string" &&
        typeof target.revision === "number" &&
        Number.isInteger(target.revision) &&
        typeof target.headword === "string" &&
        (target.part_of_speech === null ||
          typeof target.part_of_speech === "string") &&
        typeof target.gloss === "string"))
  );
}

function isValidSentenceResource(value: unknown): value is NextSentence {
  if (!value || typeof value !== "object") return false;
  const resource = value as Partial<NextSentence>;
  if (
    typeof resource.revision !== "number" ||
    !Number.isInteger(resource.revision) ||
    resource.revision < 0 ||
    typeof resource.updated_at !== "string"
  )
    return false;
  return validateRuntimeSchema("NextSentence", {
    ...resource,
    revision: Math.max(1, resource.revision),
    updated_at: resource.updated_at || "1970-01-01T00:00:00.000Z"
  }).valid;
}

function storageKey(key: NextLocalDraftKey) {
  return [
    key.account_id,
    key.entry_id,
    key.target_locale,
    key.medium_locale
  ].join(":");
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined")
    return Promise.reject(new Error("indexedDB unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("indexedDB open failed"));
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
) {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = operation(
        database.transaction(STORE_NAME, mode).objectStore(STORE_NAME)
      );
      request.onerror = () =>
        reject(request.error ?? new Error("indexedDB request failed"));
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    database.close();
  }
}

export async function readNextLocalDraft(key: NextLocalDraftKey) {
  const snapshot = await withStore<unknown>("readonly", (store) =>
    store.get(storageKey(key))
  );
  if (snapshot === undefined || isValidSnapshot(key, snapshot))
    return snapshot as NextLocalDraftSnapshot | undefined;
  await clearNextLocalDraft(key);
  return undefined;
}

export async function writeNextLocalDraft(
  key: NextLocalDraftKey,
  snapshot: NextLocalDraftSnapshot
) {
  await withStore<IDBValidKey>("readwrite", (store) =>
    store.put(snapshot, storageKey(key))
  );
}

export async function clearNextLocalDraft(key: NextLocalDraftKey) {
  await withStore<undefined>("readwrite", (store) =>
    store.delete(storageKey(key))
  );
}
