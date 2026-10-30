export function codePointLength(value: string): number {
  return Array.from(value).length;
}

export function codePointSlice(
  value: string,
  start?: number,
  end?: number
): string {
  return Array.from(value).slice(start, end).join("");
}

export function codePointRangeContainsNewline(
  value: string,
  start: number,
  end: number
): boolean {
  return codePointSlice(value, start, end).includes("\n");
}
