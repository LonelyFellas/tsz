import { useEffect } from "react";
import { clearOtherSnapshots } from "@tsz/shared/recovery";
import { useAuthStore } from "@/lib/auth";

export function RecoverySession() {
  useEffect(() => {
    window.dispatchEvent(new Event("tsz:app-ready"));
  }, []);
  const userId = useAuthStore((state) => state.profile?.id);
  const hydrated = useAuthStore((state) => state.hydrated);
  useEffect(() => {
    if (!hydrated) return;
    try {
      clearOtherSnapshots(userId ?? null, sessionStorage);
    } catch {
      /* 编辑器会显示存储失败。 */
    }
  }, [userId, hydrated]);
  return null;
}
