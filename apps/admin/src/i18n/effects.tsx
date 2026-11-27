import { useEffect, useLayoutEffect } from "react";
import { resolveInterfaceLocale } from "@tsz/shared/i18n";
import { refreshAdminProfileAndInterfacePreferences } from "@/lib/interface-preferences";
import { useAdminTranslation } from "./index";
import { useAdminLocaleReady } from "./boot";

export function AdminLocaleEffects() {
  const { i18n, t } = useAdminTranslation();
  const ready = useAdminLocaleReady();
  useLayoutEffect(() => {
    if (!ready) {
      document.documentElement.removeAttribute("data-interface-locale-ready");
      document.title = "天生会背";
      return;
    }
    document.documentElement.lang = resolveInterfaceLocale(i18n.language);
    document.documentElement.setAttribute("data-interface-locale-ready", "");
    document.title = `天生会背 · ${t("nav_platform")}`;
  }, [i18n.language, ready, t]);
  useEffect(() => {
    let focusedSinceLeaving = false;
    let visibilityFrame: number | undefined;
    const refresh = () => {
      void refreshAdminProfileAndInterfacePreferences();
    };
    const cancelVisibilityRefresh = () => {
      if (visibilityFrame === undefined) return;
      window.cancelAnimationFrame(visibilityFrame);
      visibilityFrame = undefined;
    };
    const focused = () => {
      focusedSinceLeaving = true;
      cancelVisibilityRefresh();
      refresh();
    };
    const left = () => {
      focusedSinceLeaving = false;
      cancelVisibilityRefresh();
    };
    const visible = () => {
      if (document.visibilityState !== "visible") return left();
      if (focusedSinceLeaving || visibilityFrame !== undefined) return;
      // 同一次返回若也触发 focus，由 focus 刷新；仅变为可见时由此兜底。
      visibilityFrame = window.requestAnimationFrame(() => {
        visibilityFrame = undefined;
        refresh();
      });
    };
    window.addEventListener("focus", focused);
    window.addEventListener("blur", left);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      cancelVisibilityRefresh();
      window.removeEventListener("focus", focused);
      window.removeEventListener("blur", left);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return null;
}
