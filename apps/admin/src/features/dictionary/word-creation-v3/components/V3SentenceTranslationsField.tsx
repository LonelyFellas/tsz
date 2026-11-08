import {
  useLexiconEditorTranslation,
  defaultLexiconEditorTranslation,
  type LexiconEditorTranslation
} from "../../i18n/editor";
import { Trash2Icon, PlusIcon } from "lucide-react";
import { Button, Flex } from "@tsz/ui/admin/display";
import { Dropdown } from "@tsz/ui/admin/overlays";
import { Input } from "@tsz/ui/admin/forms";
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
function translationTiers(
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
) {
  return [
    {
      key: "word_for_word",
      label: t("panel_literal"),
      name: t("panel_literal"),
      short: t("panel_w"),
      hint: t("panel_word_for_word_translation")
    },
    {
      key: "balanced_fluency",
      label: t("panel_fluent"),
      name: t("panel_fluent"),
      short: t("panel_b"),
      hint: t("panel_balanced_fluency")
    },
    {
      key: "adapted_creation",
      label: t("panel_adapted"),
      name: t("panel_adapted"),
      short: t("panel_a"),
      hint: t("panel_adapted_creation")
    }
  ] as const;
}

// 两个下拉共用：光看「初/中/高」分不出该往哪一档写，把每档的含义摆在名字后面。
// 译文语言现阶段只开放汉语；下拉就一项，位置留给将来的多语言译文。
function translationLanguages(
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
) {
  return [{ key: "zh", label: t("panel_chinese_2") }] as const;
}
function translationLanguageLabels(
  t: LexiconEditorTranslation = defaultLexiconEditorTranslation
): Record<TranslationLanguageV3, string> {
  return {
    zh: t("panel_chinese_2")
  };
}

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
  const { t } = useLexiconEditorTranslation();
  const TIER_MENU_ITEMS = translationTiers(t).map(({ key, label, hint }) => ({
    key,
    label: (
      <span className="word-sentence-translation-tier-option">
        {label}
        <span className="word-sentence-translation-tier-hint">({hint})</span>
      </span>
    )
  }));

  const LANGUAGE_MENU_ITEMS = translationLanguages(t).map(({ key, label }) => ({
    key,
    label
  }));
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
          aria-label={t("panel_example_translation_language", {
            p0: index + 1
          })}
        >
          {t("translation_language_label", {
            language: translationLanguageLabels(t)[language]
          })}
        </Button>
      </Dropdown>
      <div className="word-sentence-translation-groups">
        {translationTiers(t).map((tier) => {
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
              aria-label={t("panel_example_translation_group", {
                p0: index + 1,
                p1: tier.name
              })}
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
                      aria-label={t("panel_example_translation_style", {
                        p0: index + 1,
                        p1: translationIndex + 1
                      })}
                    >
                      <span
                        aria-label={t("panel_translation_2", { p0: tier.name })}
                        className="word-sentence-translation-tier"
                      >
                        <strong>{tier.short}</strong>
                      </span>
                    </Button>
                  </Dropdown>

                  <Input.TextArea
                    placeholder={t("panel_enter_the_chinese_translation")}
                    autoSize={{ minRows: 1, maxRows: 4 }}
                    aria-label={
                      rows.length === 1
                        ? t("panel_example_chinese", { p0: index + 1 })
                        : t("panel_example_translation_chinese", {
                            p0: index + 1,
                            p1: translationIndex + 1
                          })
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
                    aria-label={t("panel_delete_example_translation", {
                      p0: index + 1,
                      p1: translationIndex + 1
                    })}
                    type="text"
                    size="small"
                    className="word-sentence-translation-delete"
                    icon={<Trash2Icon />}
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
          icon={<PlusIcon />}
          aria-label={t("panel_add_example_translation", { p0: index + 1 })}
        >
          {t("panel_add_translation")}
        </Button>
      </Dropdown>
    </div>
  );
}
