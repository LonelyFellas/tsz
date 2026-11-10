import { createInterfacePreferences } from "@tsz/shared/i18n/preferences";
import { GUEST_LOCALE_COOKIE } from "@/i18n/snapshot";
import { interfaceLocaleStorageKey } from "@tsz/shared/i18n/preferences";
import { INTERFACE_LOCALES } from "@tsz/shared/i18n";
import { authRuntime } from "./auth";

export const interfacePreferences = createInterfacePreferences({
  surface: "web",
  getSession: () => ({
    accountId: authRuntime.store.getState().user?.id ?? null,
    generation: authRuntime.tokens.getSessionGeneration()
  }),
  capabilities: () => authRuntime.api.interfaceCapabilities("web"),
  read: async () =>
    (await authRuntime.api.interfacePreferences.get()).preferences
      .interface_locale,
  write: async (interface_locale) =>
    (await authRuntime.api.interfacePreferences.update({ interface_locale }))
      .preferences.interface_locale,
  getPublicLocale: () =>
    window.history.state?.tszLocaleGenerated
      ? null
      : new URL(window.location.href).searchParams.get("lang"),
  onPreferenceChoice: () => {
    try {
      window.history.replaceState(
        { tszLocaleGenerated: true },
        "",
        window.location.href
      );
    } catch {
      // 语言保存成功不能因浏览器历史记录不可用而改判失败。
    }
  },
  getStorage: () => ({
    getItem: (key) => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(key);
      } catch {
        /* cookie 仍可提供访客显示提示。 */
      }
      if (stored || key !== interfaceLocaleStorageKey("web", "guest"))
        return stored;
      const hint = document.cookie
        .split("; ")
        .find((part) => part.startsWith(`${GUEST_LOCALE_COOKIE}=`))
        ?.split("=")[1];
      return INTERFACE_LOCALES.find((locale) => locale === hint) ?? null;
    },
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key)
  }),
  browserLanguages: () => navigator.languages
});
