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

function dictionaryWord(input: string): string {
  const source = input
    .replaceAll("ɡ", "g")
    .replaceAll("ɹ", "r")
    .replaceAll("ɻ", "r")
    .replaceAll("t͡ʃ", "tʃ")
    .replaceAll("d͡ʒ", "dʒ")
    .replaceAll("ʧ", "tʃ")
    .replaceAll("ʤ", "dʒ");
  // Match complete units once: ɑː and eɪ must survive short-vowel substitutions.
  let value = source.replace(
    /ɑː|ɑr|iː|eɪ|ju(?!ː)|(?:ɪ(?:ʸ)?r|ʊ(?:ʷ|ʸ)?r|ɛr)(?![aɑæʌɔəɛɪɒʊuieɜ])|ɪə|ʊə|oʊ|[ɚɝɾɑe]/gu,
    (phone) =>
      ({
        ɑː: "ɑː",
        ɑr: "ɑr",
        iː: "iː",
        eɪ: "eɪ",
        ju: "jʊ",
        ɪr: "ɪʲər",
        ɪʸr: "ɪʲər",
        ʊr: "ʊʷər",
        ʊʷr: "ʊʷər",
        ʊʸr: "ʊʷər",
        ɛr: "ɛər",
        ɪə: "ɪʲə",
        ʊə: "ʊʷə",
        oʊ: "əʊ",
        ɚ: "ər",
        ɝ: "ər",
        ɾ: "d",
        ɑ: "ɒ",
        e: "ɛ"
      })[phone]!
  );
  // Happy vowel: bare i after an earlier vowel, without an immediately preceding
  // stress marker. Do not reinterpret a sole/stressed i as the lax vowel.
  value = value.replace(/i(?!ː)/gu, (phone, offset: number) => {
    const prefix = value.slice(0, offset);
    const stressedOnset = /[ˈˌ][^ɑæʌɔəɛɪɒʊuiɜ.ˈˌ]*$/u.test(prefix);
    return /[ɑæʌɔəɛɪɒʊuiɜ]/u.test(prefix) && !stressedOnset ? "ɪ" : phone;
  });
  value = value.replace(/([lnm])̩/gu, "ə$1");
  // Only syllable-final clusters from the document's onset inventory.
  value = value.replace(/([tdszpbkgfvðʃʒmn])([lnm])(?=$|[.ˈˌ])/gu, "$1ə$2");
  // Rule 7's s + unaspirated stop at a syllable onset; do not change ask/last.
  return value.replace(
    /(^|[.ˈˌ])s([ktp])(?=[ɑæʌɔəɛɪɒʊuieɜrjwl])/gu,
    (_, boundary: string, stop: string) =>
      `${boundary}s${{ k: "g", t: "d", p: "b" }[stop]}`
  );
}

export function convertDictionaryToUnified(
  input: string,
  spelling: string,
  dialect: Dialect,
  style: PronunciationStyle = "normal"
): Conversion {
  if (/\p{Cc}/u.test(input))
    return { ok: false, message: "字典音标不能包含控制字符" };
  const source = stripPhoneticDelimiters(input);
  if (!source) return { ok: false, message: "请先填写字典音标" };
  if (Array.from(source).length > 200)
    return { ok: false, message: "字典音标最多 200 个字符" };
  const words = spelling.trim().split(/\s+/u).filter(Boolean);
  const phones = source.split(/\s+/u).map(stripPhoneticDelimiters);
  if (!words.length || words.length > 30 || words.length !== phones.length)
    return {
      ok: false,
      message: "字典音标与词形词数不一致，请用空格明确逐词音标"
    };
  const notices = new Set<string>();
  const values: string[] = [];
  for (const [index, phone] of phones.entries()) {
    if (
      !phone ||
      /[^abpdʒðfgɡhklmnŋrsʃtθvwjzɑæʌɔəɛeɪiɒʊuoɜɹɻɚɝɾʔːˈˌ.ʲʷʸ̩͡ʧʤ]/u.test(phone)
    )
      return {
        ok: false,
        message: `第 ${index + 1} 个词包含未支持的音标，请每次只输入一个读音版本`
      };
    const word = words[index]!.toLowerCase();
    let value = dictionaryWord(phone);
    if (
      !/[aɑæʌɔəɛɪɒʊuieɜ]/u.test(value) ||
      /(^\.|\.$|\.\.|[ˈˌ](?:[.ˈˌ]|$)|[̩͡])/u.test(value) ||
      /(^|[^ɑɔɜiu])ː/u.test(value)
    )
      return {
        ok: false,
        message: `第 ${index + 1} 个词的音素、重音或音节标记不完整`
      };
    const exampleKey = `${word}:${dialect}`;
    const example = Object.hasOwn(STYLE_EXAMPLES, exampleKey)
      ? STYLE_EXAMPLES[exampleKey]
      : Object.hasOwn(STYLE_EXAMPLES, word)
        ? STYLE_EXAMPLES[word]
        : undefined;
    let styleApplied = false;
    if (example?.source.includes(value)) {
      const selected = example[style];
      if (selected) {
        value = selected;
        styleApplied = true;
      }
    }
    if (word === "hudson" && value === "ˈhʌdsən") value = "ˈhʌtsən";
    if (word === "bib" && value === "bɪb" && dialect === "uk") value = "bɪp";
    if (
      word === "of" &&
      words[index + 1]?.toLowerCase() === "course" &&
      value === "əv"
    )
      value = "əf";
    if (dialect === "us") {
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
    if (style !== "normal" && !styleApplied)
      notices.add(
        "文档未明确此词的该读法，仅规范已有音标；请核对强弱读、喉塞音及鼻音闪音，不自动猜测或新增读法。"
      );
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
      notices.add(
        "此词的规则涉及英美差异；当前为英美通用，仅转换通用符号，请在对应口音下转换差异读音。"
      );
    values.push(value);
  }
  return { ok: true, value: values.join(" "), notices: [...notices] };
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
  Object.assign(units, { ɪʲə: "ɪə", ʊʷə: "ʊə", r: "ɹ" });
  const pattern = Object.keys(units)
    .sort((a, b) => b.length - a.length)
    .join("|");
  value = value.replace(new RegExp(pattern, "gu"), (unit) => units[unit]!);
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
