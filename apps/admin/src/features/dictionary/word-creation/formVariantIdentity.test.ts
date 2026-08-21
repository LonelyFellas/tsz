import type { DraftFormsStepContent, WordFormVariantV2 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import {
  applyFormVariantIdentities,
  createFormVariantIdentityLedger,
  rememberRetiredStableSlots
} from "./formVariantIdentity";

function variant(
  id: string,
  dialect: WordFormVariantV2["dialect"]
): WordFormVariantV2 {
  return {
    id,
    dialect,
    spelling: "testability",
    origin: "manual",
    pronunciations: []
  };
}

function content(
  baseVariants: WordFormVariantV2[],
  slotVariants: WordFormVariantV2[] = []
): DraftFormsStepContent {
  return {
    pos: [
      {
        pos_id: "pos-noun",
        pos: "noun",
        dialect_rules: { spelling_mode: "unified", phonetic_mode: "unified" },
        base_form: {
          id: "slot-base",
          form_type: "base",
          variants: baseVariants
        },
        form_groups: [
          {
            id: "group-1",
            is_regular: true,
            slots: slotVariants.length
              ? [
                  {
                    id: "slot-plural",
                    form_type: "plural",
                    variants: slotVariants
                  }
                ]
              : []
          }
        ]
      }
    ]
  };
}

describe("applyFormVariantIdentities", () => {
  it("首次登记不改内容，原样返回同一个引用", () => {
    const ledger = createFormVariantIdentityLedger();
    const initial = content([variant("base-common", "common")]);

    expect(applyFormVariantIdentities(ledger, initial)).toBe(initial);
  });

  it("槽位消失再出现时沿用最初的节点 ID", () => {
    const ledger = createFormVariantIdentityLedger();
    applyFormVariantIdentities(
      ledger,
      content([variant("base-common", "common")])
    );

    // 英美拆分：common 暂时消失，uk / us 各拿到新 ID。
    const split = applyFormVariantIdentities(
      ledger,
      content([variant("new-uk", "uk"), variant("new-us", "us")])
    );
    expect(split.pos[0]!.base_form.variants.map((item) => item.id)).toEqual([
      "new-uk",
      "new-us"
    ]);

    // 合并回共用：重新生成的 ID 会被换回最初那个。
    const merged = applyFormVariantIdentities(
      ledger,
      content([variant("regenerated-common", "common")])
    );
    expect(merged.pos[0]!.base_form.variants.map((item) => item.id)).toEqual([
      "base-common"
    ]);

    // 再次拆分同样沿用第一次拆分出来的两个 ID。
    const resplit = applyFormVariantIdentities(
      ledger,
      content([
        variant("regenerated-uk", "uk"),
        variant("regenerated-us", "us")
      ])
    );
    expect(resplit.pos[0]!.base_form.variants.map((item) => item.id)).toEqual([
      "new-uk",
      "new-us"
    ]);
  });

  it("派生词形槽位与原形各记各的身份", () => {
    const ledger = createFormVariantIdentityLedger();
    applyFormVariantIdentities(
      ledger,
      content(
        [variant("base-common", "common")],
        [variant("plural-common", "common")]
      )
    );

    const merged = applyFormVariantIdentities(
      ledger,
      content(
        [variant("regenerated-base", "common")],
        [variant("regenerated-plural", "common")]
      )
    );
    expect(merged.pos[0]!.base_form.variants[0]!.id).toBe("base-common");
    expect(merged.pos[0]!.form_groups[0]!.slots[0]!.variants[0]!.id).toBe(
      "plural-common"
    );
  });

  it("换 ID 时只重建受影响的槽位，其他节点保持引用不变", () => {
    const ledger = createFormVariantIdentityLedger();
    const initial = content(
      [variant("base-common", "common")],
      [variant("plural-common", "common")]
    );
    applyFormVariantIdentities(ledger, initial);

    const next = content(
      [variant("regenerated-base", "common")],
      [variant("plural-common", "common")]
    );
    const aligned = applyFormVariantIdentities(ledger, next);
    expect(aligned).not.toBe(next);
    expect(aligned.pos[0]!.form_groups[0]).toBe(next.pos[0]!.form_groups[0]);
    expect(aligned.pos[0]!.base_form.variants[0]!.spelling).toBe("testability");
  });

  it("多个词性各自独立，不受其他词性的槽位影响", () => {
    const ledger = createFormVariantIdentityLedger();
    const first = content([variant("base-common", "common")]);
    const second: DraftFormsStepContent = {
      pos: [
        first.pos[0]!,
        {
          ...first.pos[0]!,
          pos_id: "pos-verb",
          pos: "verb",
          base_form: {
            id: "slot-verb-base",
            form_type: "base",
            variants: [variant("verb-base-common", "common")]
          }
        }
      ]
    };
    applyFormVariantIdentities(ledger, second);

    const merged = applyFormVariantIdentities(ledger, {
      pos: second.pos.map((item) => ({
        ...item,
        base_form: {
          ...item.base_form,
          variants: [variant(`regenerated-${item.pos_id}`, "common")]
        }
      }))
    });
    expect(merged.pos[0]!.base_form.variants[0]!.id).toBe("base-common");
    expect(merged.pos[1]!.base_form.variants[0]!.id).toBe("verb-base-common");
  });
});

describe("rememberRetiredStableSlots", () => {
  it("退役的 common 身份补进账本后，重建的槽位沿用原 ID", () => {
    const ledger = createFormVariantIdentityLedger();
    // 刷新后的草稿只剩英美两条，账本一开始是空的。
    applyFormVariantIdentities(
      ledger,
      content([variant("uk-id", "uk"), variant("us-id", "us")])
    );
    rememberRetiredStableSlots(ledger, [
      {
        id: "retired-common",
        parent_node_id: "slot-base",
        node_role: "forms.form_variant:common"
      }
    ]);

    const merged = applyFormVariantIdentities(
      ledger,
      content([variant("freshly-minted", "common")])
    );
    expect(merged.pos[0]!.base_form.variants[0]!.id).toBe("retired-common");
  });

  it("只认词形变体角色，其他稳定槽位不进本账本", () => {
    const ledger = createFormVariantIdentityLedger();
    rememberRetiredStableSlots(ledger, [
      {
        id: "meaning-text",
        parent_node_id: "slot-base",
        node_role: "meanings.content:en:common"
      }
    ]);

    const next = content([variant("minted", "common")]);
    expect(applyFormVariantIdentities(ledger, next)).toBe(next);
  });

  it("账本已有的键不会被退役清单覆盖", () => {
    const ledger = createFormVariantIdentityLedger();
    applyFormVariantIdentities(
      ledger,
      content([variant("live-common", "common")])
    );
    rememberRetiredStableSlots(ledger, [
      {
        id: "stale-common",
        parent_node_id: "slot-base",
        node_role: "forms.form_variant:common"
      }
    ]);

    const merged = applyFormVariantIdentities(
      ledger,
      content([variant("minted", "common")])
    );
    expect(merged.pos[0]!.base_form.variants[0]!.id).toBe("live-common");
  });
});
