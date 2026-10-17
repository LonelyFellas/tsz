import { IconButton as MuiIconButton } from "@mui/material";
import { env } from "@/lib/env";
import { EmptyStateHint } from "@/components/EmptyStateHint";
import { V3SynthesisInputs } from "./V3SynthesisInputs";
import { V3ActualPronunciationCopy } from "./V3ActualPronunciationCopy";
import { V3VoiceTextField } from "./V3VoiceTextField";
import DragIndicator from "@mui/icons-material/DragIndicator";
import RemoveCircleOutline from "@mui/icons-material/RemoveCircleOutline";
import AddCircleOutline from "@mui/icons-material/AddCircleOutline";
import { Button, MenuItem, Select, Stack, Typography } from "@mui/material";
import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordCommonFormVariantV3,
  WordPronunciationV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import { useState, type DragEvent } from "react";
import { issuesForPronunciation } from "../model";
import {
  reorderPronunciations,
  updatePronunciation,
  type V3IdFactory
} from "../operations";
import { pronunciationStyleLabel } from "../presentation";
import { v3IssueMessage } from "../presentationErrors";

const PRONUNCIATION_DRAG_TYPE = "application/x-tsz-pronunciation";

function pronunciationFieldMessage(
  issue: V3DraftValidationIssue,
  field: "style" | "dict_phonetic" | "actual_pron"
) {
  if (issue.code !== "pronunciation_required") return v3IssueMessage(issue);
  if (field === "style") return "请选择读法";
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
  const [draggingIndex, setDraggingIndex] = useState<number>();
  const [dragOverIndex, setDragOverIndex] = useState<number>();
  const movePronunciation = (sourceIndex: number, targetIndex: number) => {
    if (
      sourceIndex === targetIndex ||
      sourceIndex < 0 ||
      targetIndex < 0 ||
      sourceIndex >= variant.pronunciations.length ||
      targetIndex >= variant.pronunciations.length
    ) {
      return;
    }
    const orderedIds = variant.pronunciations.map((item) => item.id);
    const [movedId] = orderedIds.splice(sourceIndex, 1);
    orderedIds.splice(targetIndex, 0, movedId!);
    onChange(reorderPronunciations(content, variant.id, orderedIds));
  };
  return (
    <Stack className="v3-pronunciation-list">
      {variant.pronunciations.map((pronunciation, index) => {
        const rowIssues = issuesForPronunciation(issues, pronunciation.id);
        const styleIssue = rowIssues.find((item) => item.field === "style");
        const dictPhoneticIssue = rowIssues.find(
          (item) => item.field === "dict_phonetic"
        );
        const actualPronIssue = rowIssues.find(
          (item) => item.field === "actual_pron"
        );
        return (
          <div
            className={`word-pronunciation-editor${draggingIndex === index ? " is-dragging" : ""}${dragOverIndex === index ? " is-drag-over" : ""}${dragOverIndex === index && draggingIndex !== undefined ? (draggingIndex < index ? " is-drag-over-after" : " is-drag-over-before") : ""}`}
            data-field-key={pronunciation.id}
            data-pronunciation-id={pronunciation.id}
            data-v3-node-id={pronunciation.id}
            key={pronunciation.id}
            onDragLeave={() => setDragOverIndex(undefined)}
            onDragOver={(event: DragEvent<HTMLDivElement>) => {
              if (
                variant.pronunciations.length < 2 ||
                !event.dataTransfer.types.includes(PRONUNCIATION_DRAG_TYPE)
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
              const raw = event.dataTransfer.getData(PRONUNCIATION_DRAG_TYPE);
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
              <MuiIconButton
                aria-label={`拖动第 ${index + 1} 条发音`}
                className="word-pronunciation-drag-handle"
                disabled={variant.pronunciations.length < 2}
                draggable={variant.pronunciations.length > 1}
                type="button"
                onDragEnd={() => {
                  setDraggingIndex(undefined);
                  setDragOverIndex(undefined);
                }}
                onDragStart={(event) => {
                  if (variant.pronunciations.length < 2) {
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
                    typeof event.dataTransfer.setDragImage === "function"
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
                    index < variant.pronunciations.length - 1
                  ) {
                    event.preventDefault();
                    movePronunciation(index, index + 1);
                  }
                }}
                title={
                  variant.pronunciations.length > 1
                    ? "拖动排序，也可使用上下方向键"
                    : "仅一条发音"
                }
                size="small"
              >
                {<DragIndicator />}
              </MuiIconButton>
              <MuiIconButton
                aria-label={`在第 ${index + 1} 条后新增发音`}
                onClick={() => {
                  const next: WordPronunciationV3 = {
                    id: idFactory(),
                    dict_phonetic: "",
                    actual_pron: "",
                    style: "normal"
                  };
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
              >
                {<AddCircleOutline />}
              </MuiIconButton>
              <MuiIconButton
                aria-label={`删除第 ${index + 1} 条发音`}
                className="word-pronunciation-remove"
                color="error"
                disabled={variant.pronunciations.length === 1}
                onClick={() => {
                  onChange(
                    updateVariantPronunciations(content, variant.id, (items) =>
                      items.filter((item) => item.id !== pronunciation.id)
                    )
                  );
                }}
                size="small"
              >
                {<RemoveCircleOutline />}
              </MuiIconButton>
            </div>
            <div className="word-pronunciation-fields">
              <label className="word-pronunciation-row word-pronunciation-inline-label">
                <Typography
                  component="span"
                  className="word-pronunciation-label word-pronunciation-floating-label"
                >
                  读法
                </Typography>

                <Select
                  className="word-pronunciation-style-select"
                  data-v3-field="style"
                  data-v3-node-id={pronunciation.id}
                  onChange={(event) =>
                    onChange(
                      updatePronunciation(content, pronunciation.id, {
                        style: event.target
                          .value as WordPronunciationV3["style"]
                      })
                    )
                  }
                  size="small"
                  error={!!styleIssue}
                  inputProps={{ "aria-label": `第 ${index + 1} 条发音的读法` }}
                  displayEmpty
                  value={pronunciation.style ?? ""}
                >
                  {!pronunciation.style && (
                    <MenuItem value="" disabled>
                      风格
                    </MenuItem>
                  )}
                  {(["normal", "citation", "strong", "weak"] as const).map(
                    (style) => (
                      <MenuItem key={style} value={style}>
                        {pronunciationStyleLabel(style)}
                      </MenuItem>
                    )
                  )}
                </Select>

                {styleIssue ? (
                  <Typography
                    component="span"
                    className="word-field-help"
                    color="error"
                  >
                    {pronunciationFieldMessage(styleIssue, "style")}
                  </Typography>
                ) : null}
              </label>
              <div className="word-pronunciation-row word-pronunciation-inline-label">
                <Typography
                  component="span"
                  className="word-pronunciation-label word-pronunciation-floating-label"
                >
                  字典音标
                </Typography>
                <div className="word-pronunciation-phonetic-control">
                  <V3VoiceTextField
                    mode="dict-phonetic"
                    editingEnabled={false}
                    dialect={variant.dialect}
                    ariaLabel={`第 ${index + 1} 条发音的字典音标`}
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
                        updatePronunciation(content, pronunciation.id, {
                          dict_phonetic: dict_phonetic_rich.text,
                          ...(pronunciation.dict_phonetic_rich ||
                          dict_phonetic_rich.annotations.length > 0
                            ? { dict_phonetic_rich }
                            : {})
                        })
                      )
                    }
                  />

                  {dictPhoneticIssue ? (
                    <Typography
                      component="span"
                      className="word-field-help"
                      color="error"
                    >
                      {pronunciationFieldMessage(
                        dictPhoneticIssue,
                        "dict_phonetic"
                      )}
                    </Typography>
                  ) : null}
                </div>
              </div>
              <div className="word-pronunciation-row word-pronunciation-inline-label">
                <Typography
                  component="span"
                  className="word-pronunciation-label word-pronunciation-floating-label"
                >
                  实际发音
                </Typography>
                <div className="word-actual-pronunciation-control">
                  <V3VoiceTextField
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
                    ariaLabel={`第 ${index + 1} 条发音的实际发音`}
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
                        updatePronunciation(content, pronunciation.id, {
                          actual_pron: actual_pron_rich.text,
                          ...(pronunciation.actual_pron_rich ||
                          actual_pron_rich.annotations.length > 0
                            ? { actual_pron_rich }
                            : {})
                        })
                      )
                    }
                  />
                </div>
                {actualPronIssue ? (
                  <Typography
                    component="span"
                    className="word-field-help"
                    color="error"
                  >
                    {pronunciationFieldMessage(actualPronIssue, "actual_pron")}
                  </Typography>
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
                    updatePronunciation(content, pronunciation.id, patch)
                  )
                }
              />
            </div>
          </div>
        );
      })}
      {variant.pronunciations.length === 0 ? (
        <div className="admin-empty-state">
          <EmptyStateHint>暂无发音</EmptyStateHint>
          <Button
            aria-label="新增发音"
            startIcon={<AddCircleOutline />}
            onClick={() => {
              const pronunciation: WordPronunciationV3 = {
                id: idFactory(),
                dict_phonetic: "",
                actual_pron: "",
                style: "normal"
              };
              onChange(
                updateVariantPronunciations(content, variant.id, (items) => [
                  ...items,
                  pronunciation
                ])
              );
            }}
            variant="outlined"
          >
            新增发音
          </Button>
        </div>
      ) : null}
    </Stack>
  );
}
