/** English UPS rules. Sources (reviewed 2026-10-11):
 * https://learn.microsoft.com/en-us/previous-versions/office/developer/speech-technologies/hh378403(v=office.14)
 * https://learn.microsoft.com/azure/ai-services/speech-service/customize-pronunciation
 * The UPS reference linked by Azure SSML includes en-GB ER (ɜ), lng (ː)
 * and '+' for compound vowels. Voice fidelity still needs audition.
 * https://learn.microsoft.com/azure/ai-services/speech-service/speech-synthesis-markup-pronunciation
 * S1/S2 precede a stressed syllable; '.' is a syllable boundary.
 * Diphthong/r mappings are English lexical phone adaptations, not narrow-IPA equivalence.
 * Unsupported conventions fail instead of dropping stress/length or guessing accent.
 */
export const UPS_RULE_SOURCE =
  "https://learn.microsoft.com/en-us/previous-versions/office/developer/speech-technologies/hh378403(v=office.14)";
const phones: Readonly<Record<string, string>> = {
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
  u: "U",
  tʃ: "CH",
  dʒ: "JH",
  t͡ʃ: "CH",
  d͡ʒ: "JH",
  ʧ: "CH",
  ʤ: "JH",
  eɪ: "EI",
  aɪ: "AI",
  aʊ: "AU",
  ɔɪ: "OI",
  oʊ: "O",
  ɹ: "R",
  ɻ: "R"
};
const britishPhones: Readonly<Record<string, string>> = {
  ɑː: "AA lng",
  ɔː: "AO lng",
  ɜː: "ER lng",
  iː: "I lng",
  uː: "U lng",
  əʊ: "AX + UH",
  ɪə: "IH + AX",
  ɛə: "EH + AX",
  ʊə: "UH + AX"
};
const rhoticPhones = { ɚ: "AX R", ɝ: "ER R" };
const vowel = /^[ɑæʌɔəɛɪioɒʊuaeɜɚɝ]/u;
export function ipaWordToUps(input: string, locale: string = "en-US") {
  const fail = (message: string) => ({ ok: false as const, message });
  if (locale !== "en-US" && locale !== "en-GB")
    return fail("UPS 自动转换仅支持 en-US 和 en-GB。");
  const mapping: Readonly<Record<string, string>> = {
    ...phones,
    ...rhoticPhones,
    ...(locale === "en-GB" ? britishPhones : {})
  };
  const keys = Object.keys(mapping).sort((a, b) => b.length - a.length);
  if (Array.from(input).length > 200)
    return fail("单词实际音标最多 200 个字符。");
  const source = input.replaceAll("ɡ", "g");
  if (!source || /\s|\p{Cc}/u.test(source))
    return fail("单词音标不能为空或含空白/控制字符。");
  const out: string[] = [];
  let hasPhone = false,
    hasVowel = false,
    pendingStress = false;
  for (let i = 0; i < source.length;) {
    const char = source[i]!;
    if (char === "." || char === "ˈ" || char === "ˌ") {
      if (pendingStress)
        return fail("重音后需要有元音，不能连续重音或直接接音节点。");
      if (char === ".") {
        if (!hasPhone || !hasVowel) return fail("音节点前必须有完整音节。");
        out.push(".");
        hasPhone = false;
        hasVowel = false;
      } else {
        if (hasPhone) {
          if (!hasVowel) return fail("重音前的音节缺少元音。");
          out.push(".");
          hasPhone = false;
          hasVowel = false;
        }
        out.push(char === "ˈ" ? "S1" : "S2");
        pendingStress = true;
      }
      i++;
      continue;
    }
    if (locale === "en-US" && source.startsWith("əʊ", i))
      return fail("英式 əʊ 暂无已确认的 UPS 转换；不自动改成美式 oʊ。");
    const key = keys.find((key) => source.startsWith(key, i));
    if (!key)
      return fail(
        `第 ${Array.from(source.slice(0, i)).length + 1} 个字符「${char}」尚无确认规则（长音、卷舌元音等不会静默删除或拆开）。`
      );
    out.push(mapping[key]!);
    hasPhone = true;
    if (vowel.test(key)) {
      hasVowel = true;
      pendingStress = false;
    }
    i += key.length;
  }
  if (!hasPhone || !hasVowel || pendingStress)
    return fail("末尾缺少完整音节或重音后的元音。");
  const value = out.join(" ");
  if (value.length > 1600) return fail("UPS 转换结果超过 1600 个字符。");
  return { ok: true as const, value };
}
