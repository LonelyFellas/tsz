import type { Metadata } from "next";
import { WordListBrowser } from "@/features/wordlist";

export const metadata: Metadata = {
  title: "单词表",
  description: "浏览天生会背的英语单词表,按教材与主题分组,科学记忆每一个词。",
  alternates: { canonical: "/wordlists" }
};

// 词表浏览(师生共用)。逻辑全在 feature 里,page 只组合。
export default function WordListsPage() {
  return <WordListBrowser />;
}
