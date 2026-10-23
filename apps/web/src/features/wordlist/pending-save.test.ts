import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WordlistContentItem } from "@tsz/types";
import {
  pendingSaveKey,
  readPendingSave,
  writePendingSave,
  type WordlistSave
} from "./pending-save";
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());
it("isolates pending save payloads by user and target and preserves the complete command", () => {
  const key = pendingSaveKey("one", "list");
  const request: WordlistSave = {
    kind: "update",
    id: "list",
    body: {
      idempotency_key: "same-key",
      expected_revision: 2,
      content: null,
      note_updates: [
        { item_id: "custom", private_note: "保留", expected_note_revision: 1 }
      ],
      audio_generation: { item_ids: ["custom"], expected_cost: "2" }
    }
  };
  const form = {
    name: "原名称",
    rows: [
      { id: "row-custom", entryId: null, itemId: "custom", generateAudio: true }
    ]
  };
  writePendingSave(key, request, form);
  expect(readPendingSave(key)).toEqual({ request, form });
  expect(readPendingSave(pendingSaveKey("two", "list"))).toBeNull();
  expect(readPendingSave(pendingSaveKey("one", "other"))).toBeNull();
  expect(readPendingSave(pendingSaveKey("one"))).toBeNull();
  expect(pendingSaveKey("one", undefined, "folder-a")).not.toBe(
    pendingSaveKey("one", undefined, "folder-b")
  );
});
it("does not discard an unreadable pending operation", () => {
  const key = pendingSaveKey("one");
  sessionStorage.setItem(key, "broken");
  expect(() => readPendingSave(key)).toThrow();
  expect(sessionStorage.getItem(key)).toBe("broken");
});

it("两个预打开标签页分别保留请求，刷新或复制标签页继续使用原请求", () => {
  const key = pendingSaveKey("one");
  const firstTab = sessionStorage;
  const request: WordlistSave = {
    kind: "create",
    body: { idempotency_key: "first", name: "第一份", items: [] }
  };
  const form = { name: "第一份", rows: [] };
  const secondTab = new Map<string, string>();
  // Both editors open before either starts saving.
  expect(readPendingSave(key)).toBeNull();
  writePendingSave(key, request, form);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => secondTab.get(key) ?? null,
    setItem: (key: string, value: string) => secondTab.set(key, value)
  });
  expect(readPendingSave(key)).toBeNull();
  const second = {
    ...request,
    body: { ...request.body, idempotency_key: "second" }
  };
  writePendingSave(key, second, form);
  expect(readPendingSave(key)?.request).toEqual(second);
  vi.stubGlobal("sessionStorage", firstTab);
  expect(readPendingSave(key)).toEqual({ request, form });
  // A duplicated tab receives the original sessionStorage snapshot.
  secondTab.set(key, firstTab.getItem(key)!);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => secondTab.get(key) ?? null
  });
  expect(readPendingSave(key)?.request).toEqual(request);
  expect(localStorage.getItem(key)).toBeNull();
});

it.each(["create", "update", "notes-only"] as const)(
  "4500 项 %s 请求在存储配额内并完整还原冻结表单",
  (kind) => {
    const items: WordlistContentItem[] = Array.from(
      { length: 4500 },
      (_, i) => ({
        item_id: `item-${i}`,
        custom_word: { word: `word ${i}`, definition: "d".repeat(200) },
        author_note: "a".repeat(60)
      })
    );
    const form = {
      name: "大词表",
      rows: items.map((item) => ({
        id: `row-${item.item_id}`,
        entryId: null,
        itemId: item.item_id,
        customWord: item.custom_word,
        text: item.custom_word!.word,
        authorNote: item.author_note,
        note: "private",
        noteRevision: 1,
        generateAudio: true
      })),
      initial:
        kind === "create"
          ? undefined
          : {
              wordlist: {
                id: "list",
                owner_user_id: "one",
                owner_name: "我",
                name: "大词表",
                state: "draft" as const,
                revision: 2,
                item_count: 4500,
                created_at: "",
                updated_at: ""
              },
              entry_ids: [],
              items: items.map(({ item_id, custom_word, author_note }) => ({
                author_note,
                custom_word,
                item_id
              }))
            }
    };
    const request: WordlistSave =
      kind === "create"
        ? {
            kind: "create",
            body: {
              idempotency_key: "large",
              name: form.name,
              items: items.map((item) => ({ ...item, private_note: "private" }))
            }
          }
        : {
            kind: "update",
            id: "list",
            body: {
              idempotency_key: "large",
              expected_revision: 2,
              content:
                kind === "notes-only" ? null : { name: form.name, items },
              note_updates: []
            }
          };
    const key = pendingSaveKey("one", kind === "create" ? undefined : "list");
    writePendingSave(key, request, form);
    const serialized = sessionStorage.getItem(key)!;
    // 5 MiB even when accounting for UTF-16 storage, not just UTF-8 wire bytes.
    expect(serialized.length * 2).toBeLessThan(5 * 1024 * 1024);
    expect(readPendingSave(key)).toEqual(
      JSON.parse(JSON.stringify({ request, form }))
    );
  }
);
