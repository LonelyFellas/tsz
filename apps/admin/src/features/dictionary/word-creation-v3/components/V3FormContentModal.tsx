import { useEffect, useMemo, useRef, useState } from "react";
import { CloseOutlined, PlusOutlined } from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Drawer,
  Flex,
  Modal,
  Radio,
  Space,
  Tag,
  Tooltip,
  Typography
} from "antd";
import type {
  DialectRulesV3,
  RetiredContentSlotV3,
  RetiredStableNodeV3,
  SharedFormsStepContentV3,
  V3DraftValidationIssue,
  WordConcreteFormV3
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
import { formNodeIds, formReferenceCount } from "../referenceGuard";
import { V3ReferenceBadge } from "./V3ReferenceBadge";
import { expandFormContents } from "@tsz/shared";

export function V3FormContentModal({
  forms,
  formId,
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
  const [assignment, setAssignment] = useState<SharedFormsStepContentV3>();
  const [separateRegularity, setSeparateRegularity] = useState(false);
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
  const initialEditor = useRef(JSON.stringify(current));
  const dirty =
    JSON.stringify(current) !== initialEditor.current ||
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
  const expandedLabels = useMemo(
    () =>
      new Map(
        expandFormContents(labels).pos.flatMap((pos) =>
          pos.forms.map((form) => [form.id, form] as const)
        )
      ),
    [labels]
  );
  const expandedAssignment = useMemo(
    () =>
      assignment
        ? new Map(
            expandFormContents(assignment).pos.flatMap((pos) =>
              pos.forms.map((form) => [form.id, form] as const)
            )
          )
        : expandedLabels,
    [assignment, expandedLabels]
  );
  const referenceForms = rows.map(({ binding }) =>
    expandedLabels.get(binding.id)!
  );
  const removalReason = (
    id: string,
    source = labels,
    expanded: ReadonlyMap<string, WordConcreteFormV3> = expandedLabels
  ) => {
    const pos = source.pos.find((pos) =>
      pos.forms.some((form) => form.id === id)
    )!;
    const binding = pos.forms.find((form) => form.id === id)!;
    if (referenceGuard.index.status !== "loaded")
      return "请先加载关联信息，再移除标签";
    const projected = expanded.get(id)!;
    if (formReferenceCount(referenceGuard.index, projected) > 0)
      return "请先解除这个标签的关联，再移除标签";
    if (pos.forms.length <= 1) return "每个词性至少保留一个词形";
    const firstGroup = pos.form_groups[0];
    if (
      firstGroup?.members.some((member) => member.form_id === id) &&
      binding.form_type === "base" &&
      firstGroup.members.filter((member) =>
        pos.forms.some(
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
          ? "这是最后一个标签。确认后标记删除；点击抽屉的确认按钮才应用到页面草稿，页面保存时会检查关联影响。"
          : "其余标签继续使用同一份内容。页面保存时会检查这个标签的关联影响。",
      okText: rows.length === 1 ? "删除内容" : "移除标签",
      okButtonProps: { danger: true },
      onOk: remove
    });
  };
  const toggleAssignment = (
    posId: string,
    groupId: string,
    formType: string,
    checked: boolean
  ) => {
    if (!assignment) return;
    try {
      let next = structuredClone(assignment);
      const pos = next.pos.find((row) => row.pos_id === posId)!;
      const group = pos.form_groups.find((row) => row.id === groupId)!;
      const bindings = pos.forms.filter(
        (binding) =>
          binding.content_id === content.id &&
          binding.form_type === formType &&
          group.members.some((member) => member.form_id === binding.id)
      );
      if (checked) {
        const previousPos = labels.pos.find((row) => row.pos_id === posId)!;
        const previousGroup = previousPos.form_groups.find(
          (row) => row.id === groupId
        )!;
        const previous = previousPos.forms.filter(
          (binding) =>
            binding.content_id === content.id &&
            binding.form_type === formType &&
            previousGroup.members.some(
              (member) => member.form_id === binding.id
            )
        );
        if (previous.length > 0) {
          for (const binding of previous) {
            const originalIndex = previousPos.forms.indexOf(binding);
            const following = new Set(
              previousPos.forms.slice(originalIndex + 1).map((row) => row.id)
            );
            const insertAt = pos.forms.findIndex((row) =>
              following.has(row.id)
            );
            pos.forms.splice(
              insertAt < 0 ? pos.forms.length : insertAt,
              0,
              structuredClone(binding)
            );
          }
          for (const member of previousGroup.members.filter((member) =>
            previous.some((binding) => binding.id === member.form_id)
          )) {
            const originalIndex = previousGroup.members.indexOf(member);
            const following = new Set(
              previousGroup.members
                .slice(originalIndex + 1)
                .map((row) => row.id)
            );
            const insertAt = group.members.findIndex((row) =>
              following.has(row.id)
            );
            group.members.splice(
              insertAt < 0 ? group.members.length : insertAt,
              0,
              structuredClone(member)
            );
          }
        } else {
          next = addSharedLabel(
            next,
            content.id,
            posId,
            groupId,
            formType,
            stableVariantIds
          );
          const added = next.pos
            .find((row) => row.pos_id === posId)!
            .forms.at(-1)!;
          const source = (rows.find(({ binding }) => binding.id === formId) ??
            rows[0])!.binding.regional_bindings;
          const regions = added.regional_bindings;
          if (regions.mode === "common") {
            regions.common.is_regular =
              regularity ??
              (source.mode === "common"
                ? source.common.is_regular
                : source.uk.is_regular);
          } else {
            regions.uk.is_regular =
              regularity ??
              (source.mode === "common"
                ? source.common.is_regular
                : source.uk.is_regular);
            regions.us.is_regular =
              regularity ??
              (source.mode === "common"
                ? source.common.is_regular
                : source.us.is_regular);
          }
        }
      } else {
        for (const binding of bindings) {
          const reason = removalReason(binding.id, next, expandedAssignment);
          if (reason) throw new Error(reason);
          pos.forms = pos.forms.filter((row) => row.id !== binding.id);
          group.members = group.members.filter(
            (member) => member.form_id !== binding.id
          );
        }
      }
      setAssignment(next);
      setAssignmentError("");
    } catch (cause) {
      setAssignmentError(
        cause instanceof Error ? cause.message : "无法指派标签"
      );
    }
  };
  const rules = current.dialect_rules;
  const regularities = rows.flatMap(({ binding }) =>
    binding.regional_bindings.mode === "common"
      ? [binding.regional_bindings.common.is_regular]
      : [
          binding.regional_bindings.uk.is_regular,
          binding.regional_bindings.us.is_regular
        ]
  );
  const regularity = regularities.every((value) => value === regularities[0])
    ? regularities[0]
    : undefined;
  const changeRegularity = (value: boolean) => {
    const next = structuredClone(labels);
    for (const pos of next.pos)
      for (const binding of pos.forms) {
        if (binding.content_id !== content.id) continue;
        const regions = binding.regional_bindings;
        if (regions.mode === "common") regions.common.is_regular = value;
        else {
          regions.uk.is_regular = value;
          regions.us.is_regular = value;
        }
      }
    setLabels(next);
  };
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
    <Drawer
      open
      placement="right"
      size="min(1200px, 100vw)"
      rootClassName="v3-content-drawer"
      title={`词形 ${previewSpelling || "未填写"} 内容设置`}
      onClose={() => void askLeaveRef.current!()}
      mask={{ closable: false }}
      destroyOnHidden
      footer={
        <Flex justify="space-between" align="center" gap="small" wrap>
          <Typography.Text type="secondary">
            确认后应用到页面，保存草稿后同步到服务器
          </Typography.Text>
          <Space>
            <Button onClick={() => void askLeaveRef.current!()}>取消</Button>
            <Button type="primary" onClick={confirmed}>
              确认，应用到草稿
            </Button>
          </Space>
        </Flex>
      }
    >
      <div className="v3-content-modal">
        {rows.length > 0 && (
          <div className="v3-content-rules">
            <div className="v3-content-rule-row">
              <Typography.Text strong>英美拼写是否有区别？</Typography.Text>
              <Radio.Group
                aria-label="英美拼写是否有区别"
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
            </div>
            <div className="v3-content-rule-row">
              <Typography.Text strong>英美音标是否有区别？</Typography.Text>
              <Space wrap>
                <V3ReferenceBadge
                  nodeIds={referenceForms.flatMap(formNodeIds)}
                  label="词形发音"
                />
                <Radio.Group
                  aria-label="英美音标是否有区别"
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
            </div>
            <div className="v3-content-rule-row">
              <Typography.Text strong>是否规则变化？</Typography.Text>
              <Space wrap>
                {regularity === undefined && (
                  <Typography.Text type="secondary">
                    各标签设置不同
                  </Typography.Text>
                )}
                <Radio.Group
                  aria-label="是否规则变化"
                  value={regularity ?? null}
                  onChange={(event) => changeRegularity(event.target.value)}
                >
                  <Radio value>是</Radio>
                  <Radio value={false}>否</Radio>
                </Radio.Group>
                <Button
                  type="link"
                  size="small"
                  aria-label="分别设置规则变化"
                  aria-expanded={separateRegularity}
                  onClick={() => setSeparateRegularity((value) => !value)}
                >
                  分别设置
                </Button>
              </Space>
            </div>
            {separateRegularity && (
              <div className="v3-content-regularity-details">
                {rows.map(({ pos, binding, group }) => (
                  <div key={binding.id} className="v3-content-regularity-item">
                    <Typography.Text>
                      {partOfSpeechLabel(pos.pos)} · 第{" "}
                      {pos.form_groups.indexOf(group) + 1} 组 ·{" "}
                      {label(binding.form_type)}
                    </Typography.Text>
                    <Space wrap>
                      {(binding.regional_bindings.mode === "common"
                        ? [
                            [
                              "common",
                              binding.regional_bindings.common
                            ] as const
                          ]
                        : [
                            ["uk", binding.regional_bindings.uk] as const,
                            ["us", binding.regional_bindings.us] as const
                          ]
                      ).map(([side, variant]) => {
                        const sideLabel =
                          side === "common"
                            ? "英美通用"
                            : side === "uk"
                              ? "英式"
                              : "美式";
                        return (
                          <Space key={side}>
                            <Typography.Text type="secondary">
                              {sideLabel}
                            </Typography.Text>
                            <Radio.Group
                              aria-label={`${partOfSpeechLabel(pos.pos)}第 ${pos.form_groups.indexOf(group) + 1} 组${label(binding.form_type)}${sideLabel}是否规则变化`}
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
                              <Radio value>是</Radio>
                              <Radio value={false}>否</Radio>
                            </Radio.Group>
                          </Space>
                        );
                      })}
                    </Space>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="v3-content-labels">
          <Space>
            <Typography.Text strong>词形标签</Typography.Text>
            <Typography.Text type="secondary">可多选</Typography.Text>
          </Space>
          <Space wrap className="v3-content-label-list">
            {rows.map(({ pos, binding, group }) => (
              <Tag
                key={binding.id}
                className="v3-content-label"
                title={`第 ${pos.form_groups.indexOf(group) + 1} 组`}
              >
                {partOfSpeechLabel(pos.pos)}
                {label(binding.form_type)}
                <Tooltip title={removalReason(binding.id)}>
                  <Button
                    size="small"
                    type="text"
                    icon={<CloseOutlined />}
                    disabled={Boolean(removalReason(binding.id))}
                    onClick={() => removeLabel(binding.id)}
                    aria-label={`移除${partOfSpeechLabel(pos.pos)}${label(binding.form_type)}标签`}
                  />
                </Tooltip>
              </Tag>
            ))}
            <Button
              type="dashed"
              aria-label="新增标签"
              icon={<PlusOutlined />}
              disabled={rows.length === 0}
              onClick={() => {
                setAssignmentError("");
                setAssignment(structuredClone(labels));
                setChoosing(true);
              }}
            >
              新增标签
            </Button>
          </Space>
        </div>
        {rows.length === 0 ? (
          <Alert
            type="warning"
            title="这份内容已标记删除，确认后应用到页面草稿。"
          />
        ) : (
          <>
            {error && <Alert type="error" showIcon title={error} />}
            <div className="v3-content-editor">
              <V3ConcreteFormRow
                content={editor}
                form={editor.pos[0]!.forms[0]!}
                dialectRules={rules}
                formLabel="词形"
                showRegularity={false}
                presentation="content"
                referenceForms={referenceForms}
                formTypeDisabled
                formTypeOptions={["base"]}
                membershipCount={1}
                idFactory={newWordNodeId}
                issues={localIssues}
                onChange={setEditor}
              />
            </div>
          </>
        )}
      </div>
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
        确认后应用到页面草稿；放弃会丢弃本次抽屉修改。
      </Modal>
      <Modal
        open={choosing}
        title={`为 ${previewSpelling || "未填写"} 这种拼写形式 指派词形标签`}
        className="v3-label-assignment-modal"
        width={640}
        okText="完成"
        cancelText="取消"
        destroyOnHidden
        onCancel={() => setChoosing(false)}
        onOk={() => {
          if (!assignment) return;
          if (
            !assignment.pos.some((pos) =>
              pos.forms.some((binding) => binding.content_id === content.id)
            )
          ) {
            setAssignmentError(
              "请至少保留一个词形标签；删除内容请在抽屉中操作。"
            );
            return;
          }
          setLabels(assignment);
          setChoosing(false);
          setError("");
        }}
      >
        <Typography.Paragraph type="secondary">
          选择这种拼写形式可以充当的词形。多个标签将复用同一份拼写与发音。
        </Typography.Paragraph>
        {assignmentError && (
          <Alert type="error" showIcon title={assignmentError} />
        )}
        <div className="v3-label-assignment-columns">
          {assignment?.pos.map((pos) => {
            const existingPos = labels.pos.find(
              (row) => row.pos_id === pos.pos_id
            )!;
            const groups = existingPos.form_groups.filter(
              (group) => group.members.length > 0
            );
            if (groups.length === 0) return null;
            return (
              <section
                key={pos.pos_id}
                aria-label={`${partOfSpeechLabel(pos.pos)}词形标签`}
                className="v3-label-assignment-column"
              >
                <Typography.Title level={5}>
                  {partOfSpeechLabel(pos.pos)}
                </Typography.Title>
                {groups.map((group) => {
                  const groupIndex = existingPos.form_groups.indexOf(group);
                  const selectedGroup = pos.form_groups.find(
                    (row) => row.id === group.id
                  )!;
                  const types = [
                    ...new Set(
                      group.members.flatMap((member) => {
                        const binding = existingPos.forms.find(
                          (binding) => binding.id === member.form_id
                        );
                        return binding ? [binding.form_type] : [];
                      })
                    )
                  ];
                  return (
                    <div className="v3-label-assignment-group" key={group.id}>
                      {pos.form_groups.length > 1 && (
                        <Typography.Text type="secondary">
                          第 {groupIndex + 1} 组
                          {group.scope === "dedicated" ? "（专用）" : ""}
                        </Typography.Text>
                      )}
                      {types.map((type) => {
                        const bindings = pos.forms.filter(
                          (binding) =>
                            binding.content_id === content.id &&
                            binding.form_type === type &&
                            selectedGroup.members.some(
                              (member) => member.form_id === binding.id
                            )
                        );
                        const blockedReason = bindings
                          .map((binding) =>
                            removalReason(
                              binding.id,
                              assignment,
                              expandedAssignment
                            )
                          )
                          .find(Boolean);
                        const checkboxLabel = `${partOfSpeechLabel(pos.pos)}${pos.form_groups.length > 1 ? `第 ${groupIndex + 1} 组` : ""}${label(type)}`;
                        return (
                          <Tooltip key={type} title={blockedReason}>
                            <span className="v3-label-assignment-option">
                              <Checkbox
                                aria-label={checkboxLabel}
                                checked={bindings.length > 0}
                                disabled={Boolean(blockedReason)}
                                onChange={(event) =>
                                  toggleAssignment(
                                    pos.pos_id,
                                    group.id,
                                    type,
                                    event.target.checked
                                  )
                                }
                              >
                                {label(type)}
                              </Checkbox>
                            </span>
                          </Tooltip>
                        );
                      })}
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </Modal>
    </Drawer>
  );
}
