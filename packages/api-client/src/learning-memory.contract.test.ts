import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { createLearningMemoryEndpoints } from "./learning-memory";
import snapshot from "./openapi.snapshot.json";
it("复习实际请求使用后端登记路径，响应继续严格校验", async () => {
  const post = vi.fn().mockResolvedValue({});
  const get = vi.fn().mockResolvedValue({});
  const api = createLearningMemoryEndpoints({
    post,
    get
  } as unknown as HttpClient);
  await expect(
    api.start({ idempotency_key: "request", mode: "retest", limit: 20 })
  ).rejects.toThrow("复习内容暂时无法读取");
  expect(post).toHaveBeenCalledWith(
    "/me/review-sessions",
    { idempotency_key: "request", mode: "retest", limit: 20 },
    undefined
  );
  await expect(
    api.answer("session", {
      idempotency_key: "same",
      item_id: "item",
      answer: "apple"
    })
  ).rejects.toThrow();
  expect(post).toHaveBeenLastCalledWith(
    "/me/review-sessions/session/answers",
    { idempotency_key: "same", item_id: "item", answer: "apple" },
    undefined
  );
  const paths = snapshot.paths as Record<string, string[]>;
  expect(paths["/me/review-sessions"]).toContain("post");
  expect(paths["/me/review-sessions/{id}/answers"]).toContain("post");
  expect(paths["/me/memory/overview"]).toContain("get");
});
it("复习不可用状态与没有到期项是不同的返回值", async () => {
  const response = {
    available: false,
    enabled: false,
    answer_profile: "BrE",
    due_count: 0,
    relearning_count: 0,
    later_count: 0,
    paused_count: 0,
    unavailable_count: 0,
    server_time: "2026-10-24T00:00:00Z",
    next_day_at: "2026-10-24T20:00:00Z",
    current_session_id: null
  };
  const get = vi.fn().mockResolvedValue(response);
  expect(
    await createLearningMemoryEndpoints({
      get
    } as unknown as HttpClient).overview()
  ).toEqual(response);
});
