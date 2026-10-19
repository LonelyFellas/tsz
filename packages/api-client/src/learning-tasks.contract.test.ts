import { describe, expect, it, vi } from "vitest";
import { createLearningTaskEndpoints } from "./learning-tasks";
import { validateRuntimeSchema } from "./runtime-schema";
import type { HttpClient } from "./http";
const id = "0199bd15-8100-7000-8000-000000000001";
const task = {
  id,
  name: "任务",
  task_type: "daily",
  wordlist_ids: [id],
  daily_question_count: 2,
  ends_at: null,
  state: "active",
  revision: 1,
  created_at: "2026-10-07T00:00:00Z"
};
describe("learning wire contract", () => {
  it("validates actual business dates and rejects invented reward fields", () => {
    const detail = {
      task,
      server_time: "2026-10-07T00:00:00Z",
      business_day: "2026-10-07",
      timezone: "Asia/Shanghai",
      current_run: null
    };
    expect(validateRuntimeSchema("LearningTaskDetail", detail).valid).toBe(
      true
    );
    expect(
      validateRuntimeSchema("LearningTaskDetail", {
        ...detail,
        business_day: "2026-02-30"
      }).valid
    ).toBe(false);
    expect(
      validateRuntimeSchema("LearningTaskDetail", {
        ...detail,
        business_day: "2028-02-29"
      }).valid
    ).toBe(true);
    expect(
      validateRuntimeSchema("LearningTask", { ...task, coins_earned: 10 }).valid
    ).toBe(false);
  });
  it("preserves answer intent and abort signal and rejects unexpected answer snapshot", async () => {
    const http = {
      post: vi.fn().mockResolvedValue({ answer_snapshot: ["apple"] })
    } as unknown as HttpClient;
    const api = createLearningTaskEndpoints(http);
    const controller = new AbortController();
    const data = { idempotency_key: id, question_id: id, answer: "wrong" };
    await expect(
      api.answer(id, data, { signal: controller.signal })
    ).rejects.toThrow("学习响应不符合接口契约");
    expect(http.post).toHaveBeenCalledWith(
      `/me/learning-runs/${id}/answers`,
      data,
      { signal: controller.signal }
    );
  });
  it("never accepts answers on unanswered question DTO", () => {
    const page = {
      items: [
        {
          id,
          position: 0,
          answered: false,
          content_available: true,
          prompt: { definition: "苹果", part_of_speech: "noun" },
          feedback: null
        }
      ],
      pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
    };
    expect(validateRuntimeSchema("LearningQuestionPage", page).valid).toBe(
      true
    );
    expect(
      validateRuntimeSchema("LearningQuestionPage", {
        ...page,
        items: [{ ...page.items[0], answer_snapshot: { answers: ["apple"] } }]
      }).valid
    ).toBe(false);
  });
});
