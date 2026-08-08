import {
  DeleteOutlined,
  DownOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  PlusOutlined,
  SoundOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Divider,
  Flex,
  Input,
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
  StepSaveIntent,
  WordDerivedFormSlotV2,
  WordFormVariantV2,
  WordPosFormsV2,
  WordPosTag,
  WordPronunciationV2
} from "@tsz/types";
import { HttpError } from "@tsz/api-client/http";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  DIALECT_LABEL,
  FORM_TYPE_OPTIONS,
  POS_TAG_KEYS,
  POS_TAG_ZH,
  PRON_STYLE_OPTIONS
} from "../editorConstants";
import { POS_TAG_ABBR } from "../labels";
import { adminWordsDataSourceCapabilities } from "../dataSource";
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
  formDialects
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

function dialectPanelClass(dialect: Dialect): string {
  return `dialect-panel dialect-panel-${dialect}`;
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
  onChange,
  onRemove
}: {
  value: WordPronunciationV2;
  disabled?: boolean;
  onChange: (next: WordPronunciationV2) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className="word-inline-grid"
      data-word-node-id={value.id}
      data-word-field="pronunciations"
      style={{ marginTop: 10 }}
    >
      <Select
        aria-label="发音方式"
        value={value.style}
        options={PRON_STYLE_OPTIONS}
        disabled={disabled}
        onChange={(style) => onChange({ ...value, style })}
      />
      <Space.Compact block>
        <Button icon={<SoundOutlined />} disabled aria-label="试听发音" />
        <Input
          aria-label="字典音标"
          value={value.dict_phonetic}
          readOnly={disabled}
          placeholder="字典音标"
          onChange={(event) =>
            onChange({ ...value, dict_phonetic: event.target.value })
          }
        />
      </Space.Compact>
      <Input
        aria-label="实际发音"
        value={value.actual_pron}
        readOnly={disabled}
        placeholder="实际发音"
        onChange={(event) =>
          onChange({ ...value, actual_pron: event.target.value })
        }
      />
      <Flex justify="space-between" align="center">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          音频服务接入后可试听/生成
        </Typography.Text>
        {onRemove && (
          <Button
            type="text"
            danger
            size="small"
            icon={<MinusCircleOutlined />}
            disabled={disabled}
            onClick={onRemove}
          >
            删除读音
          </Button>
        )}
      </Flex>
    </div>
  );
}

function VariantEditor({
  value,
  base,
  baseReadOnly,
  readOnly,
  issueNodeId,
  onChange
}: {
  value: WordFormVariantV2;
  base?: boolean;
  baseReadOnly?: boolean;
  readOnly?: boolean;
  issueNodeId: string;
  onChange: (next: WordFormVariantV2) => void;
}) {
  const disabledPronunciation = readOnly || baseReadOnly;
  return (
    <div
      className={dialectPanelClass(value.dialect)}
      data-word-node-id={value.id}
    >
      <Flex justify="space-between" align="center">
        <Typography.Text strong>
          {DIALECT_LABEL[value.dialect]}
          {value.dialect === "uk"
            ? " · BrE"
            : value.dialect === "us"
              ? " · AmE"
              : ""}
        </Typography.Text>
        <Tag>{value.origin}</Tag>
      </Flex>
      <Input
        aria-label={`${DIALECT_LABEL[value.dialect]}词形拼写`}
        data-word-node-id={issueNodeId}
        data-word-field={`variants.${value.dialect}.spelling`}
        value={value.spelling}
        readOnly={readOnly || base}
        placeholder="词形拼写"
        style={{ marginTop: 10 }}
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
        />
      ))}
      {!disabledPronunciation && (
        <Button
          type="dashed"
          block
          size="small"
          icon={<PlusOutlined />}
          style={{ marginTop: 10 }}
          onClick={() =>
            onChange({
              ...value,
              pronunciations: [...value.pronunciations, createPronunciation()]
            })
          }
        >
          添加读音
        </Button>
      )}
    </div>
  );
}

function BaseFormEditor({
  pos,
  editablePronunciation,
  readOnly,
  onChange
}: {
  pos: WordPosFormsV2;
  editablePronunciation: boolean;
  readOnly?: boolean;
  onChange: (next: WordPosFormsV2) => void;
}) {
  return (
    <div data-word-node-id={pos.base_form.id} data-word-field="variants">
      <Flex align="center" gap={8} style={{ marginBottom: 10 }}>
        <Tag>原形</Tag>
        <Typography.Text strong>共享基准原形</Typography.Text>
        <Typography.Text type="secondary">
          拼写从第 1 步派生，
          {editablePronunciation ? "本组可编辑发音" : "只读镜像"}
        </Typography.Text>
      </Flex>
      <div
        className={
          pos.base_form.variants.length > 1 ? "dialect-grid" : undefined
        }
      >
        {pos.base_form.variants.map((variant, variantIndex) => (
          <VariantEditor
            key={variant.id}
            value={variant}
            base
            baseReadOnly={!editablePronunciation}
            readOnly={readOnly}
            issueNodeId={pos.base_form.id}
            onChange={(nextVariant) => {
              const variants = [...pos.base_form.variants];
              variants[variantIndex] = nextVariant;
              onChange({
                ...pos,
                base_form: { ...pos.base_form, variants }
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}

function DerivedSlotEditor({
  slot,
  index,
  last,
  dialects,
  readOnly,
  generating,
  onChange,
  onGenerate,
  onMove,
  onRemove
}: {
  slot: WordDerivedFormSlotV2;
  index: number;
  last: boolean;
  dialects: Dialect[];
  readOnly?: boolean;
  generating?: boolean;
  onChange: (next: WordDerivedFormSlotV2) => void;
  onGenerate: (
    source: WordFormVariantV2,
    target: "uk" | "us",
    clientId: string
  ) => Promise<string | undefined>;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  return (
    <div
      data-word-node-id={slot.id}
      data-word-field="variants"
      style={{ paddingBlock: 16 }}
    >
      <Flex align="center" gap={8} style={{ marginBottom: 10 }} wrap>
        <Typography.Text type="secondary">#{index + 1}</Typography.Text>
        <Select
          value={slot.form_type}
          options={DERIVED_TYPE_OPTIONS}
          disabled={readOnly}
          style={{ width: 150 }}
          onChange={(form_type) => onChange({ ...slot, form_type })}
        />
        <Button
          type="text"
          icon={<UpOutlined />}
          disabled={readOnly || index === 0}
          aria-label={`上移词形 ${index + 1}`}
          onClick={() => onMove(-1)}
        />
        <Button
          type="text"
          icon={<DownOutlined />}
          disabled={readOnly || last}
          aria-label={`下移词形 ${index + 1}`}
          onClick={() => onMove(1)}
        />
        <Button
          type="text"
          danger
          icon={<DeleteOutlined />}
          disabled={readOnly}
          onClick={onRemove}
        >
          删除词形
        </Button>
      </Flex>
      <div className={dialects.length > 1 ? "dialect-grid" : undefined}>
        {dialects.map((dialect) => {
          const variantIndex = slot.variants.findIndex(
            (item) => item.dialect === dialect
          );
          const variant = slot.variants[variantIndex];
          if (variant) {
            return (
              <VariantEditor
                key={variant.id}
                value={variant}
                readOnly={readOnly}
                issueNodeId={slot.id}
                onChange={(nextVariant) => {
                  const variants = [...slot.variants];
                  variants[variantIndex] = nextVariant;
                  onChange({ ...slot, variants });
                }}
              />
            );
          }

          const source = slot.variants.find((item) => item.dialect !== dialect);
          const addVariant = (
            spelling: string,
            origin: WordFormVariantV2["origin"]
          ) =>
            onChange({
              ...slot,
              variants: [
                ...slot.variants,
                {
                  id: newWordNodeId(),
                  dialect,
                  spelling,
                  origin,
                  pronunciations: [createPronunciation()]
                }
              ]
            });

          return (
            <div
              className={`dialect-panel dialect-panel-${dialect}`}
              key={dialect}
            >
              <Typography.Text strong>
                {DIALECT_LABEL[dialect]} · {dialect === "uk" ? "BrE" : "AmE"}
              </Typography.Text>
              <Alert
                type="warning"
                showIcon
                title="该方言词形尚未填写"
                style={{ marginTop: 8, marginBottom: 10 }}
              />
              {!readOnly && (
                <Space wrap>
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
                      void onGenerate(source, dialect, slot.id).then(
                        (suggestion) => {
                          if (suggestion !== undefined) {
                            addVariant(suggestion, "converted");
                          }
                        }
                      );
                    }}
                  >
                    生成{dialect === "uk" ? "英式" : "美式"}建议
                  </Button>
                  <Button size="small" onClick={() => addVariant("", "manual")}>
                    手工填写
                  </Button>
                </Space>
              )}
            </div>
          );
        })}
      </div>
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
  return (
    <div data-word-node-id={value.pos_id} data-word-field="form_groups">
      <Space orientation="vertical" size={20} style={{ width: "100%" }}>
        <Card size="small">
          <div className="word-inline-grid">
            <div>
              <Typography.Text strong>英美拼写是否有区别？</Typography.Text>
              <div style={{ marginTop: 8 }}>
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
              </div>
            </div>
            <div>
              <Typography.Text strong>英美音标是否有区别？</Typography.Text>
              <div style={{ marginTop: 8 }}>
                {value.dialect_rules.spelling_mode === "distinguish" ? (
                  <Typography.Text type="secondary">
                    拼写已区分，音标自动区分
                  </Typography.Text>
                ) : (
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
                )}
              </div>
            </div>
          </div>
        </Card>

        {value.form_groups.map((group, groupIndex) => (
          <Card
            className="word-form-card"
            key={group.id}
            data-word-node-id={group.id}
            data-word-field="slots"
            title={`第 ${groupIndex + 1} 组 词形变化`}
            extra={
              <Space size={2}>
                <Button
                  type="text"
                  icon={<UpOutlined />}
                  aria-label={`上移第 ${groupIndex + 1} 组词形变化`}
                  disabled={readOnly || groupIndex === 0}
                  onClick={() =>
                    onChange({
                      ...value,
                      form_groups: moveWordNode(
                        value.form_groups,
                        groupIndex,
                        groupIndex - 1
                      )
                    })
                  }
                />
                <Button
                  type="text"
                  icon={<DownOutlined />}
                  aria-label={`下移第 ${groupIndex + 1} 组词形变化`}
                  disabled={
                    readOnly || groupIndex === value.form_groups.length - 1
                  }
                  onClick={() =>
                    onChange({
                      ...value,
                      form_groups: moveWordNode(
                        value.form_groups,
                        groupIndex,
                        groupIndex + 1
                      )
                    })
                  }
                />
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  disabled={readOnly || value.form_groups.length === 1}
                  onClick={() =>
                    onChange({
                      ...value,
                      form_groups: value.form_groups.filter(
                        (_, index) => index !== groupIndex
                      )
                    })
                  }
                >
                  删除本组
                </Button>
              </Space>
            }
          >
            <Flex justify="space-between" align="center" wrap gap={12}>
              <Typography.Text strong>词形是否规则变化？</Typography.Text>
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
            </Flex>
            <Divider />
            <BaseFormEditor
              pos={value}
              editablePronunciation={groupIndex === 0}
              readOnly={readOnly}
              onChange={onChange}
            />
            {group.slots.length > 0 && <Divider />}
            {group.slots.map((slot, slotIndex) => (
              <DerivedSlotEditor
                key={slot.id}
                slot={slot}
                index={slotIndex}
                last={slotIndex === group.slots.length - 1}
                dialects={formDialects(value)}
                readOnly={readOnly}
                generating={generating}
                onGenerate={onGenerate}
                onChange={(nextSlot) => {
                  const groups = [...value.form_groups];
                  const slots = [...group.slots];
                  slots[slotIndex] = nextSlot;
                  groups[groupIndex] = { ...group, slots };
                  onChange({ ...value, form_groups: groups });
                }}
                onMove={(delta) => {
                  const groups = [...value.form_groups];
                  groups[groupIndex] = {
                    ...group,
                    slots: moveWordNode(
                      group.slots,
                      slotIndex,
                      slotIndex + delta
                    )
                  };
                  onChange({ ...value, form_groups: groups });
                }}
                onRemove={() => {
                  const groups = [...value.form_groups];
                  groups[groupIndex] = {
                    ...group,
                    slots: group.slots.filter((_, index) => index !== slotIndex)
                  };
                  onChange({ ...value, form_groups: groups });
                }}
              />
            ))}
            {!readOnly && (
              <Button
                type="dashed"
                block
                icon={<PlusOutlined />}
                onClick={() => {
                  const groups = [...value.form_groups];
                  groups[groupIndex] = {
                    ...group,
                    slots: [...group.slots, createDerivedSlot("plural", value)]
                  };
                  onChange({ ...value, form_groups: groups });
                }}
              >
                添加派生词形
              </Button>
            )}
          </Card>
        ))}

        {!readOnly && (
          <Button
            type="dashed"
            block
            size="large"
            icon={<PlusCircleOutlined />}
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
  const [content, setContent] = useState<DraftFormsStepContent>(() =>
    cloneWordValue(word.forms)
  );
  const [activePosId, setActivePosId] = useState(
    word.forms.pos[0]?.pos_id ?? ""
  );
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const issueTarget = useWordValidationIssue();
  const operationId = useRef(newWordNodeId());
  const saveForms = useSaveFormsStep(word.id);
  const previewImpact = usePreviewFormsImpact(word.id);
  const suggestVariants = useSuggestDialectVariants();
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
    operationId.current = newWordNodeId();
    setContent(next);
    setDirty(true);
  };

  const availablePos = useMemo(() => {
    const used = new Set(content.pos.map((item) => item.pos));
    return POS_TAG_KEYS.filter((pos) => !used.has(pos)).map((pos) => ({
      value: pos,
      label: `${POS_TAG_ZH[pos]} ${POS_TAG_ABBR[pos]}`
    }));
  }, [content.pos]);

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
      const impact = await previewImpact.mutateAsync({
        base_revision: word.revision,
        content
      });
      let confirmedToken: string | null = null;
      if (impact.requires_confirmation) {
        const confirmed = await confirmImpact(
          "本次修改会影响后续内容",
          impact.affected.map((item) => item.reason).join("；")
        );
        if (!confirmed) return;
        confirmedToken = impact.confirmation_token ?? null;
      }
      const { word: savedWord } = await saveForms.mutateAsync({
        base_revision: word.revision,
        operation_id: operationId.current,
        intent,
        confirmed_impact_token: confirmedToken,
        content
      });
      operationId.current = newWordNodeId();
      setDirty(false);
      onSaved(savedWord);
      message.success(
        intent === "complete" ? "词形与发音已完成" : "草稿已保存"
      );
      if (intent === "complete") {
        allowSavedNavigation();
        navigate(`/words/${word.id}/wizard/meanings`);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        const issue = error.field_issues.find(
          (candidate) => candidate.step === "forms"
        );
        if (issue) {
          message.warning(issue.message);
          navigate(`/words/${word.id}/wizard/forms`, {
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
        <strong>{POS_TAG_ZH[pos.pos]}</strong>
        <Tag color="blue">{POS_TAG_ABBR[pos.pos]}</Tag>
        {!readOnly && content.pos.length > 1 && (
          <Button
            type="text"
            danger
            size="small"
            aria-label={`删除${POS_TAG_ZH[pos.pos]}`}
            icon={<MinusCircleOutlined />}
            onClick={(event) => {
              event.stopPropagation();
              modal.confirm({
                title: `删除词性“${POS_TAG_ZH[pos.pos]}”？`,
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

      <fieldset
        className="word-request-lock"
        disabled={saving}
        aria-busy={saving}
      >
        <div data-word-node-id="forms" data-word-field="pos">
          <Tabs
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
                  style={{ width: 170 }}
                  suffixIcon={<PlusOutlined />}
                  onChange={(pos) => {
                    const next = createPosForms(pos, word.headwords);
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
            <Button onClick={() => navigate(`/words/${word.id}/wizard/basics`)}>
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
