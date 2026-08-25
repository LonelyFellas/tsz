import type { V3DraftValidationIssue } from "@tsz/types";
import { describe, expect, it, vi } from "vitest";
import { navigateToV3Issue, v3IssueNavigationTarget } from "./issueNavigation";

const deepIssue: V3DraftValidationIssue = {
  schema_version: 3,
  step: "forms",
  node_id: "pron-2",
  field: "actual_pron",
  code: "node_binding_unknown",
  message: "invalid pronunciation",
  node_location: {
    node_role: "pronunciation",
    ancestor_node_ids: [
      "pos-2",
      "group-2",
      "membership-2",
      "form-2",
      "variant-us"
    ],
    pos_id: "pos-2",
    form_group_id: "group-2",
    membership_id: "membership-2",
    form_id: "form-2",
    variant_id: "variant-us",
    dialect: "us",
    pronunciation_id: "pron-2"
  }
};

describe("V3 issue navigation", () => {
  it("keeps the authoritative meanings node instead of collapsing to its POS", () => {
    expect(
      v3IssueNavigationTarget({
        schema_version: 3,
        step: "meanings",
        node_id: "text-variant-2",
        field: "value",
        code: "definition_invalid",
        message: "invalid",
        node_location: {
          node_role: "text_variant",
          ancestor_node_ids: ["pos-2", "sense-2", "definition-2"],
          pos_id: "pos-2"
        }
      })
    ).toMatchObject({
      step: "meanings",
      node_id: "text-variant-2",
      field: "value",
      pos_id: "pos-2"
    });
  });

  it("derives the deepest stable UUID target", () => {
    expect(v3IssueNavigationTarget(deepIssue)).toEqual({
      step: "forms",
      node_id: "pron-2",
      field: "actual_pron",
      pos_id: "pos-2",
      form_group_id: "group-2",
      membership_id: "membership-2",
      form_id: "form-2",
      variant_id: "variant-us",
      dialect: "us",
      pronunciation_id: "pron-2"
    });
  });

  it("activates containers before revealing and focusing the exact field", async () => {
    const calls: string[] = [];
    const adapter = {
      activateStep: vi.fn(async () => {
        calls.push("step");
      }),
      activatePos: vi.fn(async () => {
        calls.push("pos");
      }),
      expandGroup: vi.fn(async () => {
        calls.push("group");
      }),
      revealForm: vi.fn(async () => {
        calls.push("form");
      }),
      revealVariant: vi.fn(async () => {
        calls.push("variant");
      }),
      revealPronunciation: vi.fn(async () => {
        calls.push("pronunciation");
      }),
      focusField: vi.fn(async () => {
        calls.push("focus");
      })
    };

    await navigateToV3Issue(deepIssue, adapter);

    expect(calls).toEqual([
      "step",
      "pos",
      "group",
      "form",
      "variant",
      "pronunciation",
      "focus"
    ]);
    expect(adapter.focusField).toHaveBeenCalledWith(
      expect.objectContaining({ node_id: "pron-2", field: "actual_pron" })
    );
  });
});
