import { VoiceSaveContext, useVoiceSave } from "../voiceSaveContext";
import { flushSync } from "react-dom";
import { type ContextType, useEffect, useMemo, useRef, useState } from "react";
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
  assignSharedFormContent,
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
  contentReassignmentAvailable = false,
  savedContentIds,
  formId,
  issues,
  stableVariantIds,
  pronunciationReferenceIds,
  retiredContentSlots,
  retiredStableNodes = [],
  registerLeaveGuard,
  onCancel,
  onConfirm,
  onApply
}: {
  forms: SharedFormsStepContentV3;
  contentReassignmentAvailable?: boolean;
  savedContentIds?: ReadonlySet<string>;
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
  onApply?: (forms: SharedFormsStepContentV3) => void;
}) {
  const outerSave = useVoiceSave();
  const outerSaveRef = useRef(outerSave);
  outerSaveRef.current = outerSave;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const original = useRef(forms);
  const [pronunciationIds] = useState(
    () =>
      pronunciationReferenceIds ??
      createPronunciationReferenceIds(forms, retiredStableNodes)
  );
  const content = sharedContentForForm(original.current, formId)!;
  const reassignmentBlockedReason = !contentReassignmentAvailable
    ? "当前服务暂不支持替换词形内容，请更新后重试"
    : savedContentIds && !savedContentIds.has(content.id)
      ? "请先确认当前内容并保存草稿，再指派其他词形"
      : undefined;
  const [editor, setEditor] = useState(() => contentEditorForms(content));
  const [labels, setLabels] = useState(() => structuredClone(forms));
  const [error, setError] = useState("");
  const [choosing, setChoosing] = useState(false);
  const [assignmentError, setAssignmentError] = useState("");
  const [assignment, setAssignment] = useState<SharedFormsStepContentV3>();
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
  const assignmentGroups = useMemo(() => {
    if (!choosing) return [];
    const contents = new Map(labels.contents.map((row) => [row.id, row]));
    return labels.pos.map((pos) => {
      const forms = new Map(pos.forms.map((row) => [row.id, row]));
      return {
        pos,
        groups: pos.form_groups.flatMap((group, groupIndex) => {
          const members = group.members.flatMap((member) => {
            const binding = forms.get(member.form_id);
            return binding ? [binding] : [];
          });
          if (!members.length) return [];
          const totals = new Map<string, number>();
          const seen = new Map<string, number>();
          for (const binding of members)
            totals.set(
              binding.form_type,
              (totals.get(binding.form_type) ?? 0) + 1
            );
          const candidates = members.map((binding) => {
            const ordinal = (seen.get(binding.form_type) ?? 0) + 1;
            seen.set(binding.form_type, ordinal);
            const number =
              totals.get(binding.form_type)! > 1 ? ordinal : undefined;
            const regions = contents.get(binding.content_id)!.regional_variants;
            const spelling =
              [
                ...new Set(
                  regions.mode === "common"
                    ? [regions.common.spelling]
                    : [regions.uk.spelling, regions.us.spelling]
                )
              ]
                .filter(Boolean)
                .join(" / ") || "未填写";
            return { binding, number, spelling, pos, group, groupIndex };
          });
          return [{ group, groupIndex, candidates }];
        })
      };
    });
  }, [choosing, labels]);
  const assignmentCandidates = useMemo(
    () =>
      new Map(
        assignmentGroups.flatMap(({ groups }) =>
          groups.flatMap(({ candidates }) =>
            candidates.map((row) => [row.binding.id, row] as const)
          )
        )
      ),
    [assignmentGroups]
  );
  const assignedForms = useMemo(
    () =>
      new Map(
        choosing && assignment
          ? assignment.pos.flatMap((pos) =>
              pos.forms.map((row) => [row.id, row] as const)
            )
          : []
      ),
    [choosing, assignment]
  );
  const replacements = useMemo(
    () =>
      [...assignedForms.values()].flatMap((binding) => {
        const previous = assignmentCandidates.get(binding.id);
        if (
          !previous ||
          previous.binding.content_id === content.id ||
          binding.content_id !== content.id
        )
          return [];
        return [
          {
            id: binding.id,
            text: `${partOfSpeechLabel(previous.pos.pos)}第 ${previous.groupIndex + 1} 组${label(binding.form_type)}${previous.number ? ` ${previous.number}` : ""}：${previous.spelling}`
          }
        ];
      }),
    [assignedForms, assignmentCandidates, content.id, label]
  );
  const assignmentDirty = replacements.length > 0;
  const closeAssignment = () => {
    setChoosing(false);
    setAssignment(undefined);
    setAssignmentError("");
  };
  const current = contentFromEditor(editor);
  const initialEditor = useRef(JSON.stringify(current));
  const dirty =
    JSON.stringify(current) !== initialEditor.current ||
    JSON.stringify(labels) !== JSON.stringify(original.current) ||
    assignmentDirty;
  const state = useRef({
    dirty,
    editor,
    labels,
    assignment: choosing ? assignment : undefined
  });
  state.current = {
    dirty,
    editor,
    labels,
    assignment: choosing ? assignment : undefined
  };
  const completeForms = () => {
    const local = state.current.assignment ?? state.current.labels;
    return local.contents.some((row) => row.id === content.id)
      ? replaceSharedContent(
          local,
          contentFromEditor(state.current.editor),
          stableVariantIds,
          pronunciationIds
        )
      : local;
  };
  const confirmed = () => {
    if (savingRef.current) return false;
    try {
      onConfirm(completeForms());
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
    if (savingRef.current) return Promise.resolve(false);
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
  const toggleAssignment = (targetId: string, checked: boolean) => {
    if (!assignment) return;
    const originalBinding = assignmentCandidates.get(targetId)!.binding;
    if (originalBinding.content_id === content.id) return;
    try {
      let next: SharedFormsStepContentV3;
      if (checked) {
        if (reassignmentBlockedReason)
          throw new Error(reassignmentBlockedReason);
        next = assignSharedFormContent(
          assignment,
          content.id,
          targetId,
          stableVariantIds,
          pronunciationIds
        );
      } else {
        next = structuredClone(assignment);
        const pos = next.pos.find((row) =>
          row.forms.some((form) => form.id === targetId)
        )!;
        pos.forms[pos.forms.findIndex((row) => row.id === targetId)] =
          structuredClone(originalBinding);
      }
      const used = new Set(
        next.pos.flatMap((row) => row.forms.map((form) => form.content_id))
      );
      next.contents = labels.contents.filter((row) => used.has(row.id));
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
  const saveScope: ContextType<typeof VoiceSaveContext> =
    outerSave && onApply
      ? {
          save: async (area) => {
            if (savingRef.current) return false;
            savingRef.current = true;
            setSaving(true);
            try {
              const next = completeForms();
              flushSync(() => onApply(next));
              const accepted = await outerSaveRef.current!.save(area);
              if (accepted) {
                original.current = next;
                initialEditor.current = JSON.stringify(
                  contentFromEditor(state.current.editor)
                );
                setLabels(next);
              }
              return accepted;
            } finally {
              savingRef.current = false;
              setSaving(false);
            }
          }
        }
      : outerSave;
  const drawer = (
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
        <Flex justify="flex-end" align="center" gap="small" wrap>
          <Space>
            <Button
              disabled={saving}
              onClick={() => void askLeaveRef.current!()}
            >
              取消
            </Button>
            <Button type="primary" disabled={saving} onClick={confirmed}>
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
                    changeRules({
                      ...rules,
                      phonetic_mode: event.target.value
                    })
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
              </Space>
            </div>
          </div>
        )}
        <div className="v3-content-labels">
          <Space>
            <Typography.Text strong>词形标签</Typography.Text>
            <Typography.Text type="secondary">可多选</Typography.Text>
          </Space>
          <Space wrap className="v3-content-label-list">
            {rows.map(({ pos, binding, group }) => {
              const sameType = group.members.flatMap((member) =>
                pos.forms.filter(
                  (row) =>
                    row.id === member.form_id &&
                    row.form_type === binding.form_type
                )
              );
              const number =
                sameType.length > 1 ? sameType.indexOf(binding) + 1 : undefined;
              return (
                <Tag
                  key={binding.id}
                  className="v3-content-label"
                  title={`第 ${pos.form_groups.indexOf(group) + 1} 组`}
                >
                  {partOfSpeechLabel(pos.pos)}
                  {label(binding.form_type)}
                  {number && <sup>{number}</sup>}
                  <Tooltip title={removalReason(binding.id)}>
                    <Button
                      size="small"
                      type="text"
                      icon={<CloseOutlined />}
                      disabled={Boolean(removalReason(binding.id))}
                      onClick={() => removeLabel(binding.id)}
                      aria-label={`移除${partOfSpeechLabel(pos.pos)}${label(binding.form_type)}${number ? ` ${number}` : ""}标签`}
                    />
                  </Tooltip>
                </Tag>
              );
            })}
            <Button
              type="dashed"
              aria-label="新增标签"
              icon={<PlusOutlined />}
              disabled={rows.length === 0}
              onClick={() => {
                setAssignmentError("");
                setAssignment(labels);
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
        zIndex={2100}
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
        {assignmentDirty && (
          <Alert
            type="warning"
            title="以下词形的拼写与发音将被替换"
            description={
              <Flex vertical>
                {replacements.map((row) => (
                  <span key={row.id}>{row.text}</span>
                ))}
              </Flex>
            }
          />
        )}
        {error && <Alert type="error" title={error} />}
      </Modal>
      <Modal
        open={choosing && !leavePrompt}
        title={`为 ${previewSpelling || "未填写"} 这种拼写形式 指派词形标签`}
        className="v3-label-assignment-modal"
        width={640}
        okText={replacements.length > 0 ? "确认替换" : "完成"}
        cancelText="取消"
        destroyOnHidden
        onCancel={closeAssignment}
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
          closeAssignment();
          setError("");
        }}
      >
        <Typography.Paragraph type="secondary">
          选择要共用当前拼写与发音的已有词形，词形数量不变。同组有多个同类型词形时，请按序号和拼写选择。
        </Typography.Paragraph>
        {reassignmentBlockedReason && (
          <Alert type="info" title={reassignmentBlockedReason} />
        )}
        {replacements.length > 0 && (
          <Alert
            type="warning"
            showIcon
            title="以下词形的拼写与发音将被替换"
            description={
              <Flex vertical gap={4}>
                {replacements.map((row) => (
                  <span key={row.id}>{row.text}</span>
                ))}
                <span>
                  确认后共用当前内容，后续修改将同步。已有关联会在保存草稿时检查。
                </span>
              </Flex>
            }
          />
        )}
        {assignmentError && (
          <Alert type="error" showIcon title={assignmentError} />
        )}
        <div className="v3-label-assignment-columns">
          {assignmentGroups.map(({ pos, groups }) => {
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
                {groups.map(({ group, groupIndex, candidates }) => {
                  const selectedTypes = new Set(
                    candidates
                      .filter(
                        ({ binding }) =>
                          assignedForms.get(binding.id)?.content_id ===
                          content.id
                      )
                      .map(({ binding }) => binding.form_type)
                  );
                  return (
                    <div className="v3-label-assignment-group" key={group.id}>
                      {pos.form_groups.length > 1 && (
                        <Typography.Text type="secondary">
                          第 {groupIndex + 1} 组
                          {group.scope === "dedicated" ? "（专用）" : ""}
                        </Typography.Text>
                      )}
                      {candidates.map(
                        ({ binding: candidate, number, spelling }) => {
                          const selected =
                            assignedForms.get(candidate.id)?.content_id ===
                            content.id;
                          const typeLabel = `${label(candidate.form_type)}${number ? ` ${number}（${spelling}）` : ""}`;
                          const duplicate =
                            !selected && selectedTypes.has(candidate.form_type);
                          const blockedReason =
                            candidate.content_id === content.id
                              ? "已共用当前内容；移除请使用外层标签的移除按钮"
                              : duplicate
                                ? "同组已有同类型词形共用这份内容，不能重复指派"
                                : reassignmentBlockedReason;
                          const checkboxLabel = `${partOfSpeechLabel(pos.pos)}${pos.form_groups.length > 1 ? `第 ${groupIndex + 1} 组` : ""}${typeLabel}`;
                          return (
                            <Tooltip key={candidate.id} title={blockedReason}>
                              <span className="v3-label-assignment-option">
                                <Checkbox
                                  aria-label={checkboxLabel}
                                  checked={selected}
                                  disabled={Boolean(blockedReason)}
                                  onChange={(event) =>
                                    toggleAssignment(
                                      candidate.id,
                                      event.target.checked
                                    )
                                  }
                                >
                                  {label(candidate.form_type)}
                                  {number && (
                                    <>
                                      <sup>{number}</sup>（{spelling}）
                                    </>
                                  )}
                                </Checkbox>
                              </span>
                            </Tooltip>
                          );
                        }
                      )}
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
  return (
    <VoiceSaveContext.Provider value={saveScope}>
      {drawer}
    </VoiceSaveContext.Provider>
  );
}
