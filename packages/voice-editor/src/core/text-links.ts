import type { SentenceSourceRangeV3, TextLinkV3 } from "@tsz/types";

export function rangesOverlap(
  a: readonly SentenceSourceRangeV3[],
  b: readonly SentenceSourceRangeV3[]
): boolean {
  return a.some((left) =>
    b.some((right) => left.start < right.end && right.start < left.end)
  );
}

/** 文本在关联外改动时平移；被改写的关联整条移除，禁止猜测重复词的位置。 */
export function remapTextLinks<
  TLink extends Pick<TextLinkV3, "source_segments">
>(previous: string, next: string, links: readonly TLink[]): TLink[] {
  if (previous === next) return [...links];
  const before = Array.from(previous);
  const after = Array.from(next);
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    before[oldEnd - 1] === after[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  const delta = newEnd - oldEnd;
  const word = (char: string | undefined) =>
    char !== undefined && /[\p{L}\p{N}'’\-]/u.test(char);
  return links.flatMap((link) => {
    const segments: SentenceSourceRangeV3[] = [];
    for (const segment of link.source_segments) {
      let mapped = { ...segment };
      if (segment.end <= start) {
        // 位于编辑窗口之前。
      } else if (segment.start >= oldEnd) {
        mapped = {
          ...segment,
          start: segment.start + delta,
          end: segment.end + delta
        };
      } else return [];
      if (
        after.slice(mapped.start, mapped.end).join("") !== segment.surface ||
        (word(after[mapped.start - 1]) && word(after[mapped.start])) ||
        (word(after[mapped.end - 1]) && word(after[mapped.end]))
      )
        return [];
      segments.push(mapped);
    }
    return [{ ...link, source_segments: segments }];
  });
}

/** 仅在当前编辑会话内保留；不作为仍有效的关联提交给宿主。 */
export interface RecoverableTextLink<TLink> {
  text: string;
  link: TLink;
}

/** 改回可明确对应的文字时恢复原选择，不搜索或猜测同名词条。 */
export function remapTextLinksWithRecovery<
  TLink extends Pick<TextLinkV3, "id" | "source_segments">
>(
  previous: string,
  next: string,
  links: readonly TLink[],
  recoverable: readonly RecoverableTextLink<TLink>[]
): { links: TLink[]; recoverable: RecoverableTextLink<TLink>[] } {
  const mapped = remapTextLinks(previous, next, links);
  const pending = new Map(recoverable.map((item) => [item.link.id, item]));
  for (const link of links) {
    if (!mapped.some((item) => item.id === link.id))
      pending.set(link.id, { text: previous, link });
  }
  const remaining: RecoverableTextLink<TLink>[] = [];
  for (const item of pending.values()) {
    if (mapped.some((link) => link.id === item.link.id)) continue;
    // 完整原文还原才自动恢复，避免删掉一个重复词后把关联移到另一处。
    const restored = item.text === next ? item.link : undefined;
    if (
      restored &&
      !mapped.some((link) =>
        rangesOverlap(link.source_segments, restored.source_segments)
      )
    )
      mapped.push(restored);
    else remaining.push(item);
  }
  return { links: mapped, recoverable: remaining.slice(-100) };
}

/** 把点击的整词合成有序片段；未选中的中间词仍留在片段之外。 */
export function wordSegments(
  text: string,
  ranges: readonly { start: number; end: number }[]
): SentenceSourceRangeV3[] {
  const chars = Array.from(text);
  const segments: SentenceSourceRangeV3[] = [];
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const previous = segments.at(-1);
    if (previous && range.end <= previous.end) continue;
    if (
      previous &&
      /^[\t ]*$/u.test(chars.slice(previous.end, range.start).join(""))
    ) {
      previous.end = range.end;
      previous.surface = chars.slice(previous.start, previous.end).join("");
    } else
      segments.push({
        ...range,
        surface: chars.slice(range.start, range.end).join("")
      });
  }
  return segments;
}

/** 关联按词库的词边界取词，排除首尾标点，保留词内撇号与连字符。 */
export function associationWords(text: string): SentenceSourceRangeV3[] {
  return [
    ...text.matchAll(/[\p{L}\p{N}\p{M}]+(?:['‘’ʼ‐‑\-]+[\p{L}\p{N}\p{M}]+)*/gu)
  ].map((match) => {
    const start = Array.from(text.slice(0, match.index)).length;
    return {
      start,
      end: start + Array.from(match[0]).length,
      surface: match[0]
    };
  });
}
