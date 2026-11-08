import { createInterfaceI18n, type InterfaceLocale } from "@tsz/shared/i18n";
import { useInterfaceInstance, useTranslation } from "@tsz/shared/i18n/react";
import { adminShellResources, type AdminShellKey } from "./resources";

export { adminShellResources } from "./resources";
export function createAdminI18n(locale?: InterfaceLocale) {
  return createInterfaceI18n(locale, adminShellResources);
}
export function useAdminTranslation() {
  return useTranslation("adminShell", {
    i18n: useInterfaceInstance(createAdminI18n)
  });
}
export function AdminText({
  message,
  params
}: {
  message: AdminShellKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useAdminTranslation();
  return <>{t(message, params ?? {})}</>;
}
