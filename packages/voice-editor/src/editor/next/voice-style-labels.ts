import {
  defaultVoiceEditorTranslation,
  type VoiceEditorTranslation
} from "../i18n";
export function voiceStyleNames(
  t: VoiceEditorTranslation = defaultVoiceEditorTranslation
): Record<string, string> {
  return {
    neutral: t("default"),
    cheerful: t("cheerful"),
    sad: t("sad"),
    angry: t("angry"),
    excited: t("excited"),
    friendly: t("friendly"),
    hopeful: t("hopeful"),
    calm: t("calm"),
    chat: t("chat"),
    whispering: t("whispering"),
    shouting: t("shouting"),
    terrified: t("terrified"),
    unfriendly: t("unfriendly"),
    empathetic: t("empathetic"),
    newscast: t("newscast"),
    "newscast-casual": t("casual_newscast"),
    "newscast-formal": t("formal_newscast"),
    customerservice: t("customer_service"),
    "narration-professional": t("professional_narration")
  };
}
export const styleNames = voiceStyleNames();
