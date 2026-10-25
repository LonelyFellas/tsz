import type { V3DraftValidationIssue } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { issuesForPronunciation, variantRegularity } from "./model";
import { UUIDS, formsFixture } from "./fixtures";

describe("V3 forms model", () => {
  it("仅按 pronunciation_id 筛选服务端 issue，保留原始问题", () => {
    const serverIssue: V3DraftValidationIssue = {
      schema_version: 3,
      step: "forms",
      node_id: UUIDS.pronunciation_2,
      field: "pronunciations",
      code: "duplicate_pronunciation",
      message: "server normalized duplicate",
      node_location: {
        node_role: "forms.pronunciation",
        ancestor_node_ids: [UUIDS.pos, UUIDS.form, UUIDS.common_variant],
        pos_id: UUIDS.pos,
        form_id: UUIDS.form,
        variant_id: UUIDS.common_variant,
        pronunciation_id: UUIDS.pronunciation_2,
        dialect: "common"
      }
    };
    const issues = [
      serverIssue,
      {
        ...serverIssue,
        node_location: {
          ...serverIssue.node_location,
          pronunciation_id: UUIDS.pronunciation
        }
      },
      {
        ...serverIssue,
        node_location: {
          node_role: "forms.form_variant",
          ancestor_node_ids: [UUIDS.pos, UUIDS.form],
          variant_id: UUIDS.common_variant
        }
      }
    ];
    expect(issuesForPronunciation(issues, UUIDS.pronunciation_2)).toEqual([
      serverIssue
    ]);
    expect(issuesForPronunciation(issues, UUIDS.pronunciation_3)).toEqual([]);
  });

  it("规则性优先使用变体显式值，缺省时只读取所属变化组", () => {
    const content = formsFixture();
    content.pos[0]!.form_groups[0]!.is_regular = false;
    expect(variantRegularity(content, UUIDS.form, {})).toBe(false);
    expect(variantRegularity(content, UUIDS.form, { is_regular: true })).toBe(
      true
    );
    content.pos[0]!.form_groups[0]!.is_regular = true;
    content.pos[0]!.form_groups.push({
      id: UUIDS.group_2,
      is_regular: false,
      scope: "general",
      dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
      members: [{ id: UUIDS.membership_2, form_id: UUIDS.form_2 }]
    });
    expect(variantRegularity(content, UUIDS.form, {})).toBe(true);
    expect(variantRegularity(content, UUIDS.form, { is_regular: false })).toBe(
      false
    );
  });
});
