import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined,
  PlusOutlined
} from "@ant-design/icons";
import {
  Button,
  Flex,
  Form,
  Input,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordCommonFormVariantV3,
  WordPronunciationV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import { useEffect } from "react";
import { issuesForPronunciation } from "../model";
import {
  reorderPronunciations,
  updatePronunciation,
  type V3IdFactory
} from "../operations";
import { pronunciationStyleLabel } from "../presentation";

function updateVariantPronunciations(
  content: DraftFormsStepContentV3,
  variantId: string,
  update: (items: WordPronunciationV3[]) => WordPronunciationV3[]
) {
  const next = structuredClone(content);
  for (const pos of next.pos) {
    for (const form of pos.forms) {
      const variants =
        form.regional_variants.mode === "common"
          ? [form.regional_variants.common]
          : [form.regional_variants.uk, form.regional_variants.us];
      const variant = variants.find((item) => item.id === variantId);
      if (variant) {
        variant.pronunciations = update(variant.pronunciations);
        return next;
      }
    }
  }
  throw new Error(`variant not found: ${variantId}`);
}

export interface V3PronunciationListProps {
  content: DraftFormsStepContentV3;
  variant: WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3;
  issues: readonly V3DraftValidationIssue[];
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
}

export function V3PronunciationList({
  content,
  variant,
  issues,
  idFactory,
  onChange
}: V3PronunciationListProps) {
  const [form] = Form.useForm();
  useEffect(() => {
    form.setFieldsValue({ items: variant.pronunciations });
  }, [form, variant.pronunciations]);

  return (
    <Form
      className="v3-pronunciation-list"
      component={false}
      form={form}
      initialValues={{ items: variant.pronunciations }}
    >
      <Form.List name="items">
        {(fields, { add, move, remove }) => (
          <Flex vertical gap="small">
            {fields.map((field, index) => {
              const pronunciation = variant.pronunciations[index];
              if (!pronunciation) return null;
              const rowIssues = issuesForPronunciation(
                issues,
                pronunciation.id
              );
              return (
                <div
                  className="v3-pronunciation-row"
                  data-field-key={field.key}
                  data-pronunciation-id={pronunciation.id}
                  data-v3-node-id={pronunciation.id}
                  key={field.key}
                >
                  <Tag>{index + 1}</Tag>
                  <Form.Item name={[field.name, "dict_phonetic"]} noStyle>
                    <Input
                      aria-invalid={rowIssues.some(
                        (item) => item.field === "dict_phonetic"
                      )}
                      aria-label={`第 ${index + 1} 条发音的字典音标`}
                      data-v3-field="dict_phonetic"
                      data-v3-node-id={pronunciation.id}
                      onChange={(event) =>
                        onChange(
                          updatePronunciation(content, pronunciation.id, {
                            dict_phonetic: event.target.value
                          })
                        )
                      }
                      placeholder="字典音标"
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, "actual_pron"]} noStyle>
                    <Input
                      aria-invalid={rowIssues.some(
                        (item) => item.field === "actual_pron"
                      )}
                      aria-label={`第 ${index + 1} 条发音的实际发音`}
                      data-v3-field="actual_pron"
                      data-v3-node-id={pronunciation.id}
                      onChange={(event) =>
                        onChange(
                          updatePronunciation(content, pronunciation.id, {
                            actual_pron: event.target.value
                          })
                        )
                      }
                      placeholder="实际发音"
                    />
                  </Form.Item>
                  <Form.Item name={[field.name, "style"]} noStyle>
                    <Select
                      aria-label={`第 ${index + 1} 条发音的发音方式`}
                      data-v3-field="style"
                      data-v3-node-id={pronunciation.id}
                      onChange={(style) =>
                        onChange(
                          updatePronunciation(content, pronunciation.id, {
                            style
                          })
                        )
                      }
                      options={[
                        {
                          value: "normal",
                          label: pronunciationStyleLabel("normal")
                        },
                        {
                          value: "strong",
                          label: pronunciationStyleLabel("strong")
                        },
                        {
                          value: "weak",
                          label: pronunciationStyleLabel("weak")
                        }
                      ]}
                      placeholder="风格"
                    />
                  </Form.Item>
                  <Space.Compact>
                    <Button
                      aria-label={`上移第 ${index + 1} 条发音`}
                      disabled={index === 0}
                      icon={<ArrowUpOutlined />}
                      onClick={() => {
                        move(index, index - 1);
                        const ordered = variant.pronunciations.map(
                          (item) => item.id
                        );
                        [ordered[index - 1], ordered[index]] = [
                          ordered[index]!,
                          ordered[index - 1]!
                        ];
                        onChange(
                          reorderPronunciations(content, variant.id, ordered)
                        );
                      }}
                    />
                    <Button
                      aria-label={`下移第 ${index + 1} 条发音`}
                      disabled={index === fields.length - 1}
                      icon={<ArrowDownOutlined />}
                      onClick={() => {
                        move(index, index + 1);
                        const ordered = variant.pronunciations.map(
                          (item) => item.id
                        );
                        [ordered[index], ordered[index + 1]] = [
                          ordered[index + 1]!,
                          ordered[index]!
                        ];
                        onChange(
                          reorderPronunciations(content, variant.id, ordered)
                        );
                      }}
                    />
                    <Button
                      aria-label={`删除第 ${index + 1} 条发音`}
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        remove(index);
                        onChange(
                          updateVariantPronunciations(
                            content,
                            variant.id,
                            (items) =>
                              items.filter(
                                (item) => item.id !== pronunciation.id
                              )
                          )
                        );
                      }}
                    />
                  </Space.Compact>
                </div>
              );
            })}
            {fields.length === 0 && (
              <Typography.Text type="secondary">暂无发音</Typography.Text>
            )}
            <Button
              aria-label="新增发音"
              icon={<PlusOutlined />}
              onClick={() => {
                const pronunciation: WordPronunciationV3 = {
                  id: idFactory(),
                  dict_phonetic: "",
                  actual_pron: "",
                  style: "normal"
                };
                add(pronunciation);
                onChange(
                  updateVariantPronunciations(content, variant.id, (items) => [
                    ...items,
                    pronunciation
                  ])
                );
              }}
              type="dashed"
            >
              新增发音
            </Button>
          </Flex>
        )}
      </Form.List>
    </Form>
  );
}
