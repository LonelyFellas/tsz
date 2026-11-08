import { expect, it } from "vitest";
import {
  convertDictionaryToAzureIpa,
  convertAzureIpaToUps,
  synthesisInputIssue,
  synthesisLocaleIssue
} from "@tsz/shared";
import {
  lexiconEditorMessages,
  type LexiconEditorTranslation
} from "../../i18n/editor";
import { localPhoneticDiagnostic } from "./localPhoneticDiagnostic";

const en: LexiconEditorTranslation = (key, values) =>
  lexiconEditorMessages[key][2].replace(/{{(\w+)}}/g, (_, name: string) =>
    String(values?.[name] ?? "")
  );

it("翻译真实本地转换诊断，保留音素、字符位置和未知诊断原文", () => {
  const dictionary = convertDictionaryToAzureIpa(
    "bad@",
    "word",
    "en-GB",
    "normal"
  );
  expect(dictionary.ok).toBe(false);
  if (!dictionary.ok)
    expect(localPhoneticDiagnostic(dictionary.message, en)).toMatch(
      /^Word 1 contains an unsupported transcription/
    );
  const ups = convertAzureIpaToUps("ʔ", "word", "en-US");
  expect(ups.ok).toBe(false);
  if (!ups.ok)
    expect(localPhoneticDiagnostic(ups.message, en)).toContain(
      "Character 1, ‘ʔ’"
    );
  expect(localPhoneticDiagnostic(synthesisInputIssue("ups", "ɹ"), en)).toBe(
    "UPS uses case-sensitive ASCII phonemes separated by spaces"
  );
  expect(
    localPhoneticDiagnostic(
      synthesisLocaleIssue(
        { alphabet: "ipa", ipa: "fɑː", ups: "", ipa_locale: "en-GB" },
        "ipa",
        "en-US",
        true
      ),
      en
    )
  ).toContain("British; the current accent is American");
  expect(localPhoneticDiagnostic("unknown local diagnostic @ 001", en)).toBe(
    "unknown local diagnostic @ 001"
  );
});
