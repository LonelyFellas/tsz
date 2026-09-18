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

  it("已失效的引用不锁编辑：只挡发布不挡保存，锁住反而挡住本地修复；徽标照常计数", () => {
    const stale = sharedSentenceReference(target, { stale: true });
    const staleComponent = phraseComponentReference(target, { stale: true });
    const onlyStale = buildReferenceIndex(
      inboundReferences([stale, staleComponent])
    );
    expect(nodesReferenceCount(onlyStale, [base.id, baseVariantId])).toBe(2);
    expect(formReferenceCount(onlyStale, base)).toBe(0);
    expect(posReferenceCount(onlyStale, pos, ["sense-1"])).toBe(0);
    expect(senseReferenceCount(onlyStale, "sense-1")).toBe(0);
    expect(groupDeleteReferenceCount(onlyStale, pos, group)).toBe(0);
    expect(dialectRuleLocks(onlyStale, pos, group)).toEqual({
      split: 0,
      merge: 0
    });

    const fresh = sharedSentenceReference(target, {
      sentence_id: "sentence-2"
    });
    expect(
      formReferenceCount(
        buildReferenceIndex(inboundReferences([stale, fresh])),
        base
      )
    ).toBe(1);

    // 明细被截断：完整计数减去明细里的失效条数（后端把失效项排在前面）。
    const truncated = buildReferenceIndex(
      inboundReferences([stale, fresh], { items: [stale], truncated: true })
    );
    expect(nodesReferenceCount(truncated, [base.id])).toBe(2);
    expect(formReferenceCount(truncated, base)).toBe(1);
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
      spellingConflictReferences(index, base, [baseVariantId], "Rock'n'Roll ")
    ).toEqual([]);
    const conflicting = spellingConflictReferences(
      index,
      base,
      [baseVariantId],
      "rock and roll"
    );
    expect(conflicting.map((reference) => reference.kind)).toEqual([
      "shared_sentence"
    ]);
    // 未被引用的变体改拼写不受影响。
    expect(spellingConflictReferences(index, base, ["other"], "x")).toEqual([]);
  });

  it("结构漂移后实例 id 变了：片段与任何一侧都对不上才报冲突，不误报", () => {
    const driftedForm = ukUsFormFixture({
      id: "form-drift",
      uk: { id: "variant-uk", spelling: "harbour" },
      us: { id: "variant-us", spelling: "harbor" }
    });
    const driftedTarget = {
      pos_id: pos.pos_id,
      form_id: "form-drift",
      variant_id: "variant-gone",
      sense_id: "sense-1"
    };
    // 片段与 us 侧一致：uk 格容忍（后端是「任一侧拼写匹配即成立」），不误报。
    const matchesOtherSide = buildReferenceIndex(
      inboundReferences([
        sharedSentenceReference(driftedTarget, { surface: "harbor" })
      ])
    );
    expect(
      spellingConflictReferences(
        matchesOtherSide,
        driftedForm,
        ["variant-uk"],
        "harbour"
      )
    ).toEqual([]);
    // 片段与任何一侧都对不上：报冲突。
    const matchesNoSide = buildReferenceIndex(
      inboundReferences([
        sharedSentenceReference(driftedTarget, { surface: "harbourx" })
      ])
    );
    expect(
      spellingConflictReferences(
        matchesNoSide,
        driftedForm,
        ["variant-uk"],
        "harbour"
      )
    ).toHaveLength(1);
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

  it("词形组引用链接能切换到来源词性并展开定位具体组", () => {
    const reference = draftRelationReference("sense-1", {
      kind: "form_group_sense_binding",
      source: { entry_id: "entry-source", node_id: group.id }
    });
    const link = referenceLink(reference);
    expect(link.kind).toBe("entry");
    if (link.kind !== "entry") throw new Error("expected entry link");
    const url = new URL(link.href, "https://admin.test");
    expect(url.pathname).toBe("/words/entry-source/v3/wizard/forms");
    const word = {
      forms: {
        ...forms,
        pos: [{ ...pos, pos_id: "other-pos", forms: [], form_groups: [] }, pos]
      },
      meanings: { sense_groups: [], pos: [] }
    };
    expect(locateV3Node(word, url.searchParams.get("focus_node")!)).toEqual({
      step: "forms",
      node_id: group.id,
      field: "scope",
      pos_id: pos.pos_id,
      form_group_id: group.id,
      ancestor_node_ids: [pos.pos_id]
    });
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
