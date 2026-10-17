"use client";

import { useSessionRecovery } from "@tsz/shared/auth";
import { authRuntime, restoreInitialSession } from "@/lib/auth";

export function useSessionRestore() {
  return useSessionRecovery(
    authRuntime.restoreSession,
    authRuntime.store.getState,
    restoreInitialSession
  );
}
