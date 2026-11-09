import {
  DEFAULT_INTERFACE_LOCALE,
  INTERFACE_LOCALES,
  type InterfaceLocale
} from "@tsz/shared/i18n";
export const GUEST_LOCALE_COOKIE = "tsz_web_guest_locale_v1";
export function validatedWebLocale(value: unknown): InterfaceLocale {
  return (
    INTERFACE_LOCALES.find((locale) => locale === value) ??
    DEFAULT_INTERFACE_LOCALE
  );
}

export const openGraphLocale: Record<InterfaceLocale, string> = {
  "zh-Hans": "zh_CN",
  "zh-Hant": "zh_TW",
  "en-GB": "en_GB",
  "en-US": "en_US"
};
