import type { V3DraftValidationIssue } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { formsFixture, UUIDS } from "./fixtures";
import { buildV3Readiness } from "./readiness";

function issue(
  node_id: string,
  field: string,
  location: V3DraftValidationIssue["node_location"]
): V3DraftValidationIssue {
  return {
    schema_version: 3,
    step: "forms",
    node_id,
    field,
    code: "node_binding_unknown",
    message: `${field} is invalid`,
    node_location: location
  };
}

describe("buildV3Readiness", () => {
  it("returns an empty summary when both issues and optional content are absent", () => {
    expect(buildV3Readiness([], undefined)).toEqual({
      issue_count: 0,
      positions: []
    });
  });

  it("deduplicates blockers and keeps one canonical form node with all group contexts", () => {
    const pronunciation = issue("pron-2", "actual_pron", {
      node_role: "pronunciation",
      ancestor_node_ids: ["pos-2", "group-1", "form-1", "variant-1"],
      pos_id: "pos-2",
      form_group_id: "group-1",
      form_id: "form-1",
      variant_id: "variant-1",
      pronunciation_id: "pron-2"
    });
    const sameFormOtherGroup = issue("form-1", "spelling", {
      node_role: "common_variant",
      ancestor_node_ids: ["pos-2", "group-2", "form-1"],
      pos_id: "pos-2",
      form_group_id: "group-2",
      form_id: "form-1",
      variant_id: "variant-1"
    });
    const posIssue = issue("pos-1", "pos", {
      node_role: "pos",
      ancestor_node_ids: [],
      pos_id: "pos-1"
    });

    const content = formsFixture({
      pos_id: "pos-2",
      forms: [
        {
          id: "form-1",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: "variant-1",
              dialect: "common",
              spelling: "centre",
              origin: "dictionary",
              pronunciations: []
            }
          }
        }
      ],
      groups: [
        {
          id: "group-1",
          is_regular: true,
          members: [{ id: UUIDS.membership, form_id: "form-1" }]
        },
        {
          id: "group-2",
          is_regular: false,
          members: [{ id: UUIDS.membership_2, form_id: "form-1" }]
        }
      ]
    });
    const result = buildV3Readiness(
      [pronunciation, pronunciation, sameFormOtherGroup, posIssue],
      content
    );

    expect(result.issue_count).toBe(3);
    expect(result.first_target?.node_id).toBe("pron-2");
    expect(result.positions.map((pos) => pos.node_id)).toEqual([
      "pos-2",
      "pos-1"
    ]);
    const forms = result.positions[0]!.children.filter(
      (node) => node.role === "concrete_form"
    );
    expect(forms).toHaveLength(1);
    expect(forms[0]).toMatchObject({
      node_id: "form-1",
      issue_count: 2,
      context_group_ids: ["group-1", "group-2"]
    });
    expect(forms[0]!.children[0]!.children[0]).toMatchObject({
      role: "pronunciation",
      node_id: "pron-2"
    });
  });

  it("falls back to the issue node and keeps missing form context optional", () => {
    const formIssue = issue("orphan-form", "spelling", {
      node_role: "concrete_form",
      ancestor_node_ids: [],
      form_id: "orphan-form"
    });

    const result = buildV3Readiness([formIssue]);

    expect(result.positions).toEqual([
      expect.objectContaining({
        role: "pos",
        node_id: "orphan-form",
        context_group_ids: [],
        children: [
          expect.objectContaining({
            role: "concrete_form",
            node_id: "orphan-form",
            context_group_ids: [],
            children: []
          })
        ]
      })
    ]);
  });

  it("does not duplicate one group context for repeated memberships", () => {
    const content = formsFixture({
      pos_id: "pos-2",
      forms: [
        {
          id: "form-1",
          form_type: "base",
          regional_variants: {
            mode: "common",
            common: {
              id: "variant-1",
              dialect: "common",
              spelling: "centre",
              origin: "dictionary",
              pronunciations: []
            }
          }
        }
      ],
      groups: [
        {
          id: "group-1",
          is_regular: true,
          members: [
            { id: UUIDS.membership, form_id: "form-1" },
            { id: UUIDS.membership_2, form_id: "form-1" }
          ]
        }
      ]
    });

    const result = buildV3Readiness(
      [
        issue("form-1", "spelling", {
          node_role: "concrete_form",
          ancestor_node_ids: ["pos-2", "form-1"],
          pos_id: "pos-2",
          form_id: "form-1"
        })
      ],
      content
    );

    expect(result.positions[0]!.children[0]!.context_group_ids).toEqual([
      "group-1"
    ]);
  });
});
