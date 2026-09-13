import type { SharedSentenceContent, SentenceSourceRangeV3 } from "@tsz/types";
import { newSentenceTranslations } from "../dictionary/word-creation-v3/meaningsModel";
import type { SentenceToken } from "../dictionary/word-creation-v3/tokens";

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

export function selectedSegments(
  text: string,
  tokens: SentenceToken[]
): SentenceSourceRangeV3[] {
  const chars = Array.from(text);
  const sorted = [...tokens].sort((a, b) => a.start - b.start);
  const result: SentenceSourceRangeV3[] = [];
  for (const token of sorted) {
    const previous = result.at(-1);
    if (
      previous &&
      /^\s*$/.test(chars.slice(previous.end, token.start).join(""))
    ) {
      previous.end = token.end;
      previous.surface = chars.slice(previous.start, previous.end).join("");
    } else
      result.push({ start: token.start, end: token.end, surface: token.text });
  }
  return result;
}
