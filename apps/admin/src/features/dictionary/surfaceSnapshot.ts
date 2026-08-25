import type {
  LexiconSurfaceMatchV2,
  MatchedEntryContextV2,
  MatchedEntryContextV3,
  SurfaceConfirmationReasonV2,
  SurfaceMatchItemV3,
  SurfaceMatchPageAny,
  SurfaceMatchPageV2,
  SurfacePolicyBlockCodeV2,
  SurfacePolicyNameV2
} from "@tsz/types";

export type SurfaceSnapshotPhase =
  "idle" | "loading" | "ready" | "disabled" | "error" | "expired";

type SurfaceSnapshotItems<TPage extends SurfaceMatchPageAny> =
  TPage extends SurfaceMatchPageAny ? TPage["items"] : never;
type SurfaceSnapshotContexts<TPage extends SurfaceMatchPageAny> =
  TPage extends SurfaceMatchPageAny ? TPage["matched_entry_contexts"] : never;

export interface SurfaceSnapshotState<
  TPage extends SurfaceMatchPageAny = SurfaceMatchPageV2
> {
  generation: number;
  schema_version?: TPage["schema_version"];
  phase: SurfaceSnapshotPhase;
  snapshot_id?: string;
  items: SurfaceSnapshotItems<TPage>;
  matched_entry_contexts: SurfaceSnapshotContexts<TPage>;
  total: number;
  confirmation_reasons: SurfaceConfirmationReasonV2[];
  policy_name?: SurfacePolicyNameV2;
  policy_epoch?: number;
  next_cursor?: string;
  surface_confirmation_token?: string;
  impact_confirmation_token?: string;
  policy_block_code?: SurfacePolicyBlockCodeV2;
  error?: unknown;
}

export function isSurfaceMatchPageV2(
  page: SurfaceMatchPageAny | null | undefined
): page is SurfaceMatchPageV2 {
  return page?.schema_version === 2;
}

export function isSurfaceMatchPageAny(
  page: unknown
): page is SurfaceMatchPageAny {
  return (
    typeof page === "object" &&
    page !== null &&
    "schema_version" in page &&
    (page.schema_version === 2 || page.schema_version === 3)
  );
}

export type SurfaceSnapshotAction<
  TPage extends SurfaceMatchPageAny = SurfaceMatchPageV2
> =
  | { type: "reset"; generation: number }
  | { type: "start"; generation: number; page: TPage }
  | {
      type: "page_loaded";
      generation: number;
      requested_cursor: string;
      page: TPage;
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

export function createEmptySurfaceSnapshotState<
  TPage extends SurfaceMatchPageAny = SurfaceMatchPageV2
>(): SurfaceSnapshotState<TPage> {
  return { ...EMPTY_SURFACE_SNAPSHOT_STATE } as SurfaceSnapshotState<TPage>;
}

function uniqueBy<T>(values: T[], key: (value: T) => string): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const identity = key(value);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

type SurfaceSnapshotItemAny = LexiconSurfaceMatchV2 | SurfaceMatchItemV3;
type SurfaceSnapshotContextAny = MatchedEntryContextV2 | MatchedEntryContextV3;

function surfaceItemKey(item: SurfaceSnapshotItemAny): string {
  if ("match_id" in item) return `v2:${item.match_id}`;
  if (item.match_kind === "form_variant_v3") {
    const match = item.match;
    return JSON.stringify([
      "form_variant_v3",
      match.source_schema_version,
      match.entry_id,
      match.status,
      match.content_scope,
      match.pos_id,
      [...match.group_ids].sort(),
      match.form_id,
      match.variant_id,
      match.form_type,
      match.dialect,
      match.spelling,
      match.publication_id ?? null
    ]);
  }
  const match = item.match;
  const source = match.existing.source;
  return JSON.stringify([
    "legacy_v2",
    match.source_schema_version,
    match.existing.word_id,
    match.existing.headword,
    match.existing.kind,
    match.existing.status,
    source.source_kind,
    source.source_id,
    source.content_scope,
    source.surface,
    source.dialect,
    ...(source.source_kind === "form"
      ? [source.source_node_id, source.pos_id, source.pos, source.form_type]
      : []),
    match.publication_id ?? null
  ]);
}

function surfaceContextKey(context: SurfaceSnapshotContextAny): string {
  return "word_id" in context ? context.word_id : context.entry_id;
}

function pageState<TPage extends SurfaceMatchPageAny>(
  generation: number,
  page: TPage,
  previous?: SurfaceSnapshotState<TPage>
): SurfaceSnapshotState<TPage> {
  const items = uniqueBy(
    [
      ...((previous?.items ?? []) as SurfaceSnapshotItemAny[]),
      ...(page.items as SurfaceSnapshotItemAny[])
    ],
    surfaceItemKey
  );
  const matched_entry_contexts = uniqueBy(
    [
      ...((previous?.matched_entry_contexts ??
        []) as SurfaceSnapshotContextAny[]),
      ...(page.matched_entry_contexts as SurfaceSnapshotContextAny[])
    ],
    surfaceContextKey
  );
  const nextCursor =
    typeof page.next_cursor === "string" ? page.next_cursor : undefined;
  const hasNext = nextCursor !== undefined;
  const isDisabled = page.continuation_policy === "temporarily_disabled";
  const surface_confirmation_token =
    page.continuation_policy === "enabled" && page.next_cursor === null
      ? page.surface_confirmation_token
      : undefined;
  const impact_confirmation_token =
    page.continuation_policy === "enabled" && page.next_cursor === null
      ? page.impact_confirmation_token
      : undefined;

  return {
    generation,
    schema_version: page.schema_version,
    phase: hasNext ? "loading" : isDisabled ? "disabled" : "ready",
    snapshot_id: page.snapshot_id,
    items: items as SurfaceSnapshotItems<TPage>,
    matched_entry_contexts:
      matched_entry_contexts as SurfaceSnapshotContexts<TPage>,
    total: page.total,
    confirmation_reasons: page.confirmation_reasons,
    policy_name: page.policy_name,
    policy_epoch: page.policy_epoch,
    ...(nextCursor ? { next_cursor: nextCursor } : {}),
    ...(surface_confirmation_token ? { surface_confirmation_token } : {}),
    ...(impact_confirmation_token ? { impact_confirmation_token } : {}),
    ...(isDisabled ? { policy_block_code: page.policy_block_code } : {})
  };
}

function sameSnapshot<TPage extends SurfaceMatchPageAny>(
  state: SurfaceSnapshotState<TPage>,
  page: TPage
): boolean {
  return (
    state.schema_version === page.schema_version &&
    state.snapshot_id === page.snapshot_id &&
    state.policy_name === page.policy_name &&
    state.policy_epoch === page.policy_epoch &&
    state.total === page.total
  );
}

export function surfaceSnapshotReducer<TPage extends SurfaceMatchPageAny>(
  state: SurfaceSnapshotState<TPage>,
  action: SurfaceSnapshotAction<TPage>
): SurfaceSnapshotState<TPage> {
  if (action.type === "reset") {
    return {
      ...createEmptySurfaceSnapshotState<TPage>(),
      generation: action.generation
    };
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
      impact_confirmation_token: undefined,
      error: action.error
    };
  }
  if (!sameSnapshot(state, action.page)) {
    return {
      ...state,
      phase: "error",
      next_cursor: undefined,
      surface_confirmation_token: undefined,
      impact_confirmation_token: undefined,
      error: new Error("surface snapshot page does not match its first page")
    };
  }
  return pageState(state.generation, action.page, state);
}

export function canAcknowledgeSurfaceSnapshot<
  TPage extends SurfaceMatchPageAny
>(
  state: SurfaceSnapshotState<TPage>
): state is SurfaceSnapshotState<TPage> & {
  surface_confirmation_token: string;
} {
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

export interface LifecycleSurfaceMatchCard {
  key: string;
  entry_id: string;
  label: string;
  status: "draft" | "published" | "archived";
  match_count: number;
  membership: SurfaceMatchMembership;
  source_labels: string[];
}

/** Lifecycle confirmation uses each schema's real source and presentation fields. */
export function aggregateLifecycleSurfaceMatchCards(
  state: SurfaceSnapshotState<SurfaceMatchPageAny>
): LifecycleSurfaceMatchCard[] {
  if (state.schema_version !== 3) {
    return aggregateSurfaceMatchCards(
      state.items as LexiconSurfaceMatchV2[],
      state.matched_entry_contexts as MatchedEntryContextV2[]
    ).map((card) => ({
      key: card.key,
      entry_id: card.existing.word_id,
      label: card.existing.headword,
      status: card.existing.status,
      match_count: card.matches.length,
      membership: card.membership,
      source_labels: card.matches.map((match) => {
        const source = match.existing.source;
        return source.source_kind === "form"
          ? `${source.pos} · ${source.form_type} · ${source.surface} · ${source.dialect}`
          : `主词 · ${source.surface} · ${source.dialect}`;
      })
    }));
  }

  const contexts = new Map(
    (state.matched_entry_contexts as MatchedEntryContextV3[]).map((context) => [
      context.entry_id,
      context
    ])
  );
  return (state.items as SurfaceMatchItemV3[]).map((item) => {
    if (item.match_kind === "form_variant_v3") {
      const context = contexts.get(item.match.entry_id);
      return {
        key: surfaceItemKey(item),
        entry_id: item.match.entry_id,
        label: context?.presentation.label ?? item.match.spelling,
        status: item.match.status,
        match_count: 1,
        membership: membership(state.confirmation_reasons),
        source_labels: [
          `V3 词形 · ${item.match.spelling} · ${item.match.form_type} · ${item.match.dialect}`
        ]
      };
    }
    const context = contexts.get(item.match.existing.word_id);
    const source = item.match.existing.source;
    return {
      key: surfaceItemKey(item),
      entry_id: item.match.existing.word_id,
      label: context?.presentation.label ?? item.match.existing.headword,
      status: item.match.existing.status,
      match_count: 1,
      membership: membership(state.confirmation_reasons),
      source_labels: [
        `V3 兼容来源 · ${source.source_kind === "form" ? "词形" : "主词"} · ${source.surface} · ${source.dialect}`
      ]
    };
  });
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
