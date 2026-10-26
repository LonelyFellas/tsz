import type {
  PronunciationSynthesisV3,
  PronunciationSynthesisCandidateV3,
  SynthesisSpeechV3,
  RichTextV2,
  PhonemeLocaleV3,
  SentenceSourceRangeV3,
  WordPronunciationV3,
  Dialect
} from "@tsz/types";

import { ipaWordToUps } from "./ipa-ups";
import {
  stripPhoneticDelimiters,
  convertDictionaryToUnified,
  unifiedWordToAzureIpa
} from "./unified-phonetic";
export const SYNTHESIS_LIMITS = { ipa: 200, ups: 1600 } as const;
export const EMPTY_SYNTHESIS: PronunciationSynthesisV3 = {
  alphabet: "ipa",
  ipa: "",
  ups: "",
  use_spelling: false
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
type SelectedSynthesis = PronunciationSynthesisV3 &
  Pick<PronunciationSynthesisCandidateV3, "ipa_speech" | "ups_speech">;

export function synthesisForLocale(
  synthesis: SelectedSynthesis,
  locale: PhonemeLocaleV3,
  legacyDialect: Dialect = "common"
): SelectedSynthesis {
  const candidate = synthesis[locale === "en-GB" ? "uk" : "us"];
  if (candidate)
    return {
      alphabet: synthesis.alphabet,
      use_spelling: synthesis.use_spelling,
      ...candidate,
      ipa_locale: locale,
      ups_locale: locale
    };
  const legacyLocale =
    legacyDialect === "common"
      ? undefined
      : pronunciationLocale(legacyDialect, "uk");
  const ipaLocale = synthesis.ipa_locale ?? legacyLocale;
  const upsLocale = synthesis.ups_locale ?? legacyLocale;
  const dual = synthesis.uk || synthesis.us;
  return {
    alphabet: synthesis.alphabet,
    use_spelling: synthesis.use_spelling,
    ipa: !dual || ipaLocale === locale ? synthesis.ipa : "",
    ups: !dual || upsLocale === locale ? synthesis.ups : "",
    ipa_locale: ipaLocale,
    ups_locale: upsLocale,
    ups_words: !dual || upsLocale === locale ? synthesis.ups_words : undefined,
    ipa_speech:
      !dual || ipaLocale === locale ? synthesis.ipa_speech : undefined,
    ups_speech: !dual || upsLocale === locale ? synthesis.ups_speech : undefined
  };
}

export function pronunciationSynthesisLabel(
  synthesis: PronunciationSynthesisV3,
  dialect: Dialect
): string {
  if (synthesis.use_spelling) return "词形拼写（语音来源）";
  const name = `Azure ${synthesis.alphabet.toUpperCase()}`;
  if (!synthesis.uk && !synthesis.us)
    return `${name}：${synthesis[synthesis.alphabet] || "未填写"}`;
  const uk = synthesisForLocale(synthesis, "en-GB", dialect)[
    synthesis.alphabet
  ];
  const us = synthesisForLocale(synthesis, "en-US", dialect)[
    synthesis.alphabet
  ];
  if (dialect === "uk") return `${name} · 英式：${uk || "未填写"}`;
  if (dialect === "us") return `${name} · 美式：${us || "未填写"}`;
  return `${name} · 英式：${uk || "未填写"} · 美式：${us || "未填写"}`;
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
function basePronunciationSynthesisContent(
  spelling: string,
  synthesis?: PronunciationSynthesisV3,
  targetLocale?: PhonemeLocaleV3,
  requireLocaleConfirmation = false
): RichTextV2 | undefined {
  if (targetLocale && synthesis)
    synthesis = synthesisForLocale(synthesis, targetLocale);
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
    (synthesis.ups_words != null ||
      (synthesis.use_spelling === false &&
        spelling.trim().split(/\s+/u).length > 1))
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

/** Pair visible phoneme ranges with spelling word ends for the settings editor. */
export function synthesisPhonemeWordRanges(
  spelling: string,
  candidate: PronunciationSynthesisCandidateV3,
  alphabet: "ipa" | "ups"
): { textEnd: number; start: number; end: number }[] | undefined {
  const words = [...spelling.matchAll(/\S+/gu)];
  const value = candidate[alphabet];
  const phones =
    alphabet === "ipa"
      ? [...value.matchAll(/\S+/gu)].map((match) => match[0])
      : words.length === 1
        ? [value.trim()]
        : candidate.ups_words?.map((word, index) =>
            word.text === words[index]?.[0] ? word.phoneme : ""
          );
  if (
    !phones ||
    phones.length !== words.length ||
    phones.some((phone) => !phone) ||
    (alphabet === "ups" && phones.join(" ") !== value.trim())
  )
    return undefined;
  let offset = 0;
  return phones.map((phone, index) => {
    const start = value.indexOf(phone, offset);
    offset = start + phone.length;
    const word = words[index]!;
    return {
      textEnd: Array.from(spelling.slice(0, word.index + word[0].length))
        .length,
      start: Array.from(value.slice(0, start)).length,
      end: Array.from(value.slice(0, offset)).length
    };
  });
}

/** Speech ranges map only through explicit word boundaries, including UPS words. */
export function mapSynthesisSpeechContent(
  content: RichTextV2,
  spelling: string,
  candidate: PronunciationSynthesisCandidateV3,
  alphabet: "ipa" | "ups",
  toSpelling: boolean
): RichTextV2 | undefined {
  const ranges = synthesisPhonemeWordRanges(spelling, candidate, alphabet);
  const words = [...spelling.matchAll(/\S+/gu)];
  const annotations: RichTextV2["annotations"] = [];
  for (const mark of content.annotations) {
    if (mark.type === "pause") {
      const range = ranges
        ?.slice(0, -1)
        .find((range) => (toSpelling ? range.end : range.textEnd) === mark.at);
      if (!range) return undefined;
      annotations.push({ ...mark, at: toSpelling ? range.textEnd : range.end });
    } else if (mark.type === "say_as" || mark.type === "sub") {
      const first =
        ranges?.findIndex(
          (range, index) =>
            (toSpelling
              ? range.start
              : Array.from(spelling.slice(0, words[index]!.index)).length) ===
            mark.start
        ) ?? -1;
      const last =
        ranges?.findIndex(
          (range) => (toSpelling ? range.end : range.textEnd) === mark.end
        ) ?? -1;
      if (!ranges || first < 0 || last < first) return undefined;
      annotations.push({
        ...mark,
        start: toSpelling
          ? Array.from(spelling.slice(0, words[first]!.index)).length
          : ranges[first]!.start,
        end: toSpelling ? ranges[last]!.textEnd : ranges[last]!.end
      });
    } else return undefined;
  }
  return {
    version: 2,
    text: toSpelling ? spelling : candidate[alphabet],
    annotations
  };
}

/** Keep explicit UPS word ownership only when an edit stays inside one word's phones. */
export function editSynthesisUpsWords(
  spelling: string,
  candidate: PronunciationSynthesisCandidateV3,
  value: string
): PronunciationSynthesisCandidateV3["ups_words"] {
  if (value === candidate.ups) return candidate.ups_words;
  const ranges = synthesisPhonemeWordRanges(spelling, candidate, "ups");
  if (!ranges) return null;
  const before = Array.from(candidate.ups);
  const after = Array.from(value);
  let start = 0;
  while (start < before.length && before[start] === after[start]) start++;
  let end = before.length;
  let nextEnd = after.length;
  while (
    end > start &&
    nextEnd > start &&
    before[end - 1] === after[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  const changed = ranges.findIndex(
    (range) => start >= range.start && end <= range.end
  );
  if (changed < 0) return null;
  const words = [...spelling.matchAll(/\S+/gu)].map((match, index) => ({
    text: match[0],
    phoneme: before.slice(ranges[index]!.start, ranges[index]!.end).join("")
  }));
  const range = ranges[changed]!;
  words[changed]!.phoneme = [
    ...before.slice(range.start, start),
    ...after.slice(start, nextEnd),
    ...before.slice(end, range.end)
  ]
    .join("")
    .trim();
  return words.every((word) => word.phoneme) &&
    words.map((word) => word.phoneme).join(" ") === value.trim()
    ? words
    : null;
}

/** Settings are anchored to spelling word boundaries, never to spaces between UPS phones. */
export function pronunciationSynthesisSpeech(
  synthesis: SelectedSynthesis | undefined,
  locale?: PhonemeLocaleV3,
  alphabet?: "ipa" | "ups"
): SynthesisSpeechV3 | undefined {
  if (!synthesis) return undefined;
  const selected = locale ? synthesisForLocale(synthesis, locale) : synthesis;
  if (selected.use_spelling) return undefined;
  return selected[`${alphabet ?? selected.alphabet}_speech`];
}

export function pronunciationSynthesisContent(
  spelling: string,
  synthesis?: SelectedSynthesis,
  targetLocale?: PhonemeLocaleV3,
  requireLocaleConfirmation = false
): RichTextV2 | undefined {
  const content = basePronunciationSynthesisContent(
    spelling,
    synthesis,
    targetLocale,
    requireLocaleConfirmation
  );
  const speech = pronunciationSynthesisSpeech(synthesis, targetLocale);
  if (!content || !speech) return content;
  if (
    speech.content.annotations.some(
      (mark) => !["pause", "say_as", "sub"].includes(mark.type)
    )
  )
    return undefined;
  const marks = speech.content.annotations;
  if (!marks.length) return content;
  if (speech.content.text !== spelling) return undefined;
  const selected =
    targetLocale && synthesis
      ? synthesisForLocale(synthesis, targetLocale)
      : synthesis;
  const words = [...spelling.matchAll(/\S+/gu)];
  if (words.length > 1 && content.annotations.length === 1) {
    if (selected?.alphabet !== "ipa") return undefined;
    const phones = selected.ipa.trim().split(/\s+/u);
    if (phones.length !== words.length) return undefined;
    content.annotations = words.map((match, index) => {
      const start = Array.from(spelling.slice(0, match.index)).length;
      return {
        type: "phoneme",
        start,
        end: start + Array.from(match[0]).length,
        alphabet: "ipa",
        phoneme: phones[index]!
      };
    });
  }
  const special = marks.filter(
    (mark) => mark.type === "say_as" || mark.type === "sub"
  );
  if (
    content.annotations.some(
      (mark) =>
        mark.type === "phoneme" &&
        special.some(
          (reading) =>
            reading.start < mark.end &&
            mark.start < reading.end &&
            (reading.start > mark.start || reading.end < mark.end)
        )
    )
  )
    return undefined;
  const annotations = content.annotations.filter(
    (mark) =>
      mark.type !== "phoneme" ||
      !special.some(
        (reading) => reading.start < mark.end && mark.start < reading.end
      )
  );
  return { ...content, annotations: [...annotations, ...marks] };
}

/** IPA is derived from dictionary notation; actual pronunciation is display-only. */
export function convertDictionaryToAzureIpa(
  input: string,
  spelling: string,
  locale: PhonemeLocaleV3,
  style?: WordPronunciationV3["style"]
) {
  const dictionary = input.replace(/[()[\]{}]/gu, "");
  const unified = convertDictionaryToUnified(
    dictionary,
    spelling,
    locale === "en-GB" ? "uk" : "us",
    style
  );
  if (!unified.ok) return unified;
  return convertActualPronunciation(unified.value, spelling, "ipa", locale);
}

/** Consume the current, possibly manually corrected IPA without reapplying dictionary rules. */
export function convertAzureIpaToUps(
  input: string,
  spelling: string,
  locale: PhonemeLocaleV3
) {
  const source = stripPhoneticDelimiters(input);
  const words = spelling.trim().split(/\s+/u).filter(Boolean);
  const phones = source.split(/\s+/u).filter(Boolean);
  if (!source)
    return { ok: false as const, message: "请先填写对应口音的 Azure IPA" };
  if (!words.length || words.length > 30 || words.length !== phones.length)
    return {
      ok: false as const,
      message: "Azure IPA 与正文词数不一致，请用空格明确逐词音标"
    };
  const values: string[] = [];
  for (const phone of phones) {
    const result = ipaWordToUps(phone, locale);
    if (!result.ok) return result;
    values.push(result.value);
  }
  const value = values.join(" ");
  const issue = synthesisInputIssue("ups", value);
  if (issue) return { ok: false as const, message: issue };
  return {
    ok: true as const,
    value,
    ups_words: values.map((phoneme, index) => ({
      text: words[index]!,
      phoneme
    }))
  };
}

export function readingRevision(
  synthesis: PronunciationSynthesisV3,
  locale: PhonemeLocaleV3,
  legacyDialect: Dialect,
  alphabet: "ipa" | "ups"
): string {
  const selected = synthesisForLocale(synthesis, locale, legacyDialect);
  return JSON.stringify([
    locale,
    alphabet,
    selected[alphabet],
    alphabet === "ups"
      ? (selected.ups_words?.map((word) => [word.text, word.phoneme]) ?? null)
      : null,
    selected.use_spelling ?? false
  ]);
}

export function grammarSynthesisContent(
  content: RichTextV2,
  bindings: readonly {
    source_segments: SentenceSourceRangeV3[];
    dialect: Dialect;
    pronunciations: WordPronunciationV3[];
    reading_reference?: import("@tsz/types").ReadingReferenceV3;
  }[],
  locale: PhonemeLocaleV3
): RichTextV2 {
  const annotations: RichTextV2["annotations"] = content.annotations.filter(
    (item) => item.type !== "phoneme"
  );
  const text = Array.from(content.text);
  for (const binding of bindings) {
    const segment = binding.source_segments[0];
    if (
      binding.source_segments.length !== 1 ||
      !segment ||
      text.slice(segment.start, segment.end).join("") !== segment.surface
    ) {
      throw new Error("词形关联已失效，请重新关联");
    }
    const reference =
      binding.reading_reference?.[locale === "en-GB" ? "uk" : "us"];
    if (binding.reading_reference && !reference)
      throw new Error("当前口音未选择读法，请明确选择");
    const first = reference
      ? binding.pronunciations.find(
          (row) => row.id === reference.pronunciation_id
        )
      : binding.pronunciations[0];
    if (
      reference &&
      (!first?.synthesis ||
        reference.locale !== locale ||
        readingRevision(
          { ...first.synthesis, use_spelling: reference.use_spelling ?? false },
          locale,
          binding.dialect,
          reference.alphabet
        ) !== reference.revision)
    )
      throw new Error("指定读法已失效或版本变化，请重新确认读法");
    const synthesis = first?.synthesis
      ? {
          ...synthesisForLocale(first.synthesis, locale, binding.dialect),
          ...(reference
            ? {
                alphabet: reference.alphabet,
                use_spelling: reference.use_spelling ?? false
              }
            : {})
        }
      : undefined;
    const anchoredSynthesis =
      synthesis?.ups_words?.length === 1
        ? {
            ...synthesis,
            ups_words: [{ ...synthesis.ups_words[0]!, text: segment.surface }]
          }
        : synthesis;
    const resolved = basePronunciationSynthesisContent(
      segment.surface,
      anchoredSynthesis,
      locale,
      binding.dialect === "common"
    );
    if (
      !resolved ||
      (!synthesis?.use_spelling &&
        !first?.synthesis?.[locale === "en-GB" ? "uk" : "us"] &&
        binding.dialect !== "common" &&
        pronunciationLocale(binding.dialect, "uk") !== locale)
    ) {
      throw new Error(
        `“${segment.surface}”关联词形的第一个发音未配置或与当前口音不匹配，请先完善该发音`
      );
    }
    for (const annotation of resolved.annotations) {
      if (annotation.type === "phoneme")
        annotations.push({
          ...annotation,
          start: segment.start + annotation.start,
          end: segment.start + annotation.end
        });
    }
  }
  return { ...content, annotations };
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
  const source = stripPhoneticDelimiters(input);
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
    const adapted = unifiedWordToAzureIpa(
      stripPhoneticDelimiters(phone),
      locale
    );
    if (!adapted.ok)
      return {
        ok: false as const,
        message: `第 ${index + 1} 个词：${adapted.message}`
      };
    const result =
      alphabet === "ups"
        ? ipaWordToUps(adapted.value, locale)
        : convertDictionaryPhonetic(adapted.value, "ipa");
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
