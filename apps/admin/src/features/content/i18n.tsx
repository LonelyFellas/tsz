import { useAdminModuleTranslation } from "@/i18n";
import { contentMessages } from "./messages";
export type ContentKey = keyof typeof contentMessages;
export type ContentTranslation = (
  key: ContentKey,
  values?: Record<string, string | number>
) => string;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(contentMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<ContentKey, string>;
export const contentResources = {
  "zh-Hans": { adminContent: bundle(0) },
  "zh-Hant": { adminContent: bundle(1) },
  en: { adminContent: bundle(2) },
  "en-US": {
    adminContent: {
      ...bundle(2),
      favourites: "Favorites",
      catalog_failed: "Could not load the part of speech catalog",
      form_catalog_failed: "Could not load the form type catalog"
    }
  }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminContent: Record<ContentKey, string>;
  }
}
export function useContentTranslation() {
  return useAdminModuleTranslation("adminContent", contentResources);
}
export const defaultContentTranslation: ContentTranslation = (key, values) =>
  contentMessages[key][0].replace(/{{(\w+)}}/g, (_, name: string) =>
    String(values?.[name] ?? `{{${name}}}`)
  );
export function ContentText({
  message,
  params
}: {
  message: ContentKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useContentTranslation();
  return <>{t(message, params ?? {})}</>;
}
