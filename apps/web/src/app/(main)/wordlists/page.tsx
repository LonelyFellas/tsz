import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { WordListBrowser } from "@/features/wordlist";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("webApp:word_lists"),
    description: uiText(
      "webApp:browse_english_word_lists_on_grouped_by_textbook_and_topic"
    ),
    alternates: { canonical: "/wordlists" }
  };
}

// 词表浏览(师生共用)。逻辑全在 feature 里,page 只组合。
export default function WordListsPage() {
  return <WordListBrowser />;
}
