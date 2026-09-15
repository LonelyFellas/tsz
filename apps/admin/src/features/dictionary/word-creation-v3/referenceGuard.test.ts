import type { AdminWordV3 } from "@tsz/types";
import { describe, expect, it } from "vitest";
import { commonFormFixture, formsFixture, ukUsFormFixture } from "./fixtures";
import {
  buildReferenceIndex,
  dialectRuleLocks,
  formReferenceCount,
  groupDeleteReferenceCount,
  locateV3Node,
  nodesReferenceCount,
  posReferenceCount,
  referenceLink,
  referencesForNodes,
  senseReferenceCount,
  spellingConflictReferences,
  spellingConflicts
} from "./referenceGuard";
import {
  draftRelationReference,
  inboundReferences,
  phraseComponentReference,
  sharedSentenceReference
} from "./referenceGuard.test.helper";

const forms = formsFixture();
const pos = forms.pos[0]!;
const base = pos.forms[0]!;
const baseVariantId =
  base.regional_variants.mode === "common"
    ? base.regional_variants.common.id
    : base.regional_variants.uk.id;
const group = pos.form_groups[0]!;
const target = {
  pos_id: pos.pos_id,
  form_id: base.id,
  variant_id: baseVariantId,
  sense_id: "sense-1"
};

describe("referenceGuard 判定", () => {
  it("按节点建索引：计数来自 nodes，明细按目标节点分桶并去重", () => {
    const sentence = sharedSentenceReference(target);
    const relation = draftRelationReference("sense-1");
    const index = buildReferenceIndex(inboundReferences([sentence, relation]));

    expect(index.status).toBe("loaded");
    expect(nodesReferenceCount(index, [pos.pos_id])).toBe(1);
    expect(senseReferenceCount(index, "sense-1")).toBe(2);
    // 原形既是 form_id 又是 base_form_id，只算一次。
    expect(formReferenceCount(index, base)).toBe(1);
    expect(referencesForNodes(index, [base.id, baseVariantId])).toEqual([
      sentence
    ]);
    // 词性下任一节点被引用即算词性被引用，跨节点也按引用去重。
    expect(posReferenceCount(index, pos, ["sense-1"])).toBe(2);
    expect(groupDeleteReferenceCount(index, pos, group)).toBe(1);
  });

  it("本地新增节点与空索引都不受限；加载失败标为不可用但不算有引用", () => {
    const loaded = buildReferenceIndex(inboundReferences([]));
    expect(formReferenceCount(loaded, base)).toBe(0);
    expect(buildReferenceIndex(undefined, "unavailable").status).toBe(
      "unavailable"
    );
    expect(
      formReferenceCount(
        buildReferenceIndex(
          inboundReferences([sharedSentenceReference(target)])
        ),
        commonFormFixture({ id: "local-form", variant_id: "local-variant" })
      )
    ).toBe(0);
  });

  it("明细被截断时按单节点完整计数兜底，不会把有引用报成 0", () => {
    const index = buildReferenceIndex(
      inboundReferences([sharedSentenceReference(target)], {
        items: [],
        truncated: true
      })
    );
    expect(index.stale).toEqual([]);
    expect(nodesReferenceCount(index, [base.id, baseVariantId])).toBe(1);
    expect(referencesForNodes(index, [base.id])).toEqual([]);
  });

  it("英美规则：通用变体被引用锁拆分，英美变体被引用锁合并，计数按引用去重", () => {
    const commonIndex = buildReferenceIndex(
      inboundReferences([
        sharedSentenceReference(target),
        phraseComponentReference(target)
      ])
    );
    expect(dialectRuleLocks(commonIndex, pos, group)).toEqual({
      split: 2,
      merge: 0
    });

    const ukForm = ukUsFormFixture({
      id: "form-ukus",
      uk: { id: "variant-uk" },
      us: { id: "variant-us" }
    });
    const ukPos = {
      ...pos,
      forms: [ukForm],
      form_groups: [
        { ...group, members: [{ id: "membership-uk", form_id: "form-ukus" }] }
      ]
    };
    const ukIndex = buildReferenceIndex(
      inboundReferences([
        phraseComponentReference({
          pos_id: pos.pos_id,
          form_id: "form-ukus",
          variant_id: "variant-uk",
          sense_id: "sense-1"
        })
      ])
    );
    expect(dialectRuleLocks(ukIndex, ukPos, ukPos.form_groups[0]!)).toEqual({
      split: 0,
      merge: 1
    });
    expect(formReferenceCount(ukIndex, ukForm)).toBe(1);
  });

  it("拼写冲突只看例句片段，规范化后一致（大小写 / 空白 / 弯引号）不算冲突", () => {
    const index = buildReferenceIndex(
      inboundReferences([
        sharedSentenceReference(target, { surface: "rock’n’roll" }),
        phraseComponentReference(target)
      ])
    );
    expect(
      spellingConflictReferences(index, [baseVariantId], "Rock'n'Roll ")
    ).toEqual([]);
    const conflicting = spellingConflictReferences(
      index,
      [baseVariantId],
      "rock and roll"
    );
    expect(conflicting.map((reference) => reference.kind)).toEqual([
      "shared_sentence"
    ]);
    // 未被引用的变体改拼写不受影响。
    expect(spellingConflictReferences(index, ["other"], "x")).toEqual([]);
  });

  it("spellingConflicts 扫整份词形草稿并定位到变体", () => {
    const index = buildReferenceIndex(
      inboundReferences([sharedSentenceReference(target, { surface: "orbit" })])
    );
    const edited = structuredClone(forms);
    const variants = edited.pos[0]!.forms[0]!.regional_variants;
    if (variants.mode === "common") variants.common.spelling = "orbits";
    const conflicts = spellingConflicts(index, edited);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({
      posId: pos.pos_id,
      formId: base.id,
      variantId: baseVariantId,
      spelling: "orbits"
    });
    if (variants.mode === "common") variants.common.spelling = "ORBIT";
    expect(spellingConflicts(index, edited)).toEqual([]);
  });

  it("失效引用单独列出", () => {
    const stale = sharedSentenceReference(target, { stale: true });
    const index = buildReferenceIndex(
      inboundReferences([stale, draftRelationReference("sense-1")])
    );
    expect(index.stale).toEqual([stale]);
  });

  it("跳转去处：同词条例句就地打开并给例句库备用链接，来源词条新标签页定位节点", () => {
    expect(referenceLink(sharedSentenceReference(target))).toEqual({
      kind: "local_sentence",
      senseId: "sense-1",
      posId: pos.pos_id,
      sentenceId: "sentence-1",
      libraryHref: "/sentences?sentence=sentence-1"
    });
    expect(referenceLink(draftRelationReference("sense-1"))).toEqual({
      kind: "entry",
      entryId: "entry-source",
      href: "/words/entry-source/v3/wizard/meanings?focus_node=relation-1"
    });
    // 已发布来源直接进编辑模式；变体级成分落到词形步。
    expect(
      referenceLink(
        phraseComponentReference(target, {
          source: {
            entry_id: "entry-phrase",
            entry_status: "published",
            node_id: "component-1"
          }
        })
      )
    ).toEqual({
      kind: "entry",
      entryId: "entry-phrase",
      href: "/words/entry-phrase/v3/wizard/forms?mode=edit&focus_node=component-1"
    });
    expect(
      referenceLink(
        sharedSentenceReference(target, {
          target: { pos_id: pos.pos_id },
          source: { sentence_id: "sentence-2" }
        })
      )
    ).toEqual({
      kind: "sentence_library",
      href: "/sentences?sentence=sentence-2"
    });
    expect(
      referenceLink(draftRelationReference("sense-1", { source: {} }))
    ).toEqual({ kind: "none" });
  });

  it("locateV3Node：词形与变体落到词形步，词义及其关联 / 成分落到词义卡片", () => {
    const word: Pick<AdminWordV3, "forms" | "meanings"> = {
      forms,
      meanings: {
        sense_groups: [],
        pos: [
          {
            pos_id: pos.pos_id,
            grammar_structures: [],
            senses: [
              {
                id: "sense-1",
                sub_pos: "",
                level: "A1",
                depends_on_context: false,
                definitions: [],
                sentences: [],
                relations: [
                  {
                    id: "relation-1",
                    relation: "synonym",
                    score: "80.00",
                    target_word_id: "entry-2",
                    target_sense_id: "sense-x"
                  }
                ]
              }
            ]
          }
        ]
      } as AdminWordV3["meanings"]
    };
    expect(locateV3Node(word, base.id)).toMatchObject({
      step: "forms",
      node_id: base.id,
      field: "form_type",
      pos_id: pos.pos_id,
      form_group_id: group.id,
      form_id: base.id
    });
    expect(locateV3Node(word, baseVariantId)).toMatchObject({
      step: "forms",
      node_id: baseVariantId,
      field: "spelling",
      variant_id: baseVariantId
    });
    expect(locateV3Node(word, "relation-1")).toEqual({
      step: "meanings",
      node_id: "sense-1",
      field: "sense",
      pos_id: pos.pos_id,
      ancestor_node_ids: [pos.pos_id]
    });
    expect(locateV3Node(word, "sense-x")).toBeUndefined();
  });
});
