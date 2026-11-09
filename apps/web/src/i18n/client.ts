"use client";

import { validatedWebLocale } from "./snapshot";
import { useMemo } from "react";
import { useInterfaceInstance, useTranslation } from "@tsz/shared/i18n/react";
import { webCommon, addWebCatalog, webText, type WebCatalog } from "./catalog";

/** 功能资源随调用方分块加载，每个 Provider 的实例单独装配。 */
export function useWebText(catalog: WebCatalog) {
  const instance = useInterfaceInstance();
  useMemo(() => {
    addWebCatalog(instance, webCommon);
    addWebCatalog(instance, catalog);
  }, [instance, catalog]);
  useTranslation(undefined, { i18n: instance });
  return useMemo(() => webText(instance, catalog), [instance, catalog]);
}

export function useWebLocale() {
  const instance = useInterfaceInstance();
  useTranslation(undefined, { i18n: instance });
  return validatedWebLocale(instance.language);
}
