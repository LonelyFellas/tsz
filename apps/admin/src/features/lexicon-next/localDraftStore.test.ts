import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  NextLocalDraftKey,
  NextLocalDraftSnapshot
} from "./localDraftStore";
import {
  clearNextLocalDraft,
  readNextLocalDraft,
  writeNextLocalDraft
} from "./localDraftStore";

const dbName = "tsz-admin-drafts";
const storeName = "lexicon-next";
const entryId = "00000000-0000-4000-8000-000000000001";
const editorId = "00000000-0000-4000-8000-000000000002";
const otherEditorId = "00000000-0000-4000-8000-000000000003";

const key = (account_id: string): NextLocalDraftKey => ({
  account_id,
  entry_id: entryId,
  target_locale: "en-GB",
  medium_locale: "zh-Hans"
});

function snapshot(account_id: string): NextLocalDraftSnapshot {
  return {
    snapshot_version: 1,
    account_id,
    entry_id: entryId,
    target_locale: "en-GB",
    medium_locale: "zh-Hans",
    base_revision: 1,
    draft_schema_version: 1,
    draft: {
      schema_version: 1,
      headword: "centre",
      forms: [],
      senses: []
    },
    edited_pairs: {},
    sentence_resources: [],
    updated_at: "2026-11-18T00:00:00.000Z"
  };
}

function storageKey(value: NextLocalDraftKey) {
  return [
    value.account_id,
    value.entry_id,
    value.target_locale,
    value.medium_locale
  ].join(":");
}

async function resetDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => resolve();
  });
}

async function putRaw(keyValue: string, value: unknown) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName);
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value, keyValue);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error);
    };
  });
}

async function readRaw(keyValue: string) {
  return await new Promise<unknown>((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const read = database
        .transaction(storeName, "readonly")
        .objectStore(storeName)
        .get(keyValue);
      read.onsuccess = () => {
        database.close();
        resolve(read.result);
      };
      read.onerror = () => reject(read.error);
    };
  });
}

describe("localDraftStore", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("round-trips a dialect pair snapshot through IndexedDB", async () => {
    const value = snapshot(editorId);
    value.edited_pairs = {
      "sense-1": {
        sense_id: "sense-1",
        usage: "en-GB",
        paired: true,
        no_equivalent: false,
        note: "",
        target: {
          entry_id: "peer",
          sense_id: "peer-sense",
          revision: 4,
          headword: "colour",
          gloss: "颜色",
          part_of_speech: "noun"
        }
      }
    };

    await writeNextLocalDraft(key(editorId), value);

    await expect(readNextLocalDraft(key(editorId))).resolves.toEqual(value);
  });

  it("deletes one account snapshot while preserving another account", async () => {
    const editorKey = key(editorId);
    const otherKey = key(otherEditorId);
    const editorSnapshot = snapshot(editorKey.account_id);
    const otherSnapshot = snapshot(otherKey.account_id);
    await writeNextLocalDraft(editorKey, editorSnapshot);
    await writeNextLocalDraft(otherKey, otherSnapshot);

    await clearNextLocalDraft(editorKey);

    await expect(readNextLocalDraft(editorKey)).resolves.toBeUndefined();
    await expect(readNextLocalDraft(otherKey)).resolves.toEqual(otherSnapshot);
  });

  it("removes an invalid snapshot after reading it", async () => {
    const draftKey = key("editor");
    await putRaw(storageKey(draftKey), {
      ...snapshot(draftKey.account_id),
      draft_schema_version: 99
    });

    await expect(readNextLocalDraft(draftKey)).resolves.toBeUndefined();
    await expect(readRaw(storageKey(draftKey))).resolves.toBeUndefined();
  });
});
