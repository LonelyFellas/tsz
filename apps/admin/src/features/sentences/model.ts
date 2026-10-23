import type { SharedSentenceContent } from "@tsz/types";
import { newSentenceTranslations } from "../dictionary/word-creation-v3/meaningsModel";

/** 只有新建例句时提供初 / 中 / 高 / 高空白模板。 */
export function newSentence(): SharedSentenceContent {
  const translations = newSentenceTranslations(() => crypto.randomUUID());
  const alias = translations[1]!;
  return {
    sentence: {
      id: crypto.randomUUID(),
      level: "B1",
      en_text: {
        mode: "unified",
        common: {
          id: crypto.randomUUID(),
          origin: "manual",
          value: { version: 2, text: "", annotations: [] }
        }
      },
      zh_text_id: alias.id,
      zh_text: alias.content,
      zh_translations: translations,
      links: []
    },
    annotations: []
  };
}
