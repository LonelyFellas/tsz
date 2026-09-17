import { useRemovedFormTypes } from "../formDisplayState";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import {
  CaretDownFilled,
  CaretUpFilled,
  DeleteOutlined,
  DownCircleOutlined,
  DownOutlined,
  EllipsisOutlined,
  MinusCircleOutlined,
  PlusCircleOutlined,
  UpCircleOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Flex,
  Popconfirm,
  Popover,
  Radio,
  Tag,
  Typography
} from "antd";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue,
  WordFormTypeV3,
  WordFormGroupV3,
  WordPosFormsV3
} from "@tsz/types";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  addConcreteForm,
  addConcreteFormAfterMembership,
  deleteConcreteForm,
  reorderMemberships,
  type V3IdFactory
} from "../operations";
import { newWordNodeId } from "../../word-model/primitives";
import {
  V3ConcreteFormRow,
  V3DialectSeparatedFormMatrix,
  type V3DialectSeparatedFormRow
} from "./V3ConcreteFormRow";
import { V3DisabledReason } from "./V3DisabledReason";
import { V3ReferenceBadge } from "./V3ReferenceBadge";
import { formNodeIds, formReferenceCount } from "../referenceGuard";
import {
  referenceBlockedHint,
  useV3ReferenceGuard
} from "../referenceGuardContext";

const BASE_REQUIRED_HINT = "每组词形变化至少保留一个原形";

export interface V3FormGroupCardProps {
  content: DraftFormsStepContentV3;
  group: WordFormGroupV3;
  groupCount?: number;
  groupIndex: number;
  pos: WordPosFormsV3;
  issues: readonly V3DraftValidationIssue[];
  membershipCounts: ReadonlyMap<string, number>;
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  onDelete?: () => void;
  deleteDisabled?: boolean;
  /** 本组词形被引用的处数；大于 0 时删组不可点（会连带删掉被引用的词形）。 */
  deleteBlockedByReferences?: number;
  onMove?: (offset: -1 | 1) => void;
  posCatalog?: PartOfSpeechCatalogItem;
  dialectControl?: ReactNode;
  senseScope?: ReactNode;
  onEditSenses?: () => void;
  editingSenses?: boolean;
  onCloseSenses?: () => void;
  /** 词义步里绑定到本组的词义数；只做提示，不在本地清除绑定。 */
  boundSenseCount?: number;
}

export function V3FormGroupCard({
  content: savedContent,
  group: savedGroup,
  groupCount = 1,
  groupIndex,
  pos: savedPos,
  issues,
  membershipCounts,
  idFactory,
  onChange: onSavedChange,
  onDelete,
  deleteDisabled = false,
  deleteBlockedByReferences = 0,
  onMove,
  posCatalog,
  dialectControl,
  senseScope,
  onEditSenses,
  editingSenses = false,
  onCloseSenses,
  boundSenseCount = 0
}: V3FormGroupCardProps) {
  const [removedTypes, setRemovedTypes] = useRemovedFormTypes(savedGroup.id);
  const [displayOrder, setDisplayOrder] = useState<string[]>([]);
  // 缺少的变化类型只用于展示，编辑后才进入草稿。
  const { content, pos, group, placeholders } = useMemo(() => {
    let content = structuredClone(savedContent);
    const existingTypes = new Set(
      savedGroup.members.map(
        (member) =>
          savedPos.forms.find((form) => form.id === member.form_id)?.form_type
      )
    );
    const placeholders = new Map<string, string>();
    for (const formType of posCatalog?.allowed_form_types ?? []) {
      if (existingTypes.has(formType) || removedTypes.includes(formType))
        continue;
      const result = addConcreteForm(
        content,
        savedPos.pos_id,
        savedGroup.id,
        formType,
        newWordNodeId
      );
      if (!result.ok) continue;
      content = result.value;
      const form = content.pos
        .find((item) => item.pos_id === savedPos.pos_id)!
        .forms.at(-1)!;
      placeholders.set(form.id, JSON.stringify(form));
      existingTypes.add(formType);
    }
    const pos = content.pos.find((item) => item.pos_id === savedPos.pos_id)!;
    const group =
      pos.form_groups.find((item) => item.id === savedGroup.id) ??
      structuredClone(savedGroup);
    const orderKey = (formId: string) =>
      placeholders.has(formId)
        ? `empty:${pos.forms.find((form) => form.id === formId)!.form_type}`
        : formId;
    const rank = (formId: string) => {
      const index = displayOrder.indexOf(orderKey(formId));
      return index < 0 ? displayOrder.length : index;
    };
    group.members.sort((a, b) => rank(a.form_id) - rank(b.form_id));
    return { content, pos, group, placeholders };
  }, [
    savedContent,
    savedPos,
    savedGroup,
    posCatalog,
    removedTypes,
    displayOrder
  ]);
  const onChange = (
    next: DraftFormsStepContentV3,
    retainedIds: string[] = []
  ) => {
    const cleaned = structuredClone(next);
    const nextPos = cleaned.pos.find((item) => item.pos_id === pos.pos_id)!;
    const untouched = new Set(
      nextPos.forms
        .filter(
          (form) =>
            !retainedIds.includes(form.id) &&
            placeholders.get(form.id) === JSON.stringify(form)
        )
        .map((form) => form.id)
    );
    setDisplayOrder(
      (
        nextPos.form_groups.find((item) => item.id === savedGroup.id)
          ?.members ?? []
      ).map((member) =>
        untouched.has(member.form_id)
          ? `empty:${nextPos.forms.find((form) => form.id === member.form_id)!.form_type}`
          : member.form_id
      )
    );
    nextPos.forms = nextPos.forms.filter((form) => !untouched.has(form.id));
    for (const nextGroup of nextPos.form_groups) {
      nextGroup.members = nextGroup.members.filter(
        (member) => !untouched.has(member.form_id)
      );
    }
    const nextGroup = nextPos.form_groups.find(
      (item) => item.id === savedGroup.id
    );
    const removed = savedGroup.members
      .filter(
        (member) => !nextGroup?.members.some((item) => item.id === member.id)
      )
      .map(
        (member) =>
          savedPos.forms.find((form) => form.id === member.form_id)!.form_type
      );
    if (removed.length)
      setRemovedTypes((types) => [...new Set([...types, ...removed])]);
    onSavedChange(cleaned);
  };
  const formTypeLabel = useFormTypeLabel();
  const [blockedFormId, setBlockedFormId] = useState<string>();
  const [collapsed, setCollapsed] = useState(false);
  const orderedIds = group.members.map((member) => member.id);
  const formTypeOptions = posCatalog
    ? (["base", ...(posCatalog.allowed_form_types ?? [])] as WordFormTypeV3[])
    : [];
  const baseMembersOf = (candidate: WordFormGroupV3) =>
    candidate.members.filter(
      (member) =>
        pos.forms.find((item) => item.id === member.form_id)?.form_type ===
        "base"
    );
  // 改类型和删词形动的是 form 本身，所有引用它的组都会受影响，所以按最严的组算：
  // 只要它在任一所属组里是唯一原形就锁。
  const referenceGuard = useV3ReferenceGuard();
  const lockedBaseFormIds = new Set(
    pos.form_groups.flatMap((candidate) => {
      const baseMembers = baseMembersOf(candidate);
      return baseMembers.length === 1 ? [baseMembers[0]!.form_id] : [];
    })
  );
  // 「从本组移除」只摘掉当前组的一条 membership，其他组不受影响，所以只看本组：
  // 本组还有别的原形就照常放行，跨组共享与否都不影响这一判断。
  const soleBaseMembershipId = (() => {
    const baseMembers = baseMembersOf(group);
    return baseMembers.length === 1 ? baseMembers[0]!.id : undefined;
  })();
  // 确认框开着时本组另一个原形可能被改成派生类型，待删词形就成了唯一原形，不能再删，直接收起；
  // 引用数据晚到、发现待删词形被引用时同理（受控的 open 不受 Popconfirm disabled 约束）。
  const blockedForm =
    blockedFormId === undefined
      ? undefined
      : pos.forms.find((item) => item.id === blockedFormId);
  if (
    blockedForm &&
    (lockedBaseFormIds.has(blockedForm.id) ||
      formReferenceCount(referenceGuard.index, blockedForm) > 0)
  )
    setBlockedFormId(undefined);
  const setRegular = (isRegular: boolean) => {
    const next = structuredClone(content);
    const nextPos = next.pos.find((item) => item.pos_id === pos.pos_id);
    const nextGroup = nextPos?.form_groups.find((item) => item.id === group.id);
    if (!nextGroup) return;
    nextGroup.is_regular = isRegular;
    onChange(next);
  };

  const formRow = (
    member: WordFormGroupV3["members"][number],
    index: number,
    form: WordPosFormsV3["forms"][number]
  ): V3DialectSeparatedFormRow => {
    const sameTypeMembers = group.members.filter((candidate) => {
      const candidateForm = pos.forms.find(
        (item) => item.id === candidate.form_id
      );
      return candidateForm?.form_type === form.form_type;
    });
    const sameTypeIndex = group.members
      .slice(0, index + 1)
      .filter((candidate) => {
        const candidateForm = pos.forms.find(
          (item) => item.id === candidate.form_id
        );
        return candidateForm?.form_type === form.form_type;
      }).length;
    const lockedBase = lockedBaseFormIds.has(form.id);
    // 词形或它的变体被别处引用：删词形、改类型都会让引用失效，保存必被拒。
    const formReferences = formReferenceCount(referenceGuard.index, form);
    const referenceHint =
      formReferences > 0 ? referenceBlockedHint(formReferences) : undefined;
    const baseLabel = formTypeLabel(form.form_type);
    const formMembershipCount = membershipCounts.get(form.id) ?? 0;
    const lastRequiredForm =
      !placeholders.has(form.id) &&
      savedPos.forms.length === 1 &&
      formMembershipCount <= 1;
    const formLabel =
      sameTypeMembers.length > 1 ? `${baseLabel} ${sameTypeIndex}` : baseLabel;
    const formPositionLabel = `${baseLabel} ${sameTypeIndex}`;
    const deleteLocked =
      lastRequiredForm ||
      member.id === soleBaseMembershipId ||
      formReferences > 0;
    const deleteReason =
      referenceHint ??
      (lastRequiredForm
        ? "每个词性至少保留一个词形"
        : member.id === soleBaseMembershipId
          ? BASE_REQUIRED_HINT
          : undefined);

    return {
      membershipId: member.id,
      form,
      formLabel,
      formTypeAriaLabel: `变化组 ${groupIndex + 1} 词形 ${index + 1} 类型`,
      formTypeDisabled: !posCatalog || lockedBase || formReferences > 0,
      formTypeDisabledReason:
        referenceHint ?? (lockedBase ? BASE_REQUIRED_HINT : undefined),
      formTypeOptions,
      membershipCount: formMembershipCount,
      referenceBadge: (
        <V3ReferenceBadge label={formLabel} nodeIds={formNodeIds(form)} />
      ),
      actions: (
        <div className="v3-membership-actions">
          <Button
            aria-label={`上移变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
            disabled={index === 0}
            icon={<UpCircleOutlined />}
            onClick={() => {
              const nextOrder = [...orderedIds];
              [nextOrder[index - 1], nextOrder[index]] = [
                nextOrder[index]!,
                nextOrder[index - 1]!
              ];
              onChange(reorderMemberships(content, group.id, nextOrder));
            }}
            size="small"
            type="text"
          />
          <Button
            aria-label={`下移变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
            disabled={index === group.members.length - 1}
            icon={<DownCircleOutlined />}
            onClick={() => {
              const nextOrder = [...orderedIds];
              [nextOrder[index], nextOrder[index + 1]] = [
                nextOrder[index + 1]!,
                nextOrder[index]!
              ];
              onChange(reorderMemberships(content, group.id, nextOrder));
            }}
            size="small"
            type="text"
          />
          <Button
            aria-label={`在${formPositionLabel} 下方添加同类型词形`}
            icon={<PlusCircleOutlined />}
            onClick={() => {
              const result = addConcreteFormAfterMembership(
                content,
                pos.pos_id,
                group.id,
                member.id,
                idFactory
              );
              if (result.ok) onChange(result.value, [form.id]);
            }}
            size="small"
            type="text"
          />
          {/* 一个词形只属于一个组，「从本组移除」就是删除词形，统一走删除确认；占位行直接收起不用确认。 */}
          <V3DisabledReason reason={deleteReason}>
            <Popconfirm
              cancelButtonProps={{ "aria-label": "取消删除词形并保留" }}
              cancelText="取消"
              description="词形的拼写与发音会一并删除。"
              disabled={deleteLocked || placeholders.has(form.id)}
              okButtonProps={{
                "aria-label": "删除词形及相关发音",
                danger: true
              }}
              okText="删除词形"
              onConfirm={() => {
                const result = deleteConcreteForm(content, pos.pos_id, form.id);
                if (result.ok) onChange(result.value);
              }}
              onOpenChange={(open) =>
                setBlockedFormId(open ? form.id : undefined)
              }
              open={blockedFormId === form.id}
              title="确认删除此词形？"
            >
              <Button
                aria-label={`删除变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
                danger
                disabled={deleteLocked}
                icon={<MinusCircleOutlined />}
                onClick={() => {
                  if (placeholders.has(form.id))
                    setRemovedTypes((types) => [...types, form.form_type]);
                }}
                size="small"
                type="text"
              />
            </Popconfirm>
          </V3DisabledReason>
        </div>
      )
    };
  };

  const useSeparatedMatrix =
    group.dialect_rules.spelling_mode === "distinguish" &&
    group.members.length > 0 &&
    group.members.every((member) => {
      const form = pos.forms.find((item) => item.id === member.form_id);
      return form?.regional_variants.mode === "uk_us";
    });
  const separatedRows = useSeparatedMatrix
    ? group.members.map((member, index) =>
        formRow(
          member,
          index,
          pos.forms.find((item) => item.id === member.form_id)!
        )
      )
    : undefined;

  const bodyId = `v3-form-group-${group.id}-body`;

  return (
    <Card
      className="v3-form-group-card word-form-card word-form-group-card"
      data-group-id={group.id}
      data-v3-node-id={group.id}
      size="small"
      title={
        <span className="v3-form-group-heading">
          <span>{`第 ${groupIndex + 1} 组 词形变化`}</span>
          {group.scope === "dedicated" ? <Tag color="blue">专用</Tag> : null}
          {collapsed && group.scope === "dedicated" ? (
            <span className="v3-form-group-status">
              {boundSenseCount} 个词义
            </span>
          ) : null}
        </span>
      }
      extra={
        <Flex
          align="center"
          gap="small"
          wrap
          className="v3-form-group-scope"
          data-v3-field="scope"
          data-v3-node-id={group.id}
          tabIndex={-1}
        >
          {onEditSenses ? (
            <Popover
              trigger="click"
              placement="bottomRight"
              open={editingSenses}
              onOpenChange={(open) =>
                open ? onEditSenses() : onCloseSenses?.()
              }
              destroyOnHidden
              fresh
              content={editingSenses ? senseScope : <span />}
            >
              <Button
                ghost
                size="small"
                aria-label={`第 ${groupIndex + 1} 组专用词义`}
                aria-expanded={editingSenses}
              >
                专用词义
              </Button>
            </Popover>
          ) : null}
          <Button
            type="text"
            size="small"
            className="v3-form-group-menu word-form-card-toggle-state"
            aria-label={`${collapsed ? "展开" : "收起"}第 ${groupIndex + 1} 组词形变化`}
            aria-controls={senseScope ? `${bodyId} ${bodyId}-senses` : bodyId}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? "展开" : "收起"}
            {collapsed ? <CaretDownFilled /> : <CaretUpFilled />}
          </Button>
          {onDelete ? (
            <Dropdown
              menu={{
                items: [
                  {
                    key: "move-up",
                    icon: <UpOutlined />,
                    label: "上移本组",
                    disabled: groupIndex === 0 || !onMove
                  },
                  {
                    key: "move-down",
                    icon: <DownOutlined />,
                    label: "下移本组",
                    disabled: groupIndex === groupCount - 1 || !onMove
                  },
                  { type: "divider" },
                  {
                    key: "delete",
                    icon: <DeleteOutlined />,
                    label:
                      deleteBlockedByReferences > 0
                        ? "本组词形被引用，不能删除"
                        : deleteDisabled
                          ? "至少保留一个词形"
                          : "删除本组",
                    danger: true,
                    disabled:
                      deleteDisabled ||
                      deleteBlockedByReferences > 0 ||
                      !onDelete
                  }
                ],
                onClick: ({ key }) => {
                  if (key === "move-up") onMove?.(-1);
                  if (key === "move-down") onMove?.(1);
                  if (key === "delete") onDelete?.();
                }
              }}
              placement="bottomRight"
              trigger={["click"]}
            >
              <Button
                aria-label={`管理第 ${groupIndex + 1} 组词形变化`}
                className="v3-form-group-menu"
                icon={<EllipsisOutlined />}
                type="text"
              />
            </Dropdown>
          ) : null}
        </Flex>
      }
    >
      {senseScope && !editingSenses ? (
        <div id={`${bodyId}-senses`} hidden={collapsed}>
          {senseScope}
        </div>
      ) : null}
      {!collapsed ? (
        <Flex id={bodyId} vertical>
          <div className="word-form-rules">
            <div className="word-form-rule-row">
              <Typography.Text strong>词形是否规则变化？</Typography.Text>
              <Radio.Group
                onChange={(event) => setRegular(event.target.value)}
                value={group.is_regular}
              >
                <Radio value>是</Radio>
                <Radio value={false}>否</Radio>
              </Radio.Group>
            </div>
            {dialectControl}
          </div>
          {group.members.length === 0 ? (
            <Empty
              description="草稿可暂时保留空变化组"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : null}
          {separatedRows ? (
            <V3DialectSeparatedFormMatrix
              content={content}
              dialectRules={group.dialect_rules}
              idFactory={idFactory}
              issues={issues}
              onChange={onChange}
              rows={separatedRows}
            />
          ) : (
            group.members.map((member, index) => {
              const form = pos.forms.find((item) => item.id === member.form_id);
              if (!form) {
                return (
                  <Alert
                    key={member.id}
                    title="该变化组引用的词形不存在，已停止编辑。"
                    type="error"
                  />
                );
              }
              const row = formRow(member, index, form);
              const previousMember = group.members[index - 1];
              const previousForm = previousMember
                ? pos.forms.find((item) => item.id === previousMember.form_id)
                : undefined;
              return (
                <div
                  className="v3-membership-row"
                  data-form-id={form.id}
                  data-v3-field="form_id"
                  data-v3-node-id={member.id}
                  key={member.id}
                  tabIndex={-1}
                >
                  <V3ConcreteFormRow
                    actions={row.actions}
                    content={content}
                    dialectRules={group.dialect_rules}
                    form={form}
                    formLabel={row.formLabel}
                    formTypeAriaLabel={row.formTypeAriaLabel}
                    formTypeDisabled={row.formTypeDisabled}
                    formTypeDisabledReason={row.formTypeDisabledReason}
                    formTypeOptions={row.formTypeOptions}
                    idFactory={idFactory}
                    issues={issues}
                    lastRow={index === group.members.length - 1}
                    membershipCount={row.membershipCount}
                    onChange={onChange}
                    referenceBadge={row.referenceBadge}
                    showMatrixHeader={
                      index === 0 ||
                      previousForm?.regional_variants.mode !==
                        form.regional_variants.mode
                    }
                  />
                </div>
              );
            })
          )}
        </Flex>
      ) : null}
    </Card>
  );
}
