import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { isSharedForms } from "@tsz/shared";
import type { NextPublication } from "@tsz/types";
import {
  commonFormFixture,
  formsFixture
} from "@/features/dictionary/word-creation-v3/fixtures";
import { applyFormsStructure } from "@/features/dictionary/word-creation-v3/sharedFormsModel";
import { partOfSpeechCatalogFixture } from "@/features/dictionary/word-creation/partOfSpeech.test.helper";
import { AssessmentReview } from "./AssessmentReview";

it("已发布同名原形在各自词性和变化组内核对出题资格", async () => {
  const pos = ["noun", "verb"].flatMap(
    (code, i) =>
      formsFixture({
        pos: code,
        pos_id: code,
        forms: [commonFormFixture({ id: "form-" + i, spelling: "fish" })]
      }).pos
  );
  const editor = applyFormsStructure(
    { forms_format: "shared_v1", contents: [], pos: [] },
    { pos }
  );
  if (!isSharedForms(editor)) throw new Error("expected shared fixture");
  const publication: NextPublication = {
    id: "publication",
    entry_id: "entry",
    revision: 2,
    lifecycle_revision: 2,
    published_at: "2026-11-26T00:00:00Z",
    published_by_admin_id: "editor",
    snapshot: {
      sentence_resources: [],
      relation_targets: [],
      draft: {
        schema_version: 1,
        headword: "fish",
        senses: [],
        forms: [],
        form_editor: editor,
        form_question_eligibility: [{ form_id: "form-1", eligible: false }]
      }
    }
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AssessmentReview
        publication={publication}
        catalog={partOfSpeechCatalogFixture}
        lifecycle={2}
        requests={{
          assessment: vi.fn().mockResolvedValue({
            publication_id: "publication",
            version: 0,
            lifecycle_revision: 2,
            approved: false
          }),
          reviewAssessment: vi.fn()
        }}
        onRefresh={vi.fn()}
      />
    </QueryClientProvider>
  );
  for (const [label, status] of [
    ["名词", "参与出题"],
    ["动词", "不参与出题"]
  ] as const) {
    const part = screen.getByRole("region", { name: label });
    const group = within(part).getByRole("region", { name: /第 1 组/ });
    expect(within(group).getByText("fish")).toBeVisible();
    expect(within(group).getByText(status)).toBeVisible();
  }
  expect(await screen.findByText("未获测评资格")).toBeVisible();
});
