"use client";

import { useSessionRecovery } from "@tsz/shared/auth";
import { authRuntime } from "@/lib/auth";

export function useSessionRestore() {
  return useSessionRecovery(authRuntime.restoreSession);
}
