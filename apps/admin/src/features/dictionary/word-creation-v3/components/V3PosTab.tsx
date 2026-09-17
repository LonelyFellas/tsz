import { PlusOutlined } from "@ant-design/icons";
import { Alert, Button, Empty, Flex, Radio, Space, Typography } from "antd";
import type {
  DialectRulesV3,
  DraftFormsStepContentV3,
  PartOfSpeechCatalogItem,
  V3DraftValidationIssue,
  WordFormGroupV3,
  WordPosFormsV3
} from "@tsz/types";
import {
  addFormGroup,
  deleteFormGroup,
  deleteGroupAndOrphanForms,
  normalizeGroupDialectRules,
  reorderFormGroups,
  type V3IdFactory,
  type V3StableVariantIdFactory
} from "../operations";
import { useState } from "react";
import type { ReactNode } from "react";
import { V3FormGroupCard } from "./V3FormGroupCard";
import { partOfSpeechLabel } from "../presentation";
import {
  dialectRuleLocks,
  groupDeleteReferenceCount,
  variantIdsOf
} from "../referenceGuard";
import {
  referenceBlockedHint,
  useV3ReferenceGuard
} from "../referenceGuardContext";
import { V3DisabledReason } from "./V3DisabledReason";
import { V3ReferenceBadge } from "./V3ReferenceBadge";
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
  /** 变化组 id → 词义步里绑定它的词义数。 */
  formGroupBindingCounts?: ReadonlyMap<string, number>;
  renderGroupSenses?: (group: WordFormGroupV3) => ReactNode;
  onEditGroupSenses?: (groupId: string) => void;
  editingGroupId?: string;
  onCloseGroupSenses?: () => void;
}

export function V3PosTab({
  content,
  pos,
  issues,
  idFactory,
  onChange,
  posCatalog,
  stableVariantIds,
  formGroupBindingCounts,
  renderGroupSenses,
  onEditGroupSenses,
  editingGroupId,
  onCloseGroupSenses
}: V3PosTabProps) {
  const [pendingGroupDeletion, setPendingGroupDeletion] = useState<{
    groupId: string;
    formIds: string[];
    changed: boolean;
  }>();
  // 英美规则按组生效，合并冲突也只挂在发起切换的那一组上。
  const [dialectChangeError, setDialectChangeError] = useState<{
    groupId: string;
    message: string;
  }>();
  const posLabel = posCatalog?.name_zh ?? partOfSpeechLabel(pos.pos);
  const { preference } = useDialectPreference();
  const referenceGuard = useV3ReferenceGuard();
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
  // 没配派生词形的词性（副词、代词）只有一个原形组，也要照常渲染：原形的拼写与
  // 发音得有地方录，完成度本来就把原形发音算作未填项。只有空组才继续藏起来——
  // 没有成员的组对这类词性没有意义，「增加一组词性变化」入口同样不给。
  const visibleGroups = pos.form_groups.filter(
    (group) =>
      !posCatalog || allowedDerivedTypes.length > 0 || group.members.length > 0
  );
  const applyDialectRules = (groupId: string, rules: DialectRulesV3) => {
    const result = normalizeGroupDialectRules(
      content,
      pos.pos_id,
      groupId,
      rules,
      preference,
      idFactory,
      stableVariantIds
    );
    if (result.ok) {
      setDialectChangeError(undefined);
      onChange(result.value);
    } else if (result.reason === "component_merge_required") {
      setDialectChangeError({
        groupId,
        message:
          "英式与美式成分用词配置不同，请先统一需要保留的配置，再合并为英美通用。"
      });
    } else if (result.reason === "pronunciation_merge_required") {
      setDialectChangeError({
        groupId,
        message:
          "英式与美式发音内容不同，请先统一需要保留的发音，再合并为英美通用。"
      });
    }
  };
  const dialectControl = (group: WordFormGroupV3) => {
    const rules = group.dialect_rules;
    const consistent = group.members.every((member) => {
      const form = pos.forms.find((item) => item.id === member.form_id);
      return !form || formMatchesDialectRules(form, rules);
    });
    // 被引用的变体：拆成英 / 美会换掉通用变体 id，合并成通用会丢掉英 / 美变体；
    // 两种切换都会让引用失效，保存必被拒，索性不让点。
    const locks = dialectRuleLocks(referenceGuard.index, pos, group);
    const splitHint =
      locks.split > 0 ? referenceBlockedHint(locks.split) : undefined;
    const mergeHint =
      locks.merge > 0 ? referenceBlockedHint(locks.merge) : undefined;
    const memberForms = group.members.flatMap((member) => {
      const form = pos.forms.find((item) => item.id === member.form_id);
      return form ? [form] : [];
    });
    // 徽标跟着被锁的选项走：拼写行只有「拆成英美」会被锁（通用变体被引用），
    // 音标行拆、合两个方向都可能被锁，所以按本组全部变体计。
    const memberVariantIds = memberForms.flatMap(variantIdsOf);
    const commonVariantIds = memberForms
      .filter((form) => form.regional_variants.mode === "common")
      .flatMap(variantIdsOf);
    return (
      <>
        <div
          className="v3-pos-dialect-control"
          data-v3-field="dialect_rules"
          data-v3-node-id={group.id}
          tabIndex={-1}
        >
          <div
            className="word-form-rule-row v3-pos-dialect-rule"
            data-v3-field="spelling_mode"
            data-v3-node-id={group.id}
            tabIndex={-1}
          >
            <Typography.Text strong>英美拼写是否有区别？</Typography.Text>
            <Flex align="center" gap={12}>
              <V3ReferenceBadge
                label="本组词形变体"
                nodeIds={commonVariantIds}
              />
              <Radio.Group
                onChange={(event) =>
                  applyDialectRules(
                    group.id,
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
                value={rules.spelling_mode}
              >
                <V3DisabledReason reason={splitHint}>
                  <Radio
                    aria-label="英美拼写有区别"
                    disabled={Boolean(splitHint)}
                    value="distinguish"
                  >
                    是
                  </Radio>
                </V3DisabledReason>
                <Radio aria-label="英美拼写无区别" value="unified">
                  否
                </Radio>
              </Radio.Group>
            </Flex>
          </div>
          <div
            className="word-form-rule-row v3-pos-dialect-rule"
            data-v3-field="phonetic_mode"
            data-v3-node-id={group.id}
            tabIndex={-1}
          >
            <Typography.Text strong>英美音标是否有区别？</Typography.Text>
            <Flex align="center" gap={12}>
              <V3ReferenceBadge
                label="本组词形变体"
                nodeIds={memberVariantIds}
              />
              <Radio.Group
                onChange={(event) =>
                  applyDialectRules(group.id, {
                    spelling_mode: rules.spelling_mode,
                    phonetic_mode: event.target.value
                  })
                }
                value={rules.phonetic_mode}
              >
                <V3DisabledReason reason={splitHint}>
                  <Radio
                    aria-label="英美音标有区别"
                    disabled={Boolean(splitHint)}
                    value="distinguish"
                  >
                    是
                  </Radio>
                </V3DisabledReason>
                <V3DisabledReason reason={mergeHint}>
                  <Radio
                    aria-label="英美音标无区别"
                    disabled={
                      rules.spelling_mode === "distinguish" ||
                      Boolean(mergeHint)
                    }
                    value="unified"
                  >
                    否
                  </Radio>
                </V3DisabledReason>
              </Radio.Group>
            </Flex>
          </div>
        </div>
        {!consistent ? (
          <Alert
            description="请选择统一目标；系统会按唯一词形逐条要求显式映射，不会静默复制或丢弃发音。"
            showIcon
            title="本组的英美结构待统一"
            type="warning"
          />
        ) : null}
        {dialectChangeError?.groupId === group.id ? (
          <Alert
            closable
            onClose={() => setDialectChangeError(undefined)}
            showIcon
            title="暂不能合并英美配置"
            description={dialectChangeError.message}
            type="warning"
          />
        ) : null}
      </>
    );
  };

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
      {pendingGroupDeletion ? (
        <Alert
          // 确认条渲染在组列表上方：从下面的卡片菜单点删除时它落在视口外，
          // 看起来就像点了没反应。挂载时把它带进视野。
          ref={(node) => {
            node?.nativeElement.scrollIntoView?.({ block: "center" });
          }}
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
              boundSenseCount={formGroupBindingCounts?.get(group.id) ?? 0}
              content={content}
              deleteBlockedByReferences={groupDeleteReferenceCount(
                referenceGuard.index,
                pos,
                group
              )}
              deleteDisabled={deletingGroupRemovesLastForm(group.id)}
              dialectControl={dialectControl(group)}
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
              senseScope={renderGroupSenses?.(group)}
              onEditSenses={
                onEditGroupSenses
                  ? () => onEditGroupSenses(group.id)
                  : undefined
              }
              onCloseSenses={onCloseGroupSenses}
              editingSenses={editingGroupId === group.id}
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
