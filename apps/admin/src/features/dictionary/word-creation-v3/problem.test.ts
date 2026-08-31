import {
  HttpError,
  InvalidAdminWordResponseError,
  UnsupportedAdminWordSchemaVersionError
} from "@tsz/api-client";
import type { V3DraftValidationIssue } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { classifyV3Problem } from "./problem";

const ISSUE: V3DraftValidationIssue = {
  schema_version: 3,
  step: "forms",
  node_id: "form-1",
  field: "spelling",
  code: "variant_spelling_required",
  message: "required",
  node_location: {
    node_role: "common_variant",
    ancestor_node_ids: ["pos-1", "form-1"],
    pos_id: "pos-1",
    form_id: "form-1",
    variant_id: "variant-1",
    dialect: "common"
  }
};

describe("classifyV3Problem", () => {
  it.each([
    [401, "token_expired", "authentication"],
    [403, "must_change_password", "authorization"],
    [500, "internal_error", "server"],
    [503, "smart_lexicon_v3_storage_unavailable", "service_unavailable"]
  ] as const)(
    "classifies HTTP %s independently from validation",
    (status, code, kind) => {
      expect(
        classifyV3Problem(new HttpError(status, code, [], code))
      ).toMatchObject({
        kind,
        status,
        retryable: status >= 500
      });
    }
  );

  it("exposes only schema-versioned V3 validation issues for 422", () => {
    expect(
      classifyV3Problem(
        new HttpError(422, "invalid", [], "validation_failed", [ISSUE])
      )
    ).toEqual({
      kind: "validation",
      status: 422,
      code: "validation_failed",
      issues: [ISSUE],
      retryable: false
    });

    expect(
      classifyV3Problem(
        new HttpError(422, "legacy", [], "validation_failed", [
          { schema_version: 2 } as never
        ])
      )
    ).toMatchObject({ kind: "request", status: 422 });
  });

  it("separates revision, idempotency, and surface-token conflicts", () => {
    expect(
      classifyV3Problem(new HttpError(409, "busy", [], "reference_conflict"))
    ).toMatchObject({
      kind: "reference_conflict",
      retryable: true,
      invalidates_confirmation: true
    });
    expect(
      classifyV3Problem(
        new HttpError(
          409,
          "too many",
          [],
          "relation_prebinding_fanout_exceeded"
        )
      )
    ).toMatchObject({
      kind: "relation_prebinding_fanout_exceeded",
      retryable: false
    });
    expect(
      classifyV3Problem(
        new HttpError(409, "stale", [], "revision_conflict", [], {
          current_revision: 9
        })
      )
    ).toEqual({
      kind: "revision_conflict",
      status: 409,
      code: "revision_conflict",
      current_revision: 9,
      retryable: false,
      invalidates_confirmation: true
    });
    expect(
      classifyV3Problem(
        new HttpError(409, "reused", [], "idempotency_conflict"),
        "publish"
      )
    ).toMatchObject({
      kind: "idempotency_conflict",
      action: "refresh_then_rotate_key"
    });
    expect(
      classifyV3Problem(
        new HttpError(410, "expired", [], "surface_match_snapshot_expired"),
        "save_forms"
      )
    ).toMatchObject({
      kind: "surface_confirmation",
      invalidates_confirmation: true,
      requires_new_idempotency_key: false
    });
  });

  it("rotates idempotency keys only for operations that actually send one", () => {
    const error = new HttpError(409, "reused", [], "idempotency_conflict");

    expect(classifyV3Problem(error, "create")).toMatchObject({
      kind: "idempotency_conflict",
      action: "refresh_then_rotate_key"
    });
    expect(classifyV3Problem(error, "validate")).toMatchObject({
      kind: "idempotency_conflict",
      action: "refresh_only"
    });

    const surfaceChanged = new HttpError(
      409,
      "changed",
      [],
      "surface_matches_changed"
    );
    expect(classifyV3Problem(surfaceChanged, "publish")).toMatchObject({
      kind: "surface_confirmation",
      requires_new_idempotency_key: true
    });
    expect(classifyV3Problem(surfaceChanged, "save_forms")).toMatchObject({
      kind: "surface_confirmation",
      requires_new_idempotency_key: false
    });
  });

  it("routes downstream confirmation to re-preview instead of surface retry", () => {
    expect(
      classifyV3Problem(
        new HttpError(
          409,
          "preview again",
          [],
          "downstream_confirmation_required"
        ),
        "save_forms"
      )
    ).toMatchObject({
      kind: "impact_confirmation",
      action: "re_preview",
      invalidates_confirmation: true
    });
  });

  it("keeps activation revision recovery and rotates an activation idempotency key", () => {
    expect(
      classifyV3Problem(
        new HttpError(409, "stale", [], "revision_conflict", [], {
          current_revision: 12
        }),
        "activate"
      )
    ).toEqual({
      kind: "revision_conflict",
      status: 409,
      code: "revision_conflict",
      current_revision: 12,
      retryable: false,
      invalidates_confirmation: true
    });
    expect(
      classifyV3Problem(
        new HttpError(409, "reused", [], "idempotency_conflict"),
        "activate"
      )
    ).toMatchObject({
      kind: "idempotency_conflict",
      action: "refresh_then_rotate_key"
    });
  });

  it.each([
    [409, "surface_match_acknowledgement_required"],
    [409, "surface_matches_changed"],
    [410, "surface_match_snapshot_expired"],
    [409, "surface_policy_changed"],
    [409, "exact_headword_creation_temporarily_disabled"],
    [409, "multiple_active_exact_headword_publications_not_enabled"]
  ] as const)(
    "rotates the activation key for surface confirmation %s/%s",
    (status, code) => {
      expect(
        classifyV3Problem(
          new HttpError(status, "surface confirmation", [], code),
          "activate"
        )
      ).toMatchObject({
        kind: "surface_confirmation",
        status,
        code,
        retryable: false,
        invalidates_confirmation: true,
        requires_new_idempotency_key: true
      });
    }
  );

  it("keeps activation network and unknown-client failures operation-neutral", () => {
    expect(
      classifyV3Problem(new TypeError("Failed to fetch"), "activate")
    ).toEqual({
      kind: "network",
      error: expect.any(TypeError),
      retryable: true
    });
    expect(
      classifyV3Problem(new Error("programming error"), "activate")
    ).toMatchObject({
      kind: "unexpected_client",
      retryable: false,
      fail_closed: true
    });
  });

  it("treats transport failures as retryable without claiming a save succeeded", () => {
    expect(classifyV3Problem(new TypeError("Failed to fetch"))).toEqual({
      kind: "network",
      error: expect.any(TypeError),
      retryable: true
    });
  });

  it("separates abort, decoder failures, and unexpected client errors from transport", () => {
    expect(
      classifyV3Problem(new DOMException("cancelled", "AbortError"))
    ).toMatchObject({ kind: "cancelled", retryable: false });
    expect(
      classifyV3Problem(
        new InvalidAdminWordResponseError(
          "word",
          "missing_required_property",
          "object"
        )
      )
    ).toMatchObject({ kind: "client_contract", fail_closed: true });
    expect(
      classifyV3Problem(
        new UnsupportedAdminWordSchemaVersionError(9, "word.schema_version")
      )
    ).toMatchObject({ kind: "client_contract", fail_closed: true });
    expect(classifyV3Problem(new Error("programming error"))).toMatchObject({
      kind: "unexpected_client",
      retryable: false,
      fail_closed: true
    });
  });

  it("classifies concurrent archival as a canonical refresh boundary", () => {
    expect(
      classifyV3Problem(
        new HttpError(409, "entry archived", [], "entry_archived"),
        "save_forms"
      )
    ).toMatchObject({
      kind: "entry_archived",
      status: 409,
      code: "entry_archived",
      retryable: false,
      invalidates_confirmation: true
    });
  });
});
