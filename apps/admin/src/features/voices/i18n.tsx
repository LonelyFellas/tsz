import { useState } from "react";
import { useAdminModuleTranslation } from "@/i18n";
import { voiceMessages, voiceLabelKeys } from "./messages";
export type VoiceKey = keyof typeof voiceMessages;
export type VoiceTranslation = (
  key: VoiceKey,
  values?: Record<string, string | number>
) => string;
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(voiceMessages).map(([key, values]) => [key, values[column]])
  ) as Record<VoiceKey, string>;
export const voiceResources = {
  "zh-Hans": { adminVoices: bundle(0) },
  "zh-Hant": { adminVoices: bundle(1) },
  en: { adminVoices: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminVoices: Record<VoiceKey, string>;
  }
}
export function useVoiceTranslation() {
  return useAdminModuleTranslation("adminVoices", voiceResources);
}
export const defaultVoiceTranslation: VoiceTranslation = (key, values) =>
  voiceMessages[key][0].replace(/{{(\w+)}}/g, (_, name: string) =>
    String(values?.[name] ?? `{{${name}}}`)
  );
export function VoiceText({
  message,
  params
}: {
  message: VoiceKey;
  params?: Record<string, string | number>;
}) {
  const { t } = useVoiceTranslation();
  return <>{t(message, params ?? {})}</>;
}
/** A local UI message retains its data and formats it in the current language at render time. */
export type VoiceMessage = { format: (t: VoiceTranslation) => string };
export type VoiceMessageValue = string | VoiceMessage | null | undefined;
export function voiceMessage(
  key: VoiceKey,
  values?: Record<string, string | number>
): VoiceMessage {
  return { format: (t) => t(key, values) };
}
export function voiceMessageText(
  message: VoiceMessageValue,
  t: VoiceTranslation = defaultVoiceTranslation
): string | undefined {
  return typeof message === "object" && message !== null
    ? message.format(t)
    : (message ?? undefined);
}
export function useVoiceMessageState(initial: VoiceMessageValue = undefined) {
  const { t } = useVoiceTranslation();
  const [message, setMessage] = useState<VoiceMessageValue>(initial);
  return [voiceMessageText(message, t), setMessage] as const;
}
/** Only fixed catalog/enum labels use this mapping. Provider IDs, names, prose and server errors stay raw. */
export function voiceLabel(
  source: string,
  t: VoiceTranslation = defaultVoiceTranslation
): string {
  const key = Object.hasOwn(voiceLabelKeys, source)
    ? voiceLabelKeys[source]
    : undefined;
  return key ? t(key) : source;
}
export function voiceSearchText(source: string): string {
  const key = Object.hasOwn(voiceLabelKeys, source)
    ? voiceLabelKeys[source]
    : undefined;
  return key ? voiceMessages[key].join(" ") : source;
}
