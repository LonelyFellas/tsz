import { WordListBrowser } from "@/features/wordlist";

// 词表浏览(师生共用)。逻辑全在 feature 里,page 只组合。
export default function WordListsPage() {
  return <WordListBrowser />;
}
