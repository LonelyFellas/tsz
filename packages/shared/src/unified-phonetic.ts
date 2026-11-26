import type { Dialect, PronunciationStyle } from "@tsz/types";

// Product notation, not a general English grapheme-to-phoneme engine.
// https://www.yuque.com/tianshengzhi/cowork/ymutpyfg2e1ykvt4
// Azure's target inventory:
// https://learn.microsoft.com/azure/ai-services/speech-service/speech-ssml-phonetic-sets
type Conversion =
  | { ok: true; value: string; notices: string[] }
  | { ok: false; message: string };

export function stripPhoneticDelimiters(input: string): string {
  const value = input.trim();
  return /^(?:\/[^/]*\/|\[[^\[\]]*\])$/u.test(value)
    ? value.slice(1, -1).trim()
    : value;
}

const PHONETIC_GROUP_CLOSERS = new Map([
  ["/", "/"],
  ["[", "]"],
  ["(", ")"],
  ["{", "}"]
]);

/** A complete, separately delimited segment can be an alternative reading. */
export function hasDelimitedPhoneticSegments(source: string): boolean {
  for (const match of source.matchAll(/(?:^|\s)([/[({])/gu)) {
    const opening = match[1]!;
    const closing = PHONETIC_GROUP_CLOSERS.get(opening);
    let depth = 1;
    for (
      let index = match.index + match[0].length;
      index < source.length;
      index++
    ) {
      const symbol = source[index];
      if (symbol === closing) {
        depth--;
        if (depth === 0) {
          if (index + 1 === source.length || /\s/u.test(source[index + 1]!))
            return true;
          break;
        }
      } else if (symbol === opening) {
        depth++;
      }
    }
  }
  return false;
}

// These are the document's explicit lexical examples. Match the source as well
// as the spelling: an unrelated/alternative transcription must never be replaced.
const STYLE_EXAMPLES: Record<
  string,
  {
    source: string[];
    normal: string;
    strong: string;
    weak?: string;
  }
> = {
  family: {
    source: ["ˈfæmɪlɪ", "ˈfæməlɪ", "ˈfæmlɪ"],
    strong: "ˈfæmɪlɪ",
    normal: "ˈfæməlɪ",
    weak: "ˈfæmlɪ"
  },
  definite: {
    source: ["ˈdɛfɪnɪt", "ˈdɛfɪnət", "ˈdɛfənət"],
    strong: "ˈdɛfɪnɪt",
    normal: "ˈdɛfɪnət",
    weak: "ˈdɛfənət"
  },
  useful: {
    source: ["ˈjuːsfʊl", "ˈjuːsfəl"],
    strong: "ˈjuːsfʊl",
    normal: "ˈjuːsfəl"
  },
  "careful:uk": {
    source: ["ˈkɛəfʊl", "ˈkɛəfəl"],
    strong: "ˈkɛəfʊl",
    normal: "ˈkɛəfəl"
  },
  "careful:us": {
    source: ["ˈkɛərfʊl", "ˈkɛərfəl"],
    strong: "ˈkɛərfʊl",
    normal: "ˈkɛərfəl"
  },
  "different:uk": {
    source: ["ˈdɪfɛrɛnt", "ˈdɪfrənt"],
    strong: "ˈdɪfɛrɛnt",
    normal: "ˈdɪfrənt"
  },
  "different:us": {
    source: ["ˈdɪfərənt", "ˈdɪfrənt"],
    strong: "ˈdɪfərənt",
    normal: "ˈdɪfrənt"
  },
  "literature:uk": {
    source: ["ˈlɪtɛrətʃə", "ˈlɪtrətʃə"],
    strong: "ˈlɪtɛrətʃə",
    normal: "ˈlɪtrətʃə"
  },
  "literature:us": {
    source: ["ˈlɪtərətʃər", "ˈlɪtrətʃər"],
    strong: "ˈlɪtərətʃər",
    normal: "ˈlɪtrətʃər"
  }
};

type DictionaryConversionTarget = "actual" | "azure-ipa";

// Isolate /z/ or /d/ only when the spelling supports the same ending.
// The stem must still pass the syllable-final consonant cluster rule below.
function hasSyllabicInflection(spelling: string, ipa: string): boolean {
  return (
    (/[lnm]z$/u.test(ipa) && /[a-z]s$/u.test(spelling)) ||
    (/[lnm]d$/u.test(ipa) && spelling.endsWith("ed"))
  );
}

function dictionaryWord(
  input: string,
  dialect: Dialect,
  target: DictionaryConversionTarget,
  spelling: string
): string {
  const source = input
    .replaceAll("ɡ", "g")
    .replaceAll("ɹ", "r")
    .replaceAll("ɻ", "r")
    .replaceAll("t͡ʃ", "tʃ")
    .replaceAll("d͡ʒ", "dʒ")
    .replaceAll("ʧ", "tʃ")
    .replaceAll("ʤ", "dʒ")
    // Normalize equivalent short vowels before the rhotic/lexical rules.
    .replace(/e(?!ɪ)/gu, "ɛ");
  // Match complete units once: ɑː, rhotic ɜːr and eɪ must survive short-vowel substitutions.
  // A following vowel keeps r as an onset, so it is not part of a rhotic vowel.
  let value = source.replace(
    /(?:ɜːr|ɜr|ər)(?![.ˈˌ]*[aɑæʌɔəɛɪɒʊuiɜɚɝ])|ɑː|ɑr|iː|eɪ|ju(?!ː)|(?:ɪ(?:ʸ)?r|ʊ(?:ʷ|ʸ)?r|ɛr)(?![.ˈˌ]*[aɑæʌɔəɛɪɒʊuiɜɚɝ])|ɪə|ʊə|oʊ|[ɚɝɾɑ]/gu,
    (phone) =>
      ({
        ɜːr: dialect === "us" ? (target === "azure-ipa" ? "ɝ" : "ər") : "ɜːr",
        ɜr: dialect === "us" ? (target === "azure-ipa" ? "ɝ" : "ər") : "ɜr",
        ər: target === "azure-ipa" && dialect === "us" ? "ɚ" : "ər",
        ɑː: "ɑː",
        ɑr: "ɑr",
        iː: "iː",
        eɪ: "eɪ",
        // The product's `ju` → `jʊ` display rule belongs to actual pronunciation.
        // Azure IPA must retain the dictionary source and adapt it by locale later.
        ju: target === "actual" ? "jʊ" : "ju",
        ɪr: "ɪʲər",
        ɪʸr: "ɪʲər",
        ʊr: "ʊʷər",
        ʊʷr: "ʊʷər",
        ʊʸr: "ʊʷər",
        ɛr: "ɛər",
        ɪə: "ɪʲə",
        ʊə: "ʊʷə",
        oʊ: "əʊ",
        ɚ: target === "azure-ipa" && dialect === "us" ? "ɚ" : "ər",
        ɝ: target === "azure-ipa" && dialect === "us" ? "ɝ" : "ər",
        ɾ: target === "actual" ? "d" : "ɾ",
        ɑ: "ɒ"
      })[phone]!
  );
  // Actual pronunciation applies lexical substitutions. Azure IPA keeps symbols
  // whose Azure inventory has a distinct phoneme until locale adaptation.
  if (target === "actual") {
    // Keep the existing happy-vowel normalization for matching reading variants.
    value = value.replace(/i(?!ː)/gu, (phone, offset: number) => {
      const prefix = value.slice(0, offset);
      const stressedOnset = /[ˈˌ][^ɑæʌɔəɛɪɒʊuiɜ.ˈˌ]*$/u.test(prefix);
      return /[ɑæʌɔəɛɪɒʊuiɜ]/u.test(prefix) && !stressedOnset ? "ɪ" : phone;
    });
    if (dialect === "us") {
      value = value
        .replace(/ɑːr(?![.ˈˌ]*[aɑæʌɔəɛɪɒʊuiɜɚɝ])/gu, "ɑr")
        .replace(/ɔːr(?![.ˈˌ]*[aɑæʌɔəɛɪɒʊuiɜɚɝ])/gu, "ɔr");
    }
    value = value.replace(/([lnm])̩/gu, "ə$1");
    const suffix = hasSyllabicInflection(spelling, value)
      ? value.slice(-1)
      : "";
    const stem = suffix ? value.slice(0, -1) : value;
    value =
      stem.replace(/([tdszpbkgfvðʃʒmn])([lnm])(?=$|[.ˈˌ])/gu, "$1ə$2") + suffix;
    // Use teaching notation at syllable onsets, including before aɪ and aʊ.
    return value.replace(
      /(^|[.ˈˌ])s([ktp])(?=[aɑæʌɔəɛɪɒʊuieɜrjwl])/gu,
      (_, boundary: string, stop: string) =>
        `${boundary}s${{ k: "g", t: "d", p: "b" }[stop]}`
    );
  }
  return value;
}

function convertDictionary(
  input: string,
  spelling: string,
  dialect: Dialect,
  style: PronunciationStyle,
  target: DictionaryConversionTarget
): Conversion {
  if (/\p{Cc}/u.test(input))
    return { ok: false, message: "字典音标不能包含控制字符" };
  const source = stripPhoneticDelimiters(
    target === "azure-ipa" ? input.replace(/[()[\]{}]/gu, "") : input
  );
  if (!source) return { ok: false, message: "请先填写字典音标" };
  if (Array.from(source).length > 200)
    return { ok: false, message: "字典音标最多 200 个字符" };
  if (!spelling.trim()) return { ok: false, message: "请先填写词形拼写" };
  const words = spelling.trim().toLowerCase().split(/\s+/u);
  const phones = source.split(/\s+/u).map(stripPhoneticDelimiters);
  const aligned = words.length === phones.length;
  // Examine the source grouping before stripping Azure's optional notation.
  if (!aligned && hasDelimitedPhoneticSegments(stripPhoneticDelimiters(input)))
    return { ok: false, message: "请每次只输入一个读音版本" };
  const notices = new Set<string>();
  const values: string[] = [];
  for (const [index, phone] of phones.entries()) {
    if (
      !phone ||
      /[^abpdʒðfgɡhklmnŋrsʃtθvwjzɑæʌɔəɛeɪiɒʊuoɜɹɻɚɝɾʔːˈˌ.ʲʷʸ̩͡ʧʤ]/u.test(phone)
    )
      return {
        ok: false,
        message: `第 ${index + 1} 段音标包含未支持的符号，请每次只输入一个读音版本`
      };
    // Without word boundaries, skip spelling-dependent rules for every segment.
    const word = aligned ? words[index]! : "";
    let value = dictionaryWord(phone, dialect, target, word);
    const styleValue =
      target === "actual"
        ? value
        : dictionaryWord(phone, dialect, "actual", word);
    if (
      !/[aɑæʌɔəɛɪɒʊuiɜɚɝ]/u.test(value) ||
      /(^\.|\.$|\.\.|[ˈˌ](?:[.ˈˌ]|$)|͡|(?<![lnm])̩)/u.test(value) ||
      /(^|[^ɑɔɜiu])ː/u.test(value)
    )
      return {
        ok: false,
        message: `第 ${index + 1} 段音标的音素、重音或音节标记不完整`
      };
    const exampleKey = `${word}:${dialect}`;
    const example = Object.hasOwn(STYLE_EXAMPLES, exampleKey)
      ? STYLE_EXAMPLES[exampleKey]
      : Object.hasOwn(STYLE_EXAMPLES, word)
        ? STYLE_EXAMPLES[word]
        : undefined;
    let styleApplied = false;
    if (style !== "citation" && example?.source.includes(styleValue)) {
      const selected = example[style];
      if (selected) {
        value =
          target === "actual"
            ? selected
            : dictionaryWord(selected, dialect, "azure-ipa", word);
        styleApplied = true;
      }
    }
    if (target === "actual") {
      // The dictionary may omit the onset boundary before the space stem.
      if (word === "workspace")
        value = value.replace(/^([ˈˌ]?w(?:ɜːr?|ɜr|ər)k)sp(eɪs)$/u, "$1sb$2");
      if (word === "hudson" && value === "ˈhʌdsən") value = "ˈhʌtsən";
      if (word === "bib" && value === "bɪb" && dialect === "uk") value = "bɪp";
      if (word === "of" && words[index + 1] === "course" && value === "əv")
        value = "əf";
      if (dialect === "us") {
        // Preserve the teaching vowel of chair before the inflectional suffix.
        if (word === "chairing")
          value = value.replace(/^([ˈˌ]?tʃɛ)(\.?r\.?ɪŋ)$/u, "$1ə$2");
        if (word === "butter" && value === "ˈbʌtər") value = "ˈbʌdər";
        if (word === "city" && value === "ˈsɪtɪ") value = "ˈsɪdɪ";
        if (
          style === "weak" &&
          ((word === "button" && value === "ˈbʌtən") ||
            (word === "italy" && value === "ˈɪtəlɪ"))
        ) {
          value = value.replace("t", "ʔ");
          styleApplied = true;
        }
      }
      // Apply the teaching notation after matching existing reading variants.
      value = value.replace(/i(?!ː)/gu, "ɪ");
    }
    if (!aligned || (style !== "normal" && !styleApplied))
      notices.add("仅规范已有音标，请核对读法。");
    if (
      dialect === "common" &&
      [
        "butter",
        "city",
        "bib",
        "button",
        "italy",
        "careful",
        "different",
        "literature"
      ].includes(word)
    )
      notices.add("仅转换通用音标；英美差异读音请切换口音后转换。");
    values.push(value);
  }
  return { ok: true, value: values.join(" "), notices: [...notices] };
}

export function convertDictionaryToUnified(
  input: string,
  spelling: string,
  dialect: Dialect,
  style: PronunciationStyle = "normal"
): Conversion {
  return convertDictionary(input, spelling, dialect, style, "actual");
}

export function convertDictionaryToAzureIpaSource(
  input: string,
  spelling: string,
  dialect: Dialect,
  style: PronunciationStyle = "normal"
): Conversion {
  return convertDictionary(input, spelling, dialect, style, "azure-ipa");
}

/** Adapt product notation to the chosen Azure alphabet; never infer an accent
 * change (e.g. adding/removing r or j) from spelling. Glides are mapped as whole
 * vowel units, not pronounced as additional full consonants. */
export function unifiedWordToAzureIpa(
  input: string,
  locale: string
): Conversion {
  if (locale !== "en-GB" && locale !== "en-US")
    return { ok: false, message: "仅支持英式和美式音标转换" };
  const us = locale === "en-US";
  if (input.includes("ʔ"))
    return {
      ok: false,
      message:
        "Azure 英语音素表未提供喉塞音 ʔ；请选用其他已录入读法或真人录音，不会自动替换成 t"
    };
  let value = input.replaceAll("ɡ", "g");
  const units: Record<string, string> = us
    ? {
        aɪʲər: "aɪɹ",
        aʊʷər: "aʊɹ",
        ɪʲər: "ɪɹ",
        ʊʷər: "ʊɹ",
        ɛər: "ɛɹ",
        əʊ: "oʊ",
        iː: "i",
        uː: "u",
        ɑː: "ɑ",
        ɔː: "ɔ",
        ɒ: "ɑ"
      }
    : {};
  Object.assign(units, {
    ɪʲə: "ɪə",
    ʊʷə: "ʊə",
    r: "ɹ",
    ɾ: "d"
  });
  const pattern = Object.keys(units)
    .sort((a, b) => b.length - a.length)
    .join("|");
  value = value
    .replace(/([lnm])̩/gu, "ə$1")
    .replace(new RegExp(pattern, "gu"), (unit) => units[unit]!);
  if (/[ʲʷʸ]/u.test(value))
    return {
      ok: false,
      message: "滑音标记须使用规范组合，如 ɪʲə、ʊʷə、ɪʲər、ʊʷər"
    };
  if (us && value.includes("ɜː"))
    return {
      ok: false,
      message:
        "ɜː 是英式记法；请填写该词的美式实际发音（如 ər），不会自动添加卷舌音"
    };
  // Azure can stress the preceding syllable without an explicit boundary.
  // A stress mark supplies a known boundary; do not guess unmarked syllables.
  // Confirmed against en-GB Sonia / en-US Aria IPA and UPS audio (2026-10-11).
  value = value.replace(/([^ .ˈˌ])([ˈˌ])/gu, "$1.$2");
  return { ok: true, value, notices: [] };
}
