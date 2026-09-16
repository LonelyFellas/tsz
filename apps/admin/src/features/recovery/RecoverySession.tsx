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
    // 恢复失败也会 hydrated=true；只有确认身份后才能清理其他账号备份。
    if (!hydrated || !userId) return;
    try {
      clearOtherSnapshots(userId, sessionStorage);
    } catch {
      /* 编辑器会显示存储失败。 */
    }
  }, [userId, hydrated]);
  return null;
}
