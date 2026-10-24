import { beforeEach, expect, it, vi } from "vitest";
import {
  clearPending,
  clearUserPending,
  readPending,
  savePending
} from "./pending";
beforeEach(() => {
  vi.restoreAllMocks();
  clearUserPending("one");
  clearUserPending("two");
  localStorage.clear();
  vi.useRealTimers();
});
it("待确认答案刷新可恢复，账号之间隔离", () => {
  const input = {
    idempotency_key: "same-request",
    item_id: "item",
    answer: "apple"
  };
  savePending("one", "session", input);
  expect(readPending("one", "session")).toEqual(input);
  expect(readPending("two", "session")).toBeNull();
  savePending("two", "session", input);
  clearUserPending("one");
  expect(readPending("one", "session")).toBeNull();
  expect(readPending("two", "session")).toEqual(input);
});
it("过期或损坏缓存不能继续成为待提交答案", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-24T00:00:00Z"));
  savePending("one", "s", {
    idempotency_key: "request",
    item_id: "item",
    answer: "word"
  });
  vi.advanceTimersByTime(86400001);
  expect(readPending("one", "s")).toBeNull();
  localStorage.setItem("tsz:review-pending:one:s", "broken");
  expect(readPending("one", "s")).toBeNull();
});
it("迟到回执不能删掉另一个标签页的新请求", () => {
  const old = { idempotency_key: "old", item_id: "a", answer: "apple" };
  const next = { idempotency_key: "next", item_id: "b", answer: "bank" };
  savePending("one", "session", old);
  savePending("one", "session", next);
  clearPending("one", "session", old.idempotency_key);
  expect(readPending("one", "session")).toEqual(next);
});
it("localStorage写入失败时仍可提交并在本页恢复", () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  const input = { idempotency_key: "offline", item_id: "a", answer: "apple" };
  expect(() => savePending("one", "s", input)).not.toThrow();
  expect(readPending("one", "s")).toEqual(input);
  clearPending("one", "s", input.idempotency_key);
  expect(readPending("one", "s")).toBeNull();
});
it("最新内存请求不能被之前持久化的旧请求覆盖", () => {
  const old = {
    idempotency_key: "old-persisted",
    item_id: "a",
    answer: "apple"
  };
  const next = { idempotency_key: "new-memory", item_id: "b", answer: "bank" };
  savePending("one", "session", old);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("full", "QuotaExceededError");
  });
  savePending("one", "session", next);
  expect(readPending("one", "session")).toEqual(next);
});
it("新操作会清理已放弃会话的过期答案", () => {
  vi.useFakeTimers();
  savePending("one", "abandoned", {
    idempotency_key: "old",
    item_id: "old",
    answer: "apple"
  });
  vi.advanceTimersByTime(86400001);
  savePending("one", "new", {
    idempotency_key: "new",
    item_id: "new",
    answer: "bank"
  });
  expect(localStorage.getItem("tsz:review-pending:one:abandoned")).toBeNull();
});
