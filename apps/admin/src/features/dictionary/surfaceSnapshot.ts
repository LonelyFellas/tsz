import type {
  LexiconSurfaceMatchV2,
  MatchedEntryContextV2,
  SurfaceConfirmationReasonV2,
  SurfaceMatchPageV2,
  SurfacePolicyBlockCodeV2,
  SurfacePolicyNameV2
} from "@tsz/types";

export type SurfaceSnapshotPhase =
  "idle" | "loading" | "ready" | "disabled" | "error" | "expired";

export interface SurfaceSnapshotState {
  generation: number;
  phase: SurfaceSnapshotPhase;
  snapshot_id?: string;
  items: LexiconSurfaceMatchV2[];
  matched_entry_contexts: MatchedEntryContextV2[];
  total: number;
  confirmation_reasons: SurfaceConfirmationReasonV2[];
  policy_name?: SurfacePolicyNameV2;
  policy_epoch?: number;
  next_cursor?: string;
  surface_confirmation_token?: string;
  policy_block_code?: SurfacePolicyBlockCodeV2;
  error?: unknown;
}

export type SurfaceSnapshotAction =
  | { type: "reset"; generation: number }
  | { type: "start"; generation: number; page: SurfaceMatchPageV2 }
  | {
      type: "page_loaded";
      generation: number;
      requested_cursor: string;
      page: SurfaceMatchPageV2;
    }
  | {
      type: "page_failed";
      generation: number;
      requested_cursor: string;
      error: unknown;
      expired?: boolean;
    };

export const EMPTY_SURFACE_SNAPSHOT_STATE: SurfaceSnapshotState = {
  generation: 0,
  phase: "idle",
  items: [],
  matched_entry_contexts: [],
  total: 0,
  confirmation_reasons: []
};

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

function pageState(
  generation: number,
  page: SurfaceMatchPageV2,
  previous?: SurfaceSnapshotState
): SurfaceSnapshotState {
  const items = uniqueBy(
    [...(previous?.items ?? []), ...page.items],
    (item) => item.match_id
  );
  const matched_entry_contexts = uniqueBy(
    [
      ...(previous?.matched_entry_contexts ?? []),
      ...page.matched_entry_contexts
    ],
    (context) => context.word_id
  );
  const nextCursor =
    typeof page.next_cursor === "string" ? page.next_cursor : undefined;
  const hasNext = nextCursor !== undefined;
  const isDisabled = page.continuation_policy === "temporarily_disabled";
  const surface_confirmation_token =
    page.continuation_policy === "enabled" && page.next_cursor === null
      ? page.surface_confirmation_token
      : undefined;

  return {
    generation,
    phase: hasNext ? "loading" : isDisabled ? "disabled" : "ready",
    snapshot_id: page.snapshot_id,
    items,
    matched_entry_contexts,
    total: page.total,
    confirmation_reasons: page.confirmation_reasons,
    policy_name: page.policy_name,
    policy_epoch: page.policy_epoch,
    ...(nextCursor ? { next_cursor: nextCursor } : {}),
    ...(surface_confirmation_token ? { surface_confirmation_token } : {}),
    ...(isDisabled ? { policy_block_code: page.policy_block_code } : {})
  };
}

function sameSnapshot(
  state: SurfaceSnapshotState,
  page: SurfaceMatchPageV2
): boolean {
  return (
    state.snapshot_id === page.snapshot_id &&
    state.policy_name === page.policy_name &&
    state.policy_epoch === page.policy_epoch &&
    state.total === page.total
  );
}

export function surfaceSnapshotReducer(
  state: SurfaceSnapshotState,
  action: SurfaceSnapshotAction
): SurfaceSnapshotState {
  if (action.type === "reset") {
    return { ...EMPTY_SURFACE_SNAPSHOT_STATE, generation: action.generation };
  }
  if (action.type === "start") {
    return pageState(action.generation, action.page);
  }
  if (
    action.generation !== state.generation ||
    action.requested_cursor !== state.next_cursor
  ) {
    return state;
  }
  if (action.type === "page_failed") {
    return {
      ...state,
      phase: action.expired ? "expired" : "error",
      next_cursor: undefined,
      surface_confirmation_token: undefined,
      error: action.error
    };
  }
  if (!sameSnapshot(state, action.page)) {
    return {
      ...state,
      phase: "error",
      next_cursor: undefined,
      surface_confirmation_token: undefined,
      error: new Error("surface snapshot page does not match its first page")
    };
  }
  return pageState(state.generation, action.page, state);
}

export function canAcknowledgeSurfaceSnapshot(
  state: SurfaceSnapshotState
): state is SurfaceSnapshotState & { surface_confirmation_token: string } {
  return (
    state.phase === "ready" &&
    typeof state.surface_confirmation_token === "string" &&
    state.items.length === state.total
  );
}

export type SurfaceMatchMembership = "ordinary" | "visibility" | "composite";

export interface AggregatedSurfaceMatchCard {
  key: string;
  candidate: LexiconSurfaceMatchV2["candidate"];
  existing: LexiconSurfaceMatchV2["existing"];
  matches: LexiconSurfaceMatchV2[];
  membership: SurfaceMatchMembership;
  context?: MatchedEntryContextV2;
}

function membership(
  reasons: SurfaceConfirmationReasonV2[]
): SurfaceMatchMembership {
  const ordinary = reasons.includes("unacknowledged_surface_matches");
  const visibility = reasons.includes("visibility_activation");
  return ordinary && visibility
    ? "composite"
    : visibility
      ? "visibility"
      : "ordinary";
}

/** Aggregate cards by candidate + existing entry while retaining every source row. */
export function aggregateSurfaceMatchCards(
  items: LexiconSurfaceMatchV2[],
  contexts: MatchedEntryContextV2[]
): AggregatedSurfaceMatchCard[] {
  const contextByWordId = new Map(
    contexts.map((context) => [context.word_id, context])
  );
  const cards = new Map<string, AggregatedSurfaceMatchCard>();
  for (const item of items) {
    const key = `${item.candidate.candidate_ref}:${item.existing.word_id}`;
    const existing = cards.get(key);
    if (existing) {
      existing.matches.push(item);
      existing.membership = membership(
        uniqueBy(
          existing.matches.flatMap((match) => match.confirmation_reasons),
          (reason) => reason
        )
      );
      continue;
    }
    cards.set(key, {
      key,
      candidate: item.candidate,
      existing: item.existing,
      matches: [item],
      membership: membership(item.confirmation_reasons),
      context: contextByWordId.get(item.existing.word_id)
    });
  }
  return [...cards.values()];
}

const SURFACE_BUSINESS_RETRY_CODES = new Set([
  "surface_match_acknowledgement_required",
  "surface_matches_changed",
  "surface_match_snapshot_expired",
  "surface_policy_changed",
  "exact_headword_creation_temporarily_disabled",
  "multiple_active_exact_headword_publications_not_enabled"
]);

export function requiresNewIdempotencyKey(
  status: number,
  code: string | undefined
): boolean {
  return (
    (status === 409 || status === 410) &&
    code !== undefined &&
    SURFACE_BUSINESS_RETRY_CODES.has(code)
  );
}
