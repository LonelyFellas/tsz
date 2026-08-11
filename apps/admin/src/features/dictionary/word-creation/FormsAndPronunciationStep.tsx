import {
  DeleteOutlined,
  DownOutlined,
  EllipsisOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  SoundOutlined,
  SyncOutlined,
  UploadOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Dropdown,
  Flex,
  Input,
  Radio,
  Select,
  Space,
  Tabs,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type {
  AdminWordV2,
  Dialect,
  DraftFormsStepContent,
  StepSaveIntent,
  WordDerivedFormSlotV2,
  WordFormVariantV2,
  WordPosFormsV2,
  WordPosTag,
  WordPronunciationV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import { Fragment, type DragEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DIALECT_LABEL,
  DIALECT_SHORT_LABEL,
  FORM_TYPE_OPTIONS,
  PRON_STYLE_OPTIONS
} from "../editorConstants";
import { adminWordsDataSourceCapabilities } from "../dataSource";
import {
  availablePartOfSpeechOptions,
  createPartOfSpeechLookup,
  partOfSpeechLabel
} from "../part-of-speech/catalog";
import { usePartOfSpeechCatalog } from "../part-of-speech/api";
import {
  cloneWordValue,
  moveWordNode,
  newWordNodeId
} from "../word-model/primitives";
import {
  usePreviewFormsImpact,
  useSaveFormsStep,
  useSuggestDialectVariants
} from "./api";
import {
  createDerivedSlot,
  createFormGroup,
  createPosForms,
  createPronunciation,
  formDialects,
  toFormsWireContent
} from "./model";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import {
  useWordValidationIssue,
  useWordValidationIssueFocus
} from "./useWordValidationIssueFocus";

interface Props {
  word: AdminWordV2;
  readOnly?: boolean;
  onSaved: (word: AdminWordV2) => void;
}

const DERIVED_TYPE_OPTIONS = FORM_TYPE_OPTIONS.filter(
  (option) => option.value !== "base"
);

const FORM_ORIGIN_LABEL: Record<WordFormVariantV2["origin"], string> = {
  dictionary: "词典",
  converted: "转换",
  manual: "手动"
};

const PRONUNCIATION_DRAG_TYPE = "application/x-tsz-pronunciation";

function dialectPanelClass(dialect: Dialect): string {
  return `dialect-panel dialect-panel-${dialect} word-form-variant`;
}

function updatePronunciation(
  variant: WordFormVariantV2,
  index: number,
  nextPronunciation: WordPronunciationV2
): WordFormVariantV2 {
  const pronunciations = [...variant.pronunciations];
  pronunciations[index] = nextPronunciation;
  return { ...variant, pronunciations };
}

function PronunciationFields({
  value,
  disabled,
  index,
  count,
  dragScope,
  dragLabel,
  onChange,
  onRemove,
  onAdd,
  onReorder
}: {
  value: WordPronunciationV2;
  disabled?: boolean;
  index: number;
  count: number;
  dragScope: string;
  dragLabel: string;
  onChange: (next: WordPronunciationV2) => void;
  onRemove?: () => void;
  onAdd?: () => void;
  onReorder?: (sourceIndex: number, targetIndex: number) => void;
}) {
  const { message } = App.useApp();
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const canReorder = !disabled && count > 1 && Boolean(onReorder);

  const handleDragStart = (event: DragEvent<HTMLButtonElement>) => {
    if (!canReorder) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      PRONUNCIATION_DRAG_TYPE,
      JSON.stringify({ scope: dragScope, index })
    );
    setDragging(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (
      !canReorder ||
      !event.dataTransfer.types.includes(PRONUNCIATION_DRAG_TYPE)
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOver(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    const raw = event.dataTransfer.getData(PRONUNCIATION_DRAG_TYPE);
    if (!raw || !onReorder) return;
    try {
      const source = JSON.parse(raw) as { scope?: string; index?: number };
      if (
        source.scope === dragScope &&
        typeof source.index === "number" &&
        source.index !== index
      ) {
        onReorder(source.index, index);
      }
    } catch {
      // Ignore drag data from outside the pronunciation editor.
    }
  };

  return (
    <div
      className={`word-pronunciation-editor${dragging ? " is-dragging" : ""}${dragOver ? " is-drag-over" : ""}`}
      data-word-node-id={value.id}
      data-word-field="pronunciations"
      onDragOver={handleDragOver}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="word-pronunciation-actions">
        <Button
          type="text"
          size="small"
          icon={<MinusCircleOutlined />}
          aria-label="删除读音"
          disabled={disabled || !onRemove}
          onClick={onRemove}
        />
        <Button
          type="text"
          size="small"
          icon={<PlusCircleOutlined />}
          aria-label="添加读音"
          disabled={disabled || !onAdd}
          onClick={onAdd}
        />
        <button
          type="button"
          className="word-pronunciation-drag-handle"
          aria-label={`拖动${dragLabel}`}
          title={canReorder ? "拖动排序，也可使用上下方向键" : "仅一条读音"}
          draggable={canReorder}
          disabled={!canReorder}
          onDragStart={handleDragStart}
          onDragEnd={() => {
            setDragging(false);
            setDragOver(false);
          }}
          onKeyDown={(event) => {
            if (!onReorder) return;
            if (event.key === "ArrowUp" && index > 0) {
              event.preventDefault();
              onReorder(index, index - 1);
            }
            if (event.key === "ArrowDown" && index < count - 1) {
              event.preventDefault();
              onReorder(index, index + 1);
            }
          }}
        >
          ≡
        </button>
      </div>
      <div className="word-pronunciation-fields">
        <div className="word-pronunciation-row">
          <Typography.Text className="word-pronunciation-label">
            发音方式
          </Typography.Text>
          <Select
            className="word-pronunciation-style-select"
            aria-label="发音方式"
            value={value.style}
            options={PRON_STYLE_OPTIONS}
            disabled={disabled}
            onChange={(style) => onChange({ ...value, style })}
          />
        </div>
        <div className="word-pronunciation-row">
          <Typography.Text className="word-pronunciation-label">
            字典音标
          </Typography.Text>
          <div className="word-pronunciation-phonetic-control">
            <Space.Compact block>
              <Tooltip title="播放语音">
                <Button
                  className="word-pronunciation-play-action"
                  icon={<SoundOutlined />}
                  disabled
                  aria-label="播放语音"
                />
              </Tooltip>
              <Input
                className="word-pronunciation-phonetic-input"
                aria-label="字典音标"
                value={value.dict_phonetic}
                readOnly={disabled}
                placeholder="字典音标"
                onChange={(event) =>
                  onChange({ ...value, dict_phonetic: event.target.value })
                }
              />
              <Tooltip title="获取语音">
                <Button
                  className="word-pronunciation-voice-action word-pronunciation-sync-action"
                  aria-label="获取语音"
                  icon={<SyncOutlined />}
                  disabled={disabled}
                  onClick={() => message.info("获取语音（Mock）")}
                />
              </Tooltip>
              <Tooltip title="上传语音">
                <Button
                  className="word-pronunciation-voice-action"
                  aria-label="上传语音"
                  icon={<UploadOutlined />}
                  disabled={disabled}
                  onClick={() => message.info("上传语音（Mock）")}
                />
              </Tooltip>
            </Space.Compact>
          </div>
        </div>
        <div className="word-pronunciation-row">
          <Typography.Text className="word-pronunciation-label">
            实际发音
          </Typography.Text>
          <Input
            aria-label="实际发音"
            value={value.actual_pron}
            readOnly={disabled}
            placeholder="实际发音"
            onChange={(event) =>
              onChange({ ...value, actual_pron: event.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}

function VariantEditor({
  value,
  base,
  baseReadOnly,
  readOnly,
  matrix,
  lastRow,
  issueNodeId,
  onChange
}: {
  value: WordFormVariantV2;
  base?: boolean;
  baseReadOnly?: boolean;
  readOnly?: boolean;
  matrix?: boolean;
  lastRow?: boolean;
  issueNodeId: string;
  onChange: (next: WordFormVariantV2) => void;
}) {
  const disabledPronunciation = readOnly || baseReadOnly;
  return (
    <div
      className={
        matrix
          ? `word-form-matrix-dialect-cell word-form-matrix-dialect-cell-${value.dialect}${lastRow ? " word-form-matrix-last-row" : ""}`
          : dialectPanelClass(value.dialect)
      }
      data-word-node-id={value.id}
      data-spelling-layout="distinguish"
    >
      {!matrix && (
        <Typography.Text strong>
          {DIALECT_LABEL[value.dialect]}
          {value.dialect === "uk"
            ? " · BrE"
            : value.dialect === "us"
              ? " · AmE"
              : ""}
        </Typography.Text>
      )}
      <Flex
        justify="space-between"
        align="center"
        gap={8}
        style={{ marginTop: matrix ? 0 : 10 }}
      >
        <Typography.Text strong>词形拼写</Typography.Text>
        <Tag className="word-form-origin-tag">
          {FORM_ORIGIN_LABEL[value.origin]}
        </Tag>
      </Flex>
      <Input
        aria-label={`${DIALECT_SHORT_LABEL[value.dialect]}词形拼写`}
        data-word-node-id={issueNodeId}
        data-word-field={`variants.${value.dialect}.spelling`}
        value={value.spelling}
        readOnly={readOnly || base}
        placeholder="词形拼写"
        style={{ marginTop: 8 }}
        onChange={(event) =>
          onChange({
            ...value,
            spelling: event.target.value,
            origin: "manual"
          })
        }
      />
      {value.pronunciations.map((pronunciation, index) => (
        <PronunciationFields
          key={pronunciation.id}
          value={pronunciation}
          disabled={disabledPronunciation}
          index={index}
          count={value.pronunciations.length}
          dragScope={value.id}
          dragLabel={`${DIALECT_SHORT_LABEL[value.dialect]}${base ? "原形" : "词形"}读音 ${index + 1}`}
          onChange={(next) => onChange(updatePronunciation(value, index, next))}
          onRemove={
            value.pronunciations.length > 1
              ? () =>
                  onChange({
                    ...value,
                    pronunciations: value.pronunciations.filter(
                      (_, pronunciationIndex) => pronunciationIndex !== index
                    )
                  })
              : undefined
          }
          onAdd={
            !disabledPronunciation
              ? () =>
                  onChange({
                    ...value,
                    pronunciations: [
                      ...value.pronunciations,
                      createPronunciation()
                    ]
                  })
              : undefined
          }
          onReorder={
            !disabledPronunciation && value.pronunciations.length > 1
              ? (sourceIndex, targetIndex) =>
                  onChange({
                    ...value,
                    pronunciations: moveWordNode(
                      value.pronunciations,
                      sourceIndex,
                      targetIndex
                    )
                  })
              : undefined
          }
        />
      ))}
    </div>
  );
}

function SharedSpellingVariantEditor({
  values,
  base,
  baseReadOnly,
  readOnly,
  matrix,
  lastRow,
  issueNodeId,
  onChange
}: {
  values: WordFormVariantV2[];
  base?: boolean;
  baseReadOnly?: boolean;
  readOnly?: boolean;
  matrix?: boolean;
  lastRow?: boolean;
  issueNodeId: string;
  onChange: (next: WordFormVariantV2[]) => void;
}) {
  const firstValue = values[0];
  if (!firstValue) return null;

  const disabledPronunciation = readOnly || baseReadOnly;
  const updateVariant = (
    index: number,
    nextVariant: WordFormVariantV2
  ): void => {
    const nextValues = [...values];
    nextValues[index] = nextVariant;
    onChange(nextValues);
  };

  return (
    <div
      className={`${matrix ? "word-form-matrix-shared-cell" : "word-shared-form-variant"}${lastRow ? " word-form-matrix-last-row" : ""}`}
      data-word-node-id={issueNodeId}
      data-word-field="variants"
      data-spelling-layout="unified"
    >
      <div className="word-shared-form-spelling">
        <Flex justify="space-between" align="center" gap={8}>
          <Typography.Text strong>词形拼写</Typography.Text>
          <Tag color="blue">英美共用</Tag>
        </Flex>
        <Input
          aria-label="共用词形拼写"
          value={firstValue.spelling}
          readOnly={readOnly || base}
          placeholder="词形拼写"
          style={{ marginTop: 10 }}
          onChange={(event) =>
            onChange(
              values.map((variant) => ({
                ...variant,
                spelling: event.target.value,
                origin: "manual"
              }))
            )
          }
        />
      </div>
      <div
        className={
          values.length > 1
            ? "word-shared-pronunciation-grid"
            : "word-shared-pronunciation-grid word-shared-pronunciation-grid-single"
        }
      >
        {values.map((variant, variantIndex) => (
          <div
            className={`word-shared-pronunciation word-shared-pronunciation-${variant.dialect}`}
            data-word-node-id={variant.id}
            data-word-field="pronunciations"
            key={variant.id}
          >
            {!matrix && (
              <Flex justify="space-between" align="center" gap={8}>
                <Typography.Text strong>
                  {variant.dialect === "common"
                    ? "英美共用发音"
                    : `${DIALECT_SHORT_LABEL[variant.dialect]} · ${variant.dialect === "uk" ? "BrE" : "AmE"}`}
                </Typography.Text>
                <Tag className="word-form-origin-tag">
                  {FORM_ORIGIN_LABEL[variant.origin]}
                </Tag>
              </Flex>
            )}
            {variant.pronunciations.map((pronunciation, index) => (
              <PronunciationFields
                key={pronunciation.id}
                value={pronunciation}
                disabled={disabledPronunciation}
                index={index}
                count={variant.pronunciations.length}
                dragScope={variant.id}
                dragLabel={`${DIALECT_SHORT_LABEL[variant.dialect]}${base ? "原形" : "词形"}读音 ${index + 1}`}
                onChange={(nextPronunciation) =>
                  updateVariant(
                    variantIndex,
                    updatePronunciation(variant, index, nextPronunciation)
                  )
                }
                onRemove={
                  variant.pronunciations.length > 1
                    ? () =>
                        updateVariant(variantIndex, {
                          ...variant,
                          pronunciations: variant.pronunciations.filter(
                            (_, pronunciationIndex) =>
                              pronunciationIndex !== index
                          )
                        })
                    : undefined
                }
                onAdd={
                  !disabledPronunciation
                    ? () =>
                        updateVariant(variantIndex, {
                          ...variant,
                          pronunciations: [
                            ...variant.pronunciations,
                            createPronunciation()
                          ]
                        })
                    : undefined
                }
                onReorder={
                  !disabledPronunciation && variant.pronunciations.length > 1
                    ? (sourceIndex, targetIndex) =>
                        updateVariant(variantIndex, {
                          ...variant,
                          pronunciations: moveWordNode(
                            variant.pronunciations,
                            sourceIndex,
                            targetIndex
                          )
                        })
                    : undefined
                }
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BaseTypeCell({ lastRow }: { lastRow: boolean }) {
  return (
    <div
      className={`word-form-type-cell${lastRow ? " word-form-matrix-last-row" : ""}`}
    >
      <Tag>原形</Tag>
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        拼写从第 1 步派生
      </Typography.Text>
    </div>
  );
}

function DerivedTypeCell({
  slot,
  index,
  last,
  readOnly,
  onChange,
  onMove,
  onRemove
}: {
  slot: WordDerivedFormSlotV2;
  index: number;
  last: boolean;
  readOnly?: boolean;
  onChange: (next: WordDerivedFormSlotV2) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div
      className={`word-form-type-cell${last ? " word-form-matrix-last-row" : ""}`}
      data-word-node-id={slot.id}
      data-word-field="form_type"
    >
      <Typography.Text type="secondary">#{index + 1}</Typography.Text>
      <Select
        value={slot.form_type}
        options={DERIVED_TYPE_OPTIONS}
        disabled={readOnly}
        style={{ width: "100%" }}
        onChange={(form_type) => onChange({ ...slot, form_type })}
      />
      <Flex gap={2} wrap>
        <Button
          type="text"
          size="small"
          icon={<UpOutlined />}
          disabled={readOnly || index === 0}
          aria-label={`上移词形 ${index + 1}`}
          onClick={() => onMove(-1)}
        />
        <Button
          type="text"
          size="small"
          icon={<DownOutlined />}
          disabled={readOnly || last}
          aria-label={`下移词形 ${index + 1}`}
          onClick={() => onMove(1)}
        />
        <Button
          type="text"
          danger
          size="small"
          icon={<DeleteOutlined />}
          disabled={readOnly}
          aria-label={`删除词形 ${index + 1}`}
          onClick={onRemove}
        />
      </Flex>
    </div>
  );
}

function MissingDialectVariantCell({
  dialect,
  source,
  slotId,
  lastRow,
  readOnly,
  generating,
  onGenerate,
  onAdd
}: {
  dialect: Dialect;
  source?: WordFormVariantV2;
  slotId: string;
  lastRow: boolean;
  readOnly?: boolean;
  generating?: boolean;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<string | undefined>;
  onAdd: (spelling: string, origin: WordFormVariantV2["origin"]) => void;
}) {
  return (
    <div
      className={`word-form-matrix-dialect-cell word-form-matrix-dialect-cell-${dialect}${lastRow ? " word-form-matrix-last-row" : ""}`}
    >
      <Alert type="warning" showIcon title="该方言词形尚未填写" />
      {!readOnly && (
        <Space wrap style={{ marginTop: 10 }}>
          <Button
            size="small"
            icon={<SoundOutlined />}
            loading={generating}
            disabled={
              !adminWordsDataSourceCapabilities.dialectVariantSuggestions ||
              !source ||
              source.spelling.trim() === "" ||
              dialect === "common"
            }
            title={
              adminWordsDataSourceCapabilities.dialectVariantSuggestions
                ? undefined
                : "真实方言建议服务尚未接入，请手工填写"
            }
            onClick={() => {
              if (!source || dialect === "common") return;
              void onGenerate(source, dialect, slotId).then((suggestion) => {
                if (suggestion !== undefined) onAdd(suggestion, "converted");
              });
            }}
          >
            生成{dialect === "uk" ? "英式" : "美式"}建议
          </Button>
          <Button size="small" onClick={() => onAdd("", "manual")}>
            手工填写
          </Button>
        </Space>
      )}
    </div>
  );
}

function FormGroupMatrix({
  pos,
  groupIndex,
  readOnly,
  generating,
  onGenerate,
  onChange
}: {
  pos: WordPosFormsV2;
  groupIndex: number;
  readOnly?: boolean;
  generating?: boolean;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<string | undefined>;
  onChange: (next: WordPosFormsV2) => void;
}) {
  const group = pos.form_groups[groupIndex];
  if (!group) return null;

  const dialects = formDialects(pos);
  const editableBasePronunciation = groupIndex === 0;
  const updateBaseVariants = (variants: WordFormVariantV2[]) =>
    onChange({
      ...pos,
      base_form: { ...pos.base_form, variants }
    });
  const updateSlot = (slotIndex: number, nextSlot: WordDerivedFormSlotV2) => {
    const formGroups = [...pos.form_groups];
    const slots = [...group.slots];
    slots[slotIndex] = nextSlot;
    formGroups[groupIndex] = { ...group, slots };
    onChange({ ...pos, form_groups: formGroups });
  };
  const moveSlot = (slotIndex: number, delta: -1 | 1) => {
    const formGroups = [...pos.form_groups];
    formGroups[groupIndex] = {
      ...group,
      slots: moveWordNode(group.slots, slotIndex, slotIndex + delta)
    };
    onChange({ ...pos, form_groups: formGroups });
  };
  const removeSlot = (slotIndex: number) => {
    const formGroups = [...pos.form_groups];
    formGroups[groupIndex] = {
      ...group,
      slots: group.slots.filter((_, index) => index !== slotIndex)
    };
    onChange({ ...pos, form_groups: formGroups });
  };

  if (pos.dialect_rules.spelling_mode === "unified") {
    return (
      <div className="word-form-matrix word-form-matrix-unified">
        <div className="word-form-matrix-type-header">词形类型</div>
        <div className="word-form-matrix-shared-header">
          {dialects.map((dialect) => (
            <span
              className={`word-form-matrix-shared-header-${dialect}`}
              key={dialect}
            >
              {dialect === "common"
                ? "英美共用"
                : `${DIALECT_SHORT_LABEL[dialect]} · ${dialect === "uk" ? "BrE" : "AmE"}`}
            </span>
          ))}
        </div>
        <BaseTypeCell lastRow={group.slots.length === 0} />
        <SharedSpellingVariantEditor
          values={pos.base_form.variants}
          base
          baseReadOnly={!editableBasePronunciation}
          readOnly={readOnly}
          matrix
          lastRow={group.slots.length === 0}
          issueNodeId={pos.base_form.id}
          onChange={updateBaseVariants}
        />
        {group.slots.map((slot, slotIndex) => {
          const last = slotIndex === group.slots.length - 1;
          return (
            <Fragment key={slot.id}>
              <DerivedTypeCell
                slot={slot}
                index={slotIndex}
                last={last}
                readOnly={readOnly}
                onChange={(nextSlot) => updateSlot(slotIndex, nextSlot)}
                onMove={(delta) => moveSlot(slotIndex, delta)}
                onRemove={() => removeSlot(slotIndex)}
              />
              <SharedSpellingVariantEditor
                values={slot.variants}
                readOnly={readOnly}
                matrix
                lastRow={last}
                issueNodeId={slot.id}
                onChange={(variants) =>
                  updateSlot(slotIndex, { ...slot, variants })
                }
              />
            </Fragment>
          );
        })}
      </div>
    );
  }

  const renderDialectCell = (
    slot: WordPosFormsV2["base_form"] | WordDerivedFormSlotV2,
    dialect: Dialect,
    slotIndex: number | undefined,
    lastRow: boolean
  ) => {
    const variantIndex = slot.variants.findIndex(
      (variant) => variant.dialect === dialect
    );
    const variant = slot.variants[variantIndex];
    const applyVariants = (variants: WordFormVariantV2[]) => {
      if (slotIndex === undefined) updateBaseVariants(variants);
      else
        updateSlot(slotIndex, {
          ...(slot as WordDerivedFormSlotV2),
          variants
        });
    };
    if (variant) {
      return (
        <VariantEditor
          key={dialect}
          value={variant}
          base={slotIndex === undefined}
          baseReadOnly={slotIndex === undefined && !editableBasePronunciation}
          readOnly={readOnly}
          matrix
          lastRow={lastRow}
          issueNodeId={slot.id}
          onChange={(nextVariant) => {
            const variants = [...slot.variants];
            variants[variantIndex] = nextVariant;
            applyVariants(variants);
          }}
        />
      );
    }
    const source = slot.variants.find((item) => item.dialect !== dialect);
    return (
      <MissingDialectVariantCell
        key={dialect}
        dialect={dialect}
        source={source}
        slotId={slot.id}
        lastRow={lastRow}
        readOnly={readOnly}
        generating={generating}
        onGenerate={onGenerate}
        onAdd={(spelling, origin) =>
          applyVariants([
            ...slot.variants,
            {
              id: newWordNodeId(),
              dialect,
              spelling,
              origin,
              pronunciations: [createPronunciation()]
            }
          ])
        }
      />
    );
  };

  return (
    <div className="word-form-matrix word-form-matrix-distinguish">
      <div className="word-form-matrix-type-header">词形类型</div>
      {dialects.map((dialect) => (
        <div
          className={`word-form-matrix-dialect-header word-form-matrix-dialect-header-${dialect}`}
          key={dialect}
        >
          {DIALECT_SHORT_LABEL[dialect]} · {dialect === "uk" ? "BrE" : "AmE"}
        </div>
      ))}
      <BaseTypeCell lastRow={group.slots.length === 0} />
      {dialects.map((dialect) =>
        renderDialectCell(
          pos.base_form,
          dialect,
          undefined,
          group.slots.length === 0
        )
      )}
      {group.slots.map((slot, slotIndex) => {
        const last = slotIndex === group.slots.length - 1;
        return (
          <Fragment key={slot.id}>
            <DerivedTypeCell
              slot={slot}
              index={slotIndex}
              last={last}
              readOnly={readOnly}
              onChange={(nextSlot) => updateSlot(slotIndex, nextSlot)}
              onMove={(delta) => moveSlot(slotIndex, delta)}
              onRemove={() => removeSlot(slotIndex)}
            />
            {dialects.map((dialect) =>
              renderDialectCell(slot, dialect, slotIndex, last)
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

function copyVariantToDialect(
  source: WordFormVariantV2,
  dialect: Dialect,
  spelling: string
): WordFormVariantV2 {
  return {
    ...cloneWordValue(source),
    id: newWordNodeId(),
    dialect,
    spelling,
    origin: source.origin,
    pronunciations: source.pronunciations.map((pronunciation) => ({
      ...pronunciation,
      id: newWordNodeId()
    }))
  };
}

function normalizeVariants(
  variants: WordFormVariantV2[],
  desired: Dialect[],
  forcedSpellings?: Partial<Record<Dialect, string>>,
  spellingUnified = false
): WordFormVariantV2[] {
  const fallback = variants[0] ?? {
    id: newWordNodeId(),
    dialect: "common" as const,
    spelling: "",
    origin: "manual" as const,
    pronunciations: [createPronunciation()]
  };
  const commonSpelling =
    variants.find((item) => item.dialect === "common")?.spelling ??
    fallback.spelling;
  return desired.map((dialect) => {
    const existing = variants.find((item) => item.dialect === dialect);
    const spelling =
      forcedSpellings?.[dialect] ??
      (spellingUnified
        ? commonSpelling
        : (existing?.spelling ?? fallback.spelling));
    return existing
      ? { ...existing, spelling }
      : copyVariantToDialect(fallback, dialect, spelling);
  });
}

function normalizeDialectRules(
  pos: WordPosFormsV2,
  headwords: AdminWordV2["headwords"],
  spellingMode: "unified" | "distinguish",
  phoneticMode: "unified" | "distinguish"
): WordPosFormsV2 {
  const forcedSpellingMode =
    headwords.mode === "distinguish" ? "distinguish" : spellingMode;
  const forcedPhoneticMode =
    forcedSpellingMode === "distinguish" ? "distinguish" : phoneticMode;
  const desired: Dialect[] =
    forcedSpellingMode === "distinguish" || forcedPhoneticMode === "distinguish"
      ? ["uk", "us"]
      : ["common"];
  const forcedBaseSpellings: Partial<Record<Dialect, string>> =
    headwords.mode === "distinguish"
      ? { uk: headwords.uk, us: headwords.us }
      : desired.length === 1
        ? { common: headwords.common }
        : { uk: headwords.common, us: headwords.common };
  return {
    ...pos,
    dialect_rules: {
      spelling_mode: forcedSpellingMode,
      phonetic_mode: forcedPhoneticMode
    },
    base_form: {
      ...pos.base_form,
      variants: normalizeVariants(
        pos.base_form.variants,
        desired,
        forcedBaseSpellings,
        forcedSpellingMode === "unified"
      )
    },
    form_groups: pos.form_groups.map((group) => ({
      ...group,
      slots: group.slots.map((slot) => ({
        ...slot,
        variants: normalizeVariants(
          slot.variants,
          desired,
          undefined,
          forcedSpellingMode === "unified"
        )
      }))
    }))
  };
}

function PosFormsEditor({
  value,
  headwords,
  readOnly,
  generating,
  onGenerate,
  onChange
}: {
  value: WordPosFormsV2;
  headwords: AdminWordV2["headwords"];
  readOnly?: boolean;
  generating?: boolean;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<string | undefined>;
  onChange: (next: WordPosFormsV2) => void;
}) {
  const spellingForced = headwords.mode === "distinguish";
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set()
  );

  const toggleGroup = (groupId: string) => {
    setCollapsedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <div
      className="word-forms-workbench"
      data-word-node-id={value.pos_id}
      data-word-field="form_groups"
    >
      <Space orientation="vertical" size={14} style={{ width: "100%" }}>
        {value.form_groups.map((group, groupIndex) => {
          const collapsed = collapsedGroupIds.has(group.id);
          const bodyId = `word-form-group-${group.id}-body`;
          const moveGroup = (nextIndex: number) =>
            onChange({
              ...value,
              form_groups: moveWordNode(
                value.form_groups,
                groupIndex,
                nextIndex
              )
            });
          const removeGroup = () =>
            onChange({
              ...value,
              form_groups: value.form_groups.filter(
                (_, index) => index !== groupIndex
              )
            });

          return (
            <Card
              className="word-form-card"
              key={group.id}
              data-word-node-id={group.id}
              data-word-field="slots"
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (
                  target.closest(".ant-card-head") &&
                  !target.closest("button")
                ) {
                  toggleGroup(group.id);
                }
              }}
              title={
                <button
                  type="button"
                  className="word-form-card-toggle"
                  aria-expanded={!collapsed}
                  aria-controls={bodyId}
                  aria-label={`${collapsed ? "展开" : "收起"}第 ${groupIndex + 1} 组词形变化`}
                  onClick={() => toggleGroup(group.id)}
                >
                  <span>{`第 ${groupIndex + 1} 组 词形变化`}</span>
                  <span className="word-form-card-toggle-state">
                    <span>{collapsed ? "展开" : "收起"}</span>
                    <DownOutlined
                      className={`word-form-card-toggle-icon${collapsed ? " is-collapsed" : ""}`}
                    />
                  </span>
                </button>
              }
              extra={
                !readOnly && value.form_groups.length > 1 ? (
                  <Dropdown
                    trigger={["click"]}
                    placement="bottomRight"
                    menu={{
                      items: [
                        {
                          key: "move-up",
                          icon: <UpOutlined />,
                          label: "上移本组",
                          disabled: groupIndex === 0
                        },
                        {
                          key: "move-down",
                          icon: <DownOutlined />,
                          label: "下移本组",
                          disabled: groupIndex === value.form_groups.length - 1
                        },
                        { type: "divider" },
                        {
                          key: "delete",
                          icon: <DeleteOutlined />,
                          label: "删除本组",
                          danger: true
                        }
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation();
                        if (key === "move-up") moveGroup(groupIndex - 1);
                        if (key === "move-down") moveGroup(groupIndex + 1);
                        if (key === "delete") removeGroup();
                      }
                    }}
                  >
                    <Button
                      type="text"
                      icon={<EllipsisOutlined />}
                      aria-label={`管理第 ${groupIndex + 1} 组词形变化`}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </Dropdown>
                ) : null
              }
            >
              {!collapsed && (
                <div id={bodyId}>
                  <div className="word-form-rules">
                    <div className="word-form-rule-row">
                      <Typography.Text strong>
                        词形是否规则变化？
                      </Typography.Text>
                      <Radio.Group
                        value={group.is_regular}
                        disabled={readOnly}
                        onChange={(event) => {
                          const groups = [...value.form_groups];
                          groups[groupIndex] = {
                            ...group,
                            is_regular: event.target.value
                          };
                          onChange({ ...value, form_groups: groups });
                        }}
                      >
                        <Radio value>是</Radio>
                        <Radio value={false}>否</Radio>
                      </Radio.Group>
                    </div>
                    {groupIndex === 0 && (
                      <>
                        <div className="word-form-rule-row">
                          <Typography.Text strong>
                            英美拼写是否有区别？
                          </Typography.Text>
                          <Space wrap>
                            <Radio.Group
                              value={value.dialect_rules.spelling_mode}
                              disabled={readOnly || spellingForced}
                              onChange={(event) =>
                                onChange(
                                  normalizeDialectRules(
                                    value,
                                    headwords,
                                    event.target.value,
                                    value.dialect_rules.phonetic_mode
                                  )
                                )
                              }
                            >
                              <Radio value="distinguish">是</Radio>
                              <Radio value="unified">否</Radio>
                            </Radio.Group>
                            {spellingForced && (
                              <Typography.Text type="secondary">
                                主词已区分英美，词形保持区分
                              </Typography.Text>
                            )}
                          </Space>
                        </div>
                        {value.dialect_rules.spelling_mode === "unified" && (
                          <div className="word-form-rule-row">
                            <Typography.Text strong>
                              英美音标是否有区别？
                            </Typography.Text>
                            <Radio.Group
                              value={value.dialect_rules.phonetic_mode}
                              disabled={readOnly}
                              onChange={(event) =>
                                onChange(
                                  normalizeDialectRules(
                                    value,
                                    headwords,
                                    value.dialect_rules.spelling_mode,
                                    event.target.value
                                  )
                                )
                              }
                            >
                              <Radio value="distinguish">是</Radio>
                              <Radio value="unified">否</Radio>
                            </Radio.Group>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <FormGroupMatrix
                    pos={value}
                    groupIndex={groupIndex}
                    readOnly={readOnly}
                    generating={generating}
                    onGenerate={onGenerate}
                    onChange={onChange}
                  />
                  {!readOnly && (
                    <div className="word-form-add-slot-wrap">
                      <Button
                        type="dashed"
                        icon={<PlusOutlined />}
                        className="word-form-add-slot"
                        onClick={() => {
                          const groups = [...value.form_groups];
                          groups[groupIndex] = {
                            ...group,
                            slots: [
                              ...group.slots,
                              createDerivedSlot("plural", value)
                            ]
                          };
                          onChange({ ...value, form_groups: groups });
                        }}
                      >
                        添加派生词形
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </Card>
          );
        })}
        {!readOnly && (
          <Button
            type="dashed"
            block
            size="large"
            icon={<PlusCircleOutlined />}
            className="word-form-add-group"
            onClick={() =>
              onChange({
                ...value,
                form_groups: [...value.form_groups, createFormGroup()]
              })
            }
          >
            添加一组替代词形变化
          </Button>
        )}
      </Space>
    </div>
  );
}

function hasCompleteBase(pos: WordPosFormsV2): boolean {
  const expected = formDialects(pos);
  return expected.every((dialect) => {
    const variant = pos.base_form.variants.find(
      (item) => item.dialect === dialect
    );
    return Boolean(
      variant?.spelling.trim() &&
      variant.pronunciations.some(
        (pronunciation) =>
          pronunciation.dict_phonetic.trim() && pronunciation.actual_pron.trim()
      )
    );
  });
}

export function FormsAndPronunciationStep({ word, readOnly, onSaved }: Props) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const editQuery = word.status === "published" ? "?mode=edit" : "";
  const [content, setContent] = useState<DraftFormsStepContent>(() =>
    cloneWordValue(word.forms)
  );
  const [activePosId, setActivePosId] = useState(
    word.forms.pos[0]?.pos_id ?? ""
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const issueTarget = useWordValidationIssue();
  const saveForms = useSaveFormsStep(word.id);
  const previewImpact = usePreviewFormsImpact(word.id);
  const suggestVariants = useSuggestDialectVariants();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const allowSavedNavigation = useUnsavedWordChanges(dirty);
  useWordValidationIssueFocus(activePosId);

  useEffect(() => {
    if (!issueTarget) return;
    const owner = content.pos.find((pos) => {
      if (pos.pos_id === issueTarget.nodeId) return true;
      if (pos.base_form.id === issueTarget.nodeId) return true;
      if (
        pos.base_form.variants.some(
          (variant) =>
            variant.id === issueTarget.nodeId ||
            variant.pronunciations.some(
              (pronunciation) => pronunciation.id === issueTarget.nodeId
            )
        )
      ) {
        return true;
      }
      return pos.form_groups.some(
        (group) =>
          group.id === issueTarget.nodeId ||
          group.slots.some(
            (slot) =>
              slot.id === issueTarget.nodeId ||
              slot.variants.some(
                (variant) =>
                  variant.id === issueTarget.nodeId ||
                  variant.pronunciations.some(
                    (pronunciation) => pronunciation.id === issueTarget.nodeId
                  )
              )
          )
      );
    });
    if (owner) setActivePosId(owner.pos_id);
  }, [content.pos, issueTarget]);

  useEffect(() => {
    if (!dirty) {
      setContent(cloneWordValue(word.forms));
      setActivePosId((current) =>
        word.forms.pos.some((pos) => pos.pos_id === current)
          ? current
          : (word.forms.pos[0]?.pos_id ?? "")
      );
    }
  }, [dirty, word.forms, word.revision]);

  const updateContent = (next: DraftFormsStepContent) => {
    setContent(next);
    setDirty(true);
  };

  const availablePos = useMemo(() => {
    const used = new Set(content.pos.map((item) => item.pos));
    return availablePartOfSpeechOptions(partOfSpeechLookup, used);
  }, [content.pos, partOfSpeechLookup]);

  const classificationLabel = (pos: WordPosFormsV2) =>
    partOfSpeechLabel(partOfSpeechLookup, pos.pos);

  const confirmImpact = (
    title: string,
    description: string
  ): Promise<boolean> =>
    new Promise((resolve) => {
      modal.confirm({
        title,
        content: description,
        okText: "确认并保存",
        cancelText: "取消",
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      });
    });

  const generateFormVariant = async (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ): Promise<string | undefined> => {
    if (!adminWordsDataSourceCapabilities.dialectVariantSuggestions) {
      return undefined;
    }
    if (source.dialect !== "uk" && source.dialect !== "us") return undefined;
    try {
      const response = await suggestVariants.mutateAsync({
        source_dialect: source.dialect,
        target_dialect: target,
        items: [
          {
            client_id: clientId,
            field_kind: "form",
            value: source.spelling
          }
        ]
      });
      const suggestion = response.suggestions[0];
      if (!suggestion || suggestion.field_kind !== "form") return undefined;
      return await new Promise((resolve) => {
        modal.confirm({
          title: `确认${target === "uk" ? "英式" : "美式"}词形建议`,
          content: (
            <Space orientation="vertical">
              <Typography.Text type="secondary">源词形</Typography.Text>
              <Typography.Text>{source.spelling}</Typography.Text>
              <Typography.Text type="secondary">建议词形</Typography.Text>
              <Typography.Text strong>{suggestion.value}</Typography.Text>
            </Space>
          ),
          okText: "写入建议",
          cancelText: "取消",
          onOk: () => resolve(suggestion.value),
          onCancel: () => resolve(undefined)
        });
      });
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "生成词形建议失败"
      );
      return undefined;
    }
  };

  const save = async (intent: StepSaveIntent) => {
    if (saving) return;
    if (intent === "complete") {
      if (content.pos.length === 0) {
        message.warning("请至少保留一个基本词性");
        return;
      }
      if (content.pos.some((pos) => pos.form_groups.length === 0)) {
        message.warning("每个词性至少需要一组词形变化");
        return;
      }
      if (content.pos.some((pos) => !hasCompleteBase(pos))) {
        message.warning("请完善各词性基准原形的字典音标和实际发音");
        return;
      }
    }

    setSaving(true);
    try {
      const wireContent = toFormsWireContent(content);
      const impact = await previewImpact.mutateAsync({
        base_revision: word.revision,
        content: wireContent
      });
      let confirmedToken: string | undefined;
      if (impact.requires_confirmation) {
        const confirmed = await confirmImpact(
          "本次修改会影响后续内容",
          impact.affected.map((item) => item.reason).join("；")
        );
        if (!confirmed) return;
        confirmedToken = impact.confirmation_token;
      }
      const { word: savedWord } = await saveForms.mutateAsync({
        base_revision: word.revision,
        intent,
        ...(confirmedToken ? { confirmed_impact_token: confirmedToken } : {}),
        content: wireContent
      });
      setDirty(false);
      onSaved(savedWord);
      message.success(
        intent === "complete" ? "词形与发音已完成" : "草稿已保存"
      );
      if (intent === "complete") {
        allowSavedNavigation();
        navigate(`/words/${word.id}/wizard/meanings${editQuery}`);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        const issue = error.field_issues.find(
          (candidate) => candidate.step === "forms"
        );
        if (issue) {
          message.warning(issue.message);
          navigate(`/words/${word.id}/wizard/forms${editQuery}`, {
            replace: true,
            state: { nodeId: issue.node_id, field: issue.field }
          });
          return;
        }
        if (error.status === 409) {
          modal.confirm({
            title: "草稿版本已更新",
            content:
              "该词条已在其他位置保存。为避免覆盖新内容，请重新加载最新草稿后再编辑。",
            okText: "重新加载",
            cancelText: "留在本页",
            onOk: () => navigate(0)
          });
          return;
        }
      }
      message.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const items = content.pos.map((pos, posIndex) => ({
    key: pos.pos_id,
    label: (
      <Space size={6}>
        <strong>{classificationLabel(pos)}</strong>
        {!readOnly && content.pos.length > 1 && (
          <Button
            type="text"
            danger
            size="small"
            aria-label={`删除${classificationLabel(pos)}`}
            icon={<MinusCircleOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              modal.confirm({
                title: `删除词性“${classificationLabel(pos)}”？`,
                content: "保存时会同时预览该词性下游词义、例句和关系的影响。",
                okText: "删除",
                okButtonProps: { danger: true },
                onOk: () => {
                  const next = content.pos.filter(
                    (_, index) => index !== posIndex
                  );
                  updateContent({ pos: next });
                  setActivePosId(next[0]?.pos_id ?? "");
                }
              });
            }}
          />
        )}
      </Space>
    ),
    children: (
      <PosFormsEditor
        value={pos}
        headwords={word.headwords}
        readOnly={readOnly}
        generating={suggestVariants.isPending}
        onGenerate={generateFormVariant}
        onChange={(nextPos) => {
          const posItems = [...content.pos];
          posItems[posIndex] = nextPos;
          updateContent({ pos: posItems });
        }}
      />
    )
  }));

  return (
    <>
      <div className="word-step-heading">
        <span className="word-step-number">STEP 02</span>
        <Typography.Title level={2} style={{ margin: 0 }}>
          词形与发音
        </Typography.Title>
        <Typography.Paragraph className="word-step-description">
          基本词性来自词典建议，可在本步增删。每个词性共享一个只读原形拼写，并可维护多组替代词形变化与双方言读音。
        </Typography.Paragraph>
      </div>

      {readOnly && (
        <Alert
          type="info"
          showIcon
          title="已发布词条当前为只读"
          style={{ marginBottom: 16 }}
        />
      )}

      {partOfSpeechCatalog.isError && (
        <Alert
          type="warning"
          showIcon
          title="词性目录暂时不可用"
          description="现有内容将显示稳定编码，暂不能添加新的基本词性。"
          action={
            <Button
              size="small"
              onClick={() => void partOfSpeechCatalog.refetch()}
            >
              重 试
            </Button>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      <fieldset
        className="word-request-lock"
        disabled={saving}
        aria-busy={saving}
      >
        <div data-word-node-id="forms" data-word-field="pos">
          <Tabs
            className="word-pos-tabs word-forms-tabs"
            activeKey={activePosId}
            onChange={setActivePosId}
            items={items}
            tabBarExtraContent={
              !readOnly ? (
                <Select<WordPosTag>
                  aria-label="添加基本词性"
                  placeholder="添加基本词性"
                  value={undefined}
                  options={availablePos}
                  loading={partOfSpeechCatalog.isPending}
                  disabled={partOfSpeechCatalog.isError}
                  style={{ width: 170 }}
                  suffixIcon={<PlusOutlined />}
                  onChange={(classification) => {
                    const next = createPosForms(classification, word.headwords);
                    updateContent({ pos: [...content.pos, next] });
                    setActivePosId(next.pos_id);
                  }}
                />
              ) : null
            }
          />
        </div>

        {!readOnly && (
          <div className="word-step-actions">
            <Button
              onClick={() =>
                navigate(`/words/${word.id}/wizard/basics${editQuery}`)
              }
            >
              上一步
            </Button>
            <Button loading={saving} onClick={() => void save("save")}>
              保存草稿
            </Button>
            <Button
              type="primary"
              loading={saving}
              onClick={() => void save("complete")}
            >
              完成并进入词义与例句
            </Button>
          </div>
        )}
      </fieldset>
    </>
  );
}
