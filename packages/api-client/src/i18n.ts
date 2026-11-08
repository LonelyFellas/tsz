import type {
  InterfaceCapabilities,
  InterfaceLocaleV1,
  InterfaceSurface,
  UpdateUserInterfacePreferences,
  UserInterfacePreferencesResponse
} from "@tsz/types";
import type { HttpClient } from "./http";
import { validateRuntimeSchema } from "./runtime-schema";

export function decodeInterfaceLocale(
  value: unknown
): InterfaceLocaleV1 | null {
  if (value === null || validateRuntimeSchema("InterfaceLocaleV1", value).valid)
    return value as InterfaceLocaleV1 | null;
  throw new Error("界面语言响应不符合接口契约");
}

export function decodeInterfaceCapabilities(
  value: unknown
): InterfaceCapabilities {
  if (!validateRuntimeSchema("InterfaceCapabilities", value).valid)
    throw new Error("语言目录响应不符合接口契约");
  const result = value as InterfaceCapabilities;
  if (
    result.schema_version !== 1 ||
    result.preference_version !== 1 ||
    !result.supported_locales.length ||
    new Set(result.supported_locales).size !==
      result.supported_locales.length ||
    !result.supported_locales.includes(result.default_locale)
  )
    throw new Error("语言目录不可用");
  return result;
}

export function createInterfaceCapabilitiesEndpoint(http: HttpClient) {
  return (surface: InterfaceSurface) =>
    http
      .get<unknown>(
        `/i18n/capabilities?surface=${encodeURIComponent(surface)}`,
        { skipAuth: true }
      )
      .then(decodeInterfaceCapabilities);
}

export function createUserInterfacePreferencesEndpoints(http: HttpClient) {
  const decode = (value: unknown): UserInterfacePreferencesResponse => {
    if (!validateRuntimeSchema("UserInterfacePreferencesResponse", value).valid)
      throw new Error("界面偏好响应不符合接口契约");
    return value as UserInterfacePreferencesResponse;
  };
  return {
    get: () => http.get<unknown>("/me/preferences").then(decode),
    update: (input: UpdateUserInterfacePreferences) =>
      http.patch<unknown>("/me/preferences", input).then(decode)
  };
}
