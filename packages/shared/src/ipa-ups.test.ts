import { assert, test } from "vitest";
import { ipaWordToUps } from "./ipa-ups";
import {
  convertActualPronunciation,
  pronunciationSynthesisContent,
  EMPTY_SYNTHESIS,
  synthesisLocaleIssue,
  pronunciationLocale
} from "./pronunciation-synthesis";
test("candidate accent mismatch and unconfirmed common input never synthesize", () => {
  const candidate = {
    alphabet: "ups" as const,
    ipa: "kæt",
    ups: "K AE T",
    use_spelling: false,
    ipa_locale: "en-GB" as const,
    ups_locale: "en-US" as const
  };
  assert.isUndefined(
    pronunciationSynthesisContent("cat", candidate, "en-GB", true)
  );
  assert.exists(pronunciationSynthesisContent("cat", candidate, "en-US", true));
  assert.isUndefined(
    pronunciationSynthesisContent(
      "cat",
      { ...candidate, ups_locale: null },
      "en-US",
      true
    )
  );
  assert.exists(
    pronunciationSynthesisContent(
      "cat",
      { ...candidate, use_spelling: true },
      "en-GB",
      true
    )
  );
  assert.isUndefined(synthesisLocaleIssue(candidate, "ipa", "en-GB", true));
  assert.equal(pronunciationLocale("common", "uk"), "en-GB");
  assert.equal(pronunciationLocale("us", "uk"), "en-US");
});
test("UPS has prefix S1/S2 stress and documented vowel phones, not SAPI digits", () => {
  for (const [input, expected] of [
    ["həˈloʊ", "H AX . S1 L O"],
    ["gɪˈtɑɹ", "G IH . S1 T AA R"],
    ["fəˈnɛs", "F AX . S1 N EH S"],
    ["ˈkoʊ.koʊ", "S1 K O . K O"],
    ["ˌbaɪt", "S2 B AI T"],
    ["faʊl", "F AU L"],
    ["beɪt", "B EI T"],
    ["tɔɪ", "T OI"]
  ])
    assert.deepEqual(ipaWordToUps(input!), { ok: true, value: expected! });
});
test("unsupported and malformed notation is not guessed", () => {
  for (const input of [
    "həˈ",
    "həˈˌloʊ",
    ".kæt",
    "kæt.",
    "həˈ.loʊ",
    "hˈloʊ",
    "həˈləʊ",
    "kɑːt",
    "ɝ",
    "rɛd",
    "k\tæt"
  ])
    assert.isFalse(ipaWordToUps(input).ok, input);
  assert.isFalse(ipaWordToUps("kæt", "en-GB").ok);
});
test("actual conversion preserves original IPA stress notation; no experimental dot insertion", () => {
  const result = convertActualPronunciation("gɪˈtɑɹ", "guitar", "ipa", "en-US");
  assert.isTrue(result.ok);
  if (result.ok) assert.equal(result.value, "gɪˈtɑɹ");
  assert.isFalse(convertActualPronunciation("", "cat", "ups", "en-US").ok);
});
test("phrase conversion is atomic and stores word boundaries separately", () => {
  const converted = convertActualPronunciation(
    "həˈloʊ kæt",
    "hello cat",
    "ups",
    "en-US"
  );
  assert.isTrue(converted.ok);
  if (!converted.ok) return;
  assert.equal(converted.value, "H AX . S1 L O K AE T");
  const synthesis = {
    alphabet: "ups" as const,
    ipa: "",
    ups: converted.value,
    use_spelling: false,
    ups_words: converted.ups_words
  };
  assert.deepEqual(
    pronunciationSynthesisContent("hello cat", synthesis)?.annotations,
    [
      {
        type: "phoneme",
        start: 0,
        end: 5,
        alphabet: "ups",
        phoneme: "H AX . S1 L O"
      },
      { type: "phoneme", start: 6, end: 9, alphabet: "ups", phoneme: "K AE T" }
    ]
  );
  assert.isUndefined(pronunciationSynthesisContent("hello dog", synthesis));
  assert.isUndefined(pronunciationSynthesisContent("hello", synthesis));
  assert.isUndefined(
    pronunciationSynthesisContent("hello", {
      ...synthesis,
      use_spelling: undefined
    })
  );
  assert.isUndefined(
    pronunciationSynthesisContent("hello cat", {
      ...synthesis,
      ups: synthesis.ups + " T"
    })
  );
  assert.isFalse(
    convertActualPronunciation("həˈloʊ kɑːt", "hello cat", "ups", "en-US").ok
  );
});
test("spelling and legacy source behavior are independent of inactive candidates", () => {
  assert.deepEqual(
    pronunciationSynthesisContent("cat", {
      ...EMPTY_SYNTHESIS,
      ups: "unfinished"
    }),
    { version: 2, text: "cat", annotations: [] }
  );
  assert.equal(
    pronunciationSynthesisContent("hello cat", {
      alphabet: "ups",
      ipa: "",
      ups: "H AX L O K AE T"
    })?.annotations.length,
    1
  );
  assert.isUndefined(
    pronunciationSynthesisContent("hello cat", {
      alphabet: "ups",
      ipa: "",
      ups: "H AX L O K AE T",
      use_spelling: false
    })
  );
});
