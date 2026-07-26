import type { Band } from "./types";

// Mock 词库:80 真词(Oxford 3000/5000 抽样,按 CEFR 分档)+ 12 假词。
// 仅供前端联调;真实词库在后端,见产品方案 §6。

export const REAL_WORDS: Record<Band, readonly string[]> = {
  A1: [
    "apple",
    "book",
    "water",
    "happy",
    "friend",
    "school",
    "morning",
    "family",
    "red",
    "dog",
    "eat",
    "house",
    "big",
    "sun"
  ],
  A2: [
    "weather",
    "borrow",
    "dangerous",
    "holiday",
    "kitchen",
    "medicine",
    "neighbor",
    "practice",
    "quiet",
    "repair",
    "discover",
    "promise",
    "lucky"
  ],
  B1: [
    "achieve",
    "admire",
    "ancient",
    "attitude",
    "avoid",
    "benefit",
    "challenge",
    "decrease",
    "employ",
    "familiar",
    "generous",
    "obvious",
    "opportunity"
  ],
  B2: [
    "assess",
    "consequence",
    "controversial",
    "distribute",
    "emphasis",
    "inevitable",
    "negotiate",
    "perceive",
    "reluctant",
    "significant",
    "sustain",
    "undermine",
    "vague"
  ],
  C1: [
    "adjacent",
    "ambiguous",
    "coherent",
    "deteriorate",
    "feasible",
    "meticulous",
    "notorious",
    "plausible",
    "scrutiny",
    "pragmatic",
    "resilient",
    "intricate",
    "condone"
  ],
  C2: [
    "perfunctory",
    "ubiquitous",
    "ephemeral",
    "obfuscate",
    "quintessential",
    "recalcitrant",
    "sycophant",
    "taciturn",
    "insidious",
    "magnanimous",
    "esoteric",
    "laconic",
    "abstruse"
  ]
};

/** 假词:符合英语音位规则但不存在的词,不分档。误报它们是唯一的乱猜信号。 */
export const PSEUDO_WORDS: readonly string[] = [
  "mensible",
  "purrage",
  "kilp",
  "flonty",
  "spandle",
  "trebound",
  "quilture",
  "vasterly",
  "plimsy",
  "dorvish",
  "morbex",
  "stelfy"
];
