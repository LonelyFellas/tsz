import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { regionalVariants } from "@tsz/shared";
import { env } from "@/lib/env";
import { V3SynthesisInputs } from "./V3SynthesisInputs";
import { V3ActualPronunciationCopy } from "./V3ActualPronunciationCopy";
import { V3VoiceTextField } from "./V3VoiceTextField";
import {
  GripVerticalIcon,
  CircleMinusIcon,
  CirclePlusIcon
} from "lucide-react";
import { Button, Flex, Typography } from "@tsz/ui/admin/display";
import { Form, Select } from "@tsz/ui/admin/forms";
import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordCommonFormVariantV3,
  WordPronunciationV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import { useEffect, useId, useState, type DragEvent } from "react";
import { issuesForPronunciation } from "../model";
import {
  reorderPronunciations,
  updatePronunciation,
  type V3IdFactory
} from "../operations";
import { v3IssueMessage } from "../presentationErrors";

const PRONUNCIATION_DRAG_TYPE = "application/x-tsz-pronunciation";

function pronunciationFieldMessage(
  issue: V3DraftValidationIssue,
  field: "style" | "dict_phonetic" | "actual_pron",
  t: ReturnType<typeof useLexiconEditorTranslation>["t"]
) {
  if (issue.code !== "pronunciation_required") return v3IssueMessage(issue);
  if (field === "style") return t("choose_reading");
  if (field === "dict_phonetic") return t("dictionary_phonetic_required");
  return t("actual_pronunciation_required");
}

function updateVariantPronunciations(
  content: DraftFormsStepContentV3,
  variantId: string,
  update: (items: WordPronunciationV3[]) => WordPronunciationV3[]
) {
  const next = structuredClone(content);
  for (const pos of next.pos) {
    for (const form of pos.forms) {
      const variants = regionalVariants(form.regional_variants);
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
  const { t } = useLexiconEditorTranslation();
  const [form] = Form.useForm();
  const inputPrefix = useId();
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
                const actualPronIssue = rowIssues.find(
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
                        aria-label={t("drag_pronunciation", {
                          index: index + 1
                        })}
                        className="word-pronunciation-drag-handle"
                        disabled={fields.length < 2}
                        draggable={fields.length > 1}
                        htmlType="button"
                        icon={<GripVerticalIcon />}
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
                            ? t("drag_help")
                            : t("one_pronunciation")
                        }
                        size="small"
                        type="text"
                      />
                      <Button
                        aria-label={t("insert_pronunciation", {
                          index: index + 1
                        })}
                        icon={<CirclePlusIcon />}
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
                        aria-label={t("delete_pronunciation", {
                          index: index + 1
                        })}
                        className="word-pronunciation-remove"
                        danger
                        disabled={fields.length === 1}
                        icon={<CircleMinusIcon />}
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
                    </div>
                    <div className="word-pronunciation-fields word-pronunciation-floating-fields">
                      <div className="word-pronunciation-row">
                        <label
                          className="word-pronunciation-label"
                          htmlFor={`${inputPrefix}-${pronunciation.id}-style`}
                        >
                          {t("reading")}
                        </label>
                        <Form.Item noStyle>
                          <Select
                            id={`${inputPrefix}-${pronunciation.id}-style`}
                            aria-label={t("reading_label", {
                              index: index + 1
                            })}
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
                                value: "citation",
                                label: t("reading_citation")
                              },
                              {
                                value: "normal",
                                label: t("reading_normal")
                              },
                              {
                                value: "strong",
                                label: t("reading_strong")
                              },
                              {
                                value: "weak",
                                label: t("reading_weak")
                              }
                            ]}
                            placeholder={t("style")}
                            status={styleIssue ? "error" : undefined}
                            value={pronunciation.style}
                          />
                        </Form.Item>
                        {styleIssue ? (
                          <Typography.Text
                            className="word-field-help"
                            type="danger"
                          >
                            {pronunciationFieldMessage(styleIssue, "style", t)}
                          </Typography.Text>
                        ) : null}
                      </div>
                      <div className="word-pronunciation-row">
                        <label
                          className="word-pronunciation-label"
                          htmlFor={`${inputPrefix}-${pronunciation.id}-dict`}
                        >
                          {t("dictionary_phonetic")}
                        </label>
                        <div className="word-pronunciation-phonetic-control">
                          <Form.Item noStyle>
                            <V3VoiceTextField
                              id={`${inputPrefix}-${pronunciation.id}-dict`}
                              mode="dict-phonetic"
                              editingEnabled={false}
                              dialect={variant.dialect}
                              ariaLabel={t("dictionary_phonetic_label", {
                                index: index + 1
                              })}
                              nodeId={pronunciation.id}
                              field="dict_phonetic"
                              invalid={Boolean(dictPhoneticIssue)}
                              placeholder="Dictionary Pronunciation"
                              value={
                                pronunciation.dict_phonetic_rich ?? {
                                  version: 2,
                                  text: pronunciation.dict_phonetic,
                                  annotations: []
                                }
                              }
                              onChange={(dict_phonetic_rich) =>
                                onChange(
                                  updatePronunciation(
                                    content,
                                    pronunciation.id,
                                    {
                                      dict_phonetic: dict_phonetic_rich.text,
                                      ...(pronunciation.dict_phonetic_rich ||
                                      dict_phonetic_rich.annotations.length > 0
                                        ? { dict_phonetic_rich }
                                        : {})
                                    }
                                  )
                                )
                              }
                            />
                          </Form.Item>
                          {dictPhoneticIssue ? (
                            <Typography.Text
                              className="word-field-help"
                              type="danger"
                            >
                              {pronunciationFieldMessage(
                                dictPhoneticIssue,
                                "dict_phonetic",
                                t
                              )}
                            </Typography.Text>
                          ) : null}
                        </div>
                      </div>
                      <div className="word-pronunciation-row">
                        <label
                          className="word-pronunciation-label"
                          htmlFor={`${inputPrefix}-${pronunciation.id}-actual`}
                        >
                          {t("actual_pronunciation")}
                        </label>
                        <div className="word-actual-pronunciation-control">
                          <Form.Item noStyle>
                            <V3VoiceTextField
                              id={`${inputPrefix}-${pronunciation.id}-actual`}
                              mode="actual-pron"
                              trailingAction={
                                <V3ActualPronunciationCopy
                                  pronunciation={pronunciation}
                                  spelling={variant.spelling}
                                  dialect={variant.dialect}
                                  onChange={(patch) =>
                                    onChange(
                                      updatePronunciation(
                                        content,
                                        pronunciation.id,
                                        patch
                                      )
                                    )
                                  }
                                />
                              }
                              dialect={variant.dialect}
                              ariaLabel={t("actual_pronunciation_label", {
                                index: index + 1
                              })}
                              field="actual_pron"
                              nodeId={pronunciation.id}
                              placeholder="Connected Speech"
                              invalid={Boolean(actualPronIssue)}
                              value={
                                pronunciation.actual_pron_rich ?? {
                                  version: 2,
                                  text: pronunciation.actual_pron,
                                  annotations: []
                                }
                              }
                              onChange={(actual_pron_rich) =>
                                onChange(
                                  updatePronunciation(
                                    content,
                                    pronunciation.id,
                                    {
                                      actual_pron: actual_pron_rich.text,
                                      ...(pronunciation.actual_pron_rich ||
                                      actual_pron_rich.annotations.length > 0
                                        ? { actual_pron_rich }
                                        : {})
                                    }
                                  )
                                )
                              }
                            />
                          </Form.Item>
                        </div>
                        {actualPronIssue ? (
                          <Typography.Text
                            className="word-field-help"
                            type="danger"
                          >
                            {pronunciationFieldMessage(
                              actualPronIssue,
                              "actual_pron",
                              t
                            )}
                          </Typography.Text>
                        ) : null}
                      </div>
                      <V3SynthesisInputs
                        key={pronunciation.id}
                        synthesisEditable={env.AZURE_PRONUNCIATION_INPUTS}
                        pronunciation={pronunciation}
                        spelling={variant.spelling}
                        dialect={variant.dialect}
                        index={index}
                        issues={rowIssues}
                        onChange={(patch) =>
                          onChange(
                            updatePronunciation(
                              content,
                              pronunciation.id,
                              patch
                            )
                          )
                        }
                      />
                    </div>
                  </div>
                );
              })}
              {fields.length === 0 ? (
                <>
                  <Typography.Text type="secondary">
                    {t("no_pronunciation")}
                  </Typography.Text>
                  <Button
                    aria-label={t("add_pronunciation")}
                    icon={<CirclePlusIcon />}
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
                    {t("add_pronunciation")}
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
