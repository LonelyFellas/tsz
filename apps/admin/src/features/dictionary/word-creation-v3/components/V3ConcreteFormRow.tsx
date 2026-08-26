import { Button, Card, Flex, Input, Modal, Space, Tag, Typography } from "antd";
import type {
  DraftFormsStepContentV3,
  V3DraftValidationIssue,
  WordCommonFormVariantV3,
  WordConcreteFormV3,
  WordUkFormVariantV3,
  WordUsFormVariantV3
} from "@tsz/types";
import { useState } from "react";
import {
  convertCommonToUkUs,
  convertUkUsToCommon,
  updateVariantSpelling,
  type V3IdFactory
} from "../operations";
import { dialectLabel, formTypeLabel } from "../presentation";
import { V3PronunciationList } from "./V3PronunciationList";

interface MappingSide {
  spelling: string;
  dictPhonetic: string;
  actualPron: string;
}

type MappingDraft =
  | { mode: "uk_us"; uk: MappingSide; us: MappingSide }
  | { mode: "common"; common: MappingSide };

const EMPTY_SIDE: MappingSide = {
  spelling: "",
  dictPhonetic: "",
  actualPron: ""
};

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

function MappingFields({
  label,
  side,
  onChange
}: {
  label: string;
  side: MappingSide;
  onChange: (next: MappingSide) => void;
}) {
  return (
    <Card size="small" title={`${label} 显式映射`}>
      <Flex vertical gap="small">
        <Input
          aria-label={`${label} 映射拼写`}
          onChange={(event) =>
            onChange({ ...side, spelling: event.target.value })
          }
          placeholder="拼写"
          value={side.spelling}
        />
        <Input
          aria-label={`${label} 映射字典音标`}
          onChange={(event) =>
            onChange({ ...side, dictPhonetic: event.target.value })
          }
          placeholder="字典音标"
          value={side.dictPhonetic}
        />
        <Input
          aria-label={`${label} 映射实际发音`}
          onChange={(event) =>
            onChange({ ...side, actualPron: event.target.value })
          }
          placeholder="实际发音"
          value={side.actualPron}
        />
      </Flex>
    </Card>
  );
}

function mappingComplete(mapping: MappingDraft) {
  const sides =
    mapping.mode === "uk_us" ? [mapping.uk, mapping.us] : [mapping.common];
  return sides.every(
    (side) => side.spelling && side.dictPhonetic && side.actualPron
  );
}

export interface V3ConcreteFormRowProps {
  content: DraftFormsStepContentV3;
  form: WordConcreteFormV3;
  formLabel?: string;
  issues: readonly V3DraftValidationIssue[];
  membershipCount: number;
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
}

export function V3ConcreteFormRow({
  content,
  form,
  formLabel = "词形",
  issues,
  membershipCount,
  idFactory,
  onChange
}: V3ConcreteFormRowProps) {
  const [mapping, setMapping] = useState<MappingDraft>();
  const variants: Array<
    WordCommonFormVariantV3 | WordUkFormVariantV3 | WordUsFormVariantV3
  > =
    form.regional_variants.mode === "common"
      ? [form.regional_variants.common]
      : [form.regional_variants.uk, form.regional_variants.us];
  const pronunciationCount = variants.reduce(
    (total, variant) => total + variant.pronunciations.length,
    0
  );

  const confirmMapping = () => {
    if (!mapping || !mappingComplete(mapping)) return;
    const result =
      mapping.mode === "uk_us"
        ? convertCommonToUkUs(
            form,
            {
              confirmed: true,
              uk: {
                spelling: mapping.uk.spelling,
                origin: "manual",
                pronunciations: [
                  {
                    dict_phonetic: mapping.uk.dictPhonetic,
                    actual_pron: mapping.uk.actualPron,
                    style: "normal"
                  }
                ]
              },
              us: {
                spelling: mapping.us.spelling,
                origin: "manual",
                pronunciations: [
                  {
                    dict_phonetic: mapping.us.dictPhonetic,
                    actual_pron: mapping.us.actualPron,
                    style: "normal"
                  }
                ]
              }
            },
            idFactory
          )
        : convertUkUsToCommon(
            form,
            {
              confirmed: true,
              common: {
                spelling: mapping.common.spelling,
                origin: "manual",
                pronunciations: [
                  {
                    dict_phonetic: mapping.common.dictPhonetic,
                    actual_pron: mapping.common.actualPron,
                    style: "normal"
                  }
                ]
              }
            },
            idFactory
          );
    if (result.ok) onChange(replaceForm(content, result.value));
    setMapping(undefined);
  };

  return (
    <Card
      className="v3-concrete-form-row"
      data-form-id={form.id}
      data-v3-node-id={form.id}
      size="small"
      title={
        <Space wrap>
          <span
            data-v3-field="form_type"
            data-v3-node-id={form.id}
            tabIndex={-1}
          >
            <Typography.Text strong>{formLabel}</Typography.Text>
            <Tag color="blue">{formTypeLabel(form.form_type)}</Tag>
          </span>
          {membershipCount > 1 && (
            <Tag color="purple">已在 {membershipCount} 个变化组中使用</Tag>
          )}
        </Space>
      }
      extra={
        form.regional_variants.mode === "common" ? (
          <Button
            aria-label={`${formLabel}切换为英式和美式`}
            onClick={() =>
              setMapping({
                mode: "uk_us",
                uk: { ...EMPTY_SIDE },
                us: { ...EMPTY_SIDE }
              })
            }
          >
            区分英式与美式
          </Button>
        ) : (
          <Button
            aria-label={`${formLabel}切换为通用拼写`}
            onClick={() =>
              setMapping({ mode: "common", common: { ...EMPTY_SIDE } })
            }
          >
            合并为通用拼写
          </Button>
        )
      }
    >
      <div className={`v3-variant-grid v3-variant-grid-${variants.length}`}>
        {variants.map((variant) => {
          const spellingInvalid = issues.some(
            (issue) =>
              issue.node_location.variant_id === variant.id &&
              issue.field === "spelling"
          );
          return (
            <Card
              className="v3-variant-card"
              data-v3-node-id={variant.id}
              key={variant.id}
              size="small"
              title={`${dialectLabel(variant.dialect)}拼写`}
            >
              <Flex vertical gap="small">
                <Input
                  aria-invalid={spellingInvalid}
                  aria-label={`${formLabel}${dialectLabel(variant.dialect)}拼写`}
                  data-v3-field="spelling"
                  data-v3-node-id={variant.id}
                  onChange={(event) =>
                    onChange(
                      updateVariantSpelling(
                        content,
                        variant.id,
                        event.target.value
                      )
                    )
                  }
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
            </Card>
          );
        })}
      </div>
      <Modal
        cancelText="取 消"
        okButtonProps={{ disabled: mapping ? !mappingComplete(mapping) : true }}
        okText="确认转换"
        onCancel={() => setMapping(undefined)}
        onOk={confirmMapping}
        open={mapping !== undefined}
        title="确认地区结构转换"
      >
        <Typography.Paragraph type="warning">
          现有 {pronunciationCount}{" "}
          条发音不会被静默复制，请为目标地区显式填写映射。
        </Typography.Paragraph>
        <Flex vertical gap="small">
          {mapping?.mode === "uk_us" ? (
            <>
              <MappingFields
                label="英式"
                onChange={(uk) => setMapping({ ...mapping, uk })}
                side={mapping.uk}
              />
              <MappingFields
                label="美式"
                onChange={(us) => setMapping({ ...mapping, us })}
                side={mapping.us}
              />
            </>
          ) : mapping?.mode === "common" ? (
            <MappingFields
              label="通用"
              onChange={(common) => setMapping({ ...mapping, common })}
              side={mapping.common}
            />
          ) : null}
        </Flex>
      </Modal>
    </Card>
  );
}
