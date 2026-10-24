import { beforeEach, expect, it, vi } from "vitest";
import { clearUserPending, readPending, savePending } from "./pending";
beforeEach(() => {
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
