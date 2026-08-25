import { HttpError } from "@tsz/api-client/http";
import type { SurfaceMatchPageAny, SurfaceMatchPageV2 } from "@tsz/types";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { adminWordsAnyDataSource, adminWordsDataSource } from "./dataSource";
import {
  createEmptySurfaceSnapshotState,
  type SurfaceSnapshotAction,
  type SurfaceSnapshotState,
  surfaceSnapshotReducer
} from "./surfaceSnapshot";

export type FetchSurfaceMatchPage<
  TPage extends SurfaceMatchPageAny = SurfaceMatchPageV2
> = (snapshotId: string, cursor: string, signal: AbortSignal) => Promise<TPage>;

const defaultFetchSurfaceMatchPage: FetchSurfaceMatchPage = (
  snapshotId,
  cursor,
  signal
) => adminWordsDataSource.surfaceMatchSnapshotPage(snapshotId, cursor, signal);

const defaultFetchSurfaceMatchPageAny: FetchSurfaceMatchPage<
  SurfaceMatchPageAny
> = (snapshotId, cursor, signal) =>
  adminWordsAnyDataSource.surfaceMatchSnapshotPageAny(
    snapshotId,
    cursor,
    signal
  );

function isSurfaceSnapshotInvalidated(error: unknown): boolean {
  if (error instanceof HttpError) {
    return (
      (error.status === 410 &&
        error.code === "surface_match_snapshot_expired") ||
      (error.status === 409 && error.code === "surface_policy_changed")
    );
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "code" in error &&
    ((error.status === 410 &&
      error.code === "surface_match_snapshot_expired") ||
      (error.status === 409 && error.code === "surface_policy_changed"))
  );
}

/** Shared sequential loader used by Create/Forms/Publish/Restore warning flows. */
function useSurfaceSnapshotState<TPage extends SurfaceMatchPageAny>(
  initialPage: TPage | undefined,
  resetKey: string,
  fetchPage: FetchSurfaceMatchPage<TPage>
) {
  const generation = useRef(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, dispatch] = useReducer(
    (
      current: SurfaceSnapshotState<TPage>,
      action: SurfaceSnapshotAction<TPage>
    ) => surfaceSnapshotReducer(current, action),
    createEmptySurfaceSnapshotState<TPage>()
  );

  useEffect(() => {
    generation.current += 1;
    if (!initialPage) {
      dispatch({ type: "reset", generation: generation.current });
      return;
    }
    dispatch({
      type: "start",
      generation: generation.current,
      page: initialPage
    });
  }, [initialPage, resetKey, retryVersion]);

  useEffect(() => {
    if (state.phase !== "loading" || !state.snapshot_id || !state.next_cursor) {
      return;
    }
    const controller = new AbortController();
    const requestedCursor = state.next_cursor;
    const requestedGeneration = state.generation;
    void fetchPage(state.snapshot_id, requestedCursor, controller.signal).then(
      (page) => {
        dispatch({
          type: "page_loaded",
          generation: requestedGeneration,
          requested_cursor: requestedCursor,
          page
        });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        dispatch({
          type: "page_failed",
          generation: requestedGeneration,
          requested_cursor: requestedCursor,
          error,
          expired: isSurfaceSnapshotInvalidated(error)
        });
      }
    );
    return () => controller.abort();
  }, [
    fetchPage,
    state.generation,
    state.next_cursor,
    state.phase,
    state.snapshot_id
  ]);

  const retry = useCallback(() => setRetryVersion((value) => value + 1), []);
  return { ...state, retry };
}

/** Existing V2 creation/editor flow keeps its V2-only data source and types. */
export function useSurfaceSnapshot(
  initialPage: SurfaceMatchPageV2 | undefined,
  resetKey: string,
  fetchPage: FetchSurfaceMatchPage<SurfaceMatchPageV2> = defaultFetchSurfaceMatchPage
) {
  return useSurfaceSnapshotState(initialPage, resetKey, fetchPage);
}

/** Mixed lifecycle flow follows the response discriminator across every page. */
export function useSurfaceSnapshotAny(
  initialPage: SurfaceMatchPageAny | undefined,
  resetKey: string,
  fetchPage: FetchSurfaceMatchPage<SurfaceMatchPageAny> = defaultFetchSurfaceMatchPageAny
) {
  return useSurfaceSnapshotState(initialPage, resetKey, fetchPage);
}
