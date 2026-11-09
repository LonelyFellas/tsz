import { useSyncExternalStore } from "react";
import { Spin } from "@tsz/ui/admin/display";
import { FullscreenCenter } from "@/layouts/FullscreenCenter";
import { useAuthStore } from "@/lib/auth";
import { interfacePreferences } from "@/lib/interface-preferences";

/** 等当前身份的首次语言读取结束；后台刷新保留已打开的页面。 */
export function useAdminLocaleReady() {
  const sessionSettled = useAuthStore(
    (state) =>
      state.hydrated ||
      state.connectionError ||
      state.refreshUnconfirmed ||
      state.permissionModelIncompatible
  );
  const owner = useAuthStore(() => interfacePreferences.sessionKey());
  const snapshot = useSyncExternalStore(
    interfacePreferences.subscribe,
    interfacePreferences.getSnapshot,
    interfacePreferences.getServerSnapshot
  );
  return (
    sessionSettled && snapshot.owner === owner && snapshot.status !== "idle"
  );
}

/** 语言尚未确定时不显示默认中文，包括路由 chunk 的首屏兜底。 */
export function AdminBootFallback() {
  return (
    <FullscreenCenter>
      <Spin size="small" />
    </FullscreenCenter>
  );
}
