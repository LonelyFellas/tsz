import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Dropdown, Flex, Input, Typography } from "antd";
import type {
  SentenceTranslationBandV3,
  WordSentenceTranslationV3,
  WordSentenceWritableV3
} from "@tsz/types";
import { newWordNodeId } from "../../word-model/primitives";
import { replaceRichText, sentenceTranslationsV3 } from "../meaningsModel";
import "./V3SentenceTranslationsField.css";

// 初/中/高是译文风格，与例句的难度等级无关，顺序固定为初、中、高。
const TIERS = [
  {
    key: "word_for_word",
    label: "初阶",
    name: "初阶",
    short: "初"
  },
  {
    key: "balanced_fluency",
    label: "中阶",
    name: "中阶",
    short: "中"
  },
  {
    key: "adapted_creation",
    label: "高阶",
    name: "高阶",
    short: "高"
  }
] as const;

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
  return (
    <div className="word-sentence-translation-list">
      <Typography.Text
        type="secondary"
        className="word-sentence-translation-label"
      >
        汉语译文
      </Typography.Text>
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
                      items: TIERS.map(({ key, label }) => ({ key, label })),
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
          items: TIERS.map(({ key, label }) => ({ key, label })),
          onClick: ({ key }) =>
            onChange([
              ...rows,
              {
                id: newWordNodeId(),
                band: key as SentenceTranslationBandV3,
                content: { version: 2, text: "", annotations: [] }
              }
            ])
        }}
      >
        <Button
          size="small"
          type="text"
          className="word-sentence-translation-add"
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
