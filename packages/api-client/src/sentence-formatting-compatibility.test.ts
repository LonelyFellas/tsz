import { afterEach, expect, it, vi } from "vitest";
import currentSchemas from "./admin-word-v3.runtime-schema.json";
import legacy from "./fixtures/pre-sentence-formatting-annotations.json";

afterEach(() => {
  vi.doUnmock("./admin-word-v3.runtime-schema.json");
  vi.resetModules();
});

it("the pre-formatting strict reader accepts the legacy sentence view and the existing refresh validation code", async () => {
  vi.resetModules();
  vi.doMock("./admin-word-v3.runtime-schema.json", () => ({
    default: {
      ...currentSchemas,
      $defs: { ...currentSchemas.$defs, ...legacy.$defs }
    }
  }));
  const { validateRuntimeSchema } = await import("./runtime-schema");
  const id = "00000000-0000-4000-8000-000000000001";
  const value = {
    version: 2,
    text: "a harbour",
    annotations: [
      { type: "italic", start: 2, end: 9 },
      { type: "bold", start: 2, end: 9 },
      { type: "underline", start: 2, end: 9 },
      { type: "pause", at: 1, duration_ms: 250 }
    ]
  };
  const sentence = {
    id,
    revision: 1,
    lifecycle_revision: 1,
    view: "draft",
    content: {
      sentence: {
        id,
        level: "B1",
        en_text: { mode: "unified", common: { id, origin: "manual", value } },
        zh_text_id: id,
        zh_text: { version: 2, text: "港口", annotations: [] },
        zh_translations: [
          {
            id,
            band: "balanced_fluency",
            language: "zh",
            content: { version: 2, text: "港口", annotations: [] }
          }
        ],
        links: []
      },
      annotations: []
    },
    entries: [],
    created_by: "测试管理员",
    created_by_admin_id: id,
    created_at: "2026-09-12T10:00:00Z",
    updated_at: "2026-09-12T10:00:00Z"
  };
  expect(validateRuntimeSchema("SharedSentence", sentence)).toMatchObject({
    valid: false,
    reason: "no_union_match"
  });
  value.annotations = value.annotations.filter(
    (mark) => mark.type !== "bold" && mark.type !== "underline"
  );
  expect(validateRuntimeSchema("SharedSentence", sentence)).toEqual({
    valid: true
  });
  expect(value.annotations.map((mark) => mark.type)).toEqual([
    "italic",
    "pause"
  ]);
  expect(
    validateRuntimeSchema("V3DraftValidationIssue", {
      schema_version: 3,
      step: "meanings",
      node_id: id,
      field: "sentence_formatting",
      code: "meanings_storage_unsafe",
      message: "请保留输入并刷新页面后再保存",
      node_location: { node_role: "entry", ancestor_node_ids: [] }
    })
  ).toEqual({ valid: true });
});
