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

// JS 启用时在 SSR 内容首次绘制前隐藏；无 JS 仍保留完整公开 HTML。
export const webLocaleBootScript = `(() => {
    document.documentElement.setAttribute("data-locale-pending", "");
    const sync = () => {
      if (!document.documentElement.hasAttribute("data-locale-pending")) {
        observer.disconnect();
        return;
      }
      if (document.title !== "天生会背") document.title = "天生会背";
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-locale-pending"] });
    sync();
  })();`;
export const webLocaleBootStyle =
  "html[data-locale-pending] body > :not(#web-locale-boot):not([data-resource-recovery]), html[data-locale-pending] body > :not(#web-locale-boot):not([data-resource-recovery]) * { visibility: hidden !important; } html[data-locale-pending] #web-locale-boot { display: grid; }";
