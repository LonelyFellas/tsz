import {
  HolderOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined
} from "@ant-design/icons";
import { Button, Flex, Form, Input, Select, Typography } from "antd";
import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordCommonFormVariantV3,
  WordPronunciationV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import { useEffect, useState, type DragEvent } from "react";
import { issuesForPronunciation } from "../model";
import {
  reorderPronunciations,
  updatePronunciation,
  type V3IdFactory
} from "../operations";
import { pronunciationStyleLabel } from "../presentation";
import { dialectLabel } from "../presentation";
import { v3IssueMessage } from "../presentationErrors";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";

const PRONUNCIATION_DRAG_TYPE = "application/x-tsz-pronunciation";

function pronunciationFieldMessage(
  issue: V3DraftValidationIssue,
  field: "style" | "dict_phonetic" | "actual_pron"
) {
  if (issue.code !== "pronunciation_required") return v3IssueMessage(issue);
  if (field === "style") return "请选择发音方式";
  if (field === "dict_phonetic") return "请填写字典音标";
  return "请填写实际发音";
}

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
  const [draggingIndex, setDraggingIndex] = useState<number>();
  const [dragOverIndex, setDragOverIndex] = useState<number>();
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
        {(fields, { add, move, remove }) => {
          const movePronunciation = (
            sourceIndex: number,
            targetIndex: number
          ) => {
            if (
              sourceIndex === targetIndex ||
              sourceIndex < 0 ||
              targetIndex < 0 ||
              sourceIndex >= variant.pronunciations.length ||
              targetIndex >= variant.pronunciations.length
            ) {
              return;
            }
            move(sourceIndex, targetIndex);
            const orderedIds = variant.pronunciations.map((item) => item.id);
            const [movedId] = orderedIds.splice(sourceIndex, 1);
            orderedIds.splice(targetIndex, 0, movedId!);
            onChange(reorderPronunciations(content, variant.id, orderedIds));
          };
          return (
            <Flex vertical>
              {fields.map((field, index) => {
                const pronunciation = variant.pronunciations[index];
                if (!pronunciation) return null;
                const rowIssues = issuesForPronunciation(
                  issues,
                  pronunciation.id
                );
                const styleIssue = rowIssues.find(
                  (item) => item.field === "style"
                );
                const dictPhoneticIssue = rowIssues.find(
                  (item) => item.field === "dict_phonetic"
                );
                const actualPronunciationIssue = rowIssues.find(
                  (item) => item.field === "actual_pron"
                );
                return (
                  <div
                    className={`word-pronunciation-editor${draggingIndex === index ? " is-dragging" : ""}${dragOverIndex === index ? " is-drag-over" : ""}${dragOverIndex === index && draggingIndex !== undefined ? (draggingIndex < index ? " is-drag-over-after" : " is-drag-over-before") : ""}`}
                    data-field-key={field.key}
                    data-pronunciation-id={pronunciation.id}
                    data-v3-node-id={pronunciation.id}
                    key={field.key}
                    onDragLeave={() => setDragOverIndex(undefined)}
                    onDragOver={(event: DragEvent<HTMLDivElement>) => {
                      if (
                        fields.length < 2 ||
                        !event.dataTransfer.types.includes(
                          PRONUNCIATION_DRAG_TYPE
                        )
                      ) {
                        return;
                      }
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                      setDragOverIndex(index);
                    }}
                    onDrop={(event: DragEvent<HTMLDivElement>) => {
                      event.preventDefault();
                      setDragOverIndex(undefined);
                      const raw = event.dataTransfer.getData(
                        PRONUNCIATION_DRAG_TYPE
                      );
                      if (!raw) return;
                      try {
                        const source = JSON.parse(raw) as {
                          scope?: string;
                          index?: number;
                        };
                        if (
                          source.scope === variant.id &&
                          typeof source.index === "number"
                        ) {
                          movePronunciation(source.index, index);
                        }
                      } catch {
                        // Ignore drag data from outside this pronunciation list.
                      }
                    }}
                  >
                    <div className="word-pronunciation-actions">
                      <Button
                        aria-label={`删除第 ${index + 1} 条发音`}
                        disabled={fields.length === 1}
                        icon={<MinusCircleOutlined />}
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
                        size="small"
                        type="text"
                      />
                      <Button
                        aria-label={`在第 ${index + 1} 条后新增发音`}
                        icon={<PlusCircleOutlined />}
                        onClick={() => {
                          const next: WordPronunciationV3 = {
                            id: idFactory(),
                            dict_phonetic: "",
                            actual_pron: "",
                            style: "normal"
                          };
                          add(next, index + 1);
                          onChange(
                            updateVariantPronunciations(
                              content,
                              variant.id,
                              (items) => [
                                ...items.slice(0, index + 1),
                                next,
                                ...items.slice(index + 1)
                              ]
                            )
                          );
                        }}
                        size="small"
                        type="text"
                      />
                      <Button
                        aria-label={`拖动第 ${index + 1} 条发音`}
                        className="word-pronunciation-drag-handle"
                        disabled={fields.length < 2}
                        draggable={fields.length > 1}
                        htmlType="button"
                        icon={<HolderOutlined />}
                        onDragEnd={() => {
                          setDraggingIndex(undefined);
                          setDragOverIndex(undefined);
                        }}
                        onDragStart={(event) => {
                          if (fields.length < 2) {
                            event.preventDefault();
                            return;
                          }
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData(
                            PRONUNCIATION_DRAG_TYPE,
                            JSON.stringify({ scope: variant.id, index })
                          );
                          const row = event.currentTarget.closest<HTMLElement>(
                            ".word-pronunciation-editor"
                          );
                          if (
                            row &&
                            typeof event.dataTransfer.setDragImage ===
                              "function"
                          ) {
                            event.dataTransfer.setDragImage(row, 24, 24);
                          }
                          setDraggingIndex(index);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowUp" && index > 0) {
                            event.preventDefault();
                            movePronunciation(index, index - 1);
                          }
                          if (
                            event.key === "ArrowDown" &&
                            index < fields.length - 1
                          ) {
                            event.preventDefault();
                            movePronunciation(index, index + 1);
                          }
                        }}
                        title={
                          fields.length > 1
                            ? "拖动排序，也可使用上下方向键"
                            : "仅一条发音"
                        }
                        type="text"
                      />
                    </div>
                    <div className="word-pronunciation-fields">
                      <label className="word-pronunciation-row">
                        <Typography.Text className="word-pronunciation-label">
                          发音方式
                        </Typography.Text>
                        <Form.Item noStyle>
                          <Select
                            aria-invalid={Boolean(styleIssue)}
                            aria-label={`第 ${index + 1} 条发音的发音方式`}
                            className="word-pronunciation-style-select"
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
                            status={styleIssue ? "error" : undefined}
                            value={pronunciation.style}
                          />
                        </Form.Item>
                        {styleIssue ? (
                          <Typography.Text
                            className="word-field-help"
                            type="danger"
                          >
                            {pronunciationFieldMessage(styleIssue, "style")}
                          </Typography.Text>
                        ) : null}
                      </label>
                      <div className="word-pronunciation-row">
                        <Typography.Text className="word-pronunciation-label">
                          字典音标
                        </Typography.Text>
                        <div className="word-pronunciation-phonetic-control">
                          <PronunciationPreviewControls
                            ariaLabelPrefix={`${dialectLabel(variant.dialect)}第 ${index + 1} 条发音`}
                            compact
                            dialect={variant.dialect}
                            pronunciationId={pronunciation.id}
                            spelling={variant.spelling}
                          >
                            <Form.Item noStyle>
                              <Input
                                aria-invalid={Boolean(dictPhoneticIssue)}
                                aria-label={`第 ${index + 1} 条发音的字典音标`}
                                className="word-pronunciation-phonetic-input"
                                data-v3-field="dict_phonetic"
                                data-v3-node-id={pronunciation.id}
                                onChange={(event) =>
                                  onChange(
                                    updatePronunciation(
                                      content,
                                      pronunciation.id,
                                      {
                                        dict_phonetic: event.target.value
                                      }
                                    )
                                  )
                                }
                                placeholder="字典音标"
                                status={dictPhoneticIssue ? "error" : undefined}
                                value={pronunciation.dict_phonetic}
                              />
                            </Form.Item>
                          </PronunciationPreviewControls>
                        </div>
                        {dictPhoneticIssue ? (
                          <Typography.Text
                            className="word-field-help"
                            type="danger"
                          >
                            {pronunciationFieldMessage(
                              dictPhoneticIssue,
                              "dict_phonetic"
                            )}
                          </Typography.Text>
                        ) : null}
                      </div>
                      <label className="word-pronunciation-row">
                        <Typography.Text className="word-pronunciation-label">
                          实际发音
                        </Typography.Text>
                        <Form.Item noStyle>
                          <Input
                            aria-invalid={Boolean(actualPronunciationIssue)}
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
                            status={
                              actualPronunciationIssue ? "error" : undefined
                            }
                            value={pronunciation.actual_pron}
                          />
                        </Form.Item>
                        {actualPronunciationIssue ? (
                          <Typography.Text
                            className="word-field-help"
                            type="danger"
                          >
                            {pronunciationFieldMessage(
                              actualPronunciationIssue,
                              "actual_pron"
                            )}
                          </Typography.Text>
                        ) : null}
                      </label>
                    </div>
                  </div>
                );
              })}
              {fields.length === 0 ? (
                <>
                  <Typography.Text type="secondary">暂无发音</Typography.Text>
                  <Button
                    aria-label="新增发音"
                    icon={<PlusCircleOutlined />}
                    onClick={() => {
                      const pronunciation: WordPronunciationV3 = {
                        id: idFactory(),
                        dict_phonetic: "",
                        actual_pron: "",
                        style: "normal"
                      };
                      add(pronunciation);
                      onChange(
                        updateVariantPronunciations(
                          content,
                          variant.id,
                          (items) => [...items, pronunciation]
                        )
                      );
                    }}
                    type="dashed"
                  >
                    新增发音
                  </Button>
                </>
              ) : null}
            </Flex>
          );
        }}
      </Form.List>
    </Form>
  );
}
