/**
 * 英文文本切词：句中目标发现与短语成分用词共用同一套规则，
 * 避免两处对「什么算一个词」给出不同答案（标点、连字符、撇号）。
 * 偏移量按码点计，与后端 selected_segments 的口径一致。
 */
export interface SentenceToken {
  key: string;
  text: string;
  start: number;
  end: number;
  wordIndex: number;
}

export function sentenceTokens(text: string): SentenceToken[] {
  let wordIndex = 0;
  return Array.from(
    text.matchAll(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)
  ).map((match) => {
    const utf16Start = match.index ?? 0;
    const start = Array.from(text.slice(0, utf16Start)).length;
    const end = start + Array.from(match[0]).length;
    return {
      key: `${start}:${end}:${match[0]}`,
      text: match[0],
      start,
      end,
      wordIndex: wordIndex++
    };
  });
}
