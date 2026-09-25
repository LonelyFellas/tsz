import { env } from "../../../../lib/env";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { WarningOutlined } from "@ant-design/icons";
import { Flex, Radio, Select, Tooltip, Typography } from "antd";
import { V3VoiceTextField } from "./V3VoiceTextField";
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
import { useId, type CSSProperties, type ReactNode } from "react";
import {
  unifyUkUsSpelling,
  updateConcreteFormType,
  updateVariantSpelling,
  updateFormRegularity,
  type V3IdFactory
} from "../operations";
import { variantRegularity } from "../model";
import { dialectLabel } from "../presentation";
import { spellingConflictReferences } from "../referenceGuard";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import { V3DisabledReason } from "./V3DisabledReason";
import { V3PronunciationList } from "./V3PronunciationList";

/** 拼写与多维例句标注片段对不上时即时标红（Q2）：输入框照常可编辑，保存由确认条与后端拦。 */
function SpellingConflictNote({ literals }: { literals: readonly string[] }) {
  if (literals.length === 0) return null;
  return (
    <Typography.Text
      className="v3-spelling-conflict"
      role="status"
      type="danger"
    >
      与被引用片段“{literals.join("”“")}”不一致，需改回一致或先解除引用
    </Typography.Text>
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
              <WarningOutlined
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
              popupMatchSelectWidth={240}
              styles={{
                content: {
                  whiteSpace: "normal",
                  overflowWrap: "anywhere",
                  textOverflow: "clip"
                },
                popup: { root: { maxWidth: "calc(100vw - 32px)" } }
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
            已在 {membershipCount} 个变化组中使用
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
  onChange
}: {
  content: DraftFormsStepContentV3;
  form: WordConcreteFormV3;
  dialectRules: DialectRulesV3;
  variant: WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3;
  label: string;
  onChange: (next: DraftFormsStepContentV3) => void;
}) {
  const name = useId();
  if (!env.FORM_SPELLING_REGULARITY) return null;
  return (
    <Flex align="center" gap="small" className="v3-spelling-regularity">
      <Typography.Text>是否规则变化？</Typography.Text>
      <Radio.Group
        name={`${name}-${variant.id}-regularity`}
        aria-label={`${label}是否规则变化`}
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
        <Radio value>是</Radio>
        <Radio value={false}>否</Radio>
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
  dialect: "uk" | "us";
  lastRow?: boolean;
  narrowGridRow?: number;
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
  narrowGridRow
}: V3DialectFormCellProps) {
  const referenceGuard = useV3ReferenceGuard();
  if (form.regional_variants.mode !== "uk_us") return null;
  const variant = form.regional_variants[dialect];
  const conflictLiteralList = conflictLiterals(
    spellingConflictReferences(
      referenceGuard.index,
      form,
      [variant.id],
      variant.spelling
    )
  );
  const spellingInvalid =
    conflictLiteralList.length > 0 ||
    issues.some(
      (issue) =>
        issue.node_location.variant_id === variant.id &&
        issue.field === "spelling"
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
          <Typography.Text strong>{dialectLabel(dialect)}拼写</Typography.Text>
          <SpellingRegularity
            content={content}
            form={form}
            dialectRules={dialectRules}
            variant={variant}
            label={`${formLabel}${dialectLabel(dialect)}拼写`}
            onChange={onChange}
          />
        </Flex>
        <V3VoiceTextField
          mode="spelling"
          invalid={spellingInvalid}
          ariaLabel={`${formLabel}${dialectLabel(dialect)}拼写`}
          field="spelling"
          nodeId={variant.id}
          placeholder={`${dialectLabel(dialect)}拼写`}
          onChange={(next) => {
            if (dialectRules.spelling_mode === "unified") {
              const result = unifyUkUsSpelling(form, next.text);
              if (result.ok) onChange(replaceForm(content, result.value));
              return;
            }
            onChange(updateVariantSpelling(content, variant.id, next.text));
          }}
          value={{ version: 2, text: variant.spelling, annotations: [] }}
        />
        <SpellingConflictNote literals={conflictLiteralList} />
        <V3PronunciationList
          content={content}
          idFactory={idFactory}
          issues={issues}
          onChange={onChange}
          variant={variant}
        />
      </Flex>
    </div>
  );
}

export function V3ConcreteFormRow({
  content,
  dialectRules,
  form,
  formLabel = "词形",
  formTypeAriaLabel = `${formLabel}类型`,
  formTypeDisabled = false,
  formTypeDisabledReason,
  formTypeChangeHint,
  formTypeOptions = [form.form_type],
  issues,
  membershipCount,
  idFactory,
  onChange,
  showMatrixHeader = true,
  lastRow = true,
  actions,
  referenceBadge
}: V3ConcreteFormRowProps) {
  const referenceGuard = useV3ReferenceGuard();
  const variants: Array<
    WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3
  > =
    form.regional_variants.mode === "common"
      ? [form.regional_variants.common]
      : [form.regional_variants.uk, form.regional_variants.us];
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
        spellingConflictReferences(
          referenceGuard.index,
          form,
          unifiedSpellingVariantIds,
          unifiedSpellingVariants.uk.spelling
        )
      )
    : [];
  const unifiedSpellingInvalid =
    unifiedConflictLiterals.length > 0 ||
    issues.some(
      (issue) =>
        issue.field === "spelling" &&
        issue.node_location.variant_id !== undefined &&
        unifiedSpellingVariantIds.includes(issue.node_location.variant_id)
    );
  const commonConflictLiterals = commonVariant
    ? conflictLiterals(
        spellingConflictReferences(
          referenceGuard.index,
          form,
          [commonVariant.id],
          commonVariant.spelling
        )
      )
    : [];
  return (
    <div
      className={`v3-concrete-form-row${showMatrixHeader ? "" : " v3-concrete-form-row-continuation"}`}
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
            <div className="word-form-matrix-type-header">词形类型</div>
            {commonVariant ? (
              <div className="word-form-matrix-shared-header">
                <span className="word-form-matrix-shared-header-common">
                  英美通用
                </span>
              </div>
            ) : unifiedSpellingVariants ? (
              <div className="word-form-matrix-shared-header">
                <span className="word-form-matrix-shared-header-uk">
                  英式英语 · BrE
                </span>
                <span className="word-form-matrix-shared-header-us">
                  美式英语 · AmE
                </span>
              </div>
            ) : (
              <>
                <div className="word-form-matrix-dialect-header word-form-matrix-dialect-header-uk">
                  英式英语 · BrE
                </div>
                <div className="word-form-matrix-dialect-header word-form-matrix-dialect-header-us">
                  美式英语 · AmE
                </div>
              </>
            )}
          </>
        ) : null}
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
        {commonVariant ? (
          <div
            className={`word-form-matrix-shared-cell${lastRow ? " word-form-matrix-last-row" : ""}`}
            data-v3-node-id={commonVariant.id}
          >
            <div className="word-shared-form-spelling">
              <Flex align="center" justify="space-between" gap="small" wrap>
                <Typography.Text strong>词形拼写</Typography.Text>
                <SpellingRegularity
                  content={content}
                  form={form}
                  dialectRules={dialectRules}
                  variant={commonVariant}
                  label={`${formLabel}英美通用拼写`}
                  onChange={onChange}
                />
              </Flex>
              <V3VoiceTextField
                mode="spelling"
                invalid={
                  commonConflictLiterals.length > 0 ||
                  issues.some(
                    (issue) =>
                      issue.node_location.variant_id === commonVariant.id &&
                      issue.field === "spelling"
                  )
                }
                ariaLabel={`${formLabel}英美通用拼写`}
                field="spelling"
                nodeId={commonVariant.id}
                onChange={(next) =>
                  onChange(
                    updateVariantSpelling(content, commonVariant.id, next.text)
                  )
                }
                placeholder="词形拼写"
                value={{
                  version: 2,
                  text: commonVariant.spelling,
                  annotations: []
                }}
              />
              <SpellingConflictNote literals={commonConflictLiterals} />
            </div>
            <div className="word-shared-pronunciation-grid word-shared-pronunciation-grid-single">
              <div className="word-shared-pronunciation word-shared-pronunciation-common">
                <V3PronunciationList
                  content={content}
                  idFactory={idFactory}
                  issues={issues}
                  onChange={onChange}
                  variant={commonVariant}
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
                <Typography.Text strong>词形拼写</Typography.Text>
                <SpellingRegularity
                  content={content}
                  form={form}
                  dialectRules={dialectRules}
                  variant={unifiedSpellingVariants.uk}
                  label={`${formLabel}英美通用拼写`}
                  onChange={onChange}
                />
              </Flex>
              <V3VoiceTextField
                mode="spelling"
                invalid={unifiedSpellingInvalid}
                ariaLabel={`${formLabel}英美通用拼写`}
                field="spelling"
                nodeAliases={unifiedSpellingVariantIds.join(" ")}
                nodeId={form.id}
                onChange={(next) => {
                  const result = unifyUkUsSpelling(form, next.text);
                  if (result.ok) onChange(replaceForm(content, result.value));
                }}
                placeholder="词形拼写"
                value={{
                  version: 2,
                  text: unifiedSpellingVariants.uk.spelling,
                  annotations: []
                }}
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
                      content={content}
                      idFactory={idFactory}
                      issues={issues}
                      onChange={onChange}
                      variant={variant}
                    />
                  </div>
                )
              )}
            </div>
          </div>
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
  const columnStyle = {
    "--v3-row-span": rows.length + 1
  } as CSSProperties;
  return (
    <div className="v3-dialect-separated-matrix">
      <div className="v3-form-type-column" style={columnStyle}>
        <div className="word-form-matrix-type-header">词形类型</div>
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
          aria-label={dialect === "uk" ? "英式英语词形" : "美式英语词形"}
          className={`v3-dialect-panel v3-dialect-panel-${dialect}`}
          key={dialect}
          style={columnStyle}
        >
          <div
            className={`v3-dialect-panel-header v3-dialect-panel-header-${dialect}`}
          >
            {dialect === "uk" ? "英式英语 · BrE" : "美式英语 · AmE"}
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
