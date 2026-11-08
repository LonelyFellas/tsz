import { useAdminModuleTranslation } from "@/i18n";
import { aiMessages } from "./messages";
export type AiKey = keyof typeof aiMessages;
export type AiTranslation = (
  key: AiKey,
  values?: Record<string, string | number>
) => string;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(aiMessages).map(([key, values]) => [key, values[column]])
  ) as Record<AiKey, string>;
export const aiResources = {
  "zh-Hans": { adminAi: bundle(0) },
  "zh-Hant": { adminAi: bundle(1) },
  en: { adminAi: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminAi: Record<AiKey, string>;
  }
}
export function useAiTranslation() {
  return useAdminModuleTranslation("adminAi", aiResources);
}
export function AiText({ message }: { message: AiKey }) {
  const { t } = useAiTranslation();
  return <>{t(message)}</>;
}
