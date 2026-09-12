import type {
  MatchedEntryContextV3,
  SurfaceConfirmationReasonV2,
  SurfaceMatchItemV3,
  SurfaceMatchPageV3,
  SurfacePolicyBlockCodeV2,
  SurfacePolicyNameV2
} from "@tsz/types";
import { dialectLabel, formTypeLabel } from "./word-creation-v3/presentation";

export type SurfaceSnapshotPhase =
  "idle" | "loading" | "ready" | "disabled" | "error" | "expired";

type SurfaceSnapshotItems<TPage extends SurfaceMatchPageV3> =
  TPage extends SurfaceMatchPageV3 ? TPage["items"] : never;
type SurfaceSnapshotContexts<TPage extends SurfaceMatchPageV3> =
  TPage extends SurfaceMatchPageV3 ? TPage["matched_entry_contexts"] : never;

export interface SurfaceSnapshotState<
  TPage extends SurfaceMatchPageV3 = SurfaceMatchPageV3
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

export function isSurfaceMatchPageAny(
  page: unknown
): page is SurfaceMatchPageV3 {
  return (
    typeof page === "object" &&
    page !== null &&
    "schema_version" in page &&
    page.schema_version === 3
  );
}

export type SurfaceSnapshotAction<
  TPage extends SurfaceMatchPageV3 = SurfaceMatchPageV3
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
  TPage extends SurfaceMatchPageV3 = SurfaceMatchPageV3
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

type SurfaceSnapshotItemAny = SurfaceMatchItemV3;
type SurfaceSnapshotContextAny = MatchedEntryContextV3;

function surfaceItemKey(item: SurfaceSnapshotItemAny): string {
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

function surfaceContextKey(context: SurfaceSnapshotContextAny): string {
  return context.entry_id;
}

function pageState<TPage extends SurfaceMatchPageV3>(
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

function sameSnapshot<TPage extends SurfaceMatchPageV3>(
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

export function surfaceSnapshotReducer<TPage extends SurfaceMatchPageV3>(
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

export function canAcknowledgeSurfaceSnapshot<TPage extends SurfaceMatchPageV3>(
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

export interface LifecycleSurfaceMatchCard {
  key: string;
  entry_id: string;
  schema_version: 3;
  label: string;
  kind: "word" | "phrase";
  status: "draft" | "published" | "archived";
  match_count: number;
  membership: SurfaceMatchMembership;
  source_labels: string[];
  pos_labels: string[];
  gloss_previews: string[];
}

const POS_LABELS: Record<string, string> = {
  noun: "名词",
  pronoun: "代词",
  verb: "动词",
  adjective: "形容词",
  adverb: "副词",
  preposition: "介词",
  article: "冠词",
  determiner: "限定词",
  conjunction: "连词",
  numeral: "数词",
  interjection: "感叹词"
};

function productPosLabels(values: string[]): string[] {
  return uniqueBy(
    values.map((value) =>
      POS_LABELS[value]
        ? POS_LABELS[value]
        : /[\u3400-\u9fff]/u.test(value)
          ? value
          : "其他词性"
    ),
    (value) => value
  );
}

function v3SourceLabel(
  item: SurfaceMatchItemV3,
  label: (code: string) => string
): string {
  return `词形 · ${item.match.spelling} · ${label(item.match.form_type)} · ${dialectLabel(item.match.dialect)}`;
}

/** Lifecycle confirmation uses each schema's real source and presentation fields. */
export function aggregateLifecycleSurfaceMatchCards(
  state: SurfaceSnapshotState<SurfaceMatchPageV3>,
  typeLabel = formTypeLabel
): LifecycleSurfaceMatchCard[] {
  const contexts = new Map(
    (state.matched_entry_contexts as MatchedEntryContextV3[]).map((context) => [
      context.entry_id,
      context
    ])
  );
  const cards = new Map<string, LifecycleSurfaceMatchCard>();
  for (const item of state.items as SurfaceMatchItemV3[]) {
    const entryId = item.match.entry_id;
    const context = contexts.get(entryId);
    const label = context?.presentation.label ?? item.match.spelling;
    const status = item.match.status;
    const sourceLabel = v3SourceLabel(item, typeLabel);
    const existing = cards.get(entryId);
    if (existing) {
      existing.match_count += 1;
      existing.source_labels = uniqueBy(
        [...existing.source_labels, sourceLabel],
        (value) => value
      );
      continue;
    }
    cards.set(entryId, {
      key: entryId,
      entry_id: entryId,
      schema_version: 3,
      label,
      kind: "word",
      status,
      match_count: 1,
      membership: membership(state.confirmation_reasons),
      source_labels: [sourceLabel],
      pos_labels: productPosLabels(context?.pos_labels ?? []),
      gloss_previews: context?.gloss_previews ?? []
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
