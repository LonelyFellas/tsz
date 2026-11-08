import { useState, useMemo } from "react";
import { useInterfaceInstance, useTranslation } from "@tsz/shared/i18n/react";
import { voiceEditorMessages } from "./messages";
export type VoiceEditorKey = keyof typeof voiceEditorMessages;
export type VoiceEditorTranslation = (
  key: VoiceEditorKey,
  values?: Record<string, string | number>
) => string;
export const defaultVoiceEditorTranslation: VoiceEditorTranslation = (
  key,
  values
) =>
  voiceEditorMessages[key][0].replace(/{{(\w+)}}/g, (_, name: string) =>
    String(values?.[name] ?? `{{${name}}}`)
  );
const bundle = (column: 0 | 1 | 2) =>
  Object.fromEntries(
    Object.entries(voiceEditorMessages).map(([key, values]) => [
      key,
      values[column]
    ])
  ) as Record<VoiceEditorKey, string>;
export const voiceEditorResources = {
  "zh-Hans": { voiceEditor: bundle(0) },
  "zh-Hant": { voiceEditor: bundle(1) },
  en: { voiceEditor: bundle(2) }
};
declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    voiceEditor: Record<VoiceEditorKey, string>;
  }
}
export function useVoiceEditorTranslation() {
  const instance = useInterfaceInstance();
  useMemo(() => {
    for (const [language, namespaces] of Object.entries(voiceEditorResources)) {
      if (!instance.hasResourceBundle(language, "voiceEditor"))
        instance.addResourceBundle(
          language,
          "voiceEditor",
          namespaces.voiceEditor
        );
    }
  }, [instance]);
  return useTranslation("voiceEditor", { i18n: instance });
}

export type VoiceEditorMessage = {
  key: VoiceEditorKey;
  values?: Record<string, string | number>;
};
export function createVoiceEditorMessage(
  key: VoiceEditorKey,
  values?: Record<string, string | number>
): VoiceEditorMessage {
  return { key, values };
}
export function useVoiceEditorMessageState(initial = "") {
  const { t } = useVoiceEditorTranslation();
  const [message, setMessage] = useState<
    string | VoiceEditorMessage | undefined
  >(initial);
  return [
    typeof message === "object"
      ? t(message.key, message.values ?? {})
      : (message ?? ""),
    setMessage
  ] as const;
}
