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
  Popover
} from "antd";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue,
  WordFormTypeV3,
  WordFormGroupV3,
  WordPosFormsV3
} from "@tsz/types";
import { useState } from "react";
import type { ReactNode } from "react";
import {
  addConcreteForm,
  addConcreteFormAfterMembership,
  deleteConcreteForm,
  reorderMemberships,
  type V3IdFactory
} from "../operations";
import {
  V3ConcreteFormRow,
  V3DialectSeparatedFormMatrix,
  type V3DialectSeparatedFormRow
} from "./V3ConcreteFormRow";
import { V3DisabledReason } from "./V3DisabledReason";
import { V3ReferenceBadge } from "./V3ReferenceBadge";
import { formNodeIds, formReferenceCount } from "../referenceGuard";
import { useV3ReferenceGuard } from "../referenceGuardContext";

const BASE_REQUIRED_HINT = "第 1 组词形变化至少保留一个原形";

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
  /** 本组词形被引用的处数；只作发布前影响提示，不阻断草稿编辑。 */
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
  content,
  group,
  groupCount = 1,
  groupIndex,
  pos,
  issues,
  membershipCounts,
  idFactory,
  onChange,
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
  // 模板仅在新建或显式新增词性时初始化；展示以草稿成员为准。
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
  // 改类型和删词形动的是 form 本身，所有引用它的组都会受影响；但只有第 1 组要求
  // 必须保留原形，所以只按第 1 组算：只要它是第 1 组的唯一原形就锁。
  const referenceGuard = useV3ReferenceGuard();
  const lockedBaseFormIds = new Set(
    pos.form_groups.slice(0, 1).flatMap((candidate) => {
      const baseMembers = baseMembersOf(candidate);
      return baseMembers.length === 1 ? [baseMembers[0]!.form_id] : [];
    })
  );
  // 「从本组移除」只摘掉当前组的一条 membership，其他组不受影响，所以只看本组；
  // 且只有第 1 组要求必须保留原形：本组还有别的原形就照常放行，跨组共享与否都不影响。
  const soleBaseMembershipId = (() => {
    if (group.id !== pos.form_groups[0]?.id) return undefined;
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
    // 词形或它的变体被别处引用：**删除**仍锁（引用失去锚点），**改类型**放行（保护式）。
    // 改类型不换 `form.id`，引用按「词形 + 方言侧」重解析后仍成立；但类型本身是引用记录的一部分，
    // 改动会让指向它的引用“漂移”，因此给提示而不是硬锁。
    const formReferences = formReferenceCount(referenceGuard.index, form);
    const referenceHint =
      formReferences > 0
        ? `存在 ${formReferences} 处关联，解除所有关联才能删除词形`
        : undefined;
    // 改类型的提示：告知会影响多少处引用，但不阻断编辑。
    const formTypeChangeHint =
      formReferences > 0
        ? `修改词形类型会让 ${formReferences} 处引用漂移，保存后请核对`
        : undefined;
    const baseLabel = formTypeLabel(form.form_type);
    const formMembershipCount = membershipCounts.get(form.id) ?? 0;
    const lastRequiredForm = pos.forms.length === 1 && formMembershipCount <= 1;
    const formLabel =
      sameTypeMembers.length > 1 ? `${baseLabel} ${sameTypeIndex}` : baseLabel;
    const formPositionLabel = `${baseLabel} ${sameTypeIndex}`;
    const deleteLocked =
      formReferences > 0 ||
      lastRequiredForm ||
      member.id === soleBaseMembershipId;
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
      formTypeDisabled: !posCatalog || lockedBase,
      formTypeDisabledReason: lockedBase ? BASE_REQUIRED_HINT : undefined,
      formTypeChangeHint,
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
              if (result.ok) onChange(result.value);
            }}
            size="small"
            type="text"
          />
          {/* 一个词形只属于一个组，「从本组移除」就是删除词形，统一走删除确认。 */}
          <V3DisabledReason reason={deleteReason}>
            <Popconfirm
              cancelButtonProps={{ "aria-label": "取消删除词形并保留" }}
              cancelText="取消"
              description={`词形的拼写与发音会一并删除。${referenceHint ?? ""}`}
              disabled={deleteLocked}
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
  const hasBoundSenses = group.scope === "dedicated" && boundSenseCount > 0;

  return (
    <Card
      className="v3-form-group-card word-form-card word-form-group-card"
      data-group-id={group.id}
      data-v3-node-id={group.id}
      size="small"
      title={
        <span className="v3-form-group-heading">{`第 ${groupIndex + 1} 组 词形变化`}</span>
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
                type={hasBoundSenses ? "primary" : "default"}
                ghost={!hasBoundSenses}
                size="small"
                aria-label={`第 ${groupIndex + 1} 组专用词义`}
                aria-expanded={editingSenses}
              >
                {hasBoundSenses
                  ? `专用词义 · ${boundSenseCount}`
                  : "设置专用词形"}
              </Button>
            </Popover>
          ) : null}
          <Button
            type="text"
            size="small"
            className="v3-form-group-menu word-form-card-toggle-state"
            aria-label={`${collapsed ? "展开" : "收起"}第 ${groupIndex + 1} 组词形变化`}
            aria-controls={bodyId}
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
                        ? "删除草稿词形组（发布前需修复引用）"
                        : deleteDisabled
                          ? "至少保留一个词形"
                          : "删除本组",
                    danger: true,
                    disabled: deleteDisabled || !onDelete
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
      {!collapsed ? (
        <Flex id={bodyId} vertical>
          <div className="word-form-rules">{dialectControl}</div>
          {group.members.length === 0 ? (
            <Empty
              description="草稿可暂时保留空变化组"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            >
              <Button
                icon={<PlusCircleOutlined />}
                onClick={() => {
                  const result = addConcreteForm(
                    content,
                    pos.pos_id,
                    group.id,
                    "base",
                    idFactory
                  );
                  if (result.ok) onChange(result.value);
                }}
              >
                添加原形
              </Button>
            </Empty>
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
                    formTypeChangeHint={row.formTypeChangeHint}
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
