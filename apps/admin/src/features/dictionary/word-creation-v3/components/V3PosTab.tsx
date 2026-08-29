import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Flex, Radio, Space, Typography } from "antd";
import type {
  DialectRulesV3,
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue,
  WordPosFormsV3
} from "@tsz/types";
import {
  addFormGroup,
  deleteFormGroup,
  deleteGroupAndOrphanForms,
  normalizePosDialectRules,
  reorderFormGroups,
  type V3IdFactory,
  type V3StableVariantIdFactory
} from "../operations";
import { useState } from "react";
import { V3FormGroupCard } from "./V3FormGroupCard";
import { partOfSpeechLabel } from "../presentation";
import { useDialectPreference } from "@/features/settings/useDialectPreference";

function formMatchesDialectRules(
  form: WordPosFormsV3["forms"][number],
  rules: DialectRulesV3
) {
  if (rules.spelling_mode === "unified" && rules.phonetic_mode === "unified") {
    return form.regional_variants.mode === "common";
  }
  if (form.regional_variants.mode !== "uk_us") return false;
  if (rules.spelling_mode === "distinguish") return true;
  return (
    form.regional_variants.uk.spelling === form.regional_variants.us.spelling
  );
}

export interface V3PosTabProps {
  content: DraftFormsStepContentV3;
  pos: WordPosFormsV3;
  issues: readonly V3DraftValidationIssue[];
  idFactory: V3IdFactory;
  onChange: (next: DraftFormsStepContentV3) => void;
  posCatalog?: PartOfSpeechCatalogItem;
  stableVariantIds?: V3StableVariantIdFactory;
}

export function V3PosTab({
  content,
  pos,
  issues,
  idFactory,
  onChange,
  posCatalog,
  stableVariantIds
}: V3PosTabProps) {
  const [pendingGroupDeletion, setPendingGroupDeletion] = useState<{
    groupId: string;
    formIds: string[];
    changed: boolean;
  }>();
  const posLabel = posCatalog?.name_zh ?? partOfSpeechLabel(pos.pos);
  const { preference } = useDialectPreference();
  const allowedDerivedTypes = posCatalog?.allowed_form_types ?? [];
  const membershipCounts = new Map<string, number>();
  for (const group of pos.form_groups) {
    for (const member of group.members) {
      membershipCounts.set(
        member.form_id,
        (membershipCounts.get(member.form_id) ?? 0) + 1
      );
    }
  }
  const visibleGroups = pos.form_groups.filter(
    (group) =>
      !posCatalog ||
      allowedDerivedTypes.length > 0 ||
      group.members.some((member) => {
        const form = pos.forms.find(
          (candidate) => candidate.id === member.form_id
        );
        return form && form.form_type !== "base";
      })
  );
  const dialectRulesConsistent = pos.forms.every((form) =>
    formMatchesDialectRules(form, pos.dialect_rules)
  );
  const applyDialectRules = (rules: DialectRulesV3) => {
    const result = normalizePosDialectRules(
      content,
      pos.pos_id,
      rules,
      preference,
      idFactory,
      stableVariantIds
    );
    if (result.ok) onChange(result.value);
  };
  const dialectControl = (
    <div
      className="v3-pos-dialect-control"
      data-v3-field="dialect_rules"
      data-v3-node-id={pos.pos_id}
      tabIndex={-1}
    >
      <div
        className="word-form-rule-row v3-pos-dialect-rule"
        data-v3-field="spelling_mode"
        data-v3-node-id={pos.pos_id}
        tabIndex={-1}
      >
        <Typography.Text strong>英美拼写是否有区别？</Typography.Text>
        <Radio.Group
          onChange={(event) =>
            applyDialectRules(
              event.target.value === "distinguish"
                ? {
                    spelling_mode: "distinguish",
                    phonetic_mode: "distinguish"
                  }
                : {
                    spelling_mode: "unified",
                    phonetic_mode: "distinguish"
                  }
            )
          }
          value={pos.dialect_rules.spelling_mode}
        >
          <Radio aria-label="英美拼写有区别" value="distinguish">
            是
          </Radio>
          <Radio aria-label="英美拼写无区别" value="unified">
            否
          </Radio>
        </Radio.Group>
      </div>
      <div
        className="word-form-rule-row v3-pos-dialect-rule"
        data-v3-field="phonetic_mode"
        data-v3-node-id={pos.pos_id}
        tabIndex={-1}
      >
        <Typography.Text strong>英美音标是否有区别？</Typography.Text>
        <Radio.Group
          onChange={(event) =>
            applyDialectRules({
              spelling_mode: pos.dialect_rules.spelling_mode,
              phonetic_mode: event.target.value
            })
          }
          value={pos.dialect_rules.phonetic_mode}
        >
          <Radio aria-label="英美音标有区别" value="distinguish">
            是
          </Radio>
          <Radio
            aria-label="英美音标无区别"
            disabled={pos.dialect_rules.spelling_mode === "distinguish"}
            value="unified"
          >
            否
          </Radio>
        </Radio.Group>
      </div>
    </div>
  );

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

  const deletingGroupRemovesLastForm = (groupId: string) => {
    const group = pos.form_groups.find((item) => item.id === groupId);
    if (!group) return false;
    const removedFormIds = new Set(
      group.members.map((member) => member.form_id)
    );
    const stillReferenced = new Set(
      pos.form_groups
        .filter((item) => item.id !== groupId)
        .flatMap((item) => item.members.map((member) => member.form_id))
    );
    const orphanCount = pos.forms.filter(
      (form) => removedFormIds.has(form.id) && !stillReferenced.has(form.id)
    ).length;
    return pos.forms.length - orphanCount < 1;
  };

  return (
    <Flex
      className="v3-pos-tab word-pos-editor"
      data-pos-id={pos.pos_id}
      data-v3-node-id={pos.pos_id}
      vertical
      gap="middle"
    >
      {visibleGroups.length === 0 ? (
        <div className="word-form-rules v3-pos-dialect-rules">
          {dialectControl}
        </div>
      ) : null}
      {!dialectRulesConsistent ? (
        <Alert
          description="请选择统一目标；系统会按唯一词形逐条要求显式映射，不会静默复制或丢弃发音。"
          showIcon
          title="当前词性的英美结构待统一"
          type="warning"
        />
      ) : null}
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
      {visibleGroups.length === 0 ? (
        !posCatalog || allowedDerivedTypes.length > 0 ? (
          <Empty description="草稿可暂时不添加变化组" />
        ) : null
      ) : (
        <Space
          className="v3-form-group-list"
          orientation="vertical"
          size="middle"
        >
          {visibleGroups.map((group, index) => (
            <V3FormGroupCard
              content={content}
              deleteDisabled={deletingGroupRemovesLastForm(group.id)}
              dialectControl={index === 0 ? dialectControl : undefined}
              group={group}
              groupCount={visibleGroups.length}
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
      {!posCatalog || allowedDerivedTypes.length > 0 ? (
        <Button
          aria-label={`新增${posLabel}变化组`}
          block
          className="word-form-add-group"
          icon={<PlusOutlined />}
          onClick={addGroup}
          size="large"
          type="dashed"
        >
          增加一组词性变化
        </Button>
      ) : null}
    </Flex>
  );
}
