import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Flex, Space } from "antd";
import type {
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue,
  WordPosFormsV3
} from "@tsz/types";
import {
  addFormGroup,
  deleteFormGroup,
  deleteGroupAndOrphanForms,
  reorderFormGroups,
  type V3IdFactory
} from "../operations";
import { useState } from "react";
import { V3FormGroupCard } from "./V3FormGroupCard";
import { partOfSpeechLabel } from "../presentation";

export interface V3PosTabProps {
  content: DraftFormsStepContentV3;
  pos: WordPosFormsV3;
  issues: readonly V3DraftValidationIssue[];
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  onDeletePos?: () => void;
  posCatalog?: PartOfSpeechCatalogItem;
}

export function V3PosTab({
  content,
  pos,
  issues,
  idFactory,
  onChange,
  onDeletePos,
  posCatalog
}: V3PosTabProps) {
  const [pendingGroupDeletion, setPendingGroupDeletion] = useState<{
    groupId: string;
    formIds: string[];
    changed: boolean;
  }>();
  const posLabel = posCatalog?.name_zh ?? partOfSpeechLabel(pos.pos);
  const membershipCounts = new Map<string, number>();
  for (const group of pos.form_groups) {
    for (const member of group.members) {
      membershipCounts.set(
        member.form_id,
        (membershipCounts.get(member.form_id) ?? 0) + 1
      );
    }
  }

  const addGroup = () => {
    const result = addFormGroup(content, pos.pos_id, idFactory);
    if (result.ok) onChange(result.value);
  };

  const deleteGroup = (groupId: string) => {
    const result = deleteFormGroup(content, pos.pos_id, groupId);
    if (result.ok) {
      onChange(result.value);
      setPendingGroupDeletion(undefined);
      return;
    }
    if (result.reason === "orphan_forms_require_explicit_group_deletion") {
      setPendingGroupDeletion({
        groupId,
        formIds: result.form_ids,
        changed: false
      });
    }
  };

  const confirmGroupDeletion = () => {
    if (!pendingGroupDeletion) return;
    const result = deleteGroupAndOrphanForms(
      content,
      pos.pos_id,
      pendingGroupDeletion.groupId,
      pendingGroupDeletion.formIds
    );
    if (
      !result.ok &&
      result.reason === "orphan_forms_changed_since_confirmation"
    ) {
      setPendingGroupDeletion({
        ...pendingGroupDeletion,
        formIds: result.form_ids,
        changed: true
      });
      return;
    }
    if (!result.ok) return;
    onChange(result.value);
    setPendingGroupDeletion(undefined);
  };

  const moveGroup = (index: number, offset: -1 | 1) => {
    const ordered = pos.form_groups.map((group) => group.id);
    [ordered[index], ordered[index + offset]] = [
      ordered[index + offset]!,
      ordered[index]!
    ];
    onChange(reorderFormGroups(content, pos.pos_id, ordered));
  };

  return (
    <Flex
      data-pos-id={pos.pos_id}
      data-v3-node-id={pos.pos_id}
      vertical
      gap="middle"
    >
      <Flex justify="space-between" gap="small" wrap>
        <Button
          aria-label={`新增${posLabel}变化组`}
          icon={<PlusOutlined />}
          onClick={addGroup}
        >
          新增变化组
        </Button>
        <Button
          aria-label={`删除词性${posLabel}`}
          danger
          disabled={!onDeletePos}
          icon={<DeleteOutlined />}
          onClick={onDeletePos}
        >
          删除词性
        </Button>
      </Flex>
      {pendingGroupDeletion ? (
        <Alert
          action={
            <Space>
              <Button onClick={() => setPendingGroupDeletion(undefined)}>
                取 消
              </Button>
              <Button danger onClick={confirmGroupDeletion}>
                删除变化组并同时删除 {pendingGroupDeletion.formIds.length}{" "}
                个不再被其他变化组使用的词形
              </Button>
            </Space>
          }
          description={
            <ul>
              {pendingGroupDeletion.formIds.map((formId, index) => (
                <li key={formId}>受影响词形 {index + 1}</li>
              ))}
            </ul>
          }
          showIcon
          title={
            pendingGroupDeletion.changed
              ? "删除影响已变化，请重新确认"
              : "删除变化组需要额外确认"
          }
          type="warning"
        />
      ) : null}
      {pos.form_groups.length === 0 ? (
        <Empty description="草稿可暂时不添加变化组" />
      ) : (
        <Space orientation="vertical" size="middle">
          {pos.form_groups.map((group, index) => (
            <V3FormGroupCard
              content={content}
              group={group}
              groupCount={pos.form_groups.length}
              groupIndex={index}
              idFactory={idFactory}
              issues={issues}
              key={group.id}
              membershipCounts={membershipCounts}
              onChange={onChange}
              onDelete={() => deleteGroup(group.id)}
              onMove={(offset) => moveGroup(index, offset)}
              pos={pos}
              posCatalog={posCatalog}
            />
          ))}
        </Space>
      )}
    </Flex>
  );
}
