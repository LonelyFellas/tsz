import { HttpError, InvalidAdminProfileResponseError } from "@tsz/api-client";
import { PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH } from "@tsz/shared";
import { passwordErrorMessage } from "@tsz/shared/auth";
import type { useAdminTranslation } from "./index";
import type { AdminShellKey } from "./resources";

type Translate = ReturnType<typeof useAdminTranslation>["t"];
const passwordKeys = {
  password_missing: "login_password_placeholder",
  password_too_short: "password_too_short",
  password_too_long: "password_too_long",
  password_too_weak: "password_weak",
  password_compromised: "password_compromised",
  password_unchanged: "password_unchanged",
  password_hash_unavailable: "password_hash_unavailable"
} as const;
export const passwordParams = {
  min: PASSWORD_MIN_LENGTH,
  max: PASSWORD_MAX_LENGTH
};
export function passwordMessageKey(code: string | undefined): AdminShellKey {
  return passwordKeys[code as keyof typeof passwordKeys] ?? "password_failed";
}
export function passwordLengthMessageKey(message: string): AdminShellKey {
  return passwordMessageKey(
    Object.keys(passwordKeys).find(
      (code) => passwordErrorMessage(code) === message
    )
  );
}

const authCodes: Record<string, AdminShellKey> = {
  invalid_credentials: "auth_credentials",
  account_disabled: "auth_disabled",
  invalid_token: "auth_expired"
};
const legacy: Record<string, AdminShellKey> = {
  "invalid credentials": "auth_credentials",
  "account disabled": "auth_disabled",
  "not found": "auth_feature_unavailable",
  "session expired": "auth_expired",
  "missing refresh token": "auth_expired",
  "invalid refresh token": "auth_expired"
};
export function adminAuthError(
  error: unknown,
  t: Translate,
  fallback: AdminShellKey
): string {
  if (error instanceof InvalidAdminProfileResponseError)
    return t("auth_upgrade");
  const key =
    error instanceof HttpError ? authCodes[error.code ?? ""] : undefined;
  const message = error instanceof Error ? error.message : "";
  const known = key ?? legacy[message.toLowerCase().trim()];
  return known ? t(known) : message || t(fallback);
}
