import {
  createHttpClient,
  createInterfaceCapabilitiesEndpoint,
  decodeInterfaceLocale
} from "@tsz/api-client";
import { createInterfacePreferences } from "@tsz/shared/i18n/preferences";
import { api, authRuntime, useAuthStore } from "./auth";
import { env } from "./env";

const directory = createInterfaceCapabilitiesEndpoint(
  createHttpClient({ baseUrl: env.API_BASE_URL })
);

export const interfacePreferences = createInterfacePreferences({
  surface: "admin",
  getSession: () => ({
    accountId: useAuthStore.getState().profile?.id ?? null,
    generation: authRuntime.tokens.getSessionGeneration()
  }),
  capabilities: () => directory("admin"),
  read: async () => {
    const value = (await api.profile()).preferences?.interface_locale;
    return value === undefined ? undefined : decodeInterfaceLocale(value);
  },
  write: async (interface_locale) =>
    decodeInterfaceLocale(
      (await api.updateProfilePreferences({ interface_locale })).preferences
        .interface_locale
    ),
  getStorage: () => window.localStorage,
  browserLanguages: () => navigator.languages
});
