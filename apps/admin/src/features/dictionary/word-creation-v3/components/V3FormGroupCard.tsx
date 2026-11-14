import { useLexiconEditorTranslation } from "@/features/dictionary/i18n/editor";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import { createFormTypeComparator } from "../../part-of-speech/catalog";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Trash2Icon,
  EllipsisIcon,
  CircleMinusIcon,
  CirclePlusIcon,
  SettingsIcon
} from "lucide-react";
import { Alert, Button, Card, Empty, Flex } from "@tsz/ui/admin/display";
import { Dropdown, Popconfirm, Popover } from "@tsz/ui/admin/overlays";
import type {
  DraftFormsStepContentV3,
  FormTypeCatalogItem,
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
  deleteConcreteForm,
  updateConcreteFormType,
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

import {
  V3FormContentOverview,
  formOverviewTableId,
  formOverviewColumnSettings,
  formOverviewColumnMessages
} from "./V3FormContentOverview";
import { ColumnSettings } from "@/components/ColumnSettings";
import { useColumnSettings } from "@/components/useColumnSettings";

export interface V3FormGroupCardProps {
  sharedCounts?: ReadonlyMap<string, number>;
  onEditContent?: (formId: string) => void;
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
  formTypes?: readonly FormTypeCatalogItem[];
  dialectControl?: ReactNode;
  senseScope?: ReactNode;
  onEditSenses?: () => void;
  editingSenses?: boolean;
  onCloseSenses?: () => void;
  /** 词义步里绑定到本组的词义数；只做提示，不在本地清除绑定。 */
  boundSenseCount?: number;
}

export function V3FormGroupCard({
  sharedCounts,
  onEditContent,
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
  formTypes,
  dialectControl,
  senseScope,
  onEditSenses,
  editingSenses = false,
  onCloseSenses,
  boundSenseCount = 0
}: V3FormGroupCardProps) {
  const { t, i18n } = useLexiconEditorTranslation();
  const BASE_REQUIRED_HINT = t("first_base_required");
  // 模板仅在新建或显式新增词性时初始化；展示以草稿成员为准。
  const formTypeLabel = useFormTypeLabel();
  const [blockedFormId, setBlockedFormId] = useState<string>();
  const [collapsed, setCollapsed] = useState(false);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [columnsOverflow, setColumnsOverflow] = useState(false);
  const columns = useColumnSettings(
    formOverviewTableId,
    formOverviewColumnSettings.map((column) => ({
      ...column,
      label: t(
        formOverviewColumnMessages[
          column.key as keyof typeof formOverviewColumnMessages
        ]
      )
    }))
  );
  const hasOverview = !!(onEditContent && sharedCounts);
  const compareTypes = createFormTypeComparator(formTypes, posCatalog);
  const formTypeOptions = posCatalog
    ? [
        ...new Set<WordFormTypeV3>([
          "base",
          ...(posCatalog.allowed_form_types ?? [])
        ])
      ].sort(compareTypes)
    : [];
  const formTypesById = new Map(
    pos.forms.map((form) => [form.id, form.form_type])
  );
  const orderedMembers =
    posCatalog || formTypes?.length
      ? [...group.members].sort((a, b) =>
          compareTypes(
            formTypesById.get(a.form_id) ?? "",
            formTypesById.get(b.form_id) ?? ""
          )
        )
      : group.members;
  const baseMembersOf = (candidate: WordFormGroupV3) =>
    candidate.members.filter(
      (member) =>
        pos.forms.find((item) => item.id === member.form_id)?.form_type ===
        "base"
    );
  // 改类型和删词形动的是 form 本身，所有引用它的组都会受影响；但只有第 1 组要求
  // 必须保留原形，所以只按第 1 组算：只要它是第 1 组的唯一原形就锁。
  const referenceGuard = useV3ReferenceGuard();
  const referenceStatusHint =
    referenceGuard.index.status === "loading"
      ? t("references_loading")
      : referenceGuard.index.status === "unavailable"
        ? t("references_unavailable")
        : undefined;
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
    (referenceStatusHint !== undefined ||
      lockedBaseFormIds.has(blockedForm.id) ||
      formReferenceCount(referenceGuard.index, blockedForm) > 0)
  )
    setBlockedFormId(undefined);
  const formRow = (
    member: WordFormGroupV3["members"][number],
    index: number,
    form: WordPosFormsV3["forms"][number]
  ): V3DialectSeparatedFormRow => {
    const sameTypeMembers = orderedMembers.filter((candidate) => {
      const candidateForm = pos.forms.find(
        (item) => item.id === candidate.form_id
      );
      return candidateForm?.form_type === form.form_type;
    });
    const sameTypeIndex = orderedMembers
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
        ? t("form_links_delete", { count: formReferences })
        : undefined;
    // 改类型的提示：告知会影响多少处引用，但不阻断编辑。
    const formTypeChangeHint =
      formReferences > 0
        ? t("form_links_change", { count: formReferences })
        : undefined;
    const baseLabel = formTypeLabel(form.form_type);
    const formMembershipCount = membershipCounts.get(form.id) ?? 0;
    const lastRequiredForm = pos.forms.length === 1 && formMembershipCount <= 1;
    const formLabel =
      sameTypeMembers.length > 1 ? `${baseLabel} ${sameTypeIndex}` : baseLabel;
    const deleteLocked =
      referenceStatusHint !== undefined ||
      formReferences > 0 ||
      lastRequiredForm ||
      member.id === soleBaseMembershipId;
    const deleteReason =
      referenceStatusHint ??
      referenceHint ??
      (lastRequiredForm
        ? t("one_form_required")
        : member.id === soleBaseMembershipId
          ? BASE_REQUIRED_HINT
          : undefined);

    return {
      membershipId: member.id,
      form,
      formLabel,
      formTypeAriaLabel: t("form_type_label", {
        group: groupIndex + 1,
        index: index + 1
      }),
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
          {/* 一个词形只属于一个组，「从本组移除」就是删除词形，统一走删除确认。 */}
          <V3DisabledReason reason={deleteReason}>
            <Popconfirm
              cancelButtonProps={{ "aria-label": t("cancel_delete_form") }}
              cancelText={t("cancel")}
              description={[
                (sharedCounts?.get(form.id) ?? 1) > 1
                  ? t("remove_shared_label")
                  : t("remove_last_label"),
                referenceHint
              ]
                .filter(Boolean)
                .join(i18n.language.startsWith("en") ? " " : "")}
              disabled={deleteLocked}
              okButtonProps={{
                "aria-label": t("delete_form_audio"),
                danger: true
              }}
              okText={t("delete_form")}
              onConfirm={() => {
                const result = deleteConcreteForm(content, pos.pos_id, form.id);
                if (result.ok) onChange(result.value);
              }}
              onOpenChange={(open) =>
                setBlockedFormId(open ? form.id : undefined)
              }
              open={blockedFormId === form.id}
              title={t("delete_form_title")}
            >
              <Button
                aria-label={t("delete_group_form_label", {
                  group: groupIndex + 1,
                  index: index + 1
                })}
                danger
                disabled={deleteLocked}
                icon={<CircleMinusIcon />}
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
    ? orderedMembers.map((member, index) =>
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
        <span className="v3-form-group-heading">
          {t("form_group_heading", { group: groupIndex + 1 })}
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
          <Dropdown
            disabled={formTypeOptions.length === 0}
            menu={{
              items: formTypeOptions.map((type) => ({
                key: type,
                label: formTypeLabel(type)
              })),
              onClick: ({ key }) => {
                const result = addConcreteForm(
                  content,
                  pos.pos_id,
                  group.id,
                  key,
                  idFactory
                );
                if (result.ok) {
                  onChange(result.value);
                  setCollapsed(false);
                }
              }
            }}
            placement="bottomRight"
            trigger={["click"]}
          >
            <Button
              aria-label={t("add_group_form_label", { group: groupIndex + 1 })}
              disabled={formTypeOptions.length === 0}
              ghost
              icon={<CirclePlusIcon />}
              size="small"
            >
              {t("add_form")}
            </Button>
          </Dropdown>
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
                aria-label={t("dedicated_group_label", {
                  group: groupIndex + 1
                })}
                aria-expanded={editingSenses}
              >
                {hasBoundSenses
                  ? t("dedicated_count", { count: boundSenseCount })
                  : t("dedicated_forms")}
              </Button>
            </Popover>
          ) : null}
          <Button
            type="text"
            size="small"
            className="v3-form-group-menu word-form-card-toggle-state"
            aria-label={t("toggle_form_group", {
              action: collapsed ? t("expand") : t("collapse"),
              group: groupIndex + 1
            })}
            aria-controls={bodyId}
            aria-expanded={!collapsed}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? t("expand") : t("collapse")}
            {collapsed ? <ChevronDownIcon /> : <ChevronUpIcon />}
          </Button>
          {onDelete || hasOverview ? (
            <ColumnSettings
              columns={columns.columns}
              onChange={columns.update}
              onReset={columns.reset}
              fixedOverflow={columnsOverflow}
              open={columnsOpen}
              onOpenChange={setColumnsOpen}
            >
              <Dropdown
                menu={{
                  items: [
                    ...(hasOverview
                      ? [
                          {
                            key: "columns",
                            label: t("column_settings"),
                            icon: <SettingsIcon />
                          },
                          { type: "divider" as const }
                        ]
                      : []),
                    ...(onDelete
                      ? [
                          {
                            key: "move-up",
                            icon: <ChevronUpIcon />,
                            label: t("move_group_up"),
                            disabled: groupIndex === 0 || !onMove
                          },
                          {
                            key: "move-down",
                            icon: <ChevronDownIcon />,
                            label: t("move_group_down"),
                            disabled: groupIndex === groupCount - 1 || !onMove
                          },
                          { type: "divider" as const },
                          {
                            key: "delete",
                            icon: <Trash2Icon />,
                            label:
                              deleteBlockedByReferences > 0
                                ? t("delete_draft_group")
                                : deleteDisabled
                                  ? t("keep_form")
                                  : t("delete_form_group"),
                            danger: true,
                            disabled: deleteDisabled || !onDelete
                          }
                        ]
                      : [])
                  ],
                  onClick: ({ key }) => {
                    if (key === "columns") setColumnsOpen(true);
                    if (key === "move-up") onMove?.(-1);
                    if (key === "move-down") onMove?.(1);
                    if (key === "delete") onDelete?.();
                  }
                }}
                placement="bottomRight"
                trigger={["click"]}
              >
                <Button
                  aria-label={t("manage_form_group", { group: groupIndex + 1 })}
                  className="v3-form-group-menu"
                  icon={<EllipsisIcon />}
                  type="text"
                />
              </Dropdown>
            </ColumnSettings>
          ) : null}
        </Flex>
      }
    >
      {!collapsed ? (
        <Flex id={bodyId} vertical>
          <div className="word-form-rules">{dialectControl}</div>
          {group.members.length === 0 ? (
            <Empty
              description={t("empty_form_group")}
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ) : null}
          {onEditContent && sharedCounts ? (
            <V3FormContentOverview
              group={group}
              showColumnSettings={false}
              onFixedOverflowChange={setColumnsOverflow}
              issues={issues}
              sharedCounts={sharedCounts}
              onEdit={onEditContent}
              onFormTypeChange={(id, type) =>
                onChange(updateConcreteFormType(content, id, type))
              }
              rows={orderedMembers.flatMap((member, index) => {
                const form = pos.forms.find(
                  (item) => item.id === member.form_id
                );
                return form ? [formRow(member, index, form)] : [];
              })}
            />
          ) : separatedRows ? (
            <V3DialectSeparatedFormMatrix
              content={content}
              dialectRules={group.dialect_rules}
              idFactory={idFactory}
              issues={issues}
              onChange={onChange}
              rows={separatedRows}
            />
          ) : (
            orderedMembers.map((member, index) => {
              const form = pos.forms.find((item) => item.id === member.form_id);
              if (!form) {
                return (
                  <Alert
                    key={member.id}
                    title={t("missing_group_form")}
                    type="error"
                  />
                );
              }
              const row = formRow(member, index, form);
              const previousMember = orderedMembers[index - 1];
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
