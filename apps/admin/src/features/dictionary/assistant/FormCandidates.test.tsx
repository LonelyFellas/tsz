import { App, ConfigProvider } from "antd";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type {
  LexiconFormCandidatesInput,
  LexiconFormCandidatesResponse
} from "@tsz/types";
import { partOfSpeechCatalogFixture as catalog } from "../word-creation/partOfSpeech.test.helper";
import { FormCandidates } from "./FormCandidates";
import { applyFormsStructure } from "../word-creation-v3/sharedFormsModel";
import { formsFixture, commonFormFixture } from "../word-creation-v3/fixtures";
import type { AssistantEditorContext } from "./context";

const request = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", () => ({
  api: { lexiconAssistant: { formCandidates: request } }
}));
function context(): AssistantEditorContext {
  const forms = { forms_format: "shared_v1" as const, contents: [], pos: [] };
  const meanings = { sense_groups: [], pos: [] };
  return {
    word: {
      schema_version: 3,
      id: "00000000-0000-4000-8000-000000000001",
      language: "en",
      kind: "word",
      status: "draft",
      revision: 1,
      lifecycle_revision: 1,
      annotation: null,
      annotation_revision: 1,
      has_unpublished_changes: true,
      presentation: {
        label: "bank",
        matched_surfaces: ["bank"],
        strategy_version: "v3"
      },
      capabilities: {
        publication: { mode: "native" },
        pronunciation_normalization_version: "nfkc_trim_lower_v1"
      },
      forms: { pos: [] },
      meanings,
      completed_steps: ["basics"],
      max_reachable_step: "forms",
      created_by: "admin-1",
      created_at: "2026-10-31T00:00:00Z",
      updated_at: "2026-10-31T00:00:00Z"
    },
    forms,
    meanings,
    step: "forms",
    dirtySteps: { forms: false, meanings: true },
    progress: [],
    catalog,
    applyForms: vi.fn(() => true)
  };
}
function response(
  input: LexiconFormCandidatesInput
): LexiconFormCandidatesResponse {
  return {
    entry_id: input.entry_id,
    base_revision: input.base_revision,
    context_id: input.context_id,
    catalog_version: input.catalog_version,
    headword: input.headword,
    pos: [
      {
        pos: "noun",
        forms: [
          {
            form_type: "base",
            is_regular: true,
            uk: { spelling: "bank", dict_phonetic: "/bæŋk/" },
            us: { spelling: "bank", dict_phonetic: "/bæŋk/" }
          }
        ]
      }
    ],
    notes: [],
    usage: {
      model: "fixture-model",
      model_calls: 1,
      tool_calls: 0,
      input_tokens: 10,
      output_tokens: 20
    },
    requires_human_review: true
  };
}
function surface(value: AssistantEditorContext) {
  return (
    <ConfigProvider>
      <App>
        <FormCandidates
          context={value}
          disabled={false}
          onBusyChange={() => {}}
        />
      </App>
    </ConfigProvider>
  );
}
beforeEach(() => {
  request
    .mockReset()
    .mockImplementation(async (input: LexiconFormCandidatesInput) =>
      response(input)
    );
});

it("生成只进入预览，明确点击后才应用到当前本地草稿", async () => {
  const value = context();
  value.word.presentation.label = "bank · 区分标注";
  value.forms = applyFormsStructure(
    value.forms,
    formsFixture({
      forms: [commonFormFixture({ spelling: "", pronunciations: [] })]
    })
  );
  const before = structuredClone(value.forms);
  render(surface(value));
  fireEvent.click(screen.getByRole("button", { name: /生成词性与发音候选/ }));
  const apply = await screen.findByRole("button", { name: /导入当前草稿/ });
  await waitFor(() => expect(apply).toBeEnabled());
  expect(value.applyForms).not.toHaveBeenCalled();
  expect(request.mock.calls[0]![0]).toMatchObject({
    headword: "bank",
    catalog_version: catalog.catalog_version,
    base_revision: 1
  });
  expect(screen.getByText("AI 候选需人工核对")).toBeInTheDocument();
  fireEvent.click(apply);
  expect(value.applyForms).toHaveBeenCalledWith(
    expect.objectContaining({
      forms_format: "shared_v1",
      pos: expect.any(Array)
    }),
    JSON.stringify(value.forms)
  );
  expect(value.forms).toEqual(before);
});

it("预览期间草稿变化或只读后拒绝旧候选导入", async () => {
  const value = context();
  const view = render(surface(value));
  fireEvent.click(screen.getByRole("button", { name: /生成词性与发音候选/ }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: /导入当前草稿/ })).toBeEnabled()
  );
  view.rerender(surface({ ...value, word: { ...value.word, revision: 2 } }));
  expect(
    screen.getByText("当前草稿或词性目录已变化，请重新生成候选")
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /导入当前草稿/ })).toBeDisabled();
  view.rerender(surface({ ...value, applyForms: undefined }));
  expect(screen.getByRole("button", { name: /导入当前草稿/ })).toBeDisabled();
  expect(value.applyForms).not.toHaveBeenCalled();
});

it("取消在途生成后忽略迟到结果并保留草稿", async () => {
  let resolve!: (value: LexiconFormCandidatesResponse) => void;
  request.mockImplementationOnce(
    () =>
      new Promise((done) => {
        resolve = done;
      })
  );
  const value = context();
  render(surface(value));
  fireEvent.click(screen.getByRole("button", { name: /生成词性与发音候选/ }));
  fireEvent.click(await screen.findByRole("button", { name: "取消" }));
  const call = request.mock.calls[0]!;
  expect((call[1] as AbortSignal).aborted).toBe(true);
  await act(async () => resolve(response(call[0])));
  expect(screen.queryAllByText("/bæŋk/")).toHaveLength(0);
  expect(value.applyForms).not.toHaveBeenCalled();
  expect(value.forms.pos).toHaveLength(0);
});
