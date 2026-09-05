import {
  HttpError,
  InvalidAdminWordResponseError,
  UnsupportedAdminWordSchemaVersionError
} from "@tsz/api-client";
import type { ProblemMeta, V3DraftValidationIssue } from "@tsz/types";

const SURFACE_CONFIRMATION_CODES = new Set([
  "surface_match_acknowledgement_required",
  "surface_matches_changed",
  "surface_match_snapshot_expired",
  "surface_policy_changed",
  "exact_headword_creation_temporarily_disabled",
  "multiple_active_exact_headword_publications_not_enabled"
]);

interface HttpProblemBase {
  status: number;
  code?: string;
  retryable: boolean;
}

export type V3ProblemOperation =
  | "detect"
  | "surface"
  | "create"
  | "get"
  | "impact"
  | "save_forms"
  | "save_meanings"
  | "validate"
  | "publish"
  | "activate";

function hasIdempotencyKey(operation?: V3ProblemOperation): boolean {
  return (
    operation === "create" ||
    operation === "publish" ||
    operation === "activate"
  );
}

export type V3Problem =
  | (HttpProblemBase & { kind: "authentication"; status: 401 })
  | (HttpProblemBase & { kind: "authorization"; status: 403 })
  | (HttpProblemBase & {
      kind: "revision_conflict";
      status: 409;
      current_revision?: number;
      invalidates_confirmation: true;
    })
  | (HttpProblemBase & {
      kind: "idempotency_conflict";
      status: 409;
      action: "refresh_then_rotate_key" | "refresh_only";
    })
  | (HttpProblemBase & {
      kind: "impact_confirmation";
      status: 409;
      action: "re_preview";
      invalidates_confirmation: true;
    })
  | (HttpProblemBase & {
      kind: "entry_archived";
      status: 409;
      invalidates_confirmation: true;
    })
  | (HttpProblemBase & {
      kind: "surface_confirmation";
      invalidates_confirmation: true;
      requires_new_idempotency_key: boolean;
      meta?: ProblemMeta;
    })
  | (HttpProblemBase & {
      kind: "validation";
      status: 422;
      issues: V3DraftValidationIssue[];
      operation?: V3ProblemOperation;
    })
  | (HttpProblemBase & { kind: "service_unavailable" })
  | (HttpProblemBase & { kind: "server" })
  | (HttpProblemBase & { kind: "request" })
  | { kind: "network"; error: unknown; retryable: true }
  | { kind: "cancelled"; error: unknown; retryable: false }
  | {
      kind: "client_contract";
      error:
        InvalidAdminWordResponseError | UnsupportedAdminWordSchemaVersionError;
      retryable: false;
      fail_closed: true;
    }
  | {
      kind: "unexpected_client";
      error: unknown;
      retryable: false;
      fail_closed: true;
    };

function v3Issues(error: HttpError): V3DraftValidationIssue[] | undefined {
  if (
    error.field_issues.length === 0 ||
    !error.field_issues.every((issue) => issue.schema_version === 3)
  ) {
    return undefined;
  }
  return error.field_issues as V3DraftValidationIssue[];
}

/** Stable error routing for the V3 UI. Never branches on mutable detail text. */
export function classifyV3Problem(
  error: unknown,
  operation?: V3ProblemOperation
): V3Problem {
  if (
    error instanceof InvalidAdminWordResponseError ||
    error instanceof UnsupportedAdminWordSchemaVersionError
  ) {
    return {
      kind: "client_contract",
      error,
      retryable: false,
      fail_closed: true
    };
  }
  if (!(error instanceof HttpError)) {
    const name =
      typeof error === "object" && error !== null && "name" in error
        ? error.name
        : undefined;
    if (name === "AbortError") {
      return { kind: "cancelled", error, retryable: false };
    }
    if (
      error instanceof TypeError ||
      name === "TimeoutError" ||
      name === "NetworkError"
    ) {
      return { kind: "network", error, retryable: true };
    }
    return {
      kind: "unexpected_client",
      error,
      retryable: false,
      fail_closed: true
    };
  }

  const base = {
    status: error.status,
    ...(error.code ? { code: error.code } : {})
  };
  if (error.status === 401) {
    return { ...base, kind: "authentication", status: 401, retryable: false };
  }
  if (error.status === 403) {
    return { ...base, kind: "authorization", status: 403, retryable: false };
  }
  if (error.status === 409 && error.code === "revision_conflict") {
    return {
      ...base,
      kind: "revision_conflict",
      status: 409,
      ...(error.meta?.current_revision === undefined
        ? {}
        : { current_revision: error.meta.current_revision }),
      retryable: false,
      invalidates_confirmation: true
    };
  }
  if (error.status === 409 && error.code === "idempotency_conflict") {
    return {
      ...base,
      kind: "idempotency_conflict",
      status: 409,
      retryable: false,
      action: hasIdempotencyKey(operation)
        ? "refresh_then_rotate_key"
        : "refresh_only"
    };
  }
  if (
    error.status === 409 &&
    error.code === "downstream_confirmation_required"
  ) {
    return {
      ...base,
      kind: "impact_confirmation",
      status: 409,
      retryable: false,
      action: "re_preview",
      invalidates_confirmation: true
    };
  }
  if (error.status === 409 && error.code === "entry_archived") {
    return {
      ...base,
      kind: "entry_archived",
      status: 409,
      retryable: false,
      invalidates_confirmation: true
    };
  }
  if (
    (error.status === 409 || error.status === 410) &&
    error.code !== undefined &&
    SURFACE_CONFIRMATION_CODES.has(error.code)
  ) {
    return {
      ...base,
      kind: "surface_confirmation",
      retryable: false,
      invalidates_confirmation: true,
      requires_new_idempotency_key: hasIdempotencyKey(operation),
      ...(error.meta ? { meta: error.meta } : {})
    };
  }
  if (error.status === 422) {
    const issues = v3Issues(error);
    if (issues) {
      return {
        ...base,
        kind: "validation",
        status: 422,
        issues,
        ...(operation ? { operation } : {}),
        retryable: false
      };
    }
  }
  if (error.status === 503) {
    return { ...base, kind: "service_unavailable", retryable: true };
  }
  if (error.status >= 500) {
    return { ...base, kind: "server", retryable: true };
  }
  return { ...base, kind: "request", retryable: false };
}

export function invalidatesV3Confirmations(problem: V3Problem): boolean {
  return (
    problem.kind === "revision_conflict" ||
    problem.kind === "entry_archived" ||
    problem.kind === "surface_confirmation" ||
    problem.kind === "impact_confirmation"
  );
}
