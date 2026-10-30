import { it, expect, vi } from "vitest";
import { createLearningPlanEndpoints } from "./learning-plans";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";
import spec from "./openapi.snapshot.json";
const id = "0199bd15-8100-7000-8000-000000000001";
it("new plan operations are declared separately while shared run and answer shapes remain frozen", () => {
  expect(spec.paths["/me/learning-plans"]).toEqual(["get", "post"]);
  expect(spec.paths["/me/learning-plans/{id}/cycles"]).toEqual(["get", "post"]);
  expect(spec.paths["/me/wordlist-library/{space}/selection"]).toEqual([
    "post"
  ]);
  expect(
    validateRuntimeSchema("LearningTask", {
      id,
      name: "任务",
      task_type: "daily",
      wordlist_ids: [id],
      daily_question_count: 10,
      ends_at: null,
      state: "active",
      revision: 1,
      created_at: "2026-10-18T00:00:00Z",
      current_cycle: null
    }).valid
  ).toBe(false);
});
it("plan creation preserves fingerprint, optional schedule and cancellation without falling back to legacy", async () => {
  const http = { post: vi.fn().mockResolvedValue({}) } as unknown as HttpClient;
  const api = createLearningPlanEndpoints(http);
  const controller = new AbortController();
  const data = {
    idempotency_key: id,
    name: "拼写",
    task_type: "daily" as const,
    wordlist_ids: [id],
    daily_question_count: 100,
    schedule: null,
    preview_fingerprint: "abc"
  };
  await expect(api.create(data, { signal: controller.signal })).rejects.toThrow(
    "不符合接口契约"
  );
  expect(http.post).toHaveBeenCalledExactlyOnceWith(
    "/me/learning-plans",
    data,
    {
      signal: controller.signal,
      headers: {
        "X-TSZ-Learning-Capabilities": "choice-v1,wordlist-spelling-v1"
      }
    }
  );
});
