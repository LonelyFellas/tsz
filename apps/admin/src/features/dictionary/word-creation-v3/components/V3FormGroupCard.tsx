import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  DeleteOutlined
} from "@ant-design/icons";
import { Alert, Button, Card, Empty, Flex, Select, Space, Tag } from "antd";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue,
  WordFormTypeV3,
  WordFormGroupV3,
  WordPosFormsV3
} from "@tsz/types";
import { useState } from "react";
import {
  addConcreteForm,
  addMembership,
  deleteConcreteForm,
  moveMembership,
  removeMembership,
  reorderMemberships,
  type V3IdFactory
} from "../operations";
import { formTypeLabel } from "../presentation";
import { V3ConcreteFormRow } from "./V3ConcreteFormRow";

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
  onMove?: (offset: -1 | 1) => void;
  posCatalog?: PartOfSpeechCatalogItem;
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
  onMove,
  posCatalog
}: V3FormGroupCardProps) {
  const [blockedFormId, setBlockedFormId] = useState<string>();
  const [formType, setFormType] = useState<WordFormTypeV3>("base");
  const [existingFormId, setExistingFormId] = useState<string>();
  const orderedIds = group.members.map((member) => member.id);
  const formTypeOptions = posCatalog
    ? (["base", ...(posCatalog.allowed_form_types ?? [])] as WordFormTypeV3[])
    : [];
  const existingFormOptions = pos.forms
    .filter(
      (form) => !group.members.some((member) => member.form_id === form.id)
    )
    .map((form) => ({
      value: form.id,
      label: `${formTypeLabel(form.form_type)} · ${
        form.regional_variants.mode === "common"
          ? form.regional_variants.common.spelling || "未填写拼写"
          : `${form.regional_variants.uk.spelling || "未填写英式"} / ${
              form.regional_variants.us.spelling || "未填写美式"
            }`
      }`
    }));

  const addForm = () => {
    if (!posCatalog || !formTypeOptions.includes(formType)) return;
    const result = addConcreteForm(
      content,
      pos.pos_id,
      group.id,
      formType,
      idFactory
    );
    if (result.ok) onChange(result.value);
  };

  const attachExistingForm = () => {
    if (!existingFormId) return;
    const result = addMembership(
      content,
      pos.pos_id,
      group.id,
      existingFormId,
      idFactory
    );
    if (!result.ok) return;
    onChange(result.value);
    setExistingFormId(undefined);
  };

  return (
    <Card
      className="v3-form-group-card"
      data-group-id={group.id}
      data-v3-node-id={group.id}
      size="small"
      title={
        <Space>
          变化组 {groupIndex + 1}
          {group.is_regular && <Tag color="green">规则组</Tag>}
        </Space>
      }
      extra={
        <Space.Compact>
          <Button
            aria-label={`上移变化组 ${groupIndex + 1}`}
            disabled={groupIndex === 0 || !onMove}
            icon={<ArrowUpOutlined />}
            onClick={() => onMove?.(-1)}
          />
          <Button
            aria-label={`下移变化组 ${groupIndex + 1}`}
            disabled={groupIndex === groupCount - 1 || !onMove}
            icon={<ArrowDownOutlined />}
            onClick={() => onMove?.(1)}
          />
          <Button
            aria-label={`删除变化组 ${groupIndex + 1}`}
            danger
            disabled={!onDelete}
            icon={<DeleteOutlined />}
            onClick={onDelete}
          />
        </Space.Compact>
      }
    >
      <Flex vertical gap="middle">
        <Flex gap="small" wrap>
          <Select
            aria-label={`变化组 ${groupIndex + 1} 新增词形类型`}
            disabled={!posCatalog}
            onChange={setFormType}
            options={formTypeOptions.map((value) => ({
              value,
              label: formTypeLabel(value)
            }))}
            value={formType}
          />
          <Button
            aria-label={`变化组 ${groupIndex + 1} 新增词形`}
            disabled={!posCatalog}
            onClick={addForm}
          >
            新增词形
          </Button>
          <Select
            aria-label={`变化组 ${groupIndex + 1} 选择已有词形`}
            disabled={existingFormOptions.length === 0}
            onChange={setExistingFormId}
            options={existingFormOptions}
            placeholder="选择已有词形"
            value={existingFormId}
          />
          <Button
            aria-label={`变化组 ${groupIndex + 1} 复用已有词形`}
            disabled={!existingFormId}
            onClick={attachExistingForm}
          >
            复用已有词形
          </Button>
        </Flex>
        {blockedFormId && (
          <Alert
            action={
              <Button
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
                删除整个词形
              </Button>
            }
            closable
            description="这是该词形最后一个使用位置。普通移除已停止；如需继续，请明确删除该词形及其全部使用位置。"
            onClose={() => setBlockedFormId(undefined)}
            showIcon
            title="不能留下孤立词形"
            type="warning"
          />
        )}
        {group.members.length === 0 && (
          <Empty
            description="草稿可暂时保留空变化组"
            image={Empty.PRESENTED_IMAGE_SIMPLE}
          />
        )}
        {group.members.map((member, index) => {
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
          const moveTargets = pos.form_groups
            .filter(
              (target) =>
                target.id !== group.id &&
                !target.members.some(
                  (targetMember) => targetMember.form_id === form.id
                )
            )
            .map((target) => ({
              value: target.id,
              label: `变化组 ${pos.form_groups.indexOf(target) + 1}`
            }));
          return (
            <div
              className="v3-membership-row"
              data-v3-field="form_id"
              data-v3-node-id={member.id}
              key={form.id}
              tabIndex={-1}
            >
              <Flex className="v3-membership-actions" justify="end">
                <Space>
                  <Select
                    aria-label={`移动词形 ${index + 1} 到其他变化组`}
                    disabled={moveTargets.length === 0}
                    onChange={(targetGroupId) => {
                      const target = pos.form_groups.find(
                        (item) => item.id === targetGroupId
                      )!;
                      const result = moveMembership(
                        content,
                        member.id,
                        targetGroupId,
                        target.members.length,
                        idFactory
                      );
                      if (result.ok) onChange(result.value);
                    }}
                    options={moveTargets}
                    placeholder="移动到组"
                  />
                  <Space.Compact>
                    <Button
                      aria-label={`上移变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
                      disabled={index === 0}
                      icon={<ArrowUpOutlined />}
                      onClick={() => {
                        const nextOrder = [...orderedIds];
                        [nextOrder[index - 1], nextOrder[index]] = [
                          nextOrder[index]!,
                          nextOrder[index - 1]!
                        ];
                        onChange(
                          reorderMemberships(content, group.id, nextOrder)
                        );
                      }}
                    />
                    <Button
                      aria-label={`下移变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
                      disabled={index === group.members.length - 1}
                      icon={<ArrowDownOutlined />}
                      onClick={() => {
                        const nextOrder = [...orderedIds];
                        [nextOrder[index], nextOrder[index + 1]] = [
                          nextOrder[index + 1]!,
                          nextOrder[index]!
                        ];
                        onChange(
                          reorderMemberships(content, group.id, nextOrder)
                        );
                      }}
                    />
                    <Button
                      aria-label={`从变化组 ${groupIndex + 1} 移除词形 ${index + 1}`}
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => {
                        const result = removeMembership(content, member.id);
                        if (result.ok) {
                          onChange(result.value);
                          return;
                        }
                        if (
                          result.reason ===
                          "last_membership_requires_form_deletion"
                        ) {
                          setBlockedFormId(result.form_id);
                        }
                      }}
                    />
                  </Space.Compact>
                </Space>
              </Flex>
              <V3ConcreteFormRow
                content={content}
                form={form}
                formLabel={`词形 ${index + 1}`}
                idFactory={idFactory}
                issues={issues}
                membershipCount={membershipCounts.get(form.id) ?? 0}
                onChange={onChange}
              />
            </div>
          );
        })}
      </Flex>
    </Card>
  );
}
