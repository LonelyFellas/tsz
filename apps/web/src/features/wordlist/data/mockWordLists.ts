import type { WordList } from "@tsz/types";

// 模拟词表存储。接后端后整文件删除,改用 api.wordList.*。
// 用可变数组是为了让「创建 → invalidate → 列表刷新」在无后端时也能演示。
export const MOCK_WORDLISTS: WordList[] = [
  {
    id: "wl1",
    name: "小学一年级核心词",
    owner_id: "demo",
    word_ids: ["w1", "w2", "w3"],
    custom_words: [],
    visibility: "public",
    review_status: "approved",
    created_at: new Date().toISOString()
  }
];
