import type { PartOfSpeechLookup } from "./catalog";

/** 基本词性按英文缩写展示，只斜体字母、点号保持正体（如 *adj*.）；目录里没有的编码原样显示。 */
export function PartOfSpeechAbbreviation({
  lookup,
  code
}: {
  lookup: PartOfSpeechLookup;
  code: string;
}) {
  const abbreviation = lookup.byCode.get(code)?.abbreviation;
  if (!abbreviation) return code;
  return (
    <>
      {abbreviation
        .split(/([A-Za-z]+)/)
        .map((part, index) =>
          /^[A-Za-z]+$/.test(part) ? <i key={index}>{part}</i> : part
        )}
    </>
  );
}
