import { useAdminModuleTranslation } from "@/i18n";

const messages = {
  entry_ai_dictionary_references: [
    "词典参考",
    "詞典參考",
    "Dictionary references"
  ],
  entry_ai_source_youdao: ["有道", "有道", "Youdao"],
  entry_ai_source_oxford: ["牛津", "牛津", "Oxford"],
  entry_ai_source_merriam: ["韦氏", "韋氏", "Merriam-Webster"],
  entry_ai_source_cambridge: ["剑桥", "劍橋", "Cambridge"],
  entry_ai_reference_previous: [
    "上一个词典",
    "上一個詞典",
    "Previous dictionary"
  ],
  entry_ai_reference_next: ["下一个词典", "下一個詞典", "Next dictionary"],
  entry_ai_reference_open: ["打开原词条", "開啟原詞條", "Open original entry"],
  entry_ai_source_found: ["已取得参考", "已取得參考", "Reference found"],
  entry_ai_source_unavailable: [
    "未能取得资料",
    "未能取得資料",
    "Source unavailable"
  ],
  entry_ai_source_no_match: ["无匹配", "無符合項目", "No match"],
  entry_ai_source_not_configured: ["未配置", "未設定", "Not configured"],
  entry_ai_source_missing: [
    "未返回资料",
    "未回傳資料",
    "No reference returned"
  ],
  entry_ai_source_no_inflections: [
    "本次未返回变形",
    "本次未回傳變形",
    "No inflections returned"
  ],
  entry_ai_source_index_inflection: ["韦氏索引", "韋氏索引", "Webster index"],
  entry_ai_generated_forms: ["生成词形", "生成詞形", "Generated forms"],
  entry_ai_form_column: ["词形", "詞形", "Form"],
  entry_ai_form_type_count: [
    "{{count}} 种词形",
    "{{count}} 種詞形",
    "Form types ({{count}})"
  ],
  entry_ai_no_form_proposals: [
    "没有词形候选",
    "沒有詞形候選",
    "No form candidates"
  ]
} as const;

type FormGenerationMessages = Record<keyof typeof messages, string>;

declare module "@tsz/shared/i18n" {
  interface InterfaceNamespaces {
    adminLexiconFormGeneration: FormGenerationMessages;
  }
}

function bundle(index: 0 | 1 | 2) {
  return {
    adminLexiconFormGeneration: Object.fromEntries(
      Object.entries(messages).map(([key, values]) => [key, values[index]])
    ) as FormGenerationMessages
  };
}

const resources = { "zh-Hans": bundle(0), "zh-Hant": bundle(1), en: bundle(2) };

export function useFormGenerationTranslation() {
  return useAdminModuleTranslation("adminLexiconFormGeneration", resources);
}
