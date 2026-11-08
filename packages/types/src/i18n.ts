export type InterfaceLocaleV1 = "zh-Hans" | "zh-Hant" | "en-GB" | "en-US";
export type InterfaceSurface = "web" | "admin";

export interface InterfaceCapabilities {
  schema_version: 1;
  preference_version: 1;
  default_locale: InterfaceLocaleV1;
  supported_locales: InterfaceLocaleV1[];
}

export interface UserInterfacePreferencesResponse {
  preferences: { interface_locale: InterfaceLocaleV1 | null };
}

export interface UpdateUserInterfacePreferences {
  interface_locale: InterfaceLocaleV1 | null;
}
