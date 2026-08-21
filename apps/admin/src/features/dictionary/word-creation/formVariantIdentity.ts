import type {
  DraftFormsStepContent,
  WordDerivedFormSlotV2,
  WordFormVariantV2,
  WordPosFormsV2
} from "@tsz/types";

/**
 * 词形变体的节点身份账本。
 *
 * 后端把方言编进节点角色（`forms.form_variant:<dialect>`），并对
 * (词条, 父槽位, 角色) 建了唯一索引：同一槽位同一方言的节点 ID 一经保存就永久
 * 绑定。英美拆分会让 `common` 变体暂时从表单里消失，合并回来时若重新生成 ID，
 * 提交会被判 `stable_node_id_changed`，整步都进不去。
 *
 * 账本记下每个槽位出现过的方言节点，槽位重新出现时沿用最初的 ID。
 *
 * 边界：账本只活在当前向导实例里。若在拆分状态下保存后刷新页面（或换设备），
 * 已退役的 `common` 节点 ID 既不在草稿响应里、也不在账本里，合并回共用仍会被
 * 判 `stable_node_id_changed`。要彻底收口需要后端在草稿响应里暴露已退役的稳定
 * 槽位身份，见 tsz-rust `docs/frontend-integration.md` §10.3。
 */
export type FormVariantIdentityLedger = Map<string, string>;

type FormSlot = WordPosFormsV2["base_form"] | WordDerivedFormSlotV2;

function identityKey(slotId: string, dialect: WordFormVariantV2["dialect"]) {
  return `${slotId}:${dialect}`;
}

export function createFormVariantIdentityLedger(): FormVariantIdentityLedger {
  return new Map();
}

function applyToSlot<T extends FormSlot>(
  ledger: FormVariantIdentityLedger,
  slot: T
): T {
  let changed = false;
  const variants = slot.variants.map((variant) => {
    const key = identityKey(slot.id, variant.dialect);
    const known = ledger.get(key);
    if (known === undefined) {
      ledger.set(key, variant.id);
      return variant;
    }
    if (known === variant.id) return variant;
    changed = true;
    return { ...variant, id: known };
  });
  return changed ? { ...slot, variants } : slot;
}

/**
 * 把内容里的词形变体 ID 对齐到账本，并登记账本里还没有的槽位。
 *
 * 内容没有变化时原样返回，避免多一次无意义的重渲染。
 */
export function applyFormVariantIdentities(
  ledger: FormVariantIdentityLedger,
  content: DraftFormsStepContent
): DraftFormsStepContent {
  let changed = false;
  const pos = content.pos.map((item) => {
    const baseForm = applyToSlot(ledger, item.base_form);
    const formGroups = item.form_groups.map((group) => {
      const slots = group.slots.map((slot) => applyToSlot(ledger, slot));
      return slots.every((slot, index) => slot === group.slots[index])
        ? group
        : { ...group, slots };
    });
    if (
      baseForm === item.base_form &&
      formGroups.every((group, index) => group === item.form_groups[index])
    ) {
      return item;
    }
    changed = true;
    return { ...item, base_form: baseForm, form_groups: formGroups };
  });
  return changed ? { pos } : content;
}
