import {
  CaretDownFilled,
  CaretUpFilled,
  DeleteOutlined,
  DownOutlined,
  EllipsisOutlined,
  PlusOutlined,
  UpOutlined
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Dropdown,
  Empty,
  Flex,
  Radio,
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
import { useState } from "react";
import type { ReactNode } from "react";
import {
  addConcreteFormAfterMembership,
  deleteConcreteForm,
  removeMembership,
  reorderMemberships,
  type V3IdFactory
} from "../operations";
import { formTypeLabel } from "../presentation";
import {
  V3ConcreteFormRow,
  V3DialectSeparatedFormMatrix,
  type V3DialectSeparatedFormRow
} from "./V3ConcreteFormRow";

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
  onMove?: (offset: -1 | 1) => void;
  posCatalog?: PartOfSpeechCatalogItem;
  dialectControl?: ReactNode;
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
  onMove,
  posCatalog,
  dialectControl
}: V3FormGroupCardProps) {
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
  const blockedFormLocked =
    blockedFormId !== undefined && lockedBaseFormIds.has(blockedFormId);
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
    const baseLabel = formTypeLabel(form.form_type);
    const formMembershipCount = membershipCounts.get(form.id) ?? 0;
    const lastRequiredForm = pos.forms.length === 1 && formMembershipCount <= 1;
    const formLabel =
      sameTypeMembers.length > 1 ? `${baseLabel} ${sameTypeIndex}` : baseLabel;
    const formPositionLabel = `${baseLabel} ${sameTypeIndex}`;

    return {
      membershipId: member.id,
      form,
      formLabel,
      formTypeAriaLabel: `变化组 ${groupIndex + 1} 词形 ${index + 1} 类型`,
      formTypeDisabled: !posCatalog || lockedBase,
      formTypeDisabledReason: lockedBase ? BASE_REQUIRED_HINT : undefined,
      formTypeOptions,
      membershipCount: formMembershipCount,
      actions: (
        <Flex className="v3-membership-actions" gap={2} wrap>
          <Button
            aria-label={`上移变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
            disabled={index === 0}
            icon={<UpOutlined />}
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
            icon={<DownOutlined />}
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
            icon={<PlusOutlined />}
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
          <Button
            aria-label={`从变化组 ${groupIndex + 1} 移除词形 ${index + 1}`}
            danger
            disabled={lastRequiredForm || member.id === soleBaseMembershipId}
            icon={<DeleteOutlined />}
            onClick={() => {
              const result = removeMembership(content, member.id);
              if (result.ok) {
                onChange(result.value);
                return;
              }
              if (result.reason === "last_membership_requires_form_deletion") {
                setBlockedFormId(result.form_id);
              }
            }}
            size="small"
            title={
              lastRequiredForm
                ? "每个词性至少保留一个词形"
                : member.id === soleBaseMembershipId
                  ? BASE_REQUIRED_HINT
                  : undefined
            }
            type="text"
          />
        </Flex>
      )
    };
  };

  const useSeparatedMatrix =
    pos.dialect_rules.spelling_mode === "distinguish" &&
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
        <button
          aria-controls={bodyId}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? "展开" : "收起"}第 ${groupIndex + 1} 组词形变化`}
          className="word-form-card-toggle"
          onClick={() => setCollapsed((value) => !value)}
          type="button"
        >
          <span>{`第 ${groupIndex + 1} 组 词形变化`}</span>
          <span className="word-form-card-toggle-state">
            <span>{collapsed ? "展开" : "收起"}</span>
            {collapsed ? (
              <CaretDownFilled className="word-form-card-toggle-caret" />
            ) : (
              <CaretUpFilled className="word-form-card-toggle-caret" />
            )}
          </span>
        </button>
      }
      extra={
        onDelete ? (
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
                  label: deleteDisabled ? "至少保留一个词形" : "删除本组",
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
              icon={<EllipsisOutlined />}
              type="text"
            />
          </Dropdown>
        ) : null
      }
    >
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
          {blockedFormId ? (
            <Alert
              action={
                blockedFormLocked ? undefined : (
                  <Button
                    aria-label="删除词形及相关发音"
                    danger
                    onClick={() => {
                      const result = deleteConcreteForm(
                        content,
                        pos.pos_id,
                        blockedFormId
                      );
                      if (result.ok) onChange(result.value);
                      setBlockedFormId(undefined);
                    }}
                    size="small"
                  >
                    删除词形
                  </Button>
                )
              }
              closable={{
                "aria-label": blockedFormLocked
                  ? "知道了并保留词形"
                  : "取消删除词形并保留",
                onClose: () => setBlockedFormId(undefined)
              }}
              description={
                blockedFormLocked
                  ? `${BASE_REQUIRED_HINT}。要删除它，请先在本组添加另一个原形。`
                  : "不能只从当前组移除。若不再需要此词形，可将它及相关发音一并删除。"
              }
              showIcon
              title={
                blockedFormLocked
                  ? "此词形是本组唯一的原形"
                  : "此词形仅在当前变化组中使用"
              }
              type="warning"
            />
          ) : null}
          {group.members.length === 0 ? (
            <Empty
              description="草稿可暂时保留空变化组"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : null}
          {separatedRows ? (
            <V3DialectSeparatedFormMatrix
              content={content}
              dialectRules={pos.dialect_rules}
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
                    dialectRules={pos.dialect_rules}
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
