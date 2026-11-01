import { expect, it } from "vitest";
import { formsFixture } from "../word-creation-v3/fixtures";
import { assistantFieldTarget } from "./fieldNavigation";

it("从本地草稿解析字段路径并保留词性与词形身份", () => {
  const forms = formsFixture();
  const result = assistantFieldTarget(
    "forms.pos[0].forms[0].regional_variants.common.spelling",
    forms,
    { sense_groups: [], pos: [] }
  );
  expect(result?.step).toBe("forms");
  expect(result?.pos_id).toBe(forms.pos[0]!.pos_id);
  expect(result?.form_id).toBe(forms.pos[0]!.forms[0]!.id);
  expect(result?.field).toBe("spelling");
  expect(
    assistantFieldTarget(
      "forms.pos[0].forms[0].regional_variants.common.spelling_rich",
      forms,
      { sense_groups: [], pos: [] }
    )?.field
  ).toBe("spelling");
  expect(result?.variant_id).toBe(
    forms.pos[0]!.forms[0]!.regional_variants.mode === "common"
      ? forms.pos[0]!.forms[0]!.regional_variants.common.id
      : undefined
  );
  expect(
    assistantFieldTarget("meanings.sense_groups", forms, {
      sense_groups: [],
      pos: []
    })
  ).toEqual({ step: "meanings", node_id: "", field: "sense_groups" });
  expect(
    assistantFieldTarget("forms.pos[999].spelling", forms, {
      sense_groups: [],
      pos: []
    })
  ).toBeUndefined();
});
