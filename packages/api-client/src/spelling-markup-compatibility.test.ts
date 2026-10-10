import { afterEach, expect, it, vi } from "vitest";
import currentSchemas from "./admin-word-v3.runtime-schema.json";
import legacyVariants from "./fixtures/pre-spelling-markup-variants.json";

afterEach(() => {
  vi.doUnmock("./admin-word-v3.runtime-schema.json");
  vi.resetModules();
});

it("the pre-markup strict reader accepts all regional legacy views and still rejects new fields", async () => {
  vi.resetModules();
  vi.doMock("./admin-word-v3.runtime-schema.json", () => ({
    default: {
      ...currentSchemas,
      $defs: { ...currentSchemas.$defs, ...legacyVariants.$defs }
    }
  }));
  const { validateRuntimeSchema } = await import("./runtime-schema");
  const id = "018f47b8-e3c1-7bd1-9f0a-123456789abc";
  const variant = (dialect: string) => ({
    id,
    dialect,
    spelling: "centre",
    origin: "manual",
    pronunciations: [],
    spelling_rich: {
      version: 2,
      text: "centre",
      annotations: [{ type: "italic", start: 0, end: 2 }]
    }
  });
  const word = {
    schema_version: 3,
    id,
    language: "en",
    kind: "word",
    status: "draft",
    revision: 1,
    lifecycle_revision: 1,
    annotation: null,
    annotation_revision: 1,
    has_unpublished_changes: true,
    presentation: {
      label: "centre",
      matched_surfaces: ["centre"],
      strategy_version: "v3"
    },
    capabilities: {
      publication: { mode: "native" },
      pronunciation_normalization_version: "nfkc_trim_lower_v1"
    },
    forms: {
      pos: [
        {
          pos_id: id,
          pos: "noun",
          form_groups: [],
          forms: [
            {
              id,
              form_type: "base",
              regional_variants: { mode: "common", common: variant("common") }
            },
            {
              id,
              form_type: "plural",
              regional_variants: {
                mode: "uk_us",
                uk: variant("uk"),
                us: variant("us")
              }
            }
          ]
        }
      ]
    },
    meanings: { sense_groups: [], pos: [] },
    completed_steps: [],
    max_reachable_step: "forms",
    created_by: id,
    created_at: "2026-08-25T00:00:00Z",
    updated_at: "2026-08-25T00:00:00Z"
  };
  const views = [
    word.forms.pos[0]!.forms[0]!.regional_variants.common!,
    word.forms.pos[0]!.forms[1]!.regional_variants.uk!,
    word.forms.pos[0]!.forms[1]!.regional_variants.us!
  ];
  for (const view of views) {
    expect(validateRuntimeSchema("AdminWordV3", word)).toMatchObject({
      valid: false,
      reason: "no_union_match"
    });
    Reflect.deleteProperty(view, "spelling_rich");
  }
  expect(validateRuntimeSchema("AdminWordV3", word)).toEqual({ valid: true });
});
