import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { createLearningTaskEndpoints } from "./learning-tasks";
import { validateRuntimeSchema } from "./runtime-schema";
const id = "0199bd15-8100-7000-8000-000000000001";
const source = {
  entry_id: id,
  publication_id: id,
  pos_id: id,
  sense_id: id,
  definition_id: id,
  form_id: id
};
const candidate = {
  candidate_ref: "source-1",
  source,
  content_fingerprint: "fingerprint",
  spelling: "apple",
  part_of_speech: "n.",
  level: "A1",
  definition: "苹果",
  other_definitions: [],
  accepted_spellings: ["apple"],
  answer_profile: "BrE",
  form_type: "base",
  teaching_eligible: true
};
it("choice capability is explicit and legacy spelling tasks remain valid", async () => {
  const http = {
    get: vi.fn().mockResolvedValue({
      question_types: ["spelling_zh_to_en", "choice_zh_to_en"]
    })
  } as unknown as HttpClient;
  expect(
    (await createLearningTaskEndpoints(http).capabilities()).question_types
  ).toContain("choice_zh_to_en");
  expect(http.get).toHaveBeenCalledWith("/me/learning-capabilities", {
    headers: { "X-TSZ-Learning-Capabilities": "choice-v1,mastery-v1" }
  });
  const task = {
    id,
    name: "拼写",
    task_type: "daily",
    wordlist_ids: [id],
    daily_question_count: 2,
    ends_at: null,
    state: "active",
    revision: 1,
    created_at: "2026-10-28T00:00:00Z"
  };
  expect(validateRuntimeSchema("LearningTask", task).valid).toBe(true);
  expect(
    validateRuntimeSchema("LearningTask", {
      ...task,
      question_type: "choice_zh_to_en"
    }).valid
  ).toBe(true);
});

it("unanswered choice options contain only opaque IDs and spelling; source and answer metadata are rejected", () => {
  const question = {
    id,
    position: 0,
    answered: false,
    content_available: true,
    prompt: { definition: "苹果", part_of_speech: "n." },
    options: [
      { option_id: "o1", spelling: "apple" },
      { option_id: "o2", spelling: "banana" },
      { option_id: "o3", spelling: "pear" },
      { option_id: "o4", spelling: "orange" }
    ],
    feedback: null
  };
  const page = {
    items: [question],
    pagination: { page: 1, page_size: 20, total: 1, total_pages: 1 }
  };
  expect(validateRuntimeSchema("LearningQuestionPage", page).valid).toBe(true);
  for (const extra of [{ correct_option_id: "o1" }, { source }]) {
    expect(
      validateRuntimeSchema("LearningQuestionPage", {
        ...page,
        items: [{ ...question, ...extra }]
      }).valid
    ).toBe(false);
  }
  expect(
    validateRuntimeSchema("LearningQuestionPage", {
      ...page,
      items: [{ ...question, options: [{ ...question.options[0], candidate }] }]
    }).valid
  ).toBe(false);
});
