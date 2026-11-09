import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { decodeInterfaceCapabilities } from "@tsz/api-client";
import {
  createInterfaceI18n,
  DEFAULT_INTERFACE_LOCALE,
  INTERFACE_LOCALES,
  normalizeInterfaceLocale
} from "@tsz/shared/i18n";
import { webCommon, addWebCatalog, webText, type WebCatalog } from "./catalog";
import { GUEST_LOCALE_COOKIE } from "./snapshot";

async function getDirectory() {
  const base = process.env.BACKEND_API_URL ?? "http://localhost:8383/api/v1";
  const response = await fetch(`${base}/i18n/capabilities?surface=web`, {
    cache: "no-store",
    signal: AbortSignal.timeout(1500)
  });
  if (!response.ok) throw new Error("Language directory unavailable");
  return decodeInterfaceCapabilities(await response.json());
}

/** 资源 URL 的语言必须由公开目录授权，不能借用请求 cookie。 */
export async function getPublicResourceLocale(value: string) {
  try {
    const directory = await getDirectory();
    return (
      directory.supported_locales.find((locale) => locale === value) ??
      directory.default_locale
    );
  } catch {
    return DEFAULT_INTERFACE_LOCALE;
  }
}

/** React cache 只在本次 RSC 请求内复用；不缓存活动语言或目录。 */
export const getWebLocale = cache(async () => {
  const hint = (await cookies()).get(GUEST_LOCALE_COOKIE)?.value;
  try {
    const directory = await getDirectory();
    const supported = directory.supported_locales.filter((locale) =>
      INTERFACE_LOCALES.includes(locale)
    );
    const selected = supported.find((locale) => locale === hint);
    if (selected) return selected;
    const languages = ((await headers()).get("accept-language") ?? "")
      .split(",")
      .map((entry) => {
        const [tag, ...parameters] = entry.trim().split(";");
        const weight = parameters.find((parameter) =>
          parameter.trim().startsWith("q=")
        );
        return {
          tag: tag?.trim(),
          quality: weight ? Number(weight.trim().slice(2)) : 1
        };
      })
      .filter(
        ({ quality }) => Number.isFinite(quality) && quality > 0 && quality <= 1
      )
      .sort((a, b) => b.quality - a.quality);
    for (const { tag } of languages) {
      const locale = normalizeInterfaceLocale(tag);
      if (locale && supported.includes(locale)) return locale;
    }
    return directory.default_locale;
  } catch {
    return DEFAULT_INTERFACE_LOCALE;
  }
});

export async function getServerWebText<C extends WebCatalog>(catalog: C) {
  const instance = createInterfaceI18n(await getWebLocale());
  addWebCatalog(instance, webCommon);
  addWebCatalog(instance, catalog);
  return webText(instance, catalog);
}
