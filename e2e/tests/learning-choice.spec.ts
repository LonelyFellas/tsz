import { expect, test } from "@playwright/test";
import type {
  LearningQuestion,
  LearningRun,
  SubmitLearningAnswer
} from "@tsz/types";
import { mockApi } from "./support/mockApi";

const runId = "00000000-0000-4000-8000-000000000010";
const taskId = "00000000-0000-4000-8000-000000000011";
const questionId = "00000000-0000-4000-8000-000000000012";
const secondId = "00000000-0000-4000-8000-000000000013";
const answerId = "00000000-0000-4000-8000-000000000014";
const now = "2026-10-28T00:00:00Z";

test("单选题明确提交，刷新保留选项顺序、服务端反馈和下一题进度", async ({
  page
}) => {
  await mockApi(page, { authenticated: true });
  let answered = false;
  const submissions: SubmitLearningAnswer[] = [];
  const run = (): LearningRun => ({
    id: runId,
    task_id: taskId,
    task_type: "longterm",
    state: "active",
    question_type: "choice_zh_to_en",
    task_revision: 1,
    business_day: null,
    expires_at: null,
    started_at: now,
    server_time: now,
    settings: { cefr_level: "A1", english_variant: "BrE" },
    target_count: 2,
    answered_count: answered ? 1 : 0,
    correct_count: answered ? 1 : 0,
    generation_version: "choice-v1",
    grading_version: "choice-v1",
    completion_id: null
  });
  const question = (): LearningQuestion => ({
    id: questionId,
    position: 0,
    answered,
    content_available: true,
    prompt: { definition: "苹果", part_of_speech: "n." },
    options: [
      { option_id: "q1-banana", spelling: "banana" },
      { option_id: "q1-apple", spelling: "apple" },
      { option_id: "q1-pear", spelling: "pear" },
      { option_id: "q1-orange", spelling: "orange" }
    ],
    feedback: answered
      ? {
          answer_id: answerId,
          submitted_answer: "q1-apple",
          is_correct: true,
          accepted_at: now,
          accepted_answers: ["apple"],
          correct_option_id: "q1-apple",
          explanation: "apple 表示苹果。"
        }
      : null
  });
  const second: LearningQuestion = {
    id: secondId,
    position: 1,
    answered: false,
    content_available: true,
    prompt: { definition: "香蕉", part_of_speech: "n." },
    options: [
      { option_id: "q2-pear", spelling: "pear" },
      { option_id: "q2-orange", spelling: "orange" },
      { option_id: "q2-apple", spelling: "apple" },
      { option_id: "q2-banana", spelling: "banana" }
    ],
    feedback: null
  };
  await page.route(`**/api/v1/me/learning-runs/${runId}**`, async (route) => {
    expect(route.request().headers()["x-tsz-learning-capabilities"]).toBe(
      "choice-v1"
    );
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/questions"))
      return route.fulfill({
        json: {
          items: [question(), second],
          pagination: { page: 1, page_size: 20, total: 2, total_pages: 1 }
        }
      });
    if (path.endsWith("/answers")) {
      const input = route.request().postDataJSON() as SubmitLearningAnswer;
      submissions.push(input);
      expect(input.answer).toBe("q1-apple");
      expect(input.question_id).toBe(questionId);
      answered = true;
      return route.fulfill({
        json: {
          answer_id: answerId,
          question_id: questionId,
          is_correct: true,
          accepted_at: now,
          run: run(),
          question: question()
        }
      });
    }
    return route.fulfill({ json: run() });
  });
  await page.goto(`/student/practice/${runId}`);
  const options = page.getByRole("radio");
  await expect(options).toHaveCount(4);
  const firstOrder = await options.evaluateAll((nodes) =>
    nodes.map((node) => (node as HTMLInputElement).value)
  );
  await page.reload();
  await expect(options).toHaveCount(4);
  expect(
    await options.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).value)
    )
  ).toEqual(firstOrder);
  await page.getByRole("radio", { name: "banana", exact: true }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "apple", exact: true })
  ).toBeChecked();
  expect(submissions).toHaveLength(0);
  await expect(page.getByText("apple 表示苹果。")).toHaveCount(0);
  await page.getByRole("button", { name: "提交答案", exact: true }).click();
  await expect(page.getByText("apple 表示苹果。")).toBeVisible();
  expect(submissions).toHaveLength(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: /第 2 题/ })).toBeVisible();
  await expect(page.getByText("apple 表示苹果。")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "提交答案", exact: true })
  ).toBeDisabled();
  expect(submissions).toHaveLength(1);
});
