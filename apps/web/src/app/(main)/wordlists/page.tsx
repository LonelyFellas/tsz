import { getServerWebText } from "@/i18n/server";
import { webApp } from "@/i18n/messages/app";
import type { Metadata } from "next";
import { WordListBrowser } from "@/features/wordlist";

export async function generateMetadata(): Promise<Metadata> {
  const uiText = await getServerWebText(webApp);
  return {
    title: uiText("单词表"),
    description: uiText(
      "浏览天生会背的英语单词表,按教材与主题分组,科学记忆每一个词。"
    ),
    alternates: { canonical: "/wordlists" }
  };
}

// 词表浏览(师生共用)。逻辑全在 feature 里,page 只组合。
export default function WordListsPage() {
  return <WordListBrowser />;
}
