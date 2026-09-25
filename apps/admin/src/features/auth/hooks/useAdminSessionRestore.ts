import { useSessionRecovery } from "@tsz/shared/auth";
import { authRuntime } from "@/lib/auth";

export function useAdminSessionRestore() {
  return useSessionRecovery(authRuntime.restoreSession);
}
