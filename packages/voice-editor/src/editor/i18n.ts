import {
  RichTextValidationError,
  type RichTextValidationIssue
} from "../core/normalize";
import {
  MAX_RICH_TEXT_CODE_POINTS,
  MAX_RICH_TEXT_ANNOTATIONS,
  MIN_PAUSE_MS,
  MAX_PAUSE_MS,
  phonemeCodePointLimit
} from "../core/limits";
import { VoiceEditorDisplayError } from "../types";
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
  const { t, i18n } = useVoiceEditorTranslation();
  const [message, setMessage] = useState<
    string | VoiceEditorMessage | VoiceEditorDisplayError | undefined
  >(initial);
  return [
    message instanceof VoiceEditorDisplayError
      ? message.displayMessage(i18n.language)
      : typeof message === "object"
        ? t(message.key, message.values ?? {})
        : (message ?? ""),
    setMessage
  ] as const;
}

export function voiceEditorErrorMessage(
  error: unknown,
  fallback: VoiceEditorKey
) {
  if (error instanceof RichTextValidationError)
    return richTextIssueMessage(error.issues[0]);
  return error instanceof VoiceEditorDisplayError
    ? error
    : error instanceof Error
      ? error.message
      : createVoiceEditorMessage(fallback);
}

export function richTextIssueMessage(
  issue?: RichTextValidationIssue
): VoiceEditorMessage {
  return createVoiceEditorMessage(
    issue ? `local_${issue.code}` : "local_rich_text_invalid",
    {
      limit: MAX_RICH_TEXT_CODE_POINTS,
      annotations: MAX_RICH_TEXT_ANNOTATIONS,
      min: MIN_PAUSE_MS,
      max: MAX_PAUSE_MS,
      ipa: phonemeCodePointLimit("ipa"),
      ups: phonemeCodePointLimit("ups")
    }
  );
}
export function localVoiceEditorErrorText(
  error: unknown,
  t: VoiceEditorTranslation
) {
  const message = voiceEditorErrorMessage(error, "operation_failed_try_again");
  return message instanceof VoiceEditorDisplayError
    ? message.message
    : typeof message === "object"
      ? t(message.key, message.values)
      : message;
}
