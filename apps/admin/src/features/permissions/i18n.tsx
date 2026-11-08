import { useAdminModuleTranslation } from "@/i18n";
import { accessMessages, accessLabelKeys } from "./access-messages";

export type AccessKey = keyof typeof accessMessages;
export type AccessTranslation = (
  key: AccessKey,
  values?: Record<string, string | number>
) => string;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(accessMessages).map(([key, messages]) => [
      key,
      messages[column]
    ])
  ) as Record<AccessKey, string>;
export const accessResources = {
  "zh-Hans": { adminAccess: bundle(0) },
  "zh-Hant": { adminAccess: bundle(1) },
  en: { adminAccess: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminAccess: Record<AccessKey, string>;
  }
}
export function useAccessTranslation() {
  return useAdminModuleTranslation("adminAccess", accessResources);
}
export const defaultAccessTranslation: AccessTranslation = (key, values) =>
  accessMessages[key][0].replace(/{{(\w+)}}/g, (_, name: string) =>
    String(values?.[name] ?? `{{${name}}}`)
  );
export function AccessText({
  message,
  params
}: {
  message: AccessKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useAccessTranslation();
  return <>{t(message, params ?? {})}</>;
}
/** Only fixed catalog/enum UI text goes through this mapping; names, secrets and server errors stay raw. */
export function accessLabel(
  source: string,
  t: AccessTranslation = defaultAccessTranslation
): string {
  const key = Object.hasOwn(accessLabelKeys, source)
    ? accessLabelKeys[source]
    : undefined;
  return key ? t(key) : source;
}

/** Search fixed catalog UI text in every interface language so a locale change keeps the same matches. */
export function accessLabelSearchText(source: string): string {
  const key = Object.hasOwn(accessLabelKeys, source)
    ? accessLabelKeys[source]
    : undefined;
  return key ? accessMessages[key].join(" ") : source;
}
