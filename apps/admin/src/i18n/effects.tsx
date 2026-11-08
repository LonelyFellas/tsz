import { useEffect, useLayoutEffect } from "react";
import { resolveInterfaceLocale } from "@tsz/shared/i18n";
import { interfacePreferences } from "@/lib/interface-preferences";
import { useAdminTranslation } from "./index";

export function AdminLocaleEffects() {
  const { i18n, t } = useAdminTranslation();
  useLayoutEffect(() => {
    document.documentElement.lang = resolveInterfaceLocale(i18n.language);
    document.title = `天生会背 · ${t("nav_platform")}`;
  }, [i18n.language, t]);
  useEffect(() => {
    const refresh = () => {
      void interfacePreferences.refresh();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", visible);
    };
  }, []);
  return null;
}
