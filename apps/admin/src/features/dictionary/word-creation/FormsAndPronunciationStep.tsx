import {
  DeleteOutlined,
  DownOutlined,
  EllipsisOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  SoundOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  PronunciationPreviewControls,
  PronunciationPreviewProvider,
  usePronunciationVoiceNotice
} from "./PronunciationPreview";
import {
  Alert,
  App,
  Badge,
  Button,
  Card,
  Dropdown,
  Empty,
  Flex,
  Input,
  Modal,
  Radio,
  Select,
  Space,
  Tabs,
  Tag,
  Typography
} from "antd";
import type {
  AdminWordV2,
  Dialect,
  DraftFormsStepContent,
  FormsImpactResponseV2,
  LexiconSurfaceMatchV2,
  StepSaveIntent,
  WordDerivedFormSlotV2,
  WordFormSlotV2,
  WordFormVariantV2,
  WordPosFormsV2,
  WordPosTag,
  WordPronunciationV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import {
  Fragment,
  type DragEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DIALECT_LABEL,
  DIALECT_SHORT_LABEL,
  FORM_TYPE_OPTIONS,
  PRON_STYLE_OPTIONS
} from "../editorConstants";
import { adminWordsDataSourceCapabilities } from "../dataSource";
import {
  aggregateSurfaceMatchCards,
  canAcknowledgeSurfaceSnapshot
} from "../surfaceSnapshot";
import { useSurfaceSnapshot } from "../useSurfaceSnapshot";
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
  entryContentNodeIssue,
  payloadTooLargeMessage,
  stepContentBodyIssue
} from "./contentLimits";
import {
  applyFormVariantIdentities,
  type FormVariantIdentityLedger
} from "./formVariantIdentity";
import {
  baseFormComplete,
  baseFormIssueMessage,
  derivedFormIssueMessage,
  dialectSlotsProgress,
  formSlotComplete
} from "./formsValidation";
import { summarizeFormsImpact } from "./formsImpactSummary";
import { wordValidationIssueMessage } from "./nodeIssueMessage";
import {
  createDerivedSlot,
  createFormGroup,
  createPosForms,
  createPronunciation,
  defaultDerivedFormType,
  formDialects,
  legalDerivedFormTypes,
  toFormsWireContent
} from "./model";
import type { AdminDialectPreference } from "@tsz/shared";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { buildWordReadiness, pendingReadinessRows } from "./readiness";
import { useUnsavedWordChanges } from "./useUnsavedWordChanges";
import {
  useWordValidationIssue,
  useWordValidationIssueFocus
} from "./useWordValidationIssueFocus";

interface Props {
  word: AdminWordV2;
  readOnly?: boolean;
  onSaved: (word: AdminWordV2) => void;
  onDraftChange?: (content: DraftFormsStepContent) => void;
  /**
   * 词形变体节点身份账本，由向导持有：本步骤离开再回来会重新挂载，
   * 账本放在这里会连同已退役的方言节点 ID 一起丢掉。
   */
  identityLedger: FormVariantIdentityLedger;
}

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
  spelling,
  dialect,
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
  spelling: string;
  dialect: Dialect;
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
            <PronunciationPreviewControls
              compact
              pronunciationId={value.id}
              spelling={spelling}
              dialect={dialect}
              disabled={disabled}
            >
              <Input
                className="word-pronunciation-phonetic-input"
                aria-label="字典音标"
                data-word-node-id={value.id}
                data-word-field="dict_phonetic"
                value={value.dict_phonetic}
                readOnly={disabled}
                placeholder="字典音标"
                onChange={(event) =>
                  onChange({ ...value, dict_phonetic: event.target.value })
                }
              />
            </PronunciationPreviewControls>
          </div>
        </div>
        <div className="word-pronunciation-row">
          <Typography.Text className="word-pronunciation-label">
            实际发音
          </Typography.Text>
          <Input
            aria-label="实际发音"
            data-word-node-id={value.id}
            data-word-field="actual_pron"
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
  readOnly,
  matrix,
  lastRow,
  issueNodeId,
  onChange
}: {
  value: WordFormVariantV2;
  base?: boolean;
  readOnly?: boolean;
  matrix?: boolean;
  lastRow?: boolean;
  issueNodeId: string;
  onChange: (next: WordFormVariantV2) => void;
}) {
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
          spelling={value.spelling}
          dialect={value.dialect}
          disabled={readOnly}
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
            !readOnly
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
            !readOnly && value.pronunciations.length > 1
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
  readOnly,
  matrix,
  lastRow,
  issueNodeId,
  onChange
}: {
  values: WordFormVariantV2[];
  base?: boolean;
  readOnly?: boolean;
  matrix?: boolean;
  lastRow?: boolean;
  issueNodeId: string;
  onChange: (next: WordFormVariantV2[]) => void;
}) {
  const firstValue = values[0];
  if (!firstValue) return null;

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
          data-word-node-id={issueNodeId}
          data-word-field="variants.common.spelling"
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
                spelling={variant.spelling}
                dialect={variant.dialect}
                disabled={readOnly}
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
                  !readOnly
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
                  !readOnly && variant.pronunciations.length > 1
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
    </div>
  );
}

function DerivedTypeCell({
  slot,
  allowedTypes,
  usedTypes,
  index,
  last,
  readOnly,
  onChange,
  onMove,
  onRemove
}: {
  slot: WordDerivedFormSlotV2;
  allowedTypes: WordDerivedFormSlotV2["form_type"][];
  usedTypes: WordDerivedFormSlotV2["form_type"][];
  index: number;
  last: boolean;
  readOnly?: boolean;
  onChange: (next: WordDerivedFormSlotV2) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const duplicate = usedTypes.includes(slot.form_type);
  return (
    <div
      className={`word-form-type-cell${last ? " word-form-matrix-last-row" : ""}`}
      data-word-node-id={slot.id}
      data-word-field="form_type"
    >
      <Typography.Text type="secondary">#{index + 1}</Typography.Text>
      <Select
        value={slot.form_type}
        status={
          allowedTypes.includes(slot.form_type) && !duplicate
            ? undefined
            : "error"
        }
        options={FORM_TYPE_OPTIONS.filter((option) =>
          allowedTypes.includes(
            option.value as WordDerivedFormSlotV2["form_type"]
          )
        ).map((option) => ({
          ...option,
          disabled:
            option.value !== slot.form_type &&
            usedTypes.includes(
              option.value as WordDerivedFormSlotV2["form_type"]
            )
        }))}
        disabled={readOnly}
        style={{ width: "100%" }}
        onChange={(form_type) => onChange({ ...slot, form_type })}
      />
      {duplicate && (
        <Typography.Text type="danger">同组内词形类型不能重复</Typography.Text>
      )}
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
  ) => Promise<void>;
  onAdd: (spelling: string, origin: WordFormVariantV2["origin"]) => void;
}) {
  return (
    <div
      className={`word-form-matrix-dialect-cell word-form-matrix-dialect-cell-${dialect}${lastRow ? " word-form-matrix-last-row" : ""}`}
      data-word-node-id={slotId}
      data-word-field={`variants.${dialect}`}
      tabIndex={0}
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
              void onGenerate(source, dialect, slotId);
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

/**
 * 词形矩阵的一行：基准原形与派生词形共用同一套方言分栏与折叠规则，
 * 差异只在「类型格怎么画」和「变体写回哪里」。
 */
interface FormMatrixRow {
  slot: WordFormSlotV2;
  /** 基准原形行：拼写只读（跟随第 1 步的主词），只能改读音。 */
  base?: boolean;
  typeCell: (lastRow: boolean) => ReactNode;
  onVariantsChange: (variants: WordFormVariantV2[]) => void;
}

function FormMatrix({
  pos,
  rows,
  readOnly,
  generating,
  showOtherDialect,
  onShowOtherDialect,
  onGenerate
}: {
  pos: WordPosFormsV2;
  rows: FormMatrixRow[];
  readOnly?: boolean;
  generating?: boolean;
  /** 非偏好侧是否展开。状态由词性持有：展开是「我现在要看另一侧方言」的意图，
   *  作用于该词性的基准原形与全部词形组，不该每张卡各记一份。 */
  showOtherDialect: boolean;
  onShowOtherDialect: (next: boolean) => void;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<void>;
}) {
  // 偏好侧主导（A1）：偏好那一栏排首位并默认展开，另一侧折叠成一行摘要。
  // 词形拼写与音标是词典事实，不能砍掉——后端也强制两侧齐全才能发布。
  const { preference } = useDialectPreference();
  // 待完善项/服务端 field issue 指到折叠那一侧时自动展开：否则点了没反应——
  // 目标节点根本不在 DOM 里，聚焦逻辑重试几次就静默放弃了。
  //
  // 依赖必须跟着「本次定位事件」(issueTarget 的身份，每次带 state 的 navigate 都换新)：
  // ① 压成「目标是否在折叠侧」的布尔量会把同侧的第二次定位吃掉——布尔一直是 true，
  //    effect 不再触发，用户手动折起来之后就再也展不开；
  // ② 反过来把每次渲染都换身份的 rows 放进依赖，又会让手动折叠被下一次渲染立刻推翻。
  // 所以依赖只放稳定的 issueTarget/pos/preference，槽位与回调都从 ref 读最新的
  // （onShowOtherDialect 是「怎么做」而不是「何时做」，让它进依赖等于把重跑时机
  //  交给调用方的引用稳定性——传个内联箭头就会退回上面 ② 那条回归）。
  const issueTarget = useWordValidationIssue();
  const rowSlots = rows.map((row) => row.slot);
  const watchedSlotsRef = useRef<WordFormSlotV2[]>([]);
  watchedSlotsRef.current = rowSlots;
  const onShowOtherDialectRef = useRef(onShowOtherDialect);
  onShowOtherDialectRef.current = onShowOtherDialect;
  useEffect(() => {
    if (!issueTarget) return;
    const other = otherDialectOf(pos, preference);
    if (!other) return;
    if (
      watchedSlotsRef.current.some((slot) =>
        slotOwnsIssue(slot, other, issueTarget.nodeId)
      )
    ) {
      onShowOtherDialectRef.current(true);
    }
  }, [issueTarget, pos, preference]);

  const allDialects = formDialects(pos);
  const orderedDialects =
    allDialects.length > 1
      ? [...allDialects].sort((left, right) =>
          left === preference ? -1 : right === preference ? 1 : 0
        )
      : allDialects;

  // 拼写统一的布局没有可折叠的「列」：拼写共享一格，两侧音标就在这一格里，
  // 因此只按偏好排序，不做折叠（折叠会让表头与格内内容对不上）。
  if (pos.dialect_rules.spelling_mode === "unified") {
    return (
      <div className="word-form-matrix word-form-matrix-unified">
        <div className="word-form-matrix-type-header">词形类型</div>
        <div className="word-form-matrix-shared-header">
          {orderedDialects.map((dialect) => (
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
        {rows.map((row, rowIndex) => {
          const lastRow = rowIndex === rows.length - 1;
          return (
            <Fragment key={row.slot.id}>
              {row.typeCell(lastRow)}
              <SharedSpellingVariantEditor
                values={row.slot.variants}
                base={row.base}
                readOnly={readOnly}
                matrix
                lastRow={lastRow}
                issueNodeId={row.slot.id}
                onChange={row.onVariantsChange}
              />
            </Fragment>
          );
        })}
      </div>
    );
  }

  const otherDialect = orderedDialects[1];
  const dialects =
    otherDialect && !showOtherDialect ? [orderedDialects[0]!] : orderedDialects;
  const otherProgress = otherDialect
    ? dialectSlotsProgress(rowSlots, pos.dialect_rules, otherDialect)
    : undefined;

  const renderDialectCell = (
    row: FormMatrixRow,
    dialect: Dialect,
    lastRow: boolean
  ) => {
    const variantIndex = row.slot.variants.findIndex(
      (variant) => variant.dialect === dialect
    );
    const variant = row.slot.variants[variantIndex];
    if (variant) {
      return (
        <VariantEditor
          key={dialect}
          value={variant}
          base={row.base}
          readOnly={readOnly}
          matrix
          lastRow={lastRow}
          issueNodeId={row.slot.id}
          onChange={(nextVariant) => {
            const variants = [...row.slot.variants];
            variants[variantIndex] = nextVariant;
            row.onVariantsChange(variants);
          }}
        />
      );
    }
    const source = row.slot.variants.find((item) => item.dialect !== dialect);
    return (
      <MissingDialectVariantCell
        key={dialect}
        dialect={dialect}
        source={source}
        slotId={row.slot.id}
        lastRow={lastRow}
        readOnly={readOnly}
        generating={generating}
        onGenerate={onGenerate}
        onAdd={(spelling, origin) =>
          row.onVariantsChange([
            ...row.slot.variants,
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
    <>
      <div
        className={`word-form-matrix ${dialects.length > 1 ? "word-form-matrix-distinguish" : "word-form-matrix-unified"}`}
      >
        <div className="word-form-matrix-type-header">词形类型</div>
        {dialects.map((dialect) => (
          <div
            className={`word-form-matrix-dialect-header word-form-matrix-dialect-header-${dialect}`}
            key={dialect}
          >
            {DIALECT_SHORT_LABEL[dialect]} · {dialect === "uk" ? "BrE" : "AmE"}
          </div>
        ))}
        {rows.map((row, rowIndex) => {
          const lastRow = rowIndex === rows.length - 1;
          return (
            <Fragment key={row.slot.id}>
              {row.typeCell(lastRow)}
              {dialects.map((dialect) =>
                renderDialectCell(row, dialect, lastRow)
              )}
            </Fragment>
          );
        })}
      </div>
      {otherDialect && otherProgress && (
        <div className="word-form-other-dialect-bar">
          <Typography.Text type="secondary">
            {DIALECT_SHORT_LABEL[otherDialect]}：{otherProgress.filled} 项已填
            {otherProgress.pending > 0
              ? ` / ${otherProgress.pending} 项待填`
              : ""}
          </Typography.Text>
          <Button
            size="small"
            type="link"
            aria-label={`${showOtherDialect ? "折叠" : "展开"}${DIALECT_SHORT_LABEL[otherDialect]}词形`}
            onClick={() => onShowOtherDialect(!showOtherDialect)}
          >
            {showOtherDialect ? "折 叠" : "展 开"}
          </Button>
        </div>
      )}
    </>
  );
}

/**
 * 基准原形矩阵。它独立于派生词形组渲染：无派生能力的词性（感叹词等）后端
 * 只回 `base_form` 与空 `form_groups`，而原形发音仍是完成本步的硬要求——
 * 把它嵌在派生区里，一旦派生区被隐藏就没有地方补音标了。
 */
function BaseFormMatrix({
  pos,
  readOnly,
  generating,
  showOtherDialect,
  onShowOtherDialect,
  onGenerate,
  onChange
}: {
  pos: WordPosFormsV2;
  readOnly?: boolean;
  generating?: boolean;
  showOtherDialect: boolean;
  onShowOtherDialect: (next: boolean) => void;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<void>;
  onChange: (next: WordPosFormsV2) => void;
}) {
  return (
    <FormMatrix
      pos={pos}
      rows={[
        {
          slot: pos.base_form,
          base: true,
          typeCell: (lastRow) => <BaseTypeCell lastRow={lastRow} />,
          onVariantsChange: (variants) =>
            onChange({ ...pos, base_form: { ...pos.base_form, variants } })
        }
      ]}
      readOnly={readOnly}
      generating={generating}
      showOtherDialect={showOtherDialect}
      onShowOtherDialect={onShowOtherDialect}
      onGenerate={onGenerate}
    />
  );
}

function FormGroupMatrix({
  pos,
  allowedTypes,
  groupIndex,
  readOnly,
  generating,
  showOtherDialect,
  onShowOtherDialect,
  onGenerate,
  onChange
}: {
  pos: WordPosFormsV2;
  allowedTypes: WordDerivedFormSlotV2["form_type"][];
  groupIndex: number;
  readOnly?: boolean;
  generating?: boolean;
  showOtherDialect: boolean;
  onShowOtherDialect: (next: boolean) => void;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<void>;
  onChange: (next: WordPosFormsV2) => void;
}) {
  const group = pos.form_groups[groupIndex];
  if (!group) return null;
  // 空组不画只有表头的空网格：基准原形已独立成卡，不再借它来撑这一行。
  if (group.slots.length === 0) {
    return (
      <div className="word-form-group-empty">
        <Typography.Text type="secondary">本组还没有派生词形</Typography.Text>
      </div>
    );
  }

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

  return (
    <FormMatrix
      pos={pos}
      rows={group.slots.map((slot, slotIndex) => ({
        slot,
        typeCell: (lastRow: boolean) => (
          <DerivedTypeCell
            slot={slot}
            allowedTypes={allowedTypes}
            usedTypes={group.slots
              .filter((_, index) => index !== slotIndex)
              .map((item) => item.form_type)}
            index={slotIndex}
            last={lastRow}
            readOnly={readOnly}
            onChange={(nextSlot) => updateSlot(slotIndex, nextSlot)}
            onMove={(delta) => moveSlot(slotIndex, delta)}
            onRemove={() => removeSlot(slotIndex)}
          />
        ),
        onVariantsChange: (variants: WordFormVariantV2[]) =>
          updateSlot(slotIndex, { ...slot, variants })
      }))}
      readOnly={readOnly}
      generating={generating}
      showOtherDialect={showOtherDialect}
      onShowOtherDialect={onShowOtherDialect}
      onGenerate={onGenerate}
    />
  );
}

function otherDialectOf(
  pos: WordPosFormsV2,
  preference: AdminDialectPreference
): Dialect | undefined {
  const dialects = formDialects(pos);
  return dialects.length > 1
    ? dialects.find((dialect) => dialect !== preference)
    : undefined;
}

/** 定位目标是否落在该槽位「另一侧方言」的变体或其读音上。 */
function slotOwnsIssue(
  slot: WordFormSlotV2,
  dialect: Dialect,
  nodeId: string
): boolean {
  return slot.variants.some(
    (variant) =>
      variant.dialect === dialect &&
      (variant.id === nodeId ||
        variant.pronunciations.some(
          (pronunciation) => pronunciation.id === nodeId
        ))
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
  spellingUnified = false,
  preferredDialect?: Dialect
): WordFormVariantV2[] {
  const fallback = variants.find(
    (variant) => variant.dialect === preferredDialect
  ) ??
    variants[0] ?? {
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
  phoneticMode: "unified" | "distinguish",
  preferredDialect?: Dialect
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
        forcedSpellingMode === "unified",
        preferredDialect
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
          forcedSpellingMode === "unified",
          preferredDialect
        )
      }))
    }))
  };
}

function normalizeLoadedForms(word: AdminWordV2): DraftFormsStepContent {
  const detectedHeadwords = word.detection_snapshot.headwords;
  const matchedDialect = word.detection_snapshot.matched_dialect;
  const preferredDialect: Dialect | undefined =
    matchedDialect === "uk" || matchedDialect === "us"
      ? matchedDialect
      : detectedHeadwords.mode === "distinguish"
        ? detectedHeadwords.source_dialect
        : undefined;
  return {
    pos: cloneWordValue(word.forms).pos.map((pos) => {
      const spellingMode =
        word.headwords.mode === "distinguish"
          ? "distinguish"
          : pos.dialect_rules.spelling_mode;
      const phoneticMode =
        spellingMode === "distinguish"
          ? "distinguish"
          : pos.dialect_rules.phonetic_mode;
      const desired: Dialect[] =
        spellingMode === "distinguish" || phoneticMode === "distinguish"
          ? ["uk", "us"]
          : ["common"];
      const normalizeUnexpected = (
        variants: WordFormVariantV2[],
        forcedSpellings?: Partial<Record<Dialect, string>>
      ) =>
        variants.some((variant) => !desired.includes(variant.dialect))
          ? normalizeVariants(
              variants,
              desired,
              forcedSpellings,
              spellingMode === "unified",
              preferredDialect
            )
          : variants;
      const forcedBaseSpellings: Partial<Record<Dialect, string>> =
        word.headwords.mode === "distinguish"
          ? { uk: word.headwords.uk, us: word.headwords.us }
          : desired.length === 1
            ? { common: word.headwords.common }
            : { uk: word.headwords.common, us: word.headwords.common };
      return {
        ...pos,
        dialect_rules: {
          spelling_mode: spellingMode,
          phonetic_mode: phoneticMode
        },
        base_form: {
          ...pos.base_form,
          variants: normalizeUnexpected(
            pos.base_form.variants,
            forcedBaseSpellings
          )
        },
        form_groups: pos.form_groups.map((group) => ({
          ...group,
          slots: group.slots.map((slot) => ({
            ...slot,
            variants: normalizeUnexpected(slot.variants)
          }))
        }))
      };
    })
  };
}

/**
 * 载入草稿并把词形变体的节点身份对齐到账本。
 *
 * 先用服务端保存的 `word.forms` 播种：normalizeLoadedForms 遇到超出当前
 * dialect_rules 的变体会先铸新 ID，播种在前才能让后端认的那个 ID 优先。
 */
function loadFormsWithIdentities(
  ledger: FormVariantIdentityLedger,
  word: AdminWordV2
): DraftFormsStepContent {
  // 只取播种这一个副作用，返回的对齐结果由下面那次调用给出。
  applyFormVariantIdentities(ledger, word.forms);
  return applyFormVariantIdentities(ledger, normalizeLoadedForms(word));
}

function PosFormsEditor({
  value,
  configuredAllowedTypes,
  configuredDefaultTypes,
  headwords,
  readOnly,
  generating,
  focusNodeId,
  onFocusNodeHandled,
  onGenerate,
  onChange
}: {
  value: WordPosFormsV2;
  configuredAllowedTypes?: WordDerivedFormSlotV2["form_type"][];
  configuredDefaultTypes?: WordDerivedFormSlotV2["form_type"][];
  headwords: AdminWordV2["headwords"];
  readOnly?: boolean;
  generating?: boolean;
  focusNodeId?: string;
  onFocusNodeHandled?: () => void;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<void>;
  onChange: (next: WordPosFormsV2) => void;
}) {
  const capabilityLoaded = configuredAllowedTypes !== undefined;
  const existingTypes = Array.from(
    new Set(
      value.form_groups.flatMap((group) =>
        group.slots.map((slot) => slot.form_type)
      )
    )
  );
  const allowedTypes = legalDerivedFormTypes(
    value.pos,
    configuredAllowedTypes ?? existingTypes
  );
  const defaultTypes = capabilityLoaded
    ? (configuredDefaultTypes ?? allowedTypes)
    : [];
  const orderedTypes = [
    ...defaultTypes,
    ...allowedTypes.filter((type) => !defaultTypes.includes(type))
  ];
  const invalidSlots = capabilityLoaded
    ? value.form_groups.flatMap((group) =>
        group.slots.filter((slot) => !allowedTypes.includes(slot.form_type))
      )
    : [];
  const showDerivedGroups = allowedTypes.length > 0 || invalidSlots.length > 0;
  const spellingForced = headwords.mode === "distinguish";
  const voiceNotice = usePronunciationVoiceNotice(formDialects(value));
  const [collapsedGroupIds, setCollapsedGroupIds] = useState<Set<string>>(
    () => new Set()
  );
  // 非偏好侧展开与否按词性记：管理员要补的是「这个词性的美式内容」，
  // 不该在基准原形卡和每个词形组卡上各点一次。
  const [showOtherDialect, setShowOtherDialect] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const focusOwner = useMemo(():
    | { group?: WordPosFormsV2["form_groups"][number]; slotId: string }
    | undefined => {
    if (!focusNodeId) return undefined;
    // 基准原形不挂在任何派生词形组下，定位只认它自己那一行，
    // 不能借第一组来展开——零派生组的词性根本没有第一组。
    if (
      value.base_form.id === focusNodeId ||
      value.base_form.variants.some((variant) => variant.id === focusNodeId)
    ) {
      return { slotId: value.base_form.id };
    }
    return value.form_groups
      .flatMap((group) => group.slots.map((slot) => ({ group, slot })))
      .map(({ group, slot }) =>
        slot.id === focusNodeId ||
        slot.variants.some((variant) => variant.id === focusNodeId)
          ? { group, slotId: slot.id }
          : undefined
      )
      .find(
        (
          candidate
        ): candidate is {
          group: WordPosFormsV2["form_groups"][number];
          slotId: string;
        } => Boolean(candidate)
      );
  }, [focusNodeId, value.base_form, value.form_groups]);

  useEffect(() => {
    const ownerGroup = focusOwner?.group;
    if (!ownerGroup) return;
    setCollapsedGroupIds((current) => {
      if (!current.has(ownerGroup.id)) return current;
      const next = new Set(current);
      next.delete(ownerGroup.id);
      return next;
    });
  }, [focusOwner]);

  useEffect(() => {
    if (!focusNodeId || !focusOwner) return;
    const ownerGroup = focusOwner.group;
    if (ownerGroup && collapsedGroupIds.has(ownerGroup.id)) return;
    const candidateNodeIds = [focusNodeId, focusOwner.slotId];
    const input = candidateNodeIds
      .flatMap((nodeId) =>
        Array.from(
          editorRef.current?.querySelectorAll<HTMLElement>(
            `[data-word-node-id="${nodeId}"]`
          ) ?? []
        )
      )
      .map((owner) =>
        owner instanceof HTMLInputElement && owner.placeholder === "词形拼写"
          ? owner
          : owner.querySelector<HTMLInputElement>(
              'input[placeholder="词形拼写"]'
            )
      )
      .find((candidate): candidate is HTMLInputElement => Boolean(candidate));
    if (!input) return;
    input.scrollIntoView?.({ block: "center" });
    input.focus();
    onFocusNodeHandled?.();
  }, [collapsedGroupIds, focusNodeId, focusOwner, onFocusNodeHandled]);

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
      ref={editorRef}
      className="word-forms-workbench"
      data-word-node-id={value.pos_id}
      data-word-field="form_groups"
    >
      <Space orientation="vertical" size={14} style={{ width: "100%" }}>
        {capabilityLoaded && allowedTypes.length === 0 && (
          <Alert
            type="info"
            showIcon
            title="当前基本词性无需派生词形"
            description="只需完成基准原形的音标与实际发音，即可继续下一步。"
          />
        )}
        {voiceNotice && (
          <Alert
            type="warning"
            showIcon
            title={voiceNotice}
            description="音标与实际发音仍可正常填写和保存；试听语音需要平台先配置对应方言的发音人。"
          />
        )}
        {invalidSlots.length > 0 && (
          <Alert
            type="error"
            showIcon
            title={`发现 ${invalidSlots.length} 个与当前基本词性不匹配的派生词形`}
            description="请在完成本步骤前修改或删除标红词形；系统不会自动转换或丢弃已有数据。"
          />
        )}
        <Card
          className="word-form-card word-form-base-card"
          title="基准原形与发音"
        >
          <div className="word-form-rules">
            <div className="word-form-rule-hint">
              <Typography.Text type="secondary">
                英美区分作用于该词性下的全部词形（含派生词形），不只基准原形。
              </Typography.Text>
            </div>
            <div className="word-form-rule-row">
              <Typography.Text strong>英美拼写是否有区别？</Typography.Text>
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
                <Typography.Text strong>英美音标是否有区别？</Typography.Text>
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
          </div>
          <BaseFormMatrix
            pos={value}
            readOnly={readOnly}
            generating={generating}
            showOtherDialect={showOtherDialect}
            onShowOtherDialect={setShowOtherDialect}
            onGenerate={onGenerate}
            onChange={onChange}
          />
        </Card>
        {showDerivedGroups &&
          value.form_groups.map((group, groupIndex) => {
            const collapsed = collapsedGroupIds.has(group.id);
            const bodyId = `word-form-group-${group.id}-body`;
            const nextDefaultType = defaultDerivedFormType(
              value.pos,
              group.slots.map((slot) => slot.form_type),
              orderedTypes
            );
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
                            disabled:
                              groupIndex === value.form_groups.length - 1
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
                    </div>
                    <FormGroupMatrix
                      pos={value}
                      allowedTypes={allowedTypes}
                      groupIndex={groupIndex}
                      readOnly={readOnly}
                      generating={generating}
                      showOtherDialect={showOtherDialect}
                      onShowOtherDialect={setShowOtherDialect}
                      onGenerate={onGenerate}
                      onChange={onChange}
                    />
                    {!readOnly && capabilityLoaded && (
                      <div className="word-form-add-slot-wrap">
                        <Button
                          type="dashed"
                          icon={<PlusOutlined />}
                          className="word-form-add-slot"
                          disabled={!nextDefaultType}
                          title={
                            allowedTypes.length === 0
                              ? "当前基本词性没有可添加的派生词形"
                              : !nextDefaultType
                                ? "当前组已添加全部可用词形类型"
                                : undefined
                          }
                          onClick={() => {
                            if (!nextDefaultType) return;
                            const groups = [...value.form_groups];
                            groups[groupIndex] = {
                              ...group,
                              slots: [
                                ...group.slots,
                                createDerivedSlot(nextDefaultType, value)
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
        {!readOnly && capabilityLoaded && allowedTypes.length > 0 && (
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

function countPosFormIssues(
  pos: WordPosFormsV2,
  allowed: readonly WordDerivedFormSlotV2["form_type"][] | undefined,
  headwords: AdminWordV2["headwords"]
): number {
  return (
    (baseFormComplete(pos, headwords) ? 0 : 1) +
    pos.form_groups.reduce((count, group) => {
      const duplicateCount =
        group.slots.length -
        new Set(group.slots.map((slot) => slot.form_type)).size;
      return (
        count +
        duplicateCount +
        group.slots.filter(
          (slot) =>
            (allowed !== undefined && !allowed.includes(slot.form_type)) ||
            !formSlotComplete(slot, pos.dialect_rules)
        ).length
      );
    }, 0)
  );
}

interface PendingFormsSave {
  baseRevision: number;
  intent: StepSaveIntent;
  content: DraftFormsStepContent;
  impact: FormsImpactResponseV2;
}

type FormSurfaceCandidate = Extract<
  LexiconSurfaceMatchV2["candidate"],
  { candidate_type: "form" }
>;

function formTypeLabel(value: FormSurfaceCandidate["form_type"]): string {
  return (
    FORM_TYPE_OPTIONS.find((option) => option.value === value)?.label ?? value
  );
}

function ImpactConfirmationDetails({
  impact
}: {
  impact: FormsImpactResponseV2;
}) {
  const summary = summarizeFormsImpact(impact.affected);
  if (!impact.requires_confirmation || !summary.can_confirm) return null;
  return (
    <Card size="small" title="下游内容影响">
      <Space orientation="vertical" size="small">
        <Typography.Text>
          共影响{" "}
          <Typography.Text strong>{summary.affected_count}</Typography.Text>{" "}
          个下游节点。
        </Typography.Text>
        <Typography.Text type="secondary">
          类型：
          {summary.type_counts
            .map(({ label, count }) => `${label} ${count}`)
            .join("、")}
        </Typography.Text>
        {summary.groups.map((group) => (
          <Typography.Text key={group.reason}>
            {group.reason}（{group.count} 个：
            {group.type_counts
              .map(({ label, count }) => `${label} ${count}`)
              .join("、")}
            ）
          </Typography.Text>
        ))}
        {summary.warnings.length > 0 ? (
          <Alert type="warning" showIcon title={summary.warnings.join("；")} />
        ) : null}
      </Space>
    </Card>
  );
}

function SurfaceConfirmationDetails({
  snapshot,
  checking,
  onLocate,
  onRetry
}: {
  snapshot: ReturnType<typeof useSurfaceSnapshot>;
  checking: boolean;
  onLocate: (candidate: FormSurfaceCandidate) => void;
  onRetry: () => void;
}) {
  const cards = useMemo(
    () =>
      aggregateSurfaceMatchCards(
        snapshot.items,
        snapshot.matched_entry_contexts
      ),
    [snapshot.items, snapshot.matched_entry_contexts]
  );
  const needsRetry =
    snapshot.phase === "error" ||
    snapshot.phase === "expired" ||
    snapshot.phase === "disabled";

  return (
    <Card size="small" title="同形词条提示">
      <Space orientation="vertical" size="small" style={{ width: "100%" }}>
        {snapshot.phase === "idle" || snapshot.phase === "loading" ? (
          <Alert
            type="info"
            showIcon
            title={`正在加载全部同形命中（${snapshot.items.length}/${snapshot.total}）`}
            description="读取终页并取得完整确认凭证前不能继续保存。"
          />
        ) : null}
        {snapshot.phase === "ready" ? (
          <Alert
            type="warning"
            showIcon
            title={`发现 ${snapshot.total} 条跨词条同形命中`}
            description="这些命中只作提示；查看并明确确认后仍可保存。"
          />
        ) : null}
        {needsRetry ? (
          <Alert
            type="error"
            showIcon
            title={
              snapshot.phase === "disabled"
                ? "当前策略暂不允许确认保存"
                : "同形提示已过期或未能完整加载"
            }
            description="请重新执行保存前检查；当前表单内容会保留。"
            action={
              <Button size="small" loading={checking} onClick={onRetry}>
                重新检查
              </Button>
            }
          />
        ) : null}
        {cards.map((card) => {
          const candidate = card.candidate;
          return (
            <Card
              key={card.key}
              size="small"
              type="inner"
              title={
                <Space wrap>
                  <Typography.Text strong>
                    {candidate.surface} 已在 {card.existing.headword} 中存在
                  </Typography.Text>
                  <Tag>
                    {card.existing.status === "draft"
                      ? "草稿"
                      : card.existing.status === "published"
                        ? "已发布"
                        : "已归档"}
                  </Tag>
                  <Tag>{card.existing.kind === "word" ? "单词" : "短语"}</Tag>
                  <Typography.Text code copyable>
                    {card.existing.word_id.slice(-8)}
                  </Typography.Text>
                </Space>
              }
              extra={
                <Space>
                  {candidate.candidate_type === "form" ? (
                    <Button size="small" onClick={() => onLocate(candidate)}>
                      定位词形
                    </Button>
                  ) : null}
                  <Link
                    to={`/words/${card.existing.word_id}/wizard/basics`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${card.existing.headword} ${card.existing.word_id}，在新标签页打开`}
                  >
                    查看已有词条
                  </Link>
                </Space>
              }
            >
              <Space orientation="vertical" size={2}>
                {candidate.candidate_type === "form" ? (
                  <Typography.Text type="secondary">
                    当前候选：{candidate.pos} ·{" "}
                    {formTypeLabel(candidate.form_type)} ·{" "}
                    {DIALECT_SHORT_LABEL[candidate.dialect]}
                  </Typography.Text>
                ) : null}
                {card.matches.map((match) => (
                  <Typography.Text key={match.match_id}>
                    {match.existing.source.source_kind === "form"
                      ? `${match.existing.source.pos} · ${formTypeLabel(match.existing.source.form_type)}词形`
                      : "主词"}
                    ：{match.existing.source.surface} ·{" "}
                    {match.existing.source.dialect} ·{" "}
                    {match.existing.source.content_scope === "draft"
                      ? "草稿"
                      : "当前发布版本"}
                  </Typography.Text>
                ))}
                {card.context ? (
                  <>
                    <Typography.Text type="secondary">
                      词性：{card.context.pos_labels.join("、") || "暂无"}
                      ；释义：
                      {card.context.gloss_previews.join("；") || "暂无"}；更新：
                      {card.context.updated_at.slice(0, 10)}
                    </Typography.Text>
                    <Typography.Text type="secondary">
                      有效入站关联：共 {card.context.inbound_relations.total} 条
                    </Typography.Text>
                  </>
                ) : null}
              </Space>
            </Card>
          );
        })}
      </Space>
    </Card>
  );
}

export function FormsAndPronunciationStep({
  word,
  readOnly,
  onSaved,
  onDraftChange,
  identityLedger
}: Props) {
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  const editQuery = word.status === "published" ? "?mode=edit" : "";
  const [content, setContent] = useState<DraftFormsStepContent>(() =>
    loadFormsWithIdentities(identityLedger, word)
  );
  const contentRef = useRef(content);
  const loadedWordIdRef = useRef(word.id);
  const [contentBaseRevision, setContentBaseRevision] = useState(word.revision);
  const [activePosId, setActivePosId] = useState(
    word.forms.pos[0]?.pos_id ?? ""
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [checkingSurface, setCheckingSurface] = useState(false);
  const [pendingSave, setPendingSave] = useState<PendingFormsSave>();
  const [surfaceFirstPage, setSurfaceFirstPage] =
    useState<FormsImpactResponseV2["surface_match_page"]>();
  const [surfaceResetVersion, setSurfaceResetVersion] = useState(0);
  const [focusCandidateNodeId, setFocusCandidateNodeId] = useState<string>();
  const saveFlowActiveRef = useRef(false);
  const confirmActionRef = useRef(false);
  const [validationMessages, setValidationMessages] = useState<string[]>([]);
  const issueTarget = useWordValidationIssue();
  const saveForms = useSaveFormsStep(word.id);
  const previewImpact = usePreviewFormsImpact(word.id);
  const suggestVariants = useSuggestDialectVariants();
  const { preference } = useDialectPreference();
  const partOfSpeechCatalog = usePartOfSpeechCatalog();
  const partOfSpeechLookup = useMemo(
    () => createPartOfSpeechLookup(partOfSpeechCatalog.data),
    [partOfSpeechCatalog.data]
  );
  const allowSavedNavigation = useUnsavedWordChanges(dirty);
  const surfaceSnapshot = useSurfaceSnapshot(
    surfaceFirstPage,
    `${word.id}:${pendingSave?.baseRevision ?? contentBaseRevision}:${surfaceResetVersion}`
  );
  useWordValidationIssueFocus(activePosId);

  const issueOwnerPosId = issueTarget
    ? content.pos.find((pos) => {
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
      })?.pos_id
    : undefined;

  useEffect(() => {
    if (issueOwnerPosId) setActivePosId(issueOwnerPosId);
  }, [issueOwnerPosId]);

  useEffect(() => {
    const wordChanged = loadedWordIdRef.current !== word.id;
    if (!dirty || wordChanged) {
      loadedWordIdRef.current = word.id;
      if (wordChanged) identityLedger.clear();
      const next = loadFormsWithIdentities(identityLedger, word);
      contentRef.current = next;
      setContent(next);
      setContentBaseRevision(word.revision);
      setActivePosId((current) =>
        !wordChanged && word.forms.pos.some((pos) => pos.pos_id === current)
          ? current
          : (word.forms.pos[0]?.pos_id ?? "")
      );
      if (wordChanged) {
        setDirty(false);
        setValidationMessages([]);
        setPendingSave(undefined);
        setSurfaceFirstPage(undefined);
        setSaving(false);
        setConfirming(false);
        setCheckingSurface(false);
        saveFlowActiveRef.current = false;
        confirmActionRef.current = false;
      }
    }
  }, [dirty, identityLedger, word]);

  useEffect(() => {
    onDraftChange?.(content);
  }, [content, onDraftChange]);

  const updateContent = (next: DraftFormsStepContent) => {
    const aligned = applyFormVariantIdentities(identityLedger, next);
    contentRef.current = aligned;
    setContent(aligned);
    setDirty(true);
    setValidationMessages([]);
  };

  const applyGeneratedFormVariant = (
    clientId: string,
    target: "uk" | "us",
    spelling: string
  ) => {
    setContent((current) => {
      const pos = current.pos.map((posItem) => {
        const appendIfMissing = <
          T extends WordPosFormsV2["base_form"] | WordDerivedFormSlotV2
        >(
          slot: T
        ): T => {
          if (
            slot.id !== clientId ||
            slot.variants.some((variant) => variant.dialect === target)
          ) {
            return slot;
          }
          return {
            ...slot,
            variants: [
              ...slot.variants,
              {
                id: newWordNodeId(),
                dialect: target,
                spelling,
                origin: "converted" as const,
                pronunciations: [createPronunciation()]
              }
            ]
          } as T;
        };
        const baseForm = appendIfMissing(posItem.base_form);
        const formGroups = posItem.form_groups.map((group) => ({
          ...group,
          slots: group.slots.map(appendIfMissing)
        }));
        if (
          baseForm === posItem.base_form &&
          formGroups.every(
            (group, index) => group.slots === posItem.form_groups[index]?.slots
          )
        ) {
          return posItem;
        }
        return {
          ...posItem,
          base_form: baseForm,
          form_groups: formGroups
        };
      });
      const next = applyFormVariantIdentities(identityLedger, { pos });
      contentRef.current = next;
      return next;
    });
    setDirty(true);
    setValidationMessages([]);
  };

  const hasFormVariant = (clientId: string, target: "uk" | "us") =>
    contentRef.current.pos.some(
      (posItem) =>
        (posItem.base_form.id === clientId &&
          posItem.base_form.variants.some(
            (variant) => variant.dialect === target
          )) ||
        posItem.form_groups.some((group) =>
          group.slots.some(
            (slot) =>
              slot.id === clientId &&
              slot.variants.some((variant) => variant.dialect === target)
          )
        )
    );

  const availablePos = useMemo(() => {
    const used = new Set(content.pos.map((item) => item.pos));
    return availablePartOfSpeechOptions(partOfSpeechLookup, used);
  }, [content.pos, partOfSpeechLookup]);

  const classificationLabel = (pos: WordPosFormsV2) =>
    partOfSpeechLabel(partOfSpeechLookup, pos.pos);

  const generateFormVariant = async (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ): Promise<void> => {
    if (!adminWordsDataSourceCapabilities.dialectVariantSuggestions) {
      return;
    }
    if (source.dialect !== "uk" && source.dialect !== "us") return;
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
      const matching = response.suggestions.filter(
        (
          suggestion
        ): suggestion is Extract<
          (typeof response.suggestions)[number],
          { field_kind: "form" }
        > =>
          suggestion.client_id === clientId && suggestion.field_kind === "form"
      );
      if (response.suggestions.length !== 1 || matching.length !== 1) {
        throw new Error("词形建议响应无效，请重试");
      }
      const suggestion = matching[0]!;
      await new Promise<void>((resolve) => {
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
          onOk: () => {
            if (hasFormVariant(clientId, target)) {
              message.warning("目标方言已填写，未覆盖现有内容");
              resolve();
              return;
            }
            applyGeneratedFormVariant(clientId, target, suggestion.value);
            resolve();
          },
          onCancel: resolve
        });
      });
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "生成词形建议失败"
      );
      return undefined;
    }
  };

  const finishSaveFlow = () => {
    saveFlowActiveRef.current = false;
    confirmActionRef.current = false;
    setSaving(false);
    setConfirming(false);
    setCheckingSurface(false);
    setPendingSave(undefined);
    setSurfaceFirstPage(undefined);
    setSurfaceResetVersion((current) => current + 1);
  };

  const handleSuccessfulSave = (
    intent: StepSaveIntent,
    savedWord: AdminWordV2
  ) => {
    finishSaveFlow();
    setDirty(false);
    setValidationMessages([]);
    onSaved(savedWord);
    message.success(intent === "complete" ? "词形与发音已完成" : "草稿已保存");
    if (intent === "complete") {
      allowSavedNavigation();
      navigate(`/words/${word.id}/wizard/meanings${editQuery}`);
    }
  };

  // 413 是「内容过大」，不是「格式错误」：处置动作是拆分内容而不是检查格式。
  const handlePayloadTooLarge = (error: HttpError): boolean => {
    const tooLarge = payloadTooLargeMessage(error);
    if (!tooLarge) return false;
    finishSaveFlow();
    setValidationMessages([tooLarge]);
    message.error(tooLarge);
    return true;
  };

  const handleFormsFieldIssues = (error: HttpError): boolean => {
    const stepIssues = error.field_issues.filter(
      (candidate) => candidate.step === "forms"
    );
    // 后端 message 面向实现（「已有内容槽位必须保留原节点 ID」），节点身份类问题
    // 按 node_location 改写成带定位的中文文案。
    const messages = stepIssues.map((candidate) =>
      wordValidationIssueMessage(candidate, partOfSpeechLookup)
    );
    setValidationMessages(messages);
    const issue = stepIssues[0];
    if (!issue) return false;

    finishSaveFlow();
    message.warning(messages[0]!);
    navigate(`/words/${word.id}/wizard/forms${editQuery}`, {
      replace: true,
      state: { nodeId: issue.node_id, field: issue.field }
    });
    return true;
  };

  const showRevisionConflict = () => {
    finishSaveFlow();
    modal.confirm({
      title: "草稿版本已更新",
      content:
        "该词条已在其他位置保存。为避免覆盖新内容，请重新加载最新草稿后再编辑。",
      okText: "重新加载",
      cancelText: "留在本页",
      onOk: () => navigate(0)
    });
  };

  const showImpactResult = async (
    context: Omit<PendingFormsSave, "impact">,
    impact: FormsImpactResponseV2
  ): Promise<void> => {
    if (
      impact.requires_confirmation &&
      !summarizeFormsImpact(impact.affected).can_confirm
    ) {
      message.error("影响预览响应异常，未返回受影响节点，已阻止保存");
      finishSaveFlow();
      return;
    }
    if (
      impact.requires_confirmation &&
      !impact.surface_match_page &&
      !impact.confirmation_token?.trim()
    ) {
      message.error("影响预览响应异常，缺少确认凭证，已阻止保存");
      finishSaveFlow();
      return;
    }

    const nextPending = { ...context, impact };
    if (impact.surface_match_page) {
      setPendingSave(nextPending);
      setSurfaceFirstPage(impact.surface_match_page);
      setSurfaceResetVersion((current) => current + 1);
      return;
    }
    setSurfaceFirstPage(undefined);
    if (impact.requires_confirmation) {
      setPendingSave(nextPending);
      return;
    }
    await submitForms(nextPending);
  };

  const runImpactCheck = async (
    context: Omit<PendingFormsSave, "impact">
  ): Promise<void> => {
    setCheckingSurface(true);
    setSurfaceFirstPage(undefined);
    setSurfaceResetVersion((current) => current + 1);
    try {
      const impact = await previewImpact.mutateAsync({
        base_revision: context.baseRevision,
        content: context.content
      });
      await showImpactResult(context, impact);
    } catch (error) {
      if (error instanceof HttpError) {
        if (handlePayloadTooLarge(error)) return;
        if (handleFormsFieldIssues(error)) return;
        if (error.status === 409 && error.code === "revision_conflict") {
          showRevisionConflict();
          return;
        }
      }
      finishSaveFlow();
      message.error(error instanceof Error ? error.message : "影响检查失败");
    } finally {
      setCheckingSurface(false);
    }
  };

  const handleSaveError = async (
    error: unknown,
    context: PendingFormsSave
  ): Promise<void> => {
    if (error instanceof HttpError) {
      if (handlePayloadTooLarge(error)) return;
      if (handleFormsFieldIssues(error)) return;

      if (
        error.status === 409 &&
        (error.code === "surface_match_acknowledgement_required" ||
          error.code === "surface_matches_changed")
      ) {
        const page = error.meta?.surface_match_page;
        if (!page) {
          finishSaveFlow();
          message.error("同形提示响应异常，缺少最新匹配页，已阻止保存");
          return;
        }
        setPendingSave({
          ...context,
          impact: {
            ...context.impact,
            confirmation_token: undefined,
            surface_match_page: page
          }
        });
        setSurfaceFirstPage(page);
        setSurfaceResetVersion((current) => current + 1);
        return;
      }

      if (
        (error.status === 410 &&
          error.code === "surface_match_snapshot_expired") ||
        (error.status === 409 &&
          (error.code === "surface_policy_changed" ||
            error.code === "downstream_confirmation_required"))
      ) {
        await runImpactCheck({
          baseRevision: context.baseRevision,
          intent: context.intent,
          content: context.content
        });
        return;
      }

      if (error.status === 409) {
        showRevisionConflict();
        return;
      }
    }
    finishSaveFlow();
    message.error(error instanceof Error ? error.message : "保存失败");
  };

  async function submitForms(
    context: PendingFormsSave,
    tokens: {
      confirmed_surface_match_token?: string;
      confirmed_impact_token?: string;
    } = {}
  ): Promise<void> {
    setConfirming(true);
    try {
      const { word: savedWord } = await saveForms.mutateAsync({
        base_revision: context.baseRevision,
        intent: context.intent,
        ...tokens,
        content: context.content
      });
      handleSuccessfulSave(context.intent, savedWord);
    } catch (error) {
      await handleSaveError(error, context);
    } finally {
      setConfirming(false);
    }
  }

  const confirmPendingSave = async (): Promise<void> => {
    if (
      !pendingSave ||
      confirming ||
      checkingSurface ||
      confirmActionRef.current
    ) {
      return;
    }
    const needsSurface = Boolean(pendingSave.impact.surface_match_page);
    const confirmedSurfaceToken = needsSurface
      ? surfaceSnapshot.surface_confirmation_token?.trim()
      : undefined;
    const confirmedImpactToken = pendingSave.impact.requires_confirmation
      ? needsSurface
        ? surfaceSnapshot.impact_confirmation_token?.trim()
        : pendingSave.impact.confirmation_token?.trim()
      : undefined;
    if (
      (needsSurface &&
        (!canAcknowledgeSurfaceSnapshot(surfaceSnapshot) ||
          !confirmedSurfaceToken)) ||
      (pendingSave.impact.requires_confirmation && !confirmedImpactToken)
    ) {
      message.error("确认信息尚未完整加载，已阻止保存");
      return;
    }
    confirmActionRef.current = true;
    try {
      await submitForms(pendingSave, {
        ...(confirmedSurfaceToken
          ? { confirmed_surface_match_token: confirmedSurfaceToken }
          : {}),
        ...(confirmedImpactToken
          ? { confirmed_impact_token: confirmedImpactToken }
          : {})
      });
    } finally {
      confirmActionRef.current = false;
    }
  };

  const retryPendingImpact = () => {
    if (!pendingSave || checkingSurface || confirming) return;
    void runImpactCheck({
      baseRevision: pendingSave.baseRevision,
      intent: pendingSave.intent,
      content: pendingSave.content
    });
  };

  const locateFormCandidate = (candidate: FormSurfaceCandidate) => {
    setActivePosId(candidate.pos_id);
    setFocusCandidateNodeId(candidate.candidate_node_id);
  };

  const clearFocusedCandidate = useCallback(
    () => setFocusCandidateNodeId(undefined),
    []
  );

  const save = async (intent: StepSaveIntent) => {
    if (saveFlowActiveRef.current) return;
    if (intent === "complete") {
      const issues: string[] = [];
      if (content.pos.length === 0) {
        issues.push("请至少保留一个基本词性");
      }
      for (const pos of content.pos) {
        const posLabel = partOfSpeechLabel(partOfSpeechLookup, pos.pos);
        const configured = partOfSpeechLookup.byCode.get(pos.pos);
        const configuredAllowedTypes = configured?.allowed_form_types;
        const allowed = legalDerivedFormTypes(pos.pos, configuredAllowedTypes);
        const duplicateCount = pos.form_groups.reduce(
          (count, group) =>
            count +
            group.slots.length -
            new Set(group.slots.map((slot) => slot.form_type)).size,
          0
        );
        if (duplicateCount > 0) {
          issues.push(`${posLabel}有 ${duplicateCount} 个重复的派生词形类型`);
        }
        const invalidCount =
          configuredAllowedTypes === undefined
            ? 0
            : pos.form_groups.reduce(
                (count, group) =>
                  count +
                  group.slots.filter(
                    (slot) => !allowed.includes(slot.form_type)
                  ).length,
                0
              );
        if (invalidCount > 0) {
          issues.push(`${posLabel}有 ${invalidCount} 个不合法的派生词形类型`);
        }
        const incompleteCount = pos.form_groups.reduce(
          (count, group) =>
            count +
            group.slots.filter(
              (slot) =>
                (configuredAllowedTypes === undefined ||
                  allowed.includes(slot.form_type)) &&
                !formSlotComplete(slot, pos.dialect_rules)
            ).length,
          0
        );
        // 指名到「词形类型 · 方言侧 · 缺失字段」，只报一个计数管理员没法下手（手测 C4）。
        // incompleteCount > 0 时必然找得到首个问题，所以这里不需要兜底文案。
        const derivedIssue =
          incompleteCount > 0 ? derivedFormIssueMessage(pos) : undefined;
        if (derivedIssue) {
          const more =
            incompleteCount > 1
              ? `（另有 ${incompleteCount - 1} 个派生词形待完善）`
              : "";
          issues.push(`${posLabel}${derivedIssue}${more}`);
        }
        const baseIssue = baseFormIssueMessage(pos, word.headwords);
        if (baseIssue) {
          issues.push(`${posLabel}${baseIssue}`);
        }
      }
      setValidationMessages(issues);
      if (issues.length > 0) {
        // 提示直接复述左栏「完成情况」的分数,否则拦截数与左栏数字对不上。
        const pending = pendingReadinessRows(
          buildWordReadiness(
            word,
            { forms: content },
            partOfSpeechLookup,
            preference
          ),
          "forms"
        )
          .map((row) => `${row.label} ${row.completed}/${row.total}`)
          .join("、");
        message.warning(`还需完善：${pending}（同左栏「完成情况」）`);
        return;
      }
    }

    const wireContent = toFormsWireContent({
      pos: content.pos.map((pos) => {
        const configured = partOfSpeechLookup.byCode.get(pos.pos);
        const onlyLegacyEmptyGroups = pos.form_groups.every(
          (group) => group.slots.length === 0
        );
        return configured?.allowed_form_types?.length === 0 &&
          onlyLegacyEmptyGroups
          ? { ...pos, form_groups: [] }
          : pos;
      })
    });
    // 体积预检放在发请求之前：影响预览与整步保存共用同一个请求体上限，
    // 超了就地提示，不发出去等 413（对接文档 §13.2）。节点数按 forms + meanings
    // 合计判定，词义侧取服务端当前副本。
    const blocking = [
      entryContentNodeIssue(wireContent, word.meanings),
      stepContentBodyIssue({
        base_revision: contentBaseRevision,
        intent,
        content: wireContent
      })
    ].filter((item): item is string => item !== undefined);
    if (blocking.length > 0) {
      setValidationMessages(blocking);
      message.warning(blocking[0]!);
      return;
    }

    saveFlowActiveRef.current = true;
    setSaving(true);
    await runImpactCheck({
      baseRevision: contentBaseRevision,
      intent,
      content: wireContent
    });
  };

  const pendingNeedsSurface = Boolean(pendingSave?.impact.surface_match_page);
  const surfaceConfirmationReady =
    !pendingNeedsSurface || canAcknowledgeSurfaceSnapshot(surfaceSnapshot);
  const impactConfirmationReady =
    !pendingSave?.impact.requires_confirmation ||
    Boolean(
      (pendingNeedsSurface
        ? surfaceSnapshot.impact_confirmation_token
        : pendingSave.impact.confirmation_token
      )?.trim()
    );
  const confirmationReady =
    Boolean(pendingSave) &&
    surfaceConfirmationReady &&
    impactConfirmationReady &&
    !checkingSurface &&
    !confirming;

  const confirmationTitle = pendingNeedsSurface
    ? pendingSave?.impact.requires_confirmation
      ? "保存前请确认同形提示与下游影响"
      : "保存前请确认同形提示"
    : "本次修改会影响后续内容";

  const items = content.pos.map((pos, posIndex) => ({
    key: pos.pos_id,
    label: (
      <Space size={6}>
        <strong>{classificationLabel(pos)}</strong>
        <Badge
          count={countPosFormIssues(
            pos,
            partOfSpeechLookup.byCode.get(pos.pos)?.allowed_form_types,
            word.headwords
          )}
          size="small"
          title="当前词性的未解决校验项"
        />
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
        configuredAllowedTypes={
          partOfSpeechLookup.byCode.get(pos.pos)?.allowed_form_types
        }
        configuredDefaultTypes={
          partOfSpeechLookup.byCode.get(pos.pos)?.default_form_types
        }
        headwords={word.headwords}
        readOnly={readOnly || Boolean(pendingSave)}
        generating={suggestVariants.isPending}
        focusNodeId={
          pos.pos_id === activePosId ? focusCandidateNodeId : undefined
        }
        onFocusNodeHandled={clearFocusedCandidate}
        onGenerate={generateFormVariant}
        onChange={(nextPos) => {
          const posItems = [...content.pos];
          posItems[posIndex] = nextPos;
          updateContent({ pos: posItems });
        }}
      />
    )
  }));

  const addBasicPos = (classification: WordPosTag) => {
    const next = createPosForms(classification, word.headwords);
    updateContent({ pos: [...content.pos, next] });
    setActivePosId(next.pos_id);
  };

  const addBasicPosSelect = !readOnly ? (
    <Select<WordPosTag>
      className="word-add-basic-pos-select"
      aria-label="添加基本词性"
      placeholder="添加基本词性"
      value={undefined}
      options={availablePos}
      loading={partOfSpeechCatalog.isPending}
      disabled={partOfSpeechCatalog.isError}
      style={{ width: 190 }}
      suffixIcon={<PlusOutlined />}
      onChange={addBasicPos}
    />
  ) : null;

  const tabItems =
    content.pos.length === 0
      ? [
          {
            key: "empty",
            label: "基本词性",
            disabled: true,
            children: (
              <div className="word-forms-tabs-empty">
                <Empty
                  className="word-forms-tabs-empty-content"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <Space orientation="vertical" size={4}>
                      <Typography.Text strong>暂无基本词性</Typography.Text>
                      <Typography.Text type="secondary">
                        {readOnly
                          ? "该词条没有记录任何基本词性。"
                          : "内置词典未检测到词性建议，请从右上角添加基本词性。"}
                      </Typography.Text>
                    </Space>
                  }
                />
              </div>
            )
          }
        ]
      : items;

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

      <Modal
        open={Boolean(pendingSave)}
        title={confirmationTitle}
        okText="确认并保存"
        cancelText="取消"
        confirmLoading={confirming}
        okButtonProps={{ disabled: !confirmationReady }}
        cancelButtonProps={{ disabled: confirming || checkingSurface }}
        closable={!confirming && !checkingSurface}
        mask={{ closable: false }}
        onOk={() => void confirmPendingSave()}
        onCancel={() => {
          if (!confirming && !checkingSurface) finishSaveFlow();
        }}
      >
        {pendingSave ? (
          <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
            {pendingNeedsSurface ? (
              <SurfaceConfirmationDetails
                snapshot={surfaceSnapshot}
                checking={checkingSurface}
                onLocate={locateFormCandidate}
                onRetry={retryPendingImpact}
              />
            ) : null}
            <ImpactConfirmationDetails impact={pendingSave.impact} />
          </Space>
        ) : null}
      </Modal>

      {readOnly && (
        <Alert
          type="info"
          showIcon
          title={
            word.status === "archived"
              ? "已归档词条当前为只读"
              : "已发布词条当前为只读"
          }
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
        disabled={saving && !pendingSave}
        aria-busy={saving}
      >
        {validationMessages.length > 0 && (
          <Alert
            type="error"
            showIcon
            title={`本步骤还有 ${validationMessages.length} 项待修正`}
            description={
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {validationMessages.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            }
            style={{ marginBottom: 16 }}
          />
        )}
        <PronunciationPreviewProvider readOnly={readOnly}>
          <div data-word-node-id="forms" data-word-field="pos">
            <Tabs
              className="word-pos-tabs word-forms-tabs"
              activeKey={content.pos.length === 0 ? "empty" : activePosId}
              onChange={setActivePosId}
              items={tabItems}
              tabBarExtraContent={addBasicPosSelect}
            />
          </div>
        </PronunciationPreviewProvider>

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
