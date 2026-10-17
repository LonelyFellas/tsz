import { IconButton as MuiIconButton } from "@mui/material";
import {
  Box as MuiBox,
  Paper as MuiPaper,
  Menu as MuiMenu,
  MenuItem as MuiMenuItem,
  Divider as MuiDivider,
  Dialog as MuiDialog,
  DialogTitle as MuiDialogTitle,
  DialogContent as MuiDialogContent,
  DialogActions as MuiDialogActions
} from "@mui/material";
import { AnchoredPanel } from "@/components/AnchoredPanel";
import {
  Alert as MuiAlert,
  Button as MuiButton,
  Stack as MuiStack,
  Typography as MuiTypography
} from "@mui/material";
import { useFormTypeLabel } from "../../part-of-speech/FormTypeLabels";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

import DownCircleOutlined from "@mui/icons-material/ArrowCircleDownOutlined";

import EllipsisOutlined from "@mui/icons-material/MoreHoriz";
import MinusCircleOutlined from "@mui/icons-material/RemoveCircleOutline";
import PlusCircleOutlined from "@mui/icons-material/AddCircleOutline";
import UpCircleOutlined from "@mui/icons-material/ArrowCircleUpOutlined";

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
  const [scopeAnchor, setScopeAnchor] = useState<HTMLElement | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
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
  const referenceStatusHint =
    referenceGuard.index.status === "loading"
      ? "正在加载关联信息，暂不能删除词形"
      : referenceGuard.index.status === "unavailable"
        ? "关联信息暂不可用，请刷新后再删除词形"
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
        ? `存在 ${formReferences} 处关联，修改词形类型后，请检查关联内容是否正确`
        : undefined;
    const baseLabel = formTypeLabel(form.form_type);
    const formMembershipCount = membershipCounts.get(form.id) ?? 0;
    const lastRequiredForm = pos.forms.length === 1 && formMembershipCount <= 1;
    const formLabel =
      sameTypeMembers.length > 1 ? `${baseLabel} ${sameTypeIndex}` : baseLabel;
    const formPositionLabel = `${baseLabel} ${sameTypeIndex}`;
    const deleteLocked =
      referenceStatusHint !== undefined ||
      formReferences > 0 ||
      lastRequiredForm ||
      member.id === soleBaseMembershipId;
    const deleteReason =
      referenceStatusHint ??
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
          <MuiIconButton
            aria-label={`上移变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
            disabled={index === 0}
            onClick={() => {
              const nextOrder = [...orderedIds];
              [nextOrder[index - 1], nextOrder[index]] = [
                nextOrder[index]!,
                nextOrder[index - 1]!
              ];
              onChange(reorderMemberships(content, group.id, nextOrder));
            }}
            size="small"
          >
            {<UpCircleOutlined fontSize="inherit" />}
          </MuiIconButton>
          <MuiIconButton
            aria-label={`下移变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
            disabled={index === group.members.length - 1}
            onClick={() => {
              const nextOrder = [...orderedIds];
              [nextOrder[index], nextOrder[index + 1]] = [
                nextOrder[index + 1]!,
                nextOrder[index]!
              ];
              onChange(reorderMemberships(content, group.id, nextOrder));
            }}
            size="small"
          >
            {<DownCircleOutlined fontSize="inherit" />}
          </MuiIconButton>
          <MuiIconButton
            aria-label={`在${formPositionLabel} 下方添加同类型词形`}
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
          >
            {<PlusCircleOutlined fontSize="inherit" />}
          </MuiIconButton>
          {/* 一个词形只属于一个组，「从本组移除」就是删除词形，统一走删除确认。 */}
          <V3DisabledReason reason={deleteReason}>
            <MuiIconButton
              onClick={() => setBlockedFormId(form.id)}
              aria-label={`删除变化组 ${groupIndex + 1} 的词形 ${index + 1}`}
              disabled={deleteLocked}
              size="small"
              color={"error"}
            >
              {<MinusCircleOutlined fontSize="inherit" />}
            </MuiIconButton>
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
    <>
      <MuiPaper
        variant="outlined"
        className="v3-form-group-card word-form-card word-form-group-card"
        data-group-id={group.id}
        data-v3-node-id={group.id}
      >
        <MuiStack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          useFlexGap
          flexWrap="wrap"
          spacing={1}
          className="v3-form-group-header"
        >
          <MuiTypography component="h3" variant="body1" fontWeight={600}>
            <span className="v3-form-group-heading">{`第 ${groupIndex + 1} 组 词形变化`}</span>
          </MuiTypography>
          <MuiStack
            className="v3-form-group-scope"
            data-v3-field="scope"
            data-v3-node-id={group.id}
            tabIndex={-1}
            direction="row"
            spacing={1}
            alignItems={"center"}
            useFlexGap
            flexWrap="wrap"
          >
            {onEditSenses ? (
              <>
                <MuiButton
                  ref={setScopeAnchor}
                  color={hasBoundSenses ? "primary" : "inherit"}
                  onClick={() =>
                    editingSenses ? onCloseSenses?.() : onEditSenses?.()
                  }
                  size="small"
                  aria-label={`第 ${groupIndex + 1} 组专用词义`}
                  aria-expanded={editingSenses}
                  variant={hasBoundSenses ? "contained" : "outlined"}
                >
                  {hasBoundSenses
                    ? `专用词义 · ${boundSenseCount}`
                    : "设置专用词形"}
                </MuiButton>
                <AnchoredPanel
                  open={editingSenses}
                  anchor={scopeAnchor}
                  label="适配专用词义"
                  onClose={() => onCloseSenses?.()}
                >
                  {senseScope}
                </AnchoredPanel>
              </>
            ) : null}
            <MuiButton
              size="small"
              className="v3-form-group-menu word-form-card-toggle-state"
              aria-label={`${collapsed ? "展开" : "收起"}第 ${groupIndex + 1} 组词形变化`}
              aria-controls={bodyId}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed((value) => !value)}
              variant={"text"}
            >
              {collapsed ? "展开" : "收起"}
              {collapsed ? (
                <ExpandMoreIcon fontSize="inherit" />
              ) : (
                <ExpandLessIcon fontSize="inherit" />
              )}
            </MuiButton>
            {onDelete ? (
              <>
                <MuiIconButton
                  onClick={(event) => setMenuAnchor(event.currentTarget)}
                  aria-haspopup="menu"
                  aria-expanded={!!menuAnchor}
                  aria-label={`管理第 ${groupIndex + 1} 组词形变化`}
                  className="v3-form-group-menu"
                >
                  {<EllipsisOutlined fontSize="inherit" />}
                </MuiIconButton>
                <MuiMenu
                  anchorEl={menuAnchor}
                  open={!!menuAnchor}
                  onClose={() => setMenuAnchor(null)}
                >
                  <MuiMenuItem
                    disabled={groupIndex === 0 || !onMove}
                    onClick={() => {
                      onMove?.(-1);
                      setMenuAnchor(null);
                    }}
                  >
                    上移本组
                  </MuiMenuItem>
                  <MuiMenuItem
                    disabled={groupIndex === groupCount - 1 || !onMove}
                    onClick={() => {
                      onMove?.(1);
                      setMenuAnchor(null);
                    }}
                  >
                    下移本组
                  </MuiMenuItem>
                  <MuiDivider />
                  <MuiMenuItem
                    disabled={deleteDisabled || !onDelete}
                    sx={{ color: "error.main" }}
                    onClick={() => {
                      onDelete?.();
                      setMenuAnchor(null);
                    }}
                  >
                    {deleteBlockedByReferences > 0
                      ? "删除草稿词形组（发布前需处理受影响的关联）"
                      : deleteDisabled
                        ? "至少保留一个词形"
                        : "删除本组"}
                  </MuiMenuItem>
                </MuiMenu>
              </>
            ) : null}
          </MuiStack>
        </MuiStack>
        <MuiBox className="v3-form-group-body">
          {!collapsed ? (
            <MuiStack
              id={bodyId}
              className="v3-form-group-contents"
              direction="column"
            >
              <div className="word-form-rules">{dialectControl}</div>
              {group.members.length === 0 ? (
                <MuiTypography color="text.secondary">
                  {"草稿可暂时保留空变化组"}
                  <MuiButton
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
                    startIcon={<PlusCircleOutlined fontSize="inherit" />}
                  >
                    添加原形
                  </MuiButton>
                </MuiTypography>
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
                  const form = pos.forms.find(
                    (item) => item.id === member.form_id
                  );
                  if (!form) {
                    return (
                      <MuiAlert key={member.id} severity={"error"}>
                        {"该变化组关联的词形已不存在，请刷新页面后重试。"}
                      </MuiAlert>
                    );
                  }
                  const row = formRow(member, index, form);
                  const previousMember = group.members[index - 1];
                  const previousForm = previousMember
                    ? pos.forms.find(
                        (item) => item.id === previousMember.form_id
                      )
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
            </MuiStack>
          ) : null}
        </MuiBox>
      </MuiPaper>
      <MuiDialog
        data-form-delete-confirm-open={!!blockedFormId && !!blockedForm}
        open={!!blockedFormId && !!blockedForm}
        onClose={() => setBlockedFormId(undefined)}
        aria-labelledby={bodyId + "-delete-title"}
      >
        <MuiDialogTitle id={bodyId + "-delete-title"}>
          确认删除此词形？
        </MuiDialogTitle>
        <MuiDialogContent>词形的拼写与发音会一并删除。</MuiDialogContent>
        <MuiDialogActions>
          <MuiButton
            aria-label="取消删除词形并保留"
            onClick={() => setBlockedFormId(undefined)}
          >
            取消
          </MuiButton>
          <MuiButton
            aria-label="删除词形及相关发音"
            variant="contained"
            color="error"
            onClick={() => {
              if (
                !blockedForm ||
                referenceStatusHint !== undefined ||
                lockedBaseFormIds.has(blockedForm.id) ||
                formReferenceCount(referenceGuard.index, blockedForm) > 0
              )
                return;
              const result = deleteConcreteForm(
                content,
                pos.pos_id,
                blockedForm.id
              );
              if (result.ok) onChange(result.value);
              setBlockedFormId(undefined);
            }}
          >
            删除词形
          </MuiButton>
        </MuiDialogActions>
      </MuiDialog>
    </>
  );
}
