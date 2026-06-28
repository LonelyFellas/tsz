import type { Word } from "@tsz/types";

// 模拟「平台智能词库」。接后端后换成 api.word.list()。
export const MOCK_WORDS: Word[] = [
  {
    id: "w1",
    text: "天",
    definition: "天空;一天",
    phonetic: "tiān",
    created_at: ""
  },
  {
    id: "w2",
    text: "生",
    definition: "出生;生长",
    phonetic: "shēng",
    created_at: ""
  },
  {
    id: "w3",
    text: "字",
    definition: "文字;字体",
    phonetic: "zì",
    created_at: ""
  },
  {
    id: "w4",
    text: "学",
    definition: "学习;学问",
    phonetic: "xué",
    created_at: ""
  },
  {
    id: "w5",
    text: "习",
    definition: "练习;习惯",
    phonetic: "xí",
    created_at: ""
  },
  {
    id: "w6",
    text: "词",
    definition: "词语;单词",
    phonetic: "cí",
    created_at: ""
  }
];
