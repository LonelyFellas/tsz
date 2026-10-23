import { beforeEach, expect, it } from "vitest";
import {
  pendingSaveKey,
  readPendingSave,
  writePendingSave,
  type WordlistSave
} from "./pending-save";
beforeEach(() => localStorage.clear());
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
    rows: [{ itemId: "custom", generateAudio: true }]
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
  localStorage.setItem(key, "broken");
  expect(() => readPendingSave(key)).toThrow();
  expect(localStorage.getItem(key)).toBe("broken");
});
