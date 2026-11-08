import { createInterfacePreferences } from "@tsz/shared/i18n/preferences";
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
  getStorage: () => window.localStorage,
  browserLanguages: () => navigator.languages
});
