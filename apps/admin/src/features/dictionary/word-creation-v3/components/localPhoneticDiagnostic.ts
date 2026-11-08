import {
  type LexiconEditorTranslation,
  type LexiconEditorKey
} from "../../i18n/editor";

const LOCAL_DIAGNOSTICS: Readonly<Record<string, LexiconEditorKey>> = {
  "音素不能包含换行、制表符或其他控制字符":
    "creation_phonetic_phonemes_cannot_contain_line_breaks_tabs_or_other_control_characters",
  "请先填写对应口音的 Azure IPA":
    "creation_phonetic_enter_azure_ipa_for_the_corresponding_accent_first",
  "Azure IPA 与正文词数不一致，请用空格明确逐词音标":
    "creation_phonetic_azure_ipa_does_not_match_the_text_word_count_separate_word_transcriptions_with_spaces",
  实际发音不能包含控制字符:
    "creation_phonetic_actual_pronunciation_cannot_contain_control_characters",
  请先填写实际发音: "creation_phonetic_enter_actual_pronunciation_first",
  "实际发音与正文词数不一致，请用空格明确逐词音标；不自动推断连读词界":
    "creation_phonetic_actual_pronunciation_does_not_match_the_text_word_count_separate_word_transcriptions_",
  请先填写字典音标:
    "creation_phonetic_enter_the_dictionary_transcription_first",
  字典音标不能包含控制字符:
    "creation_phonetic_dictionary_transcriptions_cannot_contain_control_characters",
  "字典音标最多 200 个字符":
    "creation_phonetic_dictionary_transcriptions_must_be_at_most_200_characters",
  "字典音标与词形词数不一致，请用空格明确逐词音标":
    "creation_phonetic_the_dictionary_transcription_does_not_match_the_form_word_count_separate_word_transcr",
  仅支持英式和美式音标转换:
    "creation_phonetic_only_british_and_american_transcription_conversion_is_supported",
  "Azure 英语音素表未提供喉塞音 ʔ；请选用其他已录入读法或真人录音，不会自动替换成 t":
    "creation_phonetic_the_azure_english_phoneme_set_does_not_include_the_glottal_stop_choose_another_saved_",
  "滑音标记须使用规范组合，如 ɪʲə、ʊʷə、ɪʲər、ʊʷər":
    "creation_phonetic_use_standard_glide_combinations_such_as_r_or_r",
  "ɜː 是英式记法；请填写该词的美式实际发音（如 ər），不会自动添加卷舌音":
    "creation_phonetic_is_british_notation_enter_the_american_actual_pronunciation_such_as_r_rhoticity_is_no",
  "UPS 自动转换仅支持 en-US 和 en-GB。":
    "creation_phonetic_automatic_ups_conversion_only_supports_en_us_and_en_gb",
  "单词实际音标最多 200 个字符。":
    "creation_phonetic_actual_word_transcriptions_must_be_at_most_200_characters",
  "单词音标不能为空或含空白/控制字符。":
    "creation_phonetic_word_transcriptions_cannot_be_empty_or_contain_whitespace_or_control_characters",
  "重音后需要有元音，不能连续重音或直接接音节点。":
    "creation_phonetic_a_stress_marker_must_be_followed_by_a_vowel_without_consecutive_stress_markers_or_an_",
  "音节点前必须有完整音节。":
    "creation_phonetic_a_syllable_boundary_must_follow_a_complete_syllable",
  "重音前的音节缺少元音。":
    "creation_phonetic_the_syllable_before_the_stress_marker_has_no_vowel",
  "英式 əʊ 暂无已确认的 UPS 转换；不自动改成美式 oʊ。":
    "creation_phonetic_british_has_no_confirmed_ups_conversion_it_is_not_changed_to_american_o",
  "末尾缺少完整音节或重音后的元音。":
    "creation_phonetic_the_ending_is_missing_a_complete_syllable_or_a_vowel_after_stress",
  "UPS 转换结果超过 1600 个字符。":
    "creation_phonetic_the_ups_conversion_exceeds_1600_characters"
};

/** Only pass diagnostics from local phonetic helpers, never server errors or dictionary content. */
export function localPhoneticDiagnostic(
  message: string | undefined,
  t: LexiconEditorTranslation
): string | undefined {
  if (!message) return message;
  const key = LOCAL_DIAGNOSTICS[message];
  if (key) return t(key);
  let match: RegExpMatchArray | null;
  if ((match = message.match(/^请填写 Azure (IPA|UPS)$/)))
    return t("creation_phonetic_enter_azure_alphabet", { alphabet: match[1]! });
  if ((match = message.match(/^Azure (IPA|UPS) 最多 (\d+) 个字符$/)))
    return t(
      "creation_phonetic_azure_alphabet_must_be_at_most_limit_characters",
      { alphabet: match[1]!, limit: match[2]! }
    );
  if (
    (match = message.match(
      /^(IPA|UPS) 使用区分大小写、以空格分隔的 ASCII 音素$/
    ))
  )
    return t(
      "creation_phonetic_alphabet_uses_case_sensitive_ascii_phonemes_separated_by_spaces",
      { alphabet: match[1]! }
    );
  if (
    (match = message.match(
      /^该 (IPA|UPS) 尚未确认英美口音，请先确认或重新转换$/
    ))
  )
    return t(
      "creation_phonetic_confirm_the_british_or_american_accent_for_alphabet_or_convert_it_again",
      { alphabet: match[1]! }
    );
  if (
    (match = message.match(
      /^该 (IPA|UPS) 已确认为(英式|美式)，当前为(英式|美式)；请重新填写或转换，不会自动改变口音$/
    ))
  )
    return t(
      "creation_phonetic_alphabet_was_confirmed_as_recorded_the_current_accent_is_current_enter_or_convert_it_",
      {
        alphabet: match[1]!,
        recorded: t(match[2] === "英式" ? "dialect_uk" : "dialect_us"),
        current: t(match[3] === "英式" ? "dialect_uk" : "dialect_us")
      }
    );
  if (
    (match = message.match(
      /^第 (\d+) 个词包含未支持的音标，请每次只输入一个读音版本$/
    ))
  )
    return t(
      "creation_phonetic_word_index_contains_an_unsupported_transcription_enter_one_reading_at_a_time",
      { index: match[1]! }
    );
  if ((match = message.match(/^第 (\d+) 个词的音素、重音或音节标记不完整$/)))
    return t(
      "creation_phonetic_word_index_has_incomplete_phonemes_stress_or_syllable_markers",
      { index: match[1]! }
    );
  if (
    (match = message.match(
      /^第 (\d+) 个字符「(.*)」尚无确认规则（长音、卷舌元音等不会静默删除或拆开）。$/
    ))
  )
    return t(
      "creation_phonetic_character_index_symbol_has_no_confirmed_rule_long_vowels_and_rhotic_vowels_are_not_si",
      { index: match[1]!, symbol: match[2]! }
    );
  if ((match = message.match(/^第 (\d+) 个词：(.+)$/)))
    return t("creation_phonetic_word_index_message", {
      index: match[1]!,
      message: localPhoneticDiagnostic(match[2], t)!
    });
  return message;
}
