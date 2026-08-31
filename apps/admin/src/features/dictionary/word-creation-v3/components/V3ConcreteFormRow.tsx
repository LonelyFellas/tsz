import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Flex, Input, Select, Tag, Typography } from "antd";
import type {
  DialectRulesV3,
  DraftFormsStepContentV3,
  PhraseComponentUsageV3,
  V3DraftValidationIssue,
  WordCommonFormVariantV3,
  WordConcreteFormV3,
  WordFormTypeV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import type { CSSProperties, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import {
  unifyUkUsSpelling,
  updateConcreteFormType,
  updateVariantSpelling,
  type V3IdFactory
} from "../operations";
import { dialectLabel, formTypeLabel } from "../presentation";
import { createV3WordRequests } from "../api";
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
  entryKind?: "word" | "phrase";
  sentenceTargetDiscoveryEnabled?: boolean;
}

type V3FormVariant =
  WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3;

function updateVariantComponents(
  content: DraftFormsStepContentV3,
  variantId: string,
  components: PhraseComponentUsageV3[]
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
        variant.component_usages = components;
        return next;
      }
    }
  }
  throw new Error(`variant not found: ${variantId}`);
}

function V3PhraseComponentEditor({
  content,
  variant,
  idFactory,
  onChange,
  targetDiscoveryEnabled
}: {
  content: DraftFormsStepContentV3;
  variant: V3FormVariant;
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  targetDiscoveryEnabled: boolean;
}) {
  const components = variant.component_usages ?? [];
  const componentsRef = useRef(components);
  componentsRef.current = components;
  const lookupRequestIdRef = useRef(0);
  const requests = useMemo(() => createV3WordRequests(), []);
  const [lookup, setLookup] = useState<{
    componentId: string;
    pending: boolean;
    message?: string;
    options: Array<{
      key: string;
      label: string;
      value: Extract<PhraseComponentUsageV3, { state: "resolved" }>;
    }>;
  }>();
  const change = (next: PhraseComponentUsageV3[]) =>
    onChange(updateVariantComponents(content, variant.id, next));
  const findMeanings = async (component: PhraseComponentUsageV3) => {
    if (!targetDiscoveryEnabled) return;
    const literal = component.literal.trim();
    if (!literal) return;
    const requestId = ++lookupRequestIdRef.current;
    setLookup({ componentId: component.id, pending: true, options: [] });
    try {
      const response = await requests.resolveSentenceTargets({
        schema_version: 3,
        sentence_text: literal,
        source_dialect: variant.dialect,
        mode: "selected_segments",
        selected_segments: [
          { start: 0, end: Array.from(literal).length, surface: literal }
        ],
        include_drafts: false,
        page_size_per_range: 50
      });
      const options = response.range_results.flatMap((range) =>
        range.published_matches.flatMap((candidate) => {
          if (
            !candidate.matched_form_id ||
            !candidate.matched_variant_id ||
            !candidate.matched_dialect ||
            !candidate.matched_form_type
          )
            return [];
          return candidate.senses.map((sense) => ({
            key: `${candidate.entry_id}:${candidate.publication_id}:${sense.sense_id}:${candidate.matched_variant_id}`,
            label: `${candidate.headword} · ${sense.gloss || "暂无释义"} · ${dialectLabel(candidate.matched_dialect!)} · ${formTypeLabel(candidate.matched_form_type!)}`,
            value: {
              state: "resolved" as const,
              id: component.id,
              literal,
              target_word_id: candidate.entry_id,
              target_publication_id: candidate.publication_id,
              target_pos_id: candidate.pos_id,
              target_base_form_id: candidate.base_form_id,
              target_sense_id: sense.sense_id,
              target_form_id: candidate.matched_form_id!,
              target_variant_id: candidate.matched_variant_id!,
              target_dialect: candidate.matched_dialect!,
              target_form_type: candidate.matched_form_type!,
              target_headword: candidate.headword,
              target_gloss: sense.gloss
            }
          }));
        })
      );
      if (
        requestId !== lookupRequestIdRef.current ||
        componentsRef.current
          .find((item) => item.id === component.id)
          ?.literal.trim() !== literal
      )
        return;
      setLookup({
        componentId: component.id,
        pending: false,
        options,
        message:
          options.length === 0
            ? "未找到可关联的已发布词义；当前成分将继续保留为待选择状态。"
            : undefined
      });
    } catch {
      if (requestId !== lookupRequestIdRef.current) return;
      setLookup({
        componentId: component.id,
        pending: false,
        options: [],
        message: "词义查询失败，请稍后重试；当前编辑内容未丢失。"
      });
    }
  };
  return (
    <Flex
      className="v3-phrase-component-editor"
      gap="small"
      vertical
      style={{
        borderTop: "1px solid #e8edf5",
        marginTop: 12,
        paddingTop: 12
      }}
    >
      <Flex align="center" justify="space-between">
        <div>
          <Typography.Text strong>成分用词</Typography.Text>
          <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
            仅属于当前{dialectLabel(variant.dialect)}词形
          </Typography.Text>
        </div>
        <Button
          aria-label={`为${variant.spelling || "当前词形"}添加成分用词`}
          icon={<PlusOutlined />}
          onClick={() =>
            change([
              ...components,
              { state: "unresolved", id: idFactory(), literal: "" }
            ])
          }
          size="small"
          type="text"
        >
          添 加
        </Button>
      </Flex>
      {!targetDiscoveryEnabled ? (
        <Typography.Text type="secondary">
          目标发现能力未启用；可先保留成分文字，稍后再选择具体词义。
        </Typography.Text>
      ) : null}
      {components.length === 0 ? (
        <Typography.Text type="secondary">
          暂无成分；可分别配置英式与美式短语中的组成单词。
        </Typography.Text>
      ) : (
        components.map((component, index) => (
          <Flex gap={4} key={component.id} vertical>
            <Flex align="center" gap="small">
              <Input
                aria-label={`第${index + 1}个成分用词`}
                onChange={(event) => {
                  lookupRequestIdRef.current += 1;
                  setLookup(undefined);
                  change(
                    components.map((item) =>
                      item.id === component.id
                        ? item.state === "resolved"
                          ? {
                              state: "unresolved",
                              id: item.id,
                              literal: event.target.value
                            }
                          : { ...item, literal: event.target.value }
                        : item
                    )
                  );
                }}
                placeholder="输入组成单词"
                value={component.literal}
              />
              <Tag color={component.state === "resolved" ? "green" : "gold"}>
                {component.state === "resolved" ? "已关联词义" : "待选择词义"}
              </Tag>
              <Button
                disabled={!targetDiscoveryEnabled}
                loading={lookup?.componentId === component.id && lookup.pending}
                onClick={() => void findMeanings(component)}
                size="small"
              >
                {component.state === "resolved" ? "更换词义" : "查找词义"}
              </Button>
              <Button
                aria-label={`删除第${index + 1}个成分用词`}
                danger
                icon={<DeleteOutlined />}
                onClick={() =>
                  change(components.filter((item) => item.id !== component.id))
                }
                size="small"
                type="text"
              />
            </Flex>
            {component.state === "resolved" ? (
              <Typography.Text type="secondary">
                {component.target_headword} ·{" "}
                {component.target_gloss || "暂无释义"} ·{" "}
                {dialectLabel(component.target_dialect)} ·{" "}
                {formTypeLabel(component.target_form_type)}
              </Typography.Text>
            ) : null}
            {lookup?.componentId === component.id && lookup.options.length ? (
              <Select
                aria-label={`选择第${index + 1}个成分的词义`}
                onChange={(key) => {
                  const selected = lookup.options.find(
                    (option) => option.key === key
                  );
                  if (!selected) return;
                  change(
                    components.map((item) =>
                      item.id === component.id ? selected.value : item
                    )
                  );
                  setLookup(undefined);
                }}
                options={lookup.options.map((option) => ({
                  value: option.key,
                  label: option.label
                }))}
                placeholder="选择已发布词义"
                showSearch
              />
            ) : null}
            {lookup?.componentId === component.id && lookup.message ? (
              <Alert showIcon title={lookup.message} type="info" />
            ) : null}
          </Flex>
        ))
      )}
    </Flex>
  );
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
  entryKind?: "word" | "phrase";
  sentenceTargetDiscoveryEnabled?: boolean;
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
  entryKind = "word",
  sentenceTargetDiscoveryEnabled = true
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
        {entryKind === "phrase" ? (
          <V3PhraseComponentEditor
            content={content}
            idFactory={idFactory}
            onChange={onChange}
            targetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
            variant={variant}
          />
        ) : null}
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
  actions,
  entryKind = "word",
  sentenceTargetDiscoveryEnabled = true
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
                {entryKind === "phrase" ? (
                  <V3PhraseComponentEditor
                    content={content}
                    idFactory={idFactory}
                    onChange={onChange}
                    targetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
                    variant={commonVariant}
                  />
                ) : null}
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
                    {entryKind === "phrase" ? (
                      <V3PhraseComponentEditor
                        content={content}
                        idFactory={idFactory}
                        onChange={onChange}
                        targetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
                        variant={variant}
                      />
                    ) : null}
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
              entryKind={entryKind}
              sentenceTargetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
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
  onChange,
  entryKind = "word",
  sentenceTargetDiscoveryEnabled = true
}: {
  content: DraftFormsStepContentV3;
  dialectRules: DialectRulesV3;
  rows: readonly V3DialectSeparatedFormRow[];
  issues: readonly V3DraftValidationIssue[];
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  entryKind?: "word" | "phrase";
  sentenceTargetDiscoveryEnabled?: boolean;
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
              entryKind={entryKind}
              issues={issues}
              key={row.form.id}
              lastRow={index === rows.length - 1}
              narrowGridRow={index * 2 + (dialect === "uk" ? 3 : 4)}
              onChange={onChange}
              sentenceTargetDiscoveryEnabled={sentenceTargetDiscoveryEnabled}
            />
          ))}
        </section>
      ))}
    </div>
  );
}
