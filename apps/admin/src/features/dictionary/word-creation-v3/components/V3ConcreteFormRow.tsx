import { LocalLexiconError } from "../../i18n/local-error-messages";
import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { regionalVariants } from "@tsz/shared";
import { toRichTextV2 } from "@tsz/voice-editor/core";
import { env } from "../../../../lib/env";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import {
  GripVerticalIcon,
  CircleMinusIcon,
  CirclePlusIcon,
  TriangleAlertIcon
} from "lucide-react";
import { Button, Flex, Typography } from "@tsz/ui/admin/display";
import { Radio, Select, type TextAreaRef } from "@tsz/ui/admin/forms";
import { Tooltip } from "@tsz/ui/admin/overlays";
import {
  V3VoiceTextField,
  type SpellingSettingsOpener
} from "./V3VoiceTextField";
import type {
  DialectRulesV3,
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordCommonFormVariantV3,
  WordConcreteFormV3,
  WordFormTypeV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import {
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode
} from "react";
import {
  editSpellingList,
  unifyUkUsSpelling,
  updateConcreteFormType,
  updateVariantSpelling,
  updateSpellingVoiceProfile,
  updateSpellingAudioAssets,
  updateFormRegularity,
  type V3IdFactory
} from "../operations";
import { spellingAudioScope, spellingEditorValue } from "../spellingSpeech";
import { variantRegularity } from "../model";
import { dialectLabel } from "../presentation";
import { spellingConflictReferences } from "../referenceGuard";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import { V3DisabledReason } from "./V3DisabledReason";
import { V3PronunciationList } from "./V3PronunciationList";
import { PronunciationPreviewControls } from "../../word-creation/PronunciationPreview";

/** 拼写与多维例句标注片段对不上时即时标红（Q2）：输入框照常可编辑，保存由确认条与后端拦。 */
function SpellingConflictNote({ literals }: { literals: readonly string[] }) {
  const { t, i18n } = useLexiconEditorTranslation();
  if (literals.length === 0) return null;
  return (
    <Typography.Text
      className="v3-spelling-conflict"
      role="status"
      type="danger"
    >
      {t("spelling_mismatch", {
        spelling: literals.join(i18n.language.startsWith("en") ? "’, ‘" : "”“")
      })}
    </Typography.Text>
  );
}

function SpellingSettingsHint({
  count,
  labelCount = 1,
  sharedPauses = false
}: {
  count: number;
  labelCount?: number;
  sharedPauses?: boolean;
}) {
  const { t } = useLexiconEditorTranslation();
  return (
    <>
      {labelCount > 1 && (
        <Typography.Paragraph>
          {t("shared_label_count", { count: labelCount })}
        </Typography.Paragraph>
      )}
      {count > 1 && (
        <Typography.Paragraph>
          {t("spelling_settings_shared_readings", { count })}
        </Typography.Paragraph>
      )}
      {sharedPauses && (
        <Typography.Paragraph>
          {t("spelling_settings_shared_pauses")}
        </Typography.Paragraph>
      )}
    </>
  );
}

function conflictLiterals(
  references: ReturnType<typeof spellingConflictReferences>
): string[] {
  return [
    ...new Set(
      references.map((reference) =>
        (reference.source.segments ?? [])
          .map((segment) => segment.surface)
          .join(" ")
      )
    )
  ];
}

function spellingReferences(
  index: Parameters<typeof spellingConflictReferences>[0],
  form: WordConcreteFormV3,
  referenceForms: readonly WordConcreteFormV3[] | undefined,
  dialects: readonly ("common" | "uk" | "us")[],
  spelling: string,
  currentSlotIds: readonly string[] = [],
  referenceVariantIds?: ReadonlyMap<string, readonly string[]>
) {
  return (referenceForms ?? [form]).flatMap((binding) => {
    const regions = binding.regional_variants;
    const ids = referenceVariantIds
      ? currentSlotIds
          .flatMap((id) => referenceVariantIds.get(id) ?? [])
          .filter((id) =>
            regionalVariants(regions).some((row) => row.id === id)
          )
      : dialects.flatMap((side) =>
          regionalVariants(regions, side === "common" ? undefined : side).map(
            (row) => row.id
          )
        );
    if (referenceVariantIds && !ids.length) return [];
    return spellingConflictReferences(index, binding, ids, spelling);
  });
}

function replaceForm(
  content: DraftFormsStepContentV3,
  replacement: WordConcreteFormV3
) {
  const next = structuredClone(content);
  for (const pos of next.pos) {
    const index = pos.forms.findIndex((item) => item.id === replacement.id);
    if (index >= 0) {
      pos.forms[index] = replacement;
      return next;
    }
  }
  throw new Error(`form not found: ${replacement.id}`);
}

export interface V3ConcreteFormRowProps {
  content: DraftFormsStepContentV3;
  dialectRules: DialectRulesV3;
  form: WordConcreteFormV3;
  formLabel?: string;
  formTypeAriaLabel?: string;
  formTypeDisabled?: boolean;
  formTypeDisabledReason?: string;
  /** 改类型会让多少处引用漂移的提示；不阻断编辑（保护式放开）。 */
  formTypeChangeHint?: string;
  formTypeOptions?: readonly WordFormTypeV3[];
  issues: readonly V3DraftValidationIssue[];
  membershipCount: number;
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  showMatrixHeader?: boolean;
  presentation?: "matrix" | "content";
  dialectActions?: Partial<Record<"uk" | "us", ReactNode>>;
  multipleSpellingsAvailable?: boolean;
  spellingRemovalReason?: (slotId: string) => string | undefined;
  showRegularity?: boolean;
  referenceForms?: readonly WordConcreteFormV3[];
  referenceVariantIds?: ReadonlyMap<string, readonly string[]>;
  lastRow?: boolean;
  actions?: ReactNode;
  /** 类型下拉上方的引用徽标，占的是与右侧「词形拼写」标签对齐的那一行。 */
  referenceBadge?: ReactNode;
}

interface V3ConcreteFormTypeCellProps {
  content: DraftFormsStepContentV3;
  form: WordConcreteFormV3;
  formTypeAriaLabel: string;
  formTypeDisabled: boolean;
  formTypeDisabledReason?: string;
  /** 改类型会让多少处引用漂移的提示；不阻断编辑（保护式放开）。 */
  formTypeChangeHint?: string;
  formTypeOptions: readonly WordFormTypeV3[];
  membershipCount: number;
  onChange: (next: DraftFormsStepContentV3) => void;
  lastRow?: boolean;
  actions?: ReactNode;
  /** 类型下拉上方的引用徽标，占的是与右侧「词形拼写」标签对齐的那一行。 */
  referenceBadge?: ReactNode;
}

function V3ConcreteFormTypeCell({
  content,
  form,
  formTypeAriaLabel,
  formTypeDisabled,
  formTypeDisabledReason,
  formTypeChangeHint,
  formTypeOptions,
  membershipCount,
  onChange,
  lastRow,
  actions,
  referenceBadge
}: V3ConcreteFormTypeCellProps) {
  const { t } = useLexiconEditorTranslation();
  const formTypeLabel = useFormTypeLabel();
  const availableFormTypes = [
    ...new Set(
      formTypeOptions.includes(form.form_type)
        ? formTypeOptions
        : [form.form_type, ...formTypeOptions]
    )
  ];
  return (
    <div
      className={`word-form-type-cell${lastRow ? " word-form-matrix-last-row" : ""}`}
      data-v3-field="form_type"
      data-v3-node-id={form.id}
      tabIndex={-1}
    >
      <div className="word-form-type-cell-content">
        <div className="word-form-type-cell-header">
          {referenceBadge}
          {/* 改类型不换 form.id，引用按「词形 + 方言侧」重解析后仍成立，但引用记录里的类型会"漂移"。
              文案长、类型列只有 112px，硬塞会折成好几行；收成警示图标 + 悬停说明。 */}
          {formTypeChangeHint ? (
            <Tooltip title={formTypeChangeHint}>
              <TriangleAlertIcon
                aria-label={formTypeChangeHint}
                className="word-form-type-change-hint"
              />
            </Tooltip>
          ) : null}
        </div>
        <V3DisabledReason
          block
          reason={formTypeDisabled ? formTypeDisabledReason : undefined}
        >
          <div className="word-form-type-select">
            <Select
              aria-label={formTypeAriaLabel}
              classNames={{ popup: { root: "v3-form-type-popup" } }}
              disabled={formTypeDisabled}
              popupMatchSelectWidth={false}
              popupAlign={{
                overflow: { adjustX: true, adjustY: true, shiftX: true }
              }}
              styles={{
                content: {
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  textOverflow: "clip"
                },
                popup: {
                  root: {
                    width: "max-content",
                    maxWidth: "calc(100vw - 32px)"
                  }
                }
              }}
              virtual={false}
              onChange={(formType) =>
                onChange(updateConcreteFormType(content, form.id, formType))
              }
              options={availableFormTypes.map((value) => ({
                value,
                label: formTypeLabel(value)
              }))}
              size="small"
              style={{ width: "100%" }}
              value={form.form_type}
            />
          </div>
        </V3DisabledReason>
        {membershipCount > 1 ? (
          <Typography.Text type="secondary">
            {t("shared_form_count", { count: membershipCount })}
          </Typography.Text>
        ) : null}
        {actions}
      </div>
    </div>
  );
}

function SpellingRegularity({
  content,
  form,
  dialectRules,
  variant,
  label,
  onChange,
  visible = true
}: {
  content: DraftFormsStepContentV3;
  form: WordConcreteFormV3;
  dialectRules: DialectRulesV3;
  variant: WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3;
  label: string;
  onChange: (next: DraftFormsStepContentV3) => void;
  visible?: boolean;
}) {
  const { t } = useLexiconEditorTranslation();
  const name = useId();
  if (!visible || !env.FORM_SPELLING_REGULARITY) return null;
  return (
    <Flex align="center" gap="small" className="v3-spelling-regularity">
      <Typography.Text>{t("regular_question")}</Typography.Text>
      <Radio.Group
        name={`${name}-${variant.id}-regularity`}
        aria-label={t("regular_label", { label: label })}
        value={variantRegularity(content, form.id, variant)}
        onChange={(event) =>
          onChange(
            updateFormRegularity(
              content,
              form.id,
              variant.dialect,
              event.target.value,
              dialectRules.spelling_mode
            )
          )
        }
      >
        <Radio value>{t("yes")}</Radio>
        <Radio value={false}>{t("no")}</Radio>
      </Radio.Group>
    </Flex>
  );
}

interface V3DialectFormCellProps {
  content: DraftFormsStepContentV3;
  dialectRules: DialectRulesV3;
  form: WordConcreteFormV3;
  formLabel: string;
  issues: readonly V3DraftValidationIssue[];
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  variantId?: string;
  spellingActions?: ReactNode;
  spellingLabel?: string;
  dialect: "uk" | "us";
  lastRow?: boolean;
  narrowGridRow?: number;
  showRegularity?: boolean;
  referenceForms?: readonly WordConcreteFormV3[];
  referenceVariantIds?: ReadonlyMap<string, readonly string[]>;
}

function V3DialectFormCell({
  content,
  dialectRules,
  form,
  formLabel,
  issues,
  idFactory,
  onChange,
  dialect,
  lastRow,
  narrowGridRow,
  showRegularity = true,
  referenceForms,
  referenceVariantIds,
  variantId,
  spellingActions,
  spellingLabel
}: V3DialectFormCellProps) {
  const { t } = useLexiconEditorTranslation();
  const spellingRef = useRef<TextAreaRef>(null);
  const spellingSettingsRef = useRef<SpellingSettingsOpener | null>(null);
  const [spellingRequired, setSpellingRequired] = useState(false);
  const referenceGuard = useV3ReferenceGuard();
  if (form.regional_variants.mode === "common") return null;
  const variant = regionalVariants(form.regional_variants, dialect).find(
    (row) => !variantId || row.id === variantId
  );
  if (!variant) return null;
  const conflictLiteralList = conflictLiterals(
    spellingReferences(
      referenceGuard.index,
      form,
      referenceForms,
      [dialect],
      variant.spelling,
      [variant.id],
      referenceVariantIds
    )
  );
  const spellingInvalid =
    conflictLiteralList.length > 0 ||
    issues.some(
      (issue) =>
        issue.node_location.variant_id === variant.id &&
        (issue.field === "spelling" ||
          issue.field === "spelling_rich" ||
          issue.field === "spelling_speech")
    );
  const style = {
    "--v3-narrow-grid-row": narrowGridRow
  } as CSSProperties;
  return (
    <div
      className={`v3-dialect-form-cell word-form-matrix-dialect-cell word-form-matrix-dialect-cell-${dialect}${lastRow ? " word-form-matrix-last-row" : ""}`}
      data-v3-node-id={variant.id}
      style={style}
    >
      <Flex vertical gap="small">
        <Flex align="center" justify="space-between" gap="small" wrap>
          <Flex align="center" gap="small">
            <Typography.Text strong>
              {spellingLabel ??
                t("spelling_label", { label: dialectLabel(dialect) })}
            </Typography.Text>
            {spellingActions}
          </Flex>
          <SpellingRegularity
            visible={showRegularity}
            content={content}
            form={form}
            dialectRules={dialectRules}
            variant={variant}
            label={t("dialect_spelling_label", {
              label: formLabel,
              dialect: dialectLabel(dialect)
            })}
            onChange={onChange}
          />
        </Flex>
        <V3VoiceTextField
          mode="spelling"
          spellingTextOnly
          spellingAudioScope={spellingAudioScope([variant])}
          spellingSettingsRef={spellingSettingsRef}
          spellingSettingsHint={
            <SpellingSettingsHint
              count={variant.pronunciations.length}
              labelCount={
                referenceVariantIds?.get(variant.id)?.length ??
                referenceForms?.length
              }
            />
          }
          inputRef={spellingRef}
          requiredError={
            spellingRequired && !variant.spelling.trim()
              ? t("panel_enter_the_form_spelling_first")
              : undefined
          }
          dialect={dialect}
          leadingAction={
            <PronunciationPreviewControls
              recommendationArea="word"
              playbackOnly
              pronunciationId={variant.id}
              spelling={variant.spelling}
              content={spellingEditorValue(variant)}
              voiceProfile={variant.spelling_speech?.voice_profile}
              audioAssets={variant.spelling_speech?.audio_assets}
              dialect={dialect}
              ariaLabelPrefix={t("dialect_spelling_label", {
                label: formLabel,
                dialect: dialectLabel(dialect)
              })}
            />
          }
          onCommit={(result) => {
            let next = content;
            if (dialectRules.spelling_mode === "unified") {
              const unified = unifyUkUsSpelling(
                form,
                toRichTextV2(result.value)
              );
              if (!unified.ok)
                throw new LocalLexiconError("local_spelling_unmergeable");
              next = replaceForm(next, unified.value);
            } else
              next = updateVariantSpelling(
                next,
                variant.id,
                toRichTextV2(result.value)
              );
            const ids =
              dialectRules.spelling_mode === "unified" &&
              form.regional_variants.mode === "uk_us"
                ? [form.regional_variants.uk.id, form.regional_variants.us.id]
                : [variant.id];
            next = updateSpellingVoiceProfile(
              next,
              ids,
              result.voiceProfile ?? { voices: [] }
            );
            onChange(
              updateSpellingAudioAssets(next, ids, result.audioAssets ?? [])
            );
          }}

          invalid={spellingInvalid}
          ariaLabel={t("dialect_spelling_label", {
            label: formLabel,
            dialect: dialectLabel(dialect)
          })}
          field="spelling"
          nodeId={variant.id}
          audioUploadEnabled
          audioAssets={variant.spelling_speech?.audio_assets}
          onAudioAssetsChange={(assets) =>
            onChange(
              updateSpellingAudioAssets(
                content,
                dialectRules.spelling_mode === "unified" &&
                  form.regional_variants.mode === "uk_us"
                  ? [form.regional_variants.uk.id, form.regional_variants.us.id]
                  : [variant.id],
                assets
              )
            )
          }
          voiceProfile={variant.spelling_speech?.voice_profile}
          onVoiceProfileChange={(profile) =>
            onChange(
              updateSpellingVoiceProfile(
                content,
                dialectRules.spelling_mode === "unified" &&
                  form.regional_variants.mode === "uk_us"
                  ? [form.regional_variants.uk.id, form.regional_variants.us.id]
                  : [variant.id],
                profile
              )
            )
          }
          placeholder={t("spelling_label", { label: dialectLabel(dialect) })}
          onChange={(next) => {
            if (dialectRules.spelling_mode === "unified") {
              const result = unifyUkUsSpelling(form, next);
              if (result.ok) onChange(replaceForm(content, result.value));
              return;
            }
            onChange(updateVariantSpelling(content, variant.id, next));
          }}
          value={spellingEditorValue(variant)}
        />
        <SpellingConflictNote literals={conflictLiteralList} />
        <V3PronunciationList
          onSpellingSettings={(request) =>
            spellingSettingsRef.current?.(request)
          }
          content={content}
          idFactory={idFactory}
          issues={issues}
          onChange={onChange}
          variant={variant}
          onMissingSpelling={() => {
            setSpellingRequired(true);
            spellingRef.current?.focus();
          }}
        />
      </Flex>
    </div>
  );
}

const SPELLING_DRAG_TYPE = "application/x-tsz-spelling";

function V3DialectSpellingList({
  multipleSpellingsAvailable,
  spellingRemovalReason,
  ...props
}: V3DialectFormCellProps & {
  multipleSpellingsAvailable: boolean;
  spellingRemovalReason?: (slotId: string) => string | undefined;
}) {
  const { t } = useLexiconEditorTranslation();
  const [draggingId, setDraggingId] = useState<string>();
  const [dragOverId, setDragOverId] = useState<string>();
  const { form, dialect, content, onChange, idFactory } = props;
  const rows = regionalVariants(form.regional_variants, dialect);
  const scope = `${form.id}:${dialect}`;
  const move = (id: string, toIndex: number) =>
    onChange(
      editSpellingList(
        content,
        form.id,
        dialect,
        { type: "move", id, toIndex },
        idFactory
      )
    );
  return (
    <div className={`v3-spelling-list v3-spelling-list-${dialect}`}>
      {rows.map((variant, index) => {
        const removalReason =
          rows.length <= 1
            ? t("one_spelling_per_side")
            : spellingRemovalReason?.(variant.id);
        const label = t("spelling_index_label", {
          label: dialectLabel(dialect),
          index: index + 1
        });
        return (
          <div
            key={variant.id}
            className={`v3-spelling-item${draggingId === variant.id ? " is-dragging" : ""}${dragOverId === variant.id ? " is-drag-over" : ""}`}
            data-spelling-id={variant.id}
            onDragOver={(event) => {
              if (
                draggingId &&
                event.dataTransfer.types.includes(SPELLING_DRAG_TYPE)
              ) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setDragOverId(variant.id);
              }
            }}
            onDragLeave={() => setDragOverId(undefined)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOverId(undefined);
              const raw = event.dataTransfer.getData(SPELLING_DRAG_TYPE);
              if (!raw) return;
              try {
                const source = JSON.parse(raw) as {
                  scope?: string;
                  id?: string;
                };
                if (
                  source.scope === scope &&
                  source.id &&
                  rows.some((row) => row.id === source.id)
                )
                  move(source.id, index);
              } catch {
                /* Ignore unrelated drag data. */
              }
            }}
          >
            <V3DialectFormCell
              {...props}
              formLabel={
                rows.length > 1
                  ? t("spelling_index", {
                      label: props.formLabel,
                      index: index + 1
                    })
                  : props.formLabel
              }
              variantId={variant.id}
              spellingLabel={t("spelling")}
              spellingActions={
                <Flex gap={2}>
                  <Tooltip
                    title={rows.length > 1 ? t("drag_help") : t("one_spelling")}
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<GripVerticalIcon />}
                      aria-label={t("move_item", { label: label })}
                      disabled={rows.length < 2}
                      draggable={rows.length > 1}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData(
                          SPELLING_DRAG_TYPE,
                          JSON.stringify({ scope, id: variant.id })
                        );
                        setDraggingId(variant.id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(undefined);
                        setDragOverId(undefined);
                      }}
                      onKeyDown={(event) => {
                        const next =
                          event.key === "ArrowUp"
                            ? index - 1
                            : event.key === "ArrowDown"
                              ? index + 1
                              : -1;
                        if (next >= 0 && next < rows.length) {
                          event.preventDefault();
                          move(variant.id, next);
                        }
                      }}
                    />
                  </Tooltip>
                  <Tooltip
                    title={
                      multipleSpellingsAvailable
                        ? t("add_spelling_after")
                        : t("multiple_spellings_unavailable")
                    }
                  >
                    <Button
                      type="text"
                      size="small"
                      icon={<CirclePlusIcon />}
                      aria-label={t("insert_spelling", { label: label })}
                      disabled={
                        !multipleSpellingsAvailable || rows.length >= 2000
                      }
                      onClick={() =>
                        onChange(
                          editSpellingList(
                            content,
                            form.id,
                            dialect,
                            { type: "add", afterId: variant.id },
                            idFactory
                          )
                        )
                      }
                    />
                  </Tooltip>
                  <Tooltip title={removalReason ?? t("delete_spelling_audio")}>
                    <Button
                      type="text"
                      size="small"
                      icon={<CircleMinusIcon />}
                      aria-label={t("delete_item", { label: label })}
                      disabled={Boolean(removalReason)}
                      onClick={() =>
                        onChange(
                          editSpellingList(
                            content,
                            form.id,
                            dialect,
                            { type: "remove", id: variant.id },
                            idFactory
                          )
                        )
                      }
                    />
                  </Tooltip>
                </Flex>
              }
            />
          </div>
        );
      })}
    </div>
  );
}

export function V3ConcreteFormRow({
  content,
  dialectRules,
  form,
  formLabel: providedFormLabel,
  formTypeAriaLabel: providedFormTypeAriaLabel,
  formTypeDisabled = false,
  formTypeDisabledReason,
  formTypeChangeHint,
  formTypeOptions = [form.form_type],
  issues,
  membershipCount,
  idFactory,
  onChange,
  showMatrixHeader = true,
  presentation = "matrix",
  dialectActions,
  showRegularity = true,
  multipleSpellingsAvailable = false,
  spellingRemovalReason,
  referenceVariantIds,
  referenceForms,
  lastRow = true,
  actions,
  referenceBadge
}: V3ConcreteFormRowProps) {
  const { t } = useLexiconEditorTranslation();
  const spellingRef = useRef<TextAreaRef>(null);
  const spellingSettingsRef = useRef<SpellingSettingsOpener | null>(null);
  const [spellingRequired, setSpellingRequired] = useState(false);
  const requireSpelling = () => {
    setSpellingRequired(true);
    spellingRef.current?.focus();
  };
  const formLabel = providedFormLabel ?? t("form");
  const formTypeAriaLabel =
    providedFormTypeAriaLabel ?? t("type_label", { label: formLabel });
  const referenceGuard = useV3ReferenceGuard();
  const variants: Array<
    WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3
  > = regionalVariants(form.regional_variants);
  const spellingReadingCount = variants.reduce(
    (count, item) => count + item.pronunciations.length,
    0
  );
  const commonVariant =
    form.regional_variants.mode === "common"
      ? form.regional_variants.common
      : undefined;
  const unifiedSpellingVariants =
    form.regional_variants.mode === "uk_us" &&
    dialectRules.spelling_mode === "unified"
      ? form.regional_variants
      : undefined;
  const unifiedSpellingVariantIds = unifiedSpellingVariants
    ? [unifiedSpellingVariants.uk.id, unifiedSpellingVariants.us.id]
    : [];
  const unifiedConflictLiterals = unifiedSpellingVariants
    ? conflictLiterals(
        spellingReferences(
          referenceGuard.index,
          form,
          referenceForms,
          ["uk", "us"],
          unifiedSpellingVariants.uk.spelling,
          unifiedSpellingVariantIds,
          referenceVariantIds
        )
      )
    : [];
  const unifiedSpellingInvalid =
    unifiedConflictLiterals.length > 0 ||
    issues.some(
      (issue) =>
        (issue.field === "spelling" ||
          issue.field === "spelling_rich" ||
          issue.field === "spelling_speech") &&
        issue.node_location.variant_id !== undefined &&
        unifiedSpellingVariantIds.includes(issue.node_location.variant_id)
    );
  const commonConflictLiterals = commonVariant
    ? conflictLiterals(
        spellingReferences(
          referenceGuard.index,
          form,
          referenceForms,
          ["common"],
          commonVariant.spelling,
          [commonVariant.id],
          referenceVariantIds
        )
      )
    : [];
  return (
    <div
      className={`v3-concrete-form-row${showMatrixHeader ? "" : " v3-concrete-form-row-continuation"}${presentation === "content" ? " v3-content-form-row" : ""}`}
      data-form-id={form.id}
      data-v3-node-id={form.id}
    >
      <div
        className={`word-form-matrix ${
          commonVariant || unifiedSpellingVariants
            ? "word-form-matrix-unified"
            : "word-form-matrix-distinguish"
        }`}
      >
        {showMatrixHeader ? (
          <>
            {presentation === "matrix" ? (
              <div className="word-form-matrix-type-header">
                {t("form_type")}
              </div>
            ) : null}
            {presentation === "content" ? (
              <div className="word-form-matrix-shared-header">
                <span className="word-form-matrix-shared-header-uk">
                  {t("british_short")}
                  {dialectActions?.uk}
                </span>
                <span className="word-form-matrix-shared-header-us">
                  {t("american_short")}
                  {dialectActions?.us}
                </span>
              </div>
            ) : commonVariant ? (
              <div className="word-form-matrix-shared-header">
                <span className="word-form-matrix-shared-header-common">
                  {t("common")}
                </span>
              </div>
            ) : unifiedSpellingVariants ? (
              <div className="word-form-matrix-shared-header">
                <span className="word-form-matrix-shared-header-uk">
                  {t("british")}
                </span>
                <span className="word-form-matrix-shared-header-us">
                  {t("american")}
                </span>
              </div>
            ) : (
              <>
                <div className="word-form-matrix-dialect-header word-form-matrix-dialect-header-uk">
                  {t("british")}
                </div>
                <div className="word-form-matrix-dialect-header word-form-matrix-dialect-header-us">
                  {t("american")}
                </div>
              </>
            )}
          </>
        ) : null}
        {presentation === "matrix" ? (
          <V3ConcreteFormTypeCell
            actions={actions}
            content={content}
            form={form}
            formTypeAriaLabel={formTypeAriaLabel}
            formTypeDisabled={formTypeDisabled}
            formTypeDisabledReason={formTypeDisabledReason}
            formTypeChangeHint={formTypeChangeHint}
            formTypeOptions={formTypeOptions}
            lastRow={lastRow}
            membershipCount={membershipCount}
            onChange={onChange}
            referenceBadge={referenceBadge}
          />
        ) : null}
        {commonVariant ? (
          <div
            className={`word-form-matrix-shared-cell${lastRow ? " word-form-matrix-last-row" : ""}`}
            data-v3-node-id={commonVariant.id}
          >
            <div className="word-shared-form-spelling">
              <Flex align="center" justify="space-between" gap="small" wrap>
                <Typography.Text strong>{t("spelling")}</Typography.Text>
                <SpellingRegularity
                  visible={showRegularity}
                  content={content}
                  form={form}
                  dialectRules={dialectRules}
                  variant={commonVariant}
                  label={t("common_spelling_label", { label: formLabel })}
                  onChange={onChange}
                />
              </Flex>
              <V3VoiceTextField
                mode="spelling"
                spellingTextOnly
                spellingAudioScope={spellingAudioScope(variants)}
                spellingSettingsRef={spellingSettingsRef}
                spellingSettingsHint={
                  <SpellingSettingsHint
                    count={spellingReadingCount}
                    labelCount={referenceForms?.length}
                    sharedPauses
                  />
                }
                inputRef={spellingRef}
                requiredError={
                  spellingRequired && !commonVariant.spelling.trim()
                    ? t("panel_enter_the_form_spelling_first")
                    : undefined
                }
                leadingAction={
                  <PronunciationPreviewControls
                    recommendationArea="word"
                    playbackOnly
                    pronunciationId={commonVariant.id}
                    spelling={commonVariant.spelling}
                    content={spellingEditorValue(commonVariant)}
                    voiceProfile={commonVariant.spelling_speech?.voice_profile}
                    audioAssets={commonVariant.spelling_speech?.audio_assets}
                    dialect="common"
                    ariaLabelPrefix={t("common_spelling_label", {
                      label: formLabel
                    })}
                  />
                }
                invalid={
                  commonConflictLiterals.length > 0 ||
                  issues.some(
                    (issue) =>
                      issue.node_location.variant_id === commonVariant.id &&
                      (issue.field === "spelling" ||
                        issue.field === "spelling_rich" ||
                        issue.field === "spelling_speech")
                  )
                }
                ariaLabel={t("common_spelling_label", { label: formLabel })}
                field="spelling"
                nodeId={commonVariant.id}
                audioUploadEnabled
                audioAssets={commonVariant.spelling_speech?.audio_assets}
                onAudioAssetsChange={(assets) =>
                  onChange(
                    updateSpellingAudioAssets(
                      content,
                      [commonVariant.id],
                      assets
                    )
                  )
                }
                onCommit={(result) => {
                  const next = updateVariantSpelling(
                    content,
                    commonVariant.id,
                    toRichTextV2(result.value)
                  );
                  onChange(
                    updateSpellingAudioAssets(
                      updateSpellingVoiceProfile(
                        next,
                        [commonVariant.id],
                        result.voiceProfile ?? { voices: [] }
                      ),
                      [commonVariant.id],
                      result.audioAssets ?? []
                    )
                  );
                }}
                voiceProfile={commonVariant.spelling_speech?.voice_profile}
                onVoiceProfileChange={(profile) =>
                  onChange(
                    updateSpellingVoiceProfile(
                      content,
                      [commonVariant.id],
                      profile
                    )
                  )
                }
                onChange={(next) =>
                  onChange(
                    updateVariantSpelling(content, commonVariant.id, next)
                  )
                }
                placeholder={t("spelling")}
                value={spellingEditorValue(commonVariant)}
              />
              <SpellingConflictNote literals={commonConflictLiterals} />
            </div>
            <div className="word-shared-pronunciation-grid word-shared-pronunciation-grid-single">
              <div className="word-shared-pronunciation word-shared-pronunciation-common">
                <V3PronunciationList
                  onSpellingSettings={(request) =>
                    spellingSettingsRef.current?.(request)
                  }
                  content={content}
                  idFactory={idFactory}
                  issues={issues}
                  onChange={onChange}
                  variant={commonVariant}
                  onMissingSpelling={requireSpelling}
                />
              </div>
            </div>
          </div>
        ) : unifiedSpellingVariants ? (
          <div
            className={`word-form-matrix-shared-cell${lastRow ? " word-form-matrix-last-row" : ""}`}
            data-v3-node-id={form.id}
          >
            <div className="word-shared-form-spelling">
              <Flex align="center" justify="space-between" gap="small" wrap>
                <Typography.Text strong>{t("spelling")}</Typography.Text>
                <SpellingRegularity
                  visible={showRegularity}
                  content={content}
                  form={form}
                  dialectRules={dialectRules}
                  variant={unifiedSpellingVariants.uk}
                  label={t("common_spelling_label", { label: formLabel })}
                  onChange={onChange}
                />
              </Flex>
              <V3VoiceTextField
                mode="spelling"
                spellingTextOnly
                spellingAudioScope={spellingAudioScope(variants)}
                spellingSettingsRef={spellingSettingsRef}
                spellingSettingsHint={
                  <SpellingSettingsHint
                    count={spellingReadingCount}
                    labelCount={referenceForms?.length}
                    sharedPauses
                  />
                }
                inputRef={spellingRef}
                requiredError={
                  spellingRequired &&
                  !unifiedSpellingVariants.uk.spelling.trim()
                    ? t("panel_enter_the_form_spelling_first")
                    : undefined
                }
                leadingAction={
                  <PronunciationPreviewControls
                    recommendationArea="word"
                    playbackOnly
                    pronunciationId={form.id}
                    spelling={unifiedSpellingVariants.uk.spelling}
                    content={spellingEditorValue(unifiedSpellingVariants.uk)}
                    voiceProfile={
                      unifiedSpellingVariants.uk.spelling_speech?.voice_profile
                    }
                    audioAssets={
                      unifiedSpellingVariants.uk.spelling_speech?.audio_assets
                    }
                    dialect="common"
                    ariaLabelPrefix={t("common_spelling_label", {
                      label: formLabel
                    })}
                  />
                }
                invalid={unifiedSpellingInvalid}
                ariaLabel={t("common_spelling_label", { label: formLabel })}
                field="spelling"
                nodeAliases={unifiedSpellingVariantIds.join(" ")}
                nodeId={form.id}
                audioUploadEnabled
                audioAssets={
                  unifiedSpellingVariants.uk.spelling_speech?.audio_assets
                }
                onAudioAssetsChange={(assets) =>
                  onChange(
                    updateSpellingAudioAssets(
                      content,
                      unifiedSpellingVariantIds,
                      assets
                    )
                  )
                }
                onCommit={(result) => {
                  const unified = unifyUkUsSpelling(
                    form,
                    toRichTextV2(result.value)
                  );
                  if (!unified.ok)
                    throw new LocalLexiconError("local_spelling_unmergeable");
                  const next = updateSpellingVoiceProfile(
                    replaceForm(content, unified.value),
                    unifiedSpellingVariantIds,
                    result.voiceProfile ?? { voices: [] }
                  );
                  onChange(
                    updateSpellingAudioAssets(
                      next,
                      unifiedSpellingVariantIds,
                      result.audioAssets ?? []
                    )
                  );
                }}
                voiceProfile={
                  unifiedSpellingVariants.uk.spelling_speech?.voice_profile
                }
                onVoiceProfileChange={(profile) =>
                  onChange(
                    updateSpellingVoiceProfile(
                      content,
                      unifiedSpellingVariantIds,
                      profile
                    )
                  )
                }
                onChange={(next) => {
                  const result = unifyUkUsSpelling(form, next);
                  if (result.ok) onChange(replaceForm(content, result.value));
                }}
                placeholder={t("spelling")}
                value={spellingEditorValue(unifiedSpellingVariants.uk)}
              />
              <SpellingConflictNote literals={unifiedConflictLiterals} />
            </div>
            <div className="word-shared-pronunciation-grid">
              {[unifiedSpellingVariants.uk, unifiedSpellingVariants.us].map(
                (variant) => (
                  <div
                    className={`word-shared-pronunciation word-shared-pronunciation-${variant.dialect}`}
                    data-v3-node-id={variant.id}
                    key={variant.id}
                  >
                    <V3PronunciationList
                      onSpellingSettings={(request) =>
                        spellingSettingsRef.current?.(request)
                      }
                      content={content}
                      idFactory={idFactory}
                      issues={issues}
                      onChange={onChange}
                      variant={variant}
                      onMissingSpelling={requireSpelling}
                    />
                  </div>
                )
              )}
            </div>
          </div>
        ) : presentation === "content" &&
          dialectRules.spelling_mode === "distinguish" ? (
          (["uk", "us"] as const).map((dialect) => (
            <V3DialectSpellingList
              key={dialect}
              content={content}
              dialectRules={dialectRules}
              form={form}
              formLabel={formLabel}
              issues={issues}
              idFactory={idFactory}
              onChange={onChange}
              dialect={dialect}
              showRegularity={showRegularity}
              referenceForms={referenceForms}
              referenceVariantIds={referenceVariantIds}
              multipleSpellingsAvailable={multipleSpellingsAvailable}
              spellingRemovalReason={spellingRemovalReason}
            />
          ))
        ) : (
          variants.map((variant) => (
            <V3DialectFormCell
              content={content}
              dialect={variant.dialect as "uk" | "us"}
              dialectRules={dialectRules}
              form={form}
              formLabel={formLabel}
              idFactory={idFactory}
              issues={issues}
              key={variant.id}
              showRegularity={showRegularity}
              referenceForms={referenceForms}
              lastRow={lastRow}
              onChange={onChange}
            />
          ))
        )}
      </div>
    </div>
  );
}

export interface V3DialectSeparatedFormRow {
  membershipId: string;
  form: WordConcreteFormV3;
  formLabel: string;
  formTypeAriaLabel: string;
  formTypeDisabled: boolean;
  formTypeDisabledReason?: string;
  /** 改类型会让多少处引用漂移的提示；不阻断编辑（保护式放开）。 */
  formTypeChangeHint?: string;
  formTypeOptions: readonly WordFormTypeV3[];
  membershipCount: number;
  actions?: ReactNode;
  /** 类型下拉上方的引用徽标，占的是与右侧「词形拼写」标签对齐的那一行。 */
  referenceBadge?: ReactNode;
}

export function V3DialectSeparatedFormMatrix({
  content,
  dialectRules,
  rows,
  issues,
  idFactory,
  onChange
}: {
  content: DraftFormsStepContentV3;
  dialectRules: DialectRulesV3;
  rows: readonly V3DialectSeparatedFormRow[];
  issues: readonly V3DraftValidationIssue[];
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
}) {
  const { t } = useLexiconEditorTranslation();
  const columnStyle = {
    "--v3-row-span": rows.length + 1
  } as CSSProperties;
  return (
    <div className="v3-dialect-separated-matrix">
      <div className="v3-form-type-column" style={columnStyle}>
        <div className="word-form-matrix-type-header">{t("form_type")}</div>
        {rows.map((row, index) => (
          <div
            className="v3-membership-row"
            data-form-id={row.form.id}
            data-v3-field="form_id"
            data-v3-node-id={row.membershipId}
            key={row.membershipId}
            style={
              {
                "--v3-narrow-grid-row": index * 2 + 3
              } as CSSProperties
            }
            tabIndex={-1}
          >
            <div
              className="v3-concrete-form-row"
              data-form-id={row.form.id}
              data-v3-node-id={row.form.id}
            >
              <V3ConcreteFormTypeCell
                actions={row.actions}
                content={content}
                form={row.form}
                formTypeAriaLabel={row.formTypeAriaLabel}
                formTypeDisabled={row.formTypeDisabled}
                formTypeDisabledReason={row.formTypeDisabledReason}
                formTypeChangeHint={row.formTypeChangeHint}
                formTypeOptions={row.formTypeOptions}
                lastRow={index === rows.length - 1}
                membershipCount={row.membershipCount}
                onChange={onChange}
                referenceBadge={row.referenceBadge}
              />
            </div>
          </div>
        ))}
      </div>
      {(["uk", "us"] as const).map((dialect) => (
        <section
          aria-label={dialect === "uk" ? t("british_form") : t("american_form")}
          className={`v3-dialect-panel v3-dialect-panel-${dialect}`}
          key={dialect}
          style={columnStyle}
        >
          <div
            className={`v3-dialect-panel-header v3-dialect-panel-header-${dialect}`}
          >
            {dialect === "uk" ? t("british") : t("american")}
          </div>
          {rows.map((row, index) => (
            <V3DialectFormCell
              content={content}
              dialect={dialect}
              dialectRules={dialectRules}
              form={row.form}
              formLabel={row.formLabel}
              idFactory={idFactory}
              issues={issues}
              key={row.form.id}
              lastRow={index === rows.length - 1}
              narrowGridRow={index * 2 + (dialect === "uk" ? 3 : 4)}
              onChange={onChange}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
