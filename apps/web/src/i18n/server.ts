import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { decodeInterfaceCapabilities } from "@tsz/api-client";
import {
  createInterfaceI18n,
  DEFAULT_INTERFACE_LOCALE,
  INTERFACE_LOCALES
} from "@tsz/shared/i18n";
import { webCommon, addWebCatalog, webText, type WebCatalog } from "./catalog";
import { GUEST_LOCALE_COOKIE } from "./snapshot";

/** React cache 只在本次 RSC 请求内复用；不缓存活动语言或目录。 */
export const getWebLocale = cache(async () => {
  const hint = (await cookies()).get(GUEST_LOCALE_COOKIE)?.value;
  try {
    const base = process.env.BACKEND_API_URL ?? "http://localhost:8383/api/v1";
    const response = await fetch(`${base}/i18n/capabilities?surface=web`, {
      cache: "no-store",
      signal: AbortSignal.timeout(1500)
    });
    if (!response.ok) return DEFAULT_INTERFACE_LOCALE;
    const directory = decodeInterfaceCapabilities(await response.json());
    return (
      directory.supported_locales
        .filter((locale) => INTERFACE_LOCALES.includes(locale))
        .find((locale) => locale === hint) ?? directory.default_locale
    );
  } catch {
    return DEFAULT_INTERFACE_LOCALE;
  }
});

export async function getServerWebText(catalog: WebCatalog) {
  const instance = createInterfaceI18n(await getWebLocale());
  addWebCatalog(instance, webCommon);
  addWebCatalog(instance, catalog);
  return webText(instance, catalog);
}
