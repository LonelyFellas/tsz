import { useAdminModuleTranslation } from "@/i18n";
import { userMessages, type UserMessageKey } from "./messages";
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(userMessages).map(([key, values]) => [key, values[column]])
  ) as Record<UserMessageKey, string>;
export const userResources = {
  "zh-Hans": { adminUsers: bundle(0) },
  "zh-Hant": { adminUsers: bundle(1) },
  en: { adminUsers: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminUsers: Record<UserMessageKey, string>;
  }
}
export function useUserTranslation() {
  return useAdminModuleTranslation("adminUsers", userResources);
}
export function UserText({
  message,
  params
}: {
  message: UserMessageKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useUserTranslation();
  return <>{t(message, params ?? {})}</>;
}
