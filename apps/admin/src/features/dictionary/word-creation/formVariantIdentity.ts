import type {
  DraftFormsStepContent,
  RetiredStableSlotV2,
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
 * 账本记下每个槽位出现过的方言节点，槽位重新出现时沿用最初的 ID。刷新或换设备后
 * 账本是空的，靠草稿响应的 `retired_stable_slots` 把退役身份补回来。
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

/** 词形变体节点角色的前缀，冒号之后是方言。 */
const FORM_VARIANT_ROLE_PREFIX = "forms.form_variant:";

/**
 * 把草稿响应里的退役稳定槽位登记进账本。
 *
 * 只认词形变体那部分角色；其余稳定槽位（释义、例句文本等）不归本账本管。
 * 已登记的键不覆盖——账本里的来源要么同样是服务端身份，要么是本次会话刚退役的，
 * 两者一致。
 */
export function rememberRetiredStableSlots(
  ledger: FormVariantIdentityLedger,
  slots: readonly RetiredStableSlotV2[]
): void {
  for (const slot of slots) {
    if (!slot.node_role.startsWith(FORM_VARIANT_ROLE_PREFIX)) continue;
    const dialect = slot.node_role.slice(FORM_VARIANT_ROLE_PREFIX.length);
    const key = `${slot.parent_node_id}:${dialect}`;
    if (!ledger.has(key)) ledger.set(key, slot.id);
  }
}
