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
      headers: { "X-TSZ-Learning-Capabilities": "choice-v1,mastery-v1" }
    }
  );
});

it("source refresh uses the cycle protocol with typed recovery counts", async () => {
  const value = {
    source_refresh: {
      refreshed_count: 3,
      changed_content_count: 1,
      unavailable_count: 1
    },
    preview: {
      entry_count: 3,
      eligible_count: 3,
      custom_word_count: 0,
      exclusions: {
        unavailable_entries: 0,
        context_dependent: 0,
        no_chinese_definition: 0,
        no_base_form: 0,
        answer_in_prompt: 0
      },
      settings: { cefr_level: "A1", english_variant: "BrE" },
      estimated_learning_days: null,
      available_learning_days: null,
      can_create: true,
      reasons: [],
      preview_fingerprint: "refresh-fingerprint",
      server_time: "2026-10-30T00:00:00Z",
      business_day: "2026-10-30",
      timezone: "Asia/Shanghai"
    },
    earliest_day: "2026-10-30",
    previous_covered_count: 1,
    previous_total_count: 4,
    previous_blocked_count: 3
  };
  const http = {
    post: vi.fn().mockResolvedValue(value)
  } as unknown as HttpClient;
  const api = createLearningPlanEndpoints(http);
  const request = {
    operation: "refresh_sources" as const,
    after_cycle_id: id,
    expected_revision: 3
  };
  const response = await api.cyclePreview(id, request);
  expect(response.source_refresh).toEqual(value.source_refresh);
  expect(http.post).toHaveBeenCalledWith(
    `/me/learning-plans/${id}/cycles/preview`,
    request,
    { headers: { "X-TSZ-Learning-Capabilities": "choice-v1,mastery-v1" } }
  );
  expect(
    validateRuntimeSchema("LearningCyclePreview", {
      ...value,
      source_refresh: { ...value.source_refresh, changed_content_count: "1" }
    }).valid
  ).toBe(false);
});
