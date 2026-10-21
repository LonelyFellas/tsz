import { useEffect, useRef, useState } from "react";
import {
  Alert,
  App,
  Button,
  Flex,
  Form,
  Modal,
  Radio,
  Select,
  Space,
  Tag,
  Typography
} from "antd";
import type {
  DialectRulesV3,
  PartOfSpeechCatalogItem,
  RetiredContentSlotV3,
  RetiredStableNodeV3,
  SharedFormsStepContentV3,
  V3DraftValidationIssue
} from "@tsz/types";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { useDialectPreference } from "@/features/settings/useDialectPreference";
import { newWordNodeId } from "../../word-model/primitives";
import {
  addSharedLabel,
  contentEditorForms,
  contentFromEditor,
  createPronunciationReferenceIds,
  createSharedContentDialectNormalizer,
  replaceSharedContent,
  sharedContentForForm
} from "../sharedFormsModel";
import type { V3StableVariantIdFactory } from "../operations";
import { partOfSpeechLabel } from "../presentation";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";
import { useV3ReferenceGuard } from "../referenceGuardContext";
import { formReferenceCount } from "../referenceGuard";
import { expandFormContents } from "@tsz/shared";

export function V3FormContentModal({
  forms,
  formId,
  catalog,
  issues,
  stableVariantIds,
  pronunciationReferenceIds,
  retiredContentSlots,
  retiredStableNodes = [],
  registerLeaveGuard,
  onCancel,
  onConfirm
}: {
  forms: SharedFormsStepContentV3;
  formId: string;
  catalog: readonly PartOfSpeechCatalogItem[];
  issues: readonly V3DraftValidationIssue[];
  stableVariantIds: V3StableVariantIdFactory;
  pronunciationReferenceIds?: ReturnType<
    typeof createPronunciationReferenceIds
  >;
  retiredContentSlots: readonly RetiredContentSlotV3[];
  retiredStableNodes?: readonly RetiredStableNodeV3[];
  registerLeaveGuard?: (guard?: () => Promise<boolean>) => void;
  onCancel: () => void;
  onConfirm: (forms: SharedFormsStepContentV3) => void;
}) {
  const original = useRef(forms);
  const [pronunciationIds] = useState(
    () =>
      pronunciationReferenceIds ??
      createPronunciationReferenceIds(forms, retiredStableNodes)
  );
  const content = sharedContentForForm(original.current, formId)!;
  const [editor, setEditor] = useState(() => contentEditorForms(content));
  const [labels, setLabels] = useState(() => structuredClone(forms));
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [posId, setPosId] = useState<string>();
  const [groupId, setGroupId] = useState<string>();
  const [formType, setFormType] = useState<string>();
  const { preference } = useDialectPreference();
  const { modal } = App.useApp();
  const label = useFormTypeLabel();
  const [normalizeDialect] = useState(() =>
    createSharedContentDialectNormalizer(content, retiredContentSlots)
  );
  const rows = labels.pos.flatMap((pos) =>
    pos.forms
      .filter((binding) => binding.content_id === content.id)
      .map((binding) => ({
        pos,
        binding,
        group: pos.form_groups.find((group) =>
          group.members.some((member) => member.form_id === binding.id)
        )!
      }))
  );
  const current = contentFromEditor(editor);
  const dirty =
    JSON.stringify(current) !== JSON.stringify(content) ||
    JSON.stringify(labels) !== JSON.stringify(original.current);
  const state = useRef({ dirty, editor, labels });
  state.current = { dirty, editor, labels };
  const confirmed = () => {
    try {
      const local = state.current.labels;
      const next = local.contents.some((row) => row.id === content.id)
        ? replaceSharedContent(
            local,
            contentFromEditor(state.current.editor),
            stableVariantIds,
            pronunciationIds
          )
        : local;
      onConfirm(next);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "内容尚未完成");
      return false;
    }
  };
  const [leavePrompt, setLeavePrompt] = useState(false);
  const pendingLeave = useRef<Promise<boolean> | undefined>(undefined);
  const resolveLeave = useRef<((accepted: boolean) => void) | undefined>(
    undefined
  );
  const finishLeave = (accepted: boolean) => {
    setLeavePrompt(false);
    pendingLeave.current = undefined;
    resolveLeave.current?.(accepted);
    resolveLeave.current = undefined;
  };
  const askLeaveRef = useRef<() => Promise<boolean>>(undefined);
  askLeaveRef.current = () => {
    if (pendingLeave.current) return pendingLeave.current;
    if (!state.current.dirty) {
      onCancel();
      return Promise.resolve(true);
    }
    pendingLeave.current = new Promise<boolean>((resolve) => {
      resolveLeave.current = resolve;
    });
    setLeavePrompt(true);
    return pendingLeave.current;
  };
  useEffect(() => () => resolveLeave.current?.(false), []);
  useEffect(() => {
    registerLeaveGuard?.(() => askLeaveRef.current!());
    return () => registerLeaveGuard?.(undefined);
  }, [registerLeaveGuard]);

  const changeRules = (rules: DialectRulesV3) => {
    const result = normalizeDialect(editor, rules, preference);
    if (!result.ok) {
      setError(
        "英美内容或配置不同，请先统一要保留的拼写、发音及设置，再合并。"
      );
      return;
    }
    try {
      setLabels(
        replaceSharedContent(
          labels,
          contentFromEditor(result.value),
          stableVariantIds,
          pronunciationIds
        )
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "标签配置不能合并");
      return;
    }
    setEditor(result.value);
    setError("");
  };
  const referenceGuard = useV3ReferenceGuard();
  const referenceForms = expandFormContents(labels).pos.flatMap((pos) =>
    pos.forms.filter((form) =>
      rows.some(({ binding }) => binding.id === form.id)
    )
  );
  const removalReason = (id: string) => {
    const row = rows.find(({ binding }) => binding.id === id)!;
    if (referenceGuard.index.status !== "loaded")
      return "请先加载关联信息，再移除标签";
    const projected = expandFormContents(labels)
      .pos.find((pos) => pos.pos_id === row.pos.pos_id)!
      .forms.find((form) => form.id === id)!;
    if (formReferenceCount(referenceGuard.index, projected) > 0)
      return "请先解除这个标签的关联，再移除标签";
    if (row.pos.forms.length <= 1) return "每个词性至少保留一个词形";
    const firstGroup = row.pos.form_groups[0];
    if (
      firstGroup?.id === row.group.id &&
      row.binding.form_type === "base" &&
      firstGroup.members.filter((member) =>
        row.pos.forms.some(
          (form) => form.id === member.form_id && form.form_type === "base"
        )
      ).length <= 1
    )
      return "第 1 组词形变化至少保留一个原形";
    return undefined;
  };
  const removeLabel = (id: string) => {
    const reason = removalReason(id);
    if (reason) {
      setError(reason);
      return;
    }
    const remove = () => {
      const next = structuredClone(labels);
      for (const pos of next.pos) {
        pos.forms = pos.forms.filter((row) => row.id !== id);
        for (const group of pos.form_groups)
          group.members = group.members.filter((row) => row.form_id !== id);
      }
      if (rows.length === 1) {
        next.contents = next.contents.filter((row) => row.id !== content.id);
      }
      setLabels(next);
    };
    modal.confirm({
      title: rows.length === 1 ? "删除这份词形内容？" : "移除这个标签？",
      content:
        rows.length === 1
          ? "这是最后一个标签。确认后标记删除；点击内容弹窗的确认按钮才应用到页面草稿，页面保存时会检查关联影响。"
          : "其余标签继续使用同一份内容。页面保存时会检查这个标签的关联影响。",
      okText: rows.length === 1 ? "删除内容" : "移除标签",
      okButtonProps: { danger: true },
      onOk: remove
    });
  };
  const selectedPos = labels.pos.find((pos) => pos.pos_id === posId);
  const rules = current.dialect_rules;
  const previewSpelling =
    current.regional_variants.mode === "common"
      ? current.regional_variants.common.spelling
      : current.regional_variants.uk.spelling;
  const localIssues = issues
    .filter((issue) =>
      issue.node_location.content_id
        ? issue.node_location.content_id === content.id
        : rows.some(({ binding }) => binding.id === issue.node_location.form_id)
    )
    .map((issue) => {
      const location = issue.node_location;
      const binding = rows.find(
        ({ binding }) => binding.id === location.form_id
      )?.binding;
      const refs = binding?.regional_bindings;
      const variant =
        refs?.mode === "common"
          ? refs.common
          : refs
            ? [refs.uk, refs.us].find((row) => row.id === location.variant_id)
            : undefined;
      const pronunciation = variant?.pronunciations.find(
        (row) => row.id === location.pronunciation_id
      );
      const slots =
        current.regional_variants.mode === "common"
          ? [current.regional_variants.common]
          : [current.regional_variants.uk, current.regional_variants.us];
      const slot = slots.find(
        (row) =>
          row.id === location.content_slot_id ||
          row.pronunciations.some(
            (item) => item.id === location.content_slot_id
          )
      );
      const pronunciationSlot = slot?.pronunciations.find(
        (row) => row.id === location.content_slot_id
      );
      const variantId = slot?.id ?? variant?.content_slot_id;
      const pronunciationId =
        pronunciationSlot?.id ?? pronunciation?.content_slot_id;
      return {
        ...issue,
        node_id: pronunciationId ?? variantId ?? content.id,
        node_location: {
          ...location,
          form_id: content.id,
          variant_id: variantId,
          pronunciation_id: pronunciationId
        }
      };
    });
  return (
    <Modal
      open
      width={1200}
      title={`词形 ${previewSpelling || "未填写"} 内容设置`}
      okText="确认，应用到草稿"
      cancelText="取消"
      onOk={confirmed}
      onCancel={() => void askLeaveRef.current!()}
      mask={{ closable: false }}
      destroyOnHidden
    >
      <Flex vertical gap="middle" className="v3-content-modal">
        <Alert
          type="info"
          showIcon
          title={`本次修改对以下 ${rows.length} 个标签生效`}
          description="确认仅更新页面草稿，点击页面“保存草稿”后才会保存到服务器。"
        />
        <Space wrap>
          {rows.map(({ pos, binding, group }) => (
            <Tag key={binding.id}>
              {partOfSpeechLabel(pos.pos)} · 第{" "}
              {pos.form_groups.indexOf(group) + 1} 组 ·{" "}
              {label(binding.form_type)}{" "}
              <Button
                size="small"
                type="text"
                danger
                disabled={Boolean(removalReason(binding.id))}
                title={removalReason(binding.id)}
                onClick={() => removeLabel(binding.id)}
                aria-label={`移除${partOfSpeechLabel(pos.pos)}${label(binding.form_type)}标签`}
              >
                移除
              </Button>
            </Tag>
          ))}
          <Button
            disabled={rows.length === 0}
            onClick={() => {
              setAssignmentError("");
              setPosId(undefined);
              setGroupId(undefined);
              setFormType(undefined);
              setChoosing(true);
            }}
          >
            指派标签
          </Button>
        </Space>
        {rows.length === 0 ? (
          <Alert
            type="warning"
            title="这份内容已标记删除，确认后应用到页面草稿。"
          />
        ) : (
          <>
            <Space wrap>
              <Typography.Text strong>英美拼写是否有区别？</Typography.Text>
              <Radio.Group
                value={rules.spelling_mode}
                onChange={(event) =>
                  changeRules({
                    spelling_mode: event.target.value,
                    phonetic_mode: "distinguish"
                  })
                }
              >
                <Radio value="distinguish">是</Radio>
                <Radio value="unified">否</Radio>
              </Radio.Group>
              <Typography.Text strong>英美音标是否有区别？</Typography.Text>
              <Radio.Group
                value={rules.phonetic_mode}
                onChange={(event) =>
                  changeRules({ ...rules, phonetic_mode: event.target.value })
                }
              >
                <Radio value="distinguish">是</Radio>
                <Radio
                  value="unified"
                  disabled={rules.spelling_mode === "distinguish"}
                >
                  否
                </Radio>
              </Radio.Group>
            </Space>
            {error && <Alert type="error" showIcon title={error} />}
            <div className="v3-content-editor">
              <V3ConcreteFormRow
                content={editor}
                form={editor.pos[0]!.forms[0]!}
                dialectRules={rules}
                formLabel="词形"
                showRegularity={false}
                referenceForms={referenceForms}
                formTypeDisabled
                formTypeOptions={["base"]}
                membershipCount={1}
                idFactory={newWordNodeId}
                issues={localIssues}
                onChange={setEditor}
              />
            </div>
            <Typography.Text strong>各标签的规则变化</Typography.Text>
            {rows.map(({ pos, binding }) => (
              <Flex key={binding.id} align="center" gap="middle" wrap>
                <span>
                  {partOfSpeechLabel(pos.pos)} · {label(binding.form_type)}
                </span>
                {(binding.regional_bindings.mode === "common"
                  ? [["common", binding.regional_bindings.common] as const]
                  : [
                      ["uk", binding.regional_bindings.uk] as const,
                      ["us", binding.regional_bindings.us] as const
                    ]
                ).map(([side, variant]) => (
                  <Space key={side}>
                    <span>
                      {side === "common"
                        ? "英美通用"
                        : side === "uk"
                          ? "英式"
                          : "美式"}
                    </span>
                    <Radio.Group
                      value={variant.is_regular}
                      onChange={(event) => {
                        const next = structuredClone(labels);
                        const target = next.pos
                          .find((row) => row.pos_id === pos.pos_id)!
                          .forms.find(
                            (row) => row.id === binding.id
                          )!.regional_bindings;
                        if (target.mode === "common")
                          target.common.is_regular = event.target.value;
                        else if (side !== "common")
                          target[side].is_regular = event.target.value;
                        setLabels(next);
                      }}
                    >
                      <Radio value>规则</Radio>
                      <Radio value={false}>不规则</Radio>
                    </Radio.Group>
                  </Space>
                ))}
              </Flex>
            ))}
          </>
        )}
      </Flex>
      <Modal
        open={leavePrompt}
        title="词形内容尚未应用"
        onCancel={() => finishLeave(false)}
        destroyOnHidden
        footer={
          <Space>
            <Button
              danger
              onClick={() => {
                finishLeave(true);
                onCancel();
              }}
            >
              放弃修改
            </Button>
            <Button onClick={() => finishLeave(false)}>继续编辑</Button>
            <Button
              type="primary"
              onClick={() => {
                if (confirmed()) finishLeave(true);
              }}
            >
              应用并离开
            </Button>
          </Space>
        }
      >
        确认后应用到页面草稿；放弃会丢弃本次弹窗修改。
      </Modal>
      <Modal
        open={choosing}
        title="指派词形标签"
        okText="完成"
        cancelText="取消"
        onCancel={() => setChoosing(false)}
        onOk={() => {
          try {
            if (!posId || !groupId || !formType)
              throw new Error("请选择词性、变化组和词形类型");
            setLabels(
              addSharedLabel(
                labels,
                content.id,
                posId,
                groupId,
                formType,
                stableVariantIds
              )
            );
            setChoosing(false);
            setError("");
          } catch (cause) {
            setAssignmentError(
              cause instanceof Error ? cause.message : "无法指派标签"
            );
          }
        }}
      >
        {assignmentError && (
          <Alert type="error" showIcon title={assignmentError} />
        )}
        <Form layout="vertical">
          <Form.Item label="词性">
            <Select
              aria-label="指派词性"
              value={posId}
              options={labels.pos.map((pos) => ({
                value: pos.pos_id,
                label: partOfSpeechLabel(pos.pos)
              }))}
              onChange={(id) => {
                setPosId(id);
                const pos = labels.pos.find((row) => row.pos_id === id)!;
                setGroupId(
                  pos.form_groups.length === 1
                    ? pos.form_groups[0]!.id
                    : undefined
                );
                setFormType(undefined);
              }}
            />
          </Form.Item>
          <Form.Item label="变化组">
            <Select
              aria-label="指派变化组"
              value={groupId}
              options={selectedPos?.form_groups.map((group, index) => ({
                value: group.id,
                label: `第 ${index + 1} 组${group.scope === "dedicated" ? "（专用）" : ""}`
              }))}
              onChange={setGroupId}
            />
          </Form.Item>
          <Form.Item label="词形类型">
            <Select
              aria-label="指派词形类型"
              value={formType}
              options={[
                ...new Set([
                  "base",
                  ...(catalog.find((row) => row.code === selectedPos?.pos)
                    ?.allowed_form_types ?? [])
                ])
              ].map((type) => ({ value: type, label: label(type) }))}
              onChange={setFormType}
            />
          </Form.Item>
        </Form>
      </Modal>
    </Modal>
  );
}
