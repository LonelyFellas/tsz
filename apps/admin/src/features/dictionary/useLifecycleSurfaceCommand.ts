import { HttpError } from "@tsz/api-client/http";
import type { SurfaceMatchPageV2 } from "@tsz/types";
import { useCallback, useRef, useState } from "react";
import { newWordNodeId } from "./word-model/primitives";
import {
  canAcknowledgeSurfaceSnapshot,
  requiresNewIdempotencyKey
} from "./surfaceSnapshot";
import { useSurfaceSnapshot } from "./useSurfaceSnapshot";

export function useLifecycleSurfaceCommand(resetKey: string) {
  const [page, setPage] = useState<SurfaceMatchPageV2>();
  const key = useRef(newWordNodeId());
  const snapshot = useSurfaceSnapshot(
    page,
    `${resetKey}:${page?.snapshot_id ?? "none"}`
  );

  const clear = useCallback(() => {
    setPage(undefined);
    key.current = newWordNodeId();
  }, []);

  const run = useCallback(
    async <T>(
      execute: (idempotencyKey: string, token?: string) => Promise<T>
    ) => {
      const token = canAcknowledgeSurfaceSnapshot(snapshot)
        ? snapshot.surface_confirmation_token
        : undefined;
      try {
        const result = await execute(key.current, token);
        clear();
        return { ok: true, result } as const;
      } catch (error) {
        if (
          error instanceof HttpError &&
          (error.status === 409 || error.status === 410) &&
          requiresNewIdempotencyKey(error.status, error.code)
        ) {
          key.current = newWordNodeId();
          setPage(error.meta?.surface_match_page);
          return { ok: false, error, confirmationRequired: true } as const;
        }
        throw error;
      }
    },
    [clear, snapshot]
  );

  return { page, snapshot, run, clear };
}
