import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Dropdown, Flex, Input } from "antd";
import type {
  SentenceTranslationBandV3,
  TranslationLanguageV3,
  WordSentenceTranslationV3,
  WordSentenceWritableV3
} from "@tsz/types";
import { newWordNodeId } from "../../word-model/primitives";
import {
  DEFAULT_SENTENCE_TRANSLATION_LANGUAGE,
  replaceRichText,
  sentenceTranslationsV3
} from "../meaningsModel";
import "./V3SentenceTranslationsField.css";

// 初/中/高是译文风格，与例句的难度等级无关，顺序固定为初、中、高。
const TIERS = [
  {
    key: "word_for_word",
    label: "初阶",
    name: "初阶",
    short: "初",
    hint: "逐字直译; Word-for-Word"
  },
  {
    key: "balanced_fluency",
    label: "中阶",
    name: "中阶",
    short: "中",
    hint: "语句通顺; Balanced Fluency"
  },
  {
    key: "adapted_creation",
    label: "高阶",
    name: "高阶",
    short: "高",
    hint: "深层重构; Adapted Creation"
  }
] as const;

// 两个下拉共用：光看「初/中/高」分不出该往哪一档写，把每档的含义摆在名字后面。
const TIER_MENU_ITEMS = TIERS.map(({ key, label, hint }) => ({
  key,
  label: (
    <span className="word-sentence-translation-tier-option">
      {label}
      <span className="word-sentence-translation-tier-hint">({hint})</span>
    </span>
  )
}));

// 译文语言现阶段只开放汉语；下拉就一项，位置留给将来的多语言译文。
const LANGUAGES = [{ key: "zh", label: "汉语" }] as const;
const LANGUAGE_LABELS: Record<TranslationLanguageV3, string> = {
  zh: "汉语"
};
const LANGUAGE_MENU_ITEMS = LANGUAGES.map(({ key, label }) => ({ key, label }));

export function V3SentenceTranslationsField({
  sentence,
  index,
  disabled,
  onChange
}: {
  sentence: WordSentenceWritableV3;
  index: number;
  disabled?: boolean;
  onChange: (translations: WordSentenceTranslationV3[]) => void;
}) {
  const rows = sentenceTranslationsV3(sentence);
  // sentenceTranslationsV3 已经把缺席的 language 补成汉语，这里直接读第一行即可。
  const language = rows[0]?.language ?? DEFAULT_SENTENCE_TRANSLATION_LANGUAGE;
  return (
    <div className="word-sentence-translation-list">
      <Dropdown
        disabled={disabled}
        trigger={["click"]}
        menu={{
          items: LANGUAGE_MENU_ITEMS,
          selectedKeys: [language],
          onClick: ({ key }) =>
            onChange(
              rows.map((item) => ({
                ...item,
                language: key as TranslationLanguageV3
              }))
            )
        }}
      >
        <Button
          type="text"
          size="small"
          disabled={disabled}
          className="word-sentence-translation-label"
          aria-label={`例句 ${index + 1} 译文语言`}
        >
          {LANGUAGE_LABELS[language]}译文
        </Button>
      </Dropdown>
      <div className="word-sentence-translation-groups">
        {TIERS.map((tier) => {
          const groupRows = rows
            .map((translation, translationIndex) => ({
              translation,
              translationIndex
            }))
            .filter(({ translation }) => translation.band === tier.key);
          if (groupRows.length === 0) return null;
          return (
            <div
              className="word-sentence-translation-group"
              role="group"
              aria-label={`例句 ${index + 1} ${tier.name}译文组`}
              key={tier.key}
            >
              {groupRows.map(({ translation, translationIndex }) => (
                <Flex
                  className="word-sentence-translation-item"
                  gap={6}
                  align="flex-start"
                  key={translation.id}
                >
                  <Dropdown
                    disabled={disabled}
                    trigger={["click"]}
                    menu={{
                      items: TIER_MENU_ITEMS,
                      selectedKeys: [translation.band],
                      onClick: ({ key }) =>
                        onChange(
                          rows.map((item) =>
                            item.id === translation.id
                              ? {
                                  ...item,
                                  band: key as SentenceTranslationBandV3
                                }
                              : item
                          )
                        )
                    }}
                  >
                    <Button
                      type="text"
                      size="small"
                      disabled={disabled}
                      className="word-sentence-translation-band-button"
                      aria-label={`例句 ${index + 1} 译文 ${translationIndex + 1} 风格`}
                    >
                      <span
                        aria-label={`${tier.name}译文`}
                        className="word-sentence-translation-tier"
                      >
                        <strong>{tier.short}</strong>
                      </span>
                    </Button>
                  </Dropdown>

                  <Input.TextArea
                    placeholder="请输入对应的中文译文"
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    aria-label={
                      rows.length === 1
                        ? `例句 ${index + 1} 中文`
                        : `例句 ${index + 1} 译文 ${translationIndex + 1} 中文`
                    }
                    data-v3-field="zh_translations"
                    data-v3-node-id={translation.id}
                    disabled={disabled}
                    value={translation.content.text}
                    onChange={(event) =>
                      onChange(
                        rows.map((item) =>
                          item.id === translation.id
                            ? {
                                ...item,
                                content: replaceRichText(
                                  item.content,
                                  event.target.value
                                )
                              }
                            : item
                        )
                      )
                    }
                  />
                  <Button
                    aria-label={`删除例句 ${index + 1} 译文 ${translationIndex + 1}`}
                    type="text"
                    size="small"
                    className="word-sentence-translation-delete"
                    icon={<DeleteOutlined />}
                    disabled={disabled || rows.length === 1}
                    onClick={() =>
                      onChange(
                        rows.filter((item) => item.id !== translation.id)
                      )
                    }
                  />
                </Flex>
              ))}
            </div>
          );
        })}
      </div>
      <Dropdown
        disabled={disabled}
        trigger={["click"]}
        menu={{
          items: TIER_MENU_ITEMS,
          onClick: ({ key }) =>
            onChange([
              ...rows,
              {
                id: newWordNodeId(),
                band: key as SentenceTranslationBandV3,
                language,
                content: { version: 2, text: "", annotations: [] }
              }
            ])
        }}
      >
        <Button
          block
          size="small"
          type="dashed"
          className="word-sentence-translation-add word-section-add-button"
          disabled={disabled}
          icon={<PlusOutlined />}
          aria-label={`添加例句 ${index + 1} 译文`}
        >
          添加译文
        </Button>
      </Dropdown>
    </div>
  );
}
