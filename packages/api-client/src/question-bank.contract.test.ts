import { expect, it, vi } from "vitest";
import type { HttpClient } from "./http";
import { createQuestionBankEndpoints } from "./question-bank";
import { createLearningTaskEndpoints } from "./learning-tasks";
import { validateRuntimeSchema } from "./runtime-schema";
import snapshot from "./openapi.snapshot.json";
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

it("generation sends the chosen publication and sense unchanged, and runtime rejects untracked fields", async () => {
  const generation = {
    id,
    state: "queued",
    revision: 1,
    created_by: id,
    question_level: "B1",
    answer_profile: "BrE",
    target: candidate,
    agent_run_id: null,
    question_id: null,
    error_code: null,
    reasons: [],
    created_at: "2026-10-28T00:00:00Z",
    updated_at: "2026-10-28T00:00:00Z"
  };
  const http = {
    post: vi.fn().mockResolvedValue(generation)
  } as unknown as HttpClient;
  const api = createQuestionBankEndpoints(http);
  const input = {
    idempotency_key: id,
    target: {
      candidate_ref: candidate.candidate_ref,
      source,
      answer_profile: "BrE"
    },
    question_level: "B1",
    answer_profile: "BrE"
  };
  const signal = new AbortController().signal;
  expect(await api.generate(input, { signal })).toEqual(generation);
  expect(http.post).toHaveBeenCalledExactlyOnceWith(
    "/question-bank/generations",
    input,
    { signal }
  );
  expect(
    validateRuntimeSchema("QuestionGeneration", {
      ...generation,
      api_key: "unexpected"
    }).valid
  ).toBe(false);
  expect(snapshot.paths["/admin/question-bank/questions/{id}/review"]).toEqual([
    "post"
  ]);
});

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
    headers: { "X-TSZ-Learning-Capabilities": "choice-v1" }
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

it("batch endpoints preserve selections, preview identity, paginated tasks and legacy response shapes", async () => {
  const selection = {
    question_levels: ["A1", "B1"],
    answer_profiles: ["BrE", "AmE"]
  };
  const preview = {
    selection,
    coverage: [
      {
        question_level: "A1",
        answer_profile: "BrE",
        eligible: 90,
        covered: 5,
        generating: 2,
        missing: 83
      }
    ],
    missing: 83,
    preview_token: "current-source-set"
  };
  const batch = {
    id,
    created_by: id,
    preview,
    state: "running",
    total: 83,
    queued: 83,
    running: 0,
    succeeded: 0,
    failed: 0,
    insufficient_candidates: 0,
    cancelled: 0,
    created_at: "2026-10-28T00:00:00Z"
  };
  const pagination = { page: 5, page_size: 20, total: 90, total_pages: 5 };
  const http = {
    get: vi.fn().mockResolvedValue({ items: [candidate], pagination }),
    post: vi.fn().mockResolvedValue(preview)
  } as unknown as HttpClient;
  const api = createQuestionBankEndpoints(http);
  expect(
    (
      await api.candidatePage({
        question_level: "B1",
        answer_profile: "BrE",
        page: 5,
        page_size: 20
      })
    ).pagination.total
  ).toBe(90);
  expect(http.get).toHaveBeenLastCalledWith(
    "/question-bank/candidate-page?question_level=B1&answer_profile=BrE&page=5&page_size=20",
    undefined
  );
  expect(await api.batchPreview(selection)).toEqual(preview);
  expect(http.post).toHaveBeenLastCalledWith(
    "/question-bank/batches/preview",
    selection,
    undefined
  );
  vi.mocked(http.post).mockResolvedValue(batch);
  const input = {
    idempotency_key: id,
    selection,
    preview_token: preview.preview_token
  };
  expect(await api.createBatch(input)).toEqual(batch);
  expect(http.post).toHaveBeenLastCalledWith(
    "/question-bank/batches",
    input,
    undefined
  );
  expect(await api.cancelBatch(id)).toEqual(batch);
  expect(http.post).toHaveBeenLastCalledWith(
    `/question-bank/batches/${id}/cancel`,
    undefined,
    undefined
  );
  expect(
    validateRuntimeSchema("QuestionBatch", { ...batch, total: "83" }).valid
  ).toBe(false);
  expect(
    validateRuntimeSchema("QuestionBatch", { ...batch, untracked: true }).valid
  ).toBe(false);
  expect(
    validateRuntimeSchema("QuestionCandidatePage", {
      contract_version: 1,
      items: [candidate]
    }).valid
  ).toBe(true);
  vi.mocked(http.get).mockResolvedValue({ items: [], pagination });
  await api.batchItems(id, { page: 5, state: "failed" });
  expect(http.get).toHaveBeenLastCalledWith(
    `/question-bank/batches/${id}/items?page=5&state=failed`,
    undefined
  );
});

it("workbench reads use separate strict schemas and candidate search preserves published-source filters", async () => {
  const content = {
    target: candidate,
    prompt: "苹果",
    question_level: "B1",
    answer_profile: "BrE",
    options: ["A", "B", "C", "D"].map((option_id) => ({
      option_id,
      candidate,
      explanation: "核查理由"
    })),
    correct_option_id: "A",
    explanation: "答后解析",
    concerns: []
  };
  const question = {
    id,
    generation_id: id,
    revision: 2,
    state: "draft",
    content,
    original_content: content,
    created_by: id,
    reviewed_by: null,
    review_comment: "",
    created_at: "2026-10-29T00:00:00Z",
    updated_at: "2026-10-29T00:00:00Z"
  };
  const page = {
    items: [
      {
        id,
        revision: 2,
        state: "draft",
        created_by: id,
        spelling: "apple",
        part_of_speech: "n.",
        definition: "苹果",
        prompt: "苹果",
        question_level: "B1",
        answer_profile: "BrE",
        options: [{ option_id: "A", spelling: "apple" }],
        correct_option_id: "A",
        source_current: false,
        has_concerns: false,
        updated_at: "2026-10-29T00:00:00Z"
      }
    ],
    pagination: { page: 5, page_size: 20, total: 90, total_pages: 5 },
    counts: { draft: 88, approved: 2, rejected: 0, disabled: 0 }
  };
  const inspection = {
    question,
    target_current: true,
    semantic_review: {
      verdict: "needs_revision",
      issues: ["其他选项也能匹配题干"]
    },
    semantic_review_current: true,
    sources: [{ option_id: "A", current: true }]
  };
  const http = {
    get: vi.fn().mockResolvedValueOnce(page).mockResolvedValueOnce(inspection),
    post: vi.fn().mockResolvedValue({
      items: [candidate],
      pagination: { page: 1, page_size: 10, total: 1, total_pages: 1 }
    })
  } as unknown as HttpClient;
  const api = createQuestionBankEndpoints(http);
  const signal = new AbortController().signal;
  expect(
    await api.workbench(
      {
        query: "银行 bank",
        state: "draft",
        question_level: "B1",
        answer_profile: "BrE",
        page: 5,
        page_size: 20
      },
      { signal }
    )
  ).toEqual(page);
  expect(http.get).toHaveBeenNthCalledWith(
    1,
    "/question-bank/questions/workbench?query=%E9%93%B6%E8%A1%8C+bank&state=draft&question_level=B1&answer_profile=BrE&page=5&page_size=20",
    { signal }
  );
  expect(await api.inspect(id, { signal })).toEqual(inspection);
  expect(http.get).toHaveBeenNthCalledWith(
    2,
    `/question-bank/questions/${id}/inspection`,
    { signal }
  );
  expect(
    validateRuntimeSchema("QuestionWorkbenchPage", {
      ...page,
      original_content: content
    }).valid
  ).toBe(false);
  expect(
    validateRuntimeSchema("QuestionInspection", {
      ...inspection,
      target_current: null
    }).valid
  ).toBe(false);
  expect(validateRuntimeSchema("QuestionInspection", inspection).valid).toBe(
    true
  );
  expect(
    validateRuntimeSchema("QuestionInspection", {
      ...inspection,
      semantic_review: null,
      semantic_review_current: false
    }).valid
  ).toBe(true);
  expect(
    validateRuntimeSchema("QuestionInspection", {
      ...inspection,
      semantic_review: { verdict: "guaranteed_unique", issues: [] }
    }).valid
  ).toBe(false);
  const search = {
    question_level: "B1",
    answer_profile: "BrE",
    page: 1,
    page_size: 10,
    part_of_speech: "n.",
    exclude_entry_ids: [id],
    exclude_spellings: ["colour", "color"],
    excluded_definition: "颜色",
    target_spelling: "colour",
    editable_only: false
  };
  await api.searchCandidates(search, { signal });
  expect(http.post).toHaveBeenCalledExactlyOnceWith(
    "/question-bank/candidate-search",
    search,
    { signal }
  );
  expect(snapshot.paths["/admin/question-bank/questions/workbench"]).toEqual([
    "get"
  ]);
});
