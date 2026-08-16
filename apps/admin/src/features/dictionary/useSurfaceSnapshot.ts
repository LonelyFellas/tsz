import { HttpError } from "@tsz/api-client/http";
import type { SurfaceMatchPageV2 } from "@tsz/types";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { adminWordsDataSource } from "./dataSource";
import {
  EMPTY_SURFACE_SNAPSHOT_STATE,
  surfaceSnapshotReducer
} from "./surfaceSnapshot";

export type FetchSurfaceMatchPage = (
  snapshotId: string,
  cursor: string,
  signal: AbortSignal
) => Promise<SurfaceMatchPageV2>;

const defaultFetchSurfaceMatchPage: FetchSurfaceMatchPage = (
  snapshotId,
  cursor,
  signal
) => adminWordsDataSource.surfaceMatchSnapshotPage(snapshotId, cursor, signal);

function isSurfaceSnapshotExpired(error: unknown): boolean {
  if (error instanceof HttpError) {
    return (
      error.status === 410 && error.code === "surface_match_snapshot_expired"
    );
  }
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 410 &&
    "code" in error &&
    error.code === "surface_match_snapshot_expired"
  );
}

/** Shared sequential loader used by Create/Forms/Publish/Restore warning flows. */
export function useSurfaceSnapshot(
  initialPage: SurfaceMatchPageV2 | undefined,
  resetKey: string,
  fetchPage: FetchSurfaceMatchPage = defaultFetchSurfaceMatchPage
) {
  const generation = useRef(0);
  const [retryVersion, setRetryVersion] = useState(0);
  const [state, dispatch] = useReducer(
    surfaceSnapshotReducer,
    EMPTY_SURFACE_SNAPSHOT_STATE
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
          expired: isSurfaceSnapshotExpired(error)
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
