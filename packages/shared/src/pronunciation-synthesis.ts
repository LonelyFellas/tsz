import type {
  PronunciationSynthesisV3,
  RichTextV2,
  PhonemeLocaleV3,
  Dialect
} from "@tsz/types";

import { ipaWordToUps } from "./ipa-ups";
export const SYNTHESIS_LIMITS = { ipa: 200, ups: 1600 } as const;
export const EMPTY_SYNTHESIS: PronunciationSynthesisV3 = {
  alphabet: "ipa",
  ipa: "",
  ups: "",
  use_spelling: true
};

/** Candidates may be unfinished in a draft; only the selected side is required to synthesize. */
export function synthesisInputIssue(
  alphabet: "ipa" | "ups",
  input: string | null | undefined
): string | undefined {
  const value = input ?? "";
  if (!value.trim()) return `请填写 Azure ${alphabet.toUpperCase()}`;
  if (Array.from(value).length > SYNTHESIS_LIMITS[alphabet])
    return `Azure ${alphabet.toUpperCase()} 最多 ${SYNTHESIS_LIMITS[alphabet]} 个字符`;
  if (/\p{Cc}/u.test(value)) return "音素不能包含换行、制表符或其他控制字符";
  if (alphabet !== "ipa" && /[^\x20-\x7e]/u.test(value))
    return `${alphabet.toUpperCase()} 使用区分大小写、以空格分隔的 ASCII 音素`;
  return undefined;
}

export function pronunciationLocale(
  dialect: Dialect,
  preference: "uk" | "us"
): PhonemeLocaleV3 {
  return (dialect === "common" ? preference : dialect) === "uk"
    ? "en-GB"
    : "en-US";
}
export function pronunciationLocaleLabel(locale: PhonemeLocaleV3): string {
  return locale === "en-GB" ? "英式" : "美式";
}
export function synthesisLocaleIssue(
  synthesis: PronunciationSynthesisV3,
  alphabet: "ipa" | "ups",
  locale: PhonemeLocaleV3,
  requireConfirmation = false
): string | undefined {
  const recorded = synthesis[alphabet === "ipa" ? "ipa_locale" : "ups_locale"];
  if (!recorded && requireConfirmation && synthesis[alphabet].trim())
    return `该 ${alphabet.toUpperCase()} 尚未确认英美口音，请先确认或重新转换`;
  if (recorded && recorded !== locale)
    return `该 ${alphabet.toUpperCase()} 已确认为${pronunciationLocaleLabel(recorded)}，当前为${pronunciationLocaleLabel(locale)}；请重新填写或转换，不会自动改变口音`;
  return undefined;
}

/** Spelling is the readable body, never the phoneme string. Offsets count Unicode code points. */
export function pronunciationSynthesisContent(
  spelling: string,
  synthesis?: PronunciationSynthesisV3,
  targetLocale?: PhonemeLocaleV3,
  requireLocaleConfirmation = false
): RichTextV2 | undefined {
  if (!spelling.trim()) return undefined;
  if (synthesis?.use_spelling)
    return { version: 2, text: spelling, annotations: [] };
  if (
    !synthesis ||
    synthesisInputIssue(synthesis.alphabet, synthesis[synthesis.alphabet]) ||
    (targetLocale &&
      synthesisLocaleIssue(
        synthesis,
        synthesis.alphabet,
        targetLocale,
        requireLocaleConfirmation
      ))
  )
    return undefined;
  if (
    synthesis.alphabet === "ups" &&
    spelling.trim().split(/\s+/u).length > 1 &&
    (synthesis.use_spelling === false || synthesis.ups_words != null)
  ) {
    const words = synthesis.ups_words;
    const matches = [...spelling.matchAll(/\S+/gu)];
    if (
      !words ||
      words.length > 30 ||
      words.length !== matches.length ||
      words.some(
        (word, index) =>
          word.text !== matches[index]![0] ||
          synthesisInputIssue("ups", word.phoneme)
      ) ||
      words.map((word) => word.phoneme).join(" ") !== synthesis.ups.trim()
    )
      return undefined;
    return {
      version: 2,
      text: spelling,
      annotations: words.map((word, index) => {
        const match = matches[index]!;
        const start = Array.from(spelling.slice(0, match.index)).length;
        return {
          type: "phoneme",
          start,
          end: start + Array.from(word.text).length,
          alphabet: "ups",
          phoneme: word.phoneme
        };
      })
    };
  }
  return {
    version: 2,
    text: spelling,
    annotations: [
      {
        type: "phoneme",
        start: 0,
        end: Array.from(spelling).length,
        alphabet: synthesis.alphabet,
        phoneme: synthesis[synthesis.alphabet]!.trim()
      }
    ]
  };
}

/** Atomic conversion from actual IPA, retaining phrase word boundaries separately. */
export function convertActualPronunciation(
  input: string,
  spelling: string,
  alphabet: "ipa" | "ups",
  locale: string
) {
  if (/\p{Cc}/u.test(input))
    return { ok: false as const, message: "实际发音不能包含控制字符" };
  const source = input.trim().replace(/^\/(.*)\/$/u, "$1");
  const textWords = spelling.trim().split(/\s+/u).filter(Boolean);
  const phones = source.split(/\s+/u).filter(Boolean);
  if (!source) return { ok: false as const, message: "请先填写实际发音" };
  if (
    !textWords.length ||
    textWords.length > 30 ||
    textWords.length !== phones.length
  )
    return {
      ok: false as const,
      message:
        "实际发音与正文词数不一致，请用空格明确逐词音标；不自动推断连读词界"
    };
  const values: string[] = [];
  for (const [index, phone] of phones.entries()) {
    const result =
      alphabet === "ups"
        ? ipaWordToUps(phone, locale)
        : convertDictionaryPhonetic(phone, "ipa");
    if (!result.ok)
      return {
        ok: false as const,
        message: `第 ${index + 1} 个词：${result.message}`
      };
    values.push(result.value);
  }
  const value = values.join(" ");
  const issue = synthesisInputIssue(alphabet, value);
  if (issue) return { ok: false as const, message: issue };
  return {
    ok: true as const,
    value,
    ups_words:
      alphabet === "ups"
        ? values.map((phoneme, index) => ({ text: textWords[index]!, phoneme }))
        : undefined
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
    // IPA stress marks already locate the following syllable; no extra dot is required.
    // UPS stress remains unsupported and is rejected by its own rules below.
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
