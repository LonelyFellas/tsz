import { Flex, Input, Select, Tag, Typography } from "antd";
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
import type { CSSProperties, ReactNode } from "react";
import {
  unifyUkUsSpelling,
  updateConcreteFormType,
  updateVariantSpelling,
  type V3IdFactory
} from "../operations";
import { dialectLabel, formTypeLabel } from "../presentation";
import { V3PronunciationList } from "./V3PronunciationList";

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
  formTypeOptions?: readonly WordFormTypeV3[];
  issues: readonly V3DraftValidationIssue[];
  membershipCount: number;
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  showMatrixHeader?: boolean;
  lastRow?: boolean;
  actions?: ReactNode;
}

interface V3ConcreteFormTypeCellProps {
  content: DraftFormsStepContentV3;
  form: WordConcreteFormV3;
  formTypeAriaLabel: string;
  formTypeDisabled: boolean;
  formTypeOptions: readonly WordFormTypeV3[];
  membershipCount: number;
  onChange: (next: DraftFormsStepContentV3) => void;
  lastRow?: boolean;
  actions?: ReactNode;
}

function V3ConcreteFormTypeCell({
  content,
  form,
  formTypeAriaLabel,
  formTypeDisabled,
  formTypeOptions,
  membershipCount,
  onChange,
  lastRow,
  actions
}: V3ConcreteFormTypeCellProps) {
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
      <Select
        aria-label={formTypeAriaLabel}
        disabled={formTypeDisabled}
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
      {membershipCount > 1 ? (
        <Typography.Text type="secondary">
          已在 {membershipCount} 个变化组中使用
        </Typography.Text>
      ) : null}
      {actions}
    </div>
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
  if (form.regional_variants.mode !== "uk_us") return null;
  const variant = form.regional_variants[dialect];
  const spellingInvalid = issues.some(
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
        <Typography.Text strong>{dialectLabel(dialect)}拼写</Typography.Text>
        <Input
          aria-invalid={spellingInvalid}
          aria-label={`${formLabel}${dialectLabel(dialect)}拼写`}
          data-v3-field="spelling"
          data-v3-node-id={variant.id}
          onChange={(event) => {
            if (dialectRules.spelling_mode === "unified") {
              const result = unifyUkUsSpelling(form, event.target.value);
              if (result.ok) onChange(replaceForm(content, result.value));
              return;
            }
            onChange(
              updateVariantSpelling(content, variant.id, event.target.value)
            );
          }}
          value={variant.spelling}
        />
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
  formTypeOptions = [form.form_type],
  issues,
  membershipCount,
  idFactory,
  onChange,
  showMatrixHeader = true,
  lastRow = true,
  actions
}: V3ConcreteFormRowProps) {
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
                  英美共用
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
          formTypeOptions={formTypeOptions}
          lastRow={lastRow}
          membershipCount={membershipCount}
          onChange={onChange}
        />
        {commonVariant ? (
          <div
            className={`word-form-matrix-shared-cell${lastRow ? " word-form-matrix-last-row" : ""}`}
            data-v3-node-id={commonVariant.id}
          >
            <div className="word-shared-form-spelling">
              <Flex align="center" justify="space-between">
                <Typography.Text strong>词形拼写</Typography.Text>
                <Tag color="blue">英美共用</Tag>
              </Flex>
              <Input
                aria-invalid={issues.some(
                  (issue) =>
                    issue.node_location.variant_id === commonVariant.id &&
                    issue.field === "spelling"
                )}
                aria-label={`${formLabel}通用拼写`}
                data-v3-field="spelling"
                data-v3-node-id={commonVariant.id}
                onChange={(event) =>
                  onChange(
                    updateVariantSpelling(
                      content,
                      commonVariant.id,
                      event.target.value
                    )
                  )
                }
                placeholder="词形拼写"
                style={{ marginTop: 10 }}
                value={commonVariant.spelling}
              />
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
              <Flex align="center" justify="space-between">
                <Typography.Text strong>词形拼写</Typography.Text>
                <Tag color="blue">英美共用</Tag>
              </Flex>
              <Input
                aria-label={`${formLabel}英美共用拼写`}
                data-v3-field="spelling"
                data-v3-node-id={form.id}
                onChange={(event) => {
                  const result = unifyUkUsSpelling(form, event.target.value);
                  if (result.ok) onChange(replaceForm(content, result.value));
                }}
                placeholder="词形拼写"
                style={{ marginTop: 10 }}
                value={unifiedSpellingVariants.uk.spelling}
              />
            </div>
            <div className="word-shared-pronunciation-grid">
              {[unifiedSpellingVariants.uk, unifiedSpellingVariants.us].map(
                (variant) => (
                  <div
                    className={`word-shared-pronunciation word-shared-pronunciation-${variant.dialect}`}
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
  formTypeOptions: readonly WordFormTypeV3[];
  membershipCount: number;
  actions?: ReactNode;
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
                formTypeOptions={row.formTypeOptions}
                lastRow={index === rows.length - 1}
                membershipCount={row.membershipCount}
                onChange={onChange}
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
