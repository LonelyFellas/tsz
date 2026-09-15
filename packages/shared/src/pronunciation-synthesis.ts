import type { PronunciationSynthesisV3, RichTextV2 } from "@tsz/types";

export const SYNTHESIS_LIMITS = { ipa: 200, ups: 1600 } as const;
export const EMPTY_SYNTHESIS: PronunciationSynthesisV3 = {
  alphabet: "ipa",
  ipa: "",
  ups: ""
};

/** Candidates may be unfinished in a draft; only the selected side is required to synthesize. */
export function synthesisInputIssue(
  alphabet: "ipa" | "ups",
  value: string
): string | undefined {
  if (!value.trim()) return `请填写 Azure ${alphabet.toUpperCase()}`;
  if (Array.from(value).length > SYNTHESIS_LIMITS[alphabet])
    return `Azure ${alphabet.toUpperCase()} 最多 ${SYNTHESIS_LIMITS[alphabet]} 个字符`;
  if (/\p{Cc}/u.test(value)) return "音素不能包含换行、制表符或其他控制字符";
  if (alphabet === "ups" && /[^\x20-\x7e]/u.test(value))
    return "UPS 使用区分大小写、以空格分隔的 ASCII 音素";
  return undefined;
}

/** Spelling is the readable body, never the phoneme string. Offsets count Unicode code points. */
export function pronunciationSynthesisContent(
  spelling: string,
  synthesis?: PronunciationSynthesisV3
): RichTextV2 | undefined {
  if (
    !spelling.trim() ||
    !synthesis ||
    synthesisInputIssue(synthesis.alphabet, synthesis[synthesis.alphabet])
  )
    return undefined;
  return {
    version: 2,
    text: spelling,
    annotations: [
      {
        type: "phoneme",
        start: 0,
        end: Array.from(spelling).length,
        alphabet: synthesis.alphabet,
        phoneme: synthesis[synthesis.alphabet].trim()
      }
    ]
  };
}

export type PhoneticConversion =
  | { ok: true; value: string }
  | { ok: false; position: number; symbol: string; message: string };

// Verified basic phones from Microsoft's UPS/IPA table. This deliberately excludes
// ambiguous dictionary r/e, diphthongs, stress, length and syllable conventions.
// https://learn.microsoft.com/azure/ai-services/speech-service/customize-pronunciation
// The table describes recognition data, so synthesis voice support still requires real audition.
const BASIC_UPS: Readonly<Record<string, string>> = {
  b: "B",
  d: "D",
  ð: "DH",
  f: "F",
  g: "G",
  h: "H",
  k: "K",
  l: "L",
  m: "M",
  n: "N",
  ŋ: "NG",
  p: "P",
  s: "S",
  ʃ: "SH",
  t: "T",
  θ: "TH",
  v: "V",
  w: "W",
  j: "J",
  z: "Z",
  ʒ: "ZH",
  ɑ: "AA",
  æ: "AE",
  ʌ: "AH",
  ɔ: "AO",
  ə: "AX",
  ɛ: "EH",
  ɪ: "IH",
  i: "I",
  o: "O",
  ɒ: "Q",
  ʊ: "UH",
  u: "U"
};
const IPA_EXTRA = new Set(Array.from("ɹɻɚɝ.ˈˌ"));
// Longest matches before individual phones; a syllable dot is never an affricate tie.
const COMBINATIONS = [
  { source: "t͡ʃ", ipa: "tʃ", ups: "CH" },
  { source: "d͡ʒ", ipa: "dʒ", ups: "JH" },
  { source: "tʃ", ipa: "tʃ", ups: "CH" },
  { source: "dʒ", ipa: "dʒ", ups: "JH" },
  { source: "ʧ", ipa: "tʃ", ups: "CH" },
  { source: "ʤ", ipa: "dʒ", ups: "JH" },
  ...[
    "iː",
    "uː",
    "ɑː",
    "ɔː",
    "ɜː",
    "aɪ",
    "aʊ",
    "eɪ",
    "ɔɪ",
    "əʊ",
    "oʊ",
    "ɪə",
    "ɛə",
    "ʊə"
  ].map((source) => ({ source, ipa: source, ups: undefined }))
];

/** Strict, partial conversion: failure identifies the original code-point offset and writes nothing. */
export function convertDictionaryPhonetic(
  input: string,
  alphabet: "ipa" | "ups"
): PhoneticConversion {
  const original = Array.from(input);
  let start = 0;
  let end = original.length;
  while (start < end && /\s/u.test(original[start]!)) start++;
  while (end > start && /\s/u.test(original[end - 1]!)) end--;
  if (
    (original[start] === "/" && original[end - 1] === "/") ||
    (original[start] === "[" && original[end - 1] === "]")
  ) {
    start++;
    end--;
  }
  const fail = (position: number, message: string): PhoneticConversion => ({
    ok: false,
    position,
    symbol: original[position] ?? "",
    message
  });
  if (start >= end) return fail(start, "请先填写字典音标");
  const phones = original.slice(start, end);
  const result: string[] = [];
  for (let index = 0; index < phones.length; index++) {
    const phone = phones[index]!;
    const remaining = phones.slice(index).join("");
    const combination = COMBINATIONS.find((item) =>
      remaining.startsWith(item.source)
    );
    if (combination) {
      if (alphabet === "ups" && !combination.ups)
        return fail(
          start + index,
          "此音素组合的 UPS 转换尚未完成合成验证，请手工输入"
        );
      result.push(alphabet === "ipa" ? combination.ipa : combination.ups!);
      index += Array.from(combination.source).length - 1;
      continue;
    }

    if (
      phone === "." &&
      (index === 0 ||
        index === phones.length - 1 ||
        /[.ˈˌ]/u.test(phones[index - 1]!))
    )
      return fail(start + index, "音节边界两侧必须有音素");
    if (
      (phone === "ˈ" || phone === "ˌ") &&
      (index === phones.length - 1 || /[.ˈˌ]/u.test(phones[index + 1]!))
    )
      return fail(start + index, "重音标记之后必须有音素");
    if (phone === "r")
      return fail(
        start + index,
        "字典 r 的目标音值未确定，请确认 ɹ/ɻ 等规则或手工输入"
      );
    if (
      (phone === "ˈ" || phone === "ˌ") &&
      index > 0 &&
      phones[index - 1] !== "."
    )
      return fail(
        start + index,
        "非首音节重音缺少明确音节边界，请补充转换规则或手工输入"
      );
    if (!(phone in BASIC_UPS) && !IPA_EXTRA.has(phone))
      return fail(start + index, "此符号或组合尚无确认的转换规则，请手工输入");
    if (alphabet === "ups") {
      if (!(phone in BASIC_UPS))
        return fail(start + index, "此音素的 UPS 转换规则尚未确认，请手工输入");
      // Adjacent vowels may be a diphthong; never guess how a dictionary encodes it.
      if (
        index > 0 &&
        /[ɑæʌɔəɛɪioɒʊu]/u.test(phone) &&
        /[ɑæʌɔəɛɪioɒʊu]/u.test(phones[index - 1]!)
      )
        return fail(
          start + index - 1,
          "相邻元音的双元音/音节规则尚未确认，请手工输入 UPS"
        );
      result.push(BASIC_UPS[phone]!);
    } else result.push(phone);
  }
  const value = result.join(alphabet === "ups" ? " " : "");
  const issue = synthesisInputIssue(alphabet, value);
  return issue ? fail(start, issue) : { ok: true, value };
}
