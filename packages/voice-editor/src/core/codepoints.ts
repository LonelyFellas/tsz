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

export function codePointToUtf16Index(value: string, offset: number): number {
  const points = Array.from(value);
  if (!Number.isInteger(offset) || offset < 0 || offset > points.length) {
    throw new RangeError(`invalid code-point offset: ${offset}`);
  }
  return points.slice(0, offset).join("").length;
}

export function utf16IndexToCodePoint(value: string, index: number): number {
  if (!Number.isInteger(index) || index < 0 || index > value.length) {
    throw new RangeError(`invalid UTF-16 index: ${index}`);
  }
  let utf16 = 0;
  let codePoints = 0;
  for (const point of value) {
    if (utf16 === index) return codePoints;
    utf16 += point.length;
    codePoints += 1;
    if (utf16 > index) {
      throw new RangeError(
        `UTF-16 index is not a code-point boundary: ${index}`
      );
    }
  }
  return codePoints;
}

export function codePointRangeContainsNewline(
  value: string,
  start: number,
  end: number
): boolean {
  return codePointSlice(value, start, end).includes("\n");
}
