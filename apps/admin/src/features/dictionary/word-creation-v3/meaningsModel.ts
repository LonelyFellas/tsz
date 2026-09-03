import type {
  Dialect,
  DialectModeV3,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  EnglishTextV3,
  GrammarStructureV3,
  RichTextV3,
  RichTextVariantV3,
  SentenceTranslationBandV3,
  WordDefinitionV3,
  WordPosMeaningsWritableV3,
  WordSentenceTranslationV3
} from "@tsz/types";

export interface RelationDisplaySnapshot {
  headword?: string;
  gloss?: string;
  prebinding_state?: "waiting_first_sense" | "target_sense_deleted";
  target_status?: "draft" | "published" | "archived";
}

export type RelationDisplaySnapshots = Readonly<
  Record<string, RelationDisplaySnapshot>
>;

export function sentenceTranslationBand(
  level: string
): SentenceTranslationBandV3 {
  if (level === "C1" || level === "C2") return "c1_c2";
  if (level === "A1" || level === "A2") return "a1_a2";
  return "b1_b2";
}

export function sentenceTranslationsV3(sentence: {
  level: string;
  zh_text_id: string;
  zh_text: RichTextV3;
  zh_translations?: WordSentenceTranslationV3[];
}): WordSentenceTranslationV3[] {
  const translations =
    sentence.zh_translations && sentence.zh_translations.length > 0
      ? sentence.zh_translations
      : [
          {
            id: sentence.zh_text_id,
            band: sentenceTranslationBand(sentence.level),
            content: sentence.zh_text
          }
        ];
  return translations.map((translation) => ({
    id: translation.id,
    band: translation.band,
    content: cloneRichText(translation.content)
  }));
}

export function relationDisplaySnapshots(
  canonical: DraftMeaningsStepContentV3
): RelationDisplaySnapshots {
  const snapshots: Record<string, RelationDisplaySnapshot> = {};
  for (const pos of canonical.pos) {
    for (const sense of pos.senses) {
      for (const relation of sense.relations) {
        if (
          !relation.target_headword &&
          !relation.target_gloss &&
          !relation.prebinding_state &&
          !relation.target_status
        )
          continue;
        snapshots[relation.id] = {
          ...(relation.target_headword
            ? { headword: relation.target_headword }
            : {}),
          ...(relation.target_gloss ? { gloss: relation.target_gloss } : {}),
          ...(relation.prebinding_state
            ? { prebinding_state: relation.prebinding_state }
            : {}),
          ...(relation.target_status
            ? { target_status: relation.target_status }
            : {})
        };
      }
    }
  }
  return snapshots;
}

export interface EditableEnglishTextV3 {
  dialect: Dialect;
  variant_id: string;
  text: string;
}

function cloneRichText(value: RichTextV3): RichTextV3 {
  if (value.version === 1) {
    return {
      version: 1,
      text: value.text,
      spans: value.spans.map((span) => ({ ...span })),
      liaisons: [...value.liaisons]
    };
  }
  return {
    version: 2,
    text: value.text,
    annotations: value.annotations.map((annotation) => ({ ...annotation }))
  };
}

function cloneVariant(variant: RichTextVariantV3): RichTextVariantV3 {
  return {
    id: variant.id,
    origin: variant.origin,
    value: cloneRichText(variant.value)
  };
}

function cloneEnglishText(value: EnglishTextV3): EnglishTextV3 {
  if (value.mode === "unified") {
    return { mode: "unified", common: cloneVariant(value.common) };
  }
  return {
    mode: "distinguish",
    source_dialect: value.source_dialect,
    uk:
      value.uk.state === "ready"
        ? { state: "ready", variant: cloneVariant(value.uk.variant) }
        : { state: "missing" },
    us:
      value.us.state === "ready"
        ? { state: "ready", variant: cloneVariant(value.us.variant) }
        : { state: "missing" }
  };
}

function cloneDefinition(definition: WordDefinitionV3): WordDefinitionV3 {
  const common = {
    id: definition.id,
    level: definition.level,
    ...(definition.grammar_structure_id === undefined
      ? {}
      : { grammar_structure_id: definition.grammar_structure_id })
  };
  if (
    definition.definition_mode === "zh_definition" ||
    definition.definition_mode === "zh_sentence"
  ) {
    return {
      ...common,
      definition_mode: definition.definition_mode,
      content_id: definition.content_id,
      content: cloneRichText(definition.content)
    };
  }
  return {
    ...common,
    definition_mode: definition.definition_mode,
    content: cloneEnglishText(definition.content as EnglishTextV3)
  };
}

/**
 * Convert a canonical meanings response into the exact writable request shape.
 * Read-only association resolution and target display snapshots are deliberately
 * reconstructed away instead of being retained through object spread.
 */
export function toWritableMeanings(
  canonical: DraftMeaningsStepContentV3
): DraftMeaningsStepContentWritableV3 {
  return {
    sense_groups: canonical.sense_groups.map((group) => ({
      id: group.id,
      name_zh: group.name_zh,
      name_en: group.name_en
    })),
    pos: canonical.pos.map((pos) => ({
      pos_id: pos.pos_id,
      grammar_structures: pos.grammar_structures.map((structure) => ({
        id: structure.id,
        variants: structure.variants.map((variant) => ({
          id: variant.id,
          dialect: variant.dialect,
          content: cloneRichText(variant.content)
        }))
      })),
      senses: pos.senses.map((sense) => ({
        id: sense.id,
        sub_pos: sense.sub_pos,
        level: sense.level,
        ...(sense.sense_group_id === undefined
          ? {}
          : { sense_group_id: sense.sense_group_id }),
        ...(sense.frequency === undefined
          ? {}
          : { frequency: sense.frequency }),
        depends_on_context: sense.depends_on_context,
        // 释义级成分用词是后端 B1 起才返回的可选字段；逐字段重建时必须显式带上，
        // 否则草稿一进编辑器就丢、再保存一次就把后端清空。
        ...(sense.component_usages === undefined
          ? {}
          : {
              component_usages: sense.component_usages.map((usage) =>
                structuredClone(usage)
              )
            }),
        definitions: sense.definitions.map(cloneDefinition),
        sentences: sense.sentences.map((sentence) => ({
          id: sentence.id,
          level: sentence.level,
          en_text: cloneEnglishText(sentence.en_text),
          zh_text_id: sentence.zh_text_id,
          zh_text: cloneRichText(sentence.zh_text),
          zh_translations: sentenceTranslationsV3(sentence),
          links: sentence.links.map((link) => ({
            word_id: link.word_id,
            sense_id: link.sense_id,
            role: link.role
          }))
        })),
        relations: sense.relations.map((relation) => {
          const hasTargetWord = Boolean(relation.target_word_id);
          const hasTargetSense = Boolean(relation.target_sense_id);
          const bound = hasTargetWord && hasTargetSense;
          const prebound = Boolean(relation.prebound_target_word_id);
          const pendingHeadword = relation.pending_target_headword?.trim();
          const pendingGloss = relation.pending_target_gloss?.trim();
          if (
            hasTargetWord !== hasTargetSense ||
            (bound &&
              (prebound ||
                Boolean(pendingHeadword) ||
                Boolean(pendingGloss))) ||
            (prebound &&
              (Boolean(pendingHeadword) ||
                !relation.prebinding_state ||
                bound)) ||
            (!prebound && Boolean(relation.prebinding_state)) ||
            (!bound && !prebound && !pendingHeadword) ||
            (!bound && !prebound && Boolean(relation.target_status))
          ) {
            throw new Error(`invalid relation target shape: ${relation.id}`);
          }
          return {
            id: relation.id,
            relation: relation.relation,
            ...(bound
              ? {
                  target_word_id: relation.target_word_id,
                  target_sense_id: relation.target_sense_id
                }
              : prebound
                ? {
                    prebound_target_word_id: relation.prebound_target_word_id,
                    ...(pendingGloss
                      ? { pending_target_gloss: pendingGloss }
                      : {})
                  }
                : {
                    ...(pendingHeadword
                      ? { pending_target_headword: pendingHeadword }
                      : {}),
                    ...(pendingHeadword && pendingGloss
                      ? { pending_target_gloss: pendingGloss }
                      : {})
                  }),
            score: relation.score
          };
        })
      }))
    }))
  };
}

/** 词性拼写模式决定语法结构的方言形态：distinguish → uk/us 双条，否则单条 common。 */
function grammarVariantDialects(
  spellingMode: DialectModeV3
): readonly Dialect[] {
  return spellingMode === "distinguish" ? ["uk", "us"] : ["common"];
}

export function spellingModeForPos(
  forms: DraftFormsStepContentV3 | undefined,
  posId: string
): DialectModeV3 {
  return (
    forms?.pos.find((pos) => pos.pos_id === posId)?.dialect_rules
      .spelling_mode ?? "unified"
  );
}

export function newGrammarStructure(
  idFactory: () => string,
  spellingMode: DialectModeV3
): GrammarStructureV3 {
  return {
    id: idFactory(),
    variants: grammarVariantDialects(spellingMode).map((dialect) => ({
      id: idFactory(),
      dialect,
      content: { version: 2, text: "", annotations: [] }
    }))
  };
}

function createDefaultPosMeanings(
  posId: string,
  wordId: string,
  senseGroupId: string,
  spellingMode: DialectModeV3,
  idFactory: () => string
): WordPosMeaningsWritableV3 {
  const senseId = idFactory();
  const translationId = idFactory();
  return {
    pos_id: posId,
    grammar_structures: [newGrammarStructure(idFactory, spellingMode)],
    senses: [
      {
        id: senseId,
        sub_pos: "",
        level: "A1",
        sense_group_id: senseGroupId,
        depends_on_context: false,
        definitions: [
          {
            id: idFactory(),
            level: "A1",
            definition_mode: "zh_definition",
            content_id: idFactory(),
            content: { version: 2, text: "", annotations: [] }
          }
        ],
        sentences: [
          {
            id: idFactory(),
            level: "A1",
            en_text: {
              mode: "unified",
              common: {
                id: idFactory(),
                origin: "manual",
                value: { version: 2, text: "", annotations: [] }
              }
            },
            zh_text_id: translationId,
            zh_text: { version: 2, text: "", annotations: [] },
            zh_translations: [
              {
                id: translationId,
                band: "a1_a2",
                content: { version: 2, text: "", annotations: [] }
              }
            ],
            links: [{ word_id: wordId, sense_id: senseId, role: "focus" }]
          }
        ],
        relations: []
      }
    ]
  };
}

/**
 * Adds the product defaults directly to a writable V3 draft. Sense groups are
 * word-level and shared across POS: removing a POS never removes groups, and
 * a new POS reuses the first existing group instead of minting its own.
 */
export function ensureV3MeaningsForForms(
  wordId: string,
  forms: DraftFormsStepContentV3,
  meanings: DraftMeaningsStepContentWritableV3,
  idFactory: () => string,
  missingPosTemplates?: DraftMeaningsStepContentWritableV3
): DraftMeaningsStepContentWritableV3 {
  const formPosIds = new Set(forms.pos.map((pos) => pos.pos_id));
  const remainingPos = meanings.pos.filter((pos) => formPosIds.has(pos.pos_id));
  const removedPos = meanings.pos.filter((pos) => !formPosIds.has(pos.pos_id));
  const removedSenseIds = new Set(
    removedPos.flatMap((pos) => pos.senses.map((sense) => sense.id))
  );
  let crossReferencesChanged = false;
  const keptPos = remainingPos.map((pos) => {
    let posChanged = false;
    const senses = pos.senses.map((sense) => {
      const relations = sense.relations.filter(
        (relation) =>
          !(
            relation.target_word_id === wordId &&
            relation.target_sense_id &&
            removedSenseIds.has(relation.target_sense_id)
          )
      );
      const sentences = sense.sentences.map((sentence) => {
        const links = sentence.links.filter(
          (link) =>
            !(link.word_id === wordId && removedSenseIds.has(link.sense_id))
        );
        if (links.length === sentence.links.length) return sentence;
        posChanged = true;
        return { ...sentence, links };
      });
      if (
        relations.length === sense.relations.length &&
        sentences.every(
          (sentence, index) => sentence === sense.sentences[index]
        )
      ) {
        return sense;
      }
      posChanged = true;
      return { ...sense, relations, sentences };
    });
    if (!posChanged) return pos;
    crossReferencesChanged = true;
    return { ...pos, senses };
  });
  let nextGroups = meanings.sense_groups;
  let nextPos =
    removedPos.length === 0 && !crossReferencesChanged ? meanings.pos : keptPos;
  let changed = nextPos !== meanings.pos;
  const groupById = new Map(nextGroups.map((group) => [group.id, group]));
  const appendGroup = (
    group: DraftMeaningsStepContentWritableV3["sense_groups"][number]
  ) => {
    if (nextGroups === meanings.sense_groups) nextGroups = [...nextGroups];
    nextGroups.push(group);
    groupById.set(group.id, group);
    changed = true;
  };

  for (const pos of nextPos) {
    for (const sense of pos.senses) {
      if (sense.sense_group_id && !groupById.has(sense.sense_group_id)) {
        appendGroup({ id: sense.sense_group_id, name_zh: "", name_en: "" });
      }
    }
  }

  const spellingModeByPos = new Map(
    forms.pos.map(
      (pos) => [pos.pos_id, pos.dialect_rules.spelling_mode] as const
    )
  );
  const existingPosIds = new Set(nextPos.map((pos) => pos.pos_id));
  const missingPosIds: string[] = [];
  for (const pos of forms.pos) {
    if (existingPosIds.has(pos.pos_id)) continue;
    existingPosIds.add(pos.pos_id);
    missingPosIds.push(pos.pos_id);
  }
  for (const posId of missingPosIds) {
    const templateGroups = missingPosTemplates?.sense_groups ?? [];
    const template = missingPosTemplates?.pos.find(
      (candidate) => candidate.pos_id === posId
    );
    if (template) {
      const templateGroupIds = new Set(
        template.senses.flatMap((sense) =>
          sense.sense_group_id ? [sense.sense_group_id] : []
        )
      );
      for (const group of templateGroups) {
        if (templateGroupIds.has(group.id) && !groupById.has(group.id)) {
          appendGroup(group);
        }
      }
      if (nextPos === meanings.pos) nextPos = [...nextPos];
      nextPos.push(template);
      changed = true;
      continue;
    }
    let senseGroupId = nextGroups[0]?.id;
    if (!senseGroupId) {
      const senseGroup = { id: idFactory(), name_zh: "", name_en: "" };
      appendGroup(senseGroup);
      senseGroupId = senseGroup.id;
    }
    if (nextPos === meanings.pos) nextPos = [...nextPos];
    nextPos.push(
      createDefaultPosMeanings(
        posId,
        wordId,
        senseGroupId,
        spellingModeByPos.get(posId) ?? "unified",
        idFactory
      )
    );
    changed = true;
  }

  // 语法结构方言形态跟随词性拼写模式双向归一（对齐 forms 侧 applyDialectRules）：
  // distinguish 把单条 common 拆成 uk/us 双条（文本复制），unified 把 uk/us 合回
  // 单条 common（取英式文本，英式为空则取美式——与后端补全偏英式同口径）。
  // 转换一律旧节点退场换新 ID：text_variant 的 node_role 编入方言，原 ID 换方言
  // 会被后端 422 拒。missingPosTemplates 里同 ID 结构若已是目标形态则直接复用其
  // variants，让 draft 与 clean 两次装配产出相同节点 ID，不产生虚假脏标记。
  const templateGrammarById = new Map(
    (missingPosTemplates?.pos ?? []).flatMap((pos) =>
      pos.grammar_structures.map((grammar) => [grammar.id, grammar] as const)
    )
  );
  for (const [posIndex, pos] of nextPos.entries()) {
    const spellingMode = spellingModeByPos.get(pos.pos_id);
    if (spellingMode === undefined) continue;
    let currentPos = pos;
    for (const [grammarIndex, grammar] of pos.grammar_structures.entries()) {
      const variants = normalizeGrammarVariants(
        grammar,
        spellingMode,
        templateGrammarById.get(grammar.id),
        idFactory
      );
      if (!variants) continue;
      if (currentPos === pos) {
        currentPos = {
          ...pos,
          grammar_structures: [...pos.grammar_structures]
        };
      }
      currentPos.grammar_structures[grammarIndex] = { ...grammar, variants };
    }
    if (currentPos !== pos) {
      if (nextPos === meanings.pos) nextPos = [...nextPos];
      nextPos[posIndex] = currentPos;
      changed = true;
    }
  }

  return changed ? { sense_groups: nextGroups, pos: nextPos } : meanings;
}

function variantDialectsMatch(
  variants: readonly GrammarStructureV3["variants"][number][],
  dialects: readonly Dialect[]
) {
  return (
    variants.length === dialects.length &&
    dialects.every((dialect) =>
      variants.some((variant) => variant.dialect === dialect)
    )
  );
}

/**
 * 返回归一后的 variants；形态已符合或属于无法安全转换的畸形（交给发布校验兜底）
 * 时返回 undefined 表示不动。
 *
 * template 只复用节点 ID，内容一律取自被归一结构自身——若把 template 的内容
 * 一并带过来，clean 基线会吸收 draft 的未保存文本，脏比对失真后 canonical
 * 同步会把用户编辑静默冲掉。
 */
function normalizeGrammarVariants(
  grammar: GrammarStructureV3,
  spellingMode: DialectModeV3,
  template: GrammarStructureV3 | undefined,
  idFactory: () => string
): GrammarStructureV3["variants"] | undefined {
  const dialects = grammarVariantDialects(spellingMode);
  if (variantDialectsMatch(grammar.variants, dialects)) return undefined;
  const templateVariants =
    template && variantDialectsMatch(template.variants, dialects)
      ? template.variants
      : undefined;
  const variantId = (dialect: Dialect) =>
    templateVariants?.find((variant) => variant.dialect === dialect)?.id ??
    idFactory();
  if (spellingMode === "distinguish") {
    const only =
      grammar.variants.length === 1 ? grammar.variants[0] : undefined;
    if (!only || only.dialect !== "common") return undefined;
    return dialects.map((dialect) => ({
      id: variantId(dialect),
      dialect,
      content: structuredClone(only.content)
    }));
  }
  const uk = grammar.variants.find((variant) => variant.dialect === "uk");
  const us = grammar.variants.find((variant) => variant.dialect === "us");
  if (grammar.variants.length !== 2 || !uk || !us) return undefined;
  const source = uk.content.text.trim() ? uk : us;
  return [
    {
      id: variantId("common"),
      dialect: "common",
      content: structuredClone(source.content)
    }
  ];
}

export function replaceRichText(value: RichTextV3, text: string): RichTextV3 {
  const codepoints = [...text].length;
  if (value.version === 1) {
    return {
      version: 1,
      text,
      spans: value.spans
        .filter((span) => span.start < span.end && span.end <= codepoints)
        .map((span) => ({ ...span })),
      liaisons: value.liaisons.filter(
        (liaison) => liaison >= 0 && liaison + 2 <= codepoints
      )
    };
  }
  return {
    version: 2,
    text,
    annotations: value.annotations
      .filter((annotation) =>
        annotation.type === "pause"
          ? annotation.at >= 0 && annotation.at <= codepoints
          : annotation.start < annotation.end && annotation.end <= codepoints
      )
      .map((annotation) => ({ ...annotation }))
  };
}

export function editableEnglishText(
  value: EnglishTextV3
): EditableEnglishTextV3[] {
  if (value.mode === "unified") {
    return [
      {
        dialect: "common",
        variant_id: value.common.id,
        text: value.common.value.text
      }
    ];
  }
  return (["uk", "us"] as const).flatMap((dialect) => {
    const slot = value[dialect];
    return slot.state === "ready"
      ? [
          {
            dialect,
            variant_id: slot.variant.id,
            text: slot.variant.value.text
          }
        ]
      : [];
  });
}

export function replaceEnglishText(
  value: EnglishTextV3,
  dialect: Dialect,
  text: string
): EnglishTextV3 {
  const next = cloneEnglishText(value);
  if (next.mode === "unified") {
    if (dialect !== "common") {
      throw new Error(`Dialect ${dialect} is not editable in unified mode`);
    }
    next.common.value = replaceRichText(next.common.value, text);
    return next;
  }
  if (dialect === "common") {
    throw new Error("Common dialect is not editable in distinguish mode");
  }
  const slot = next[dialect];
  if (slot.state !== "ready") {
    throw new Error(`Dialect ${dialect} is not ready`);
  }
  slot.variant.value = replaceRichText(slot.variant.value, text);
  return next;
}

/**
 * 旧后端（capabilities.sense_component_usages 缺失）对 sense 上的未知字段会 400：
 * 发送前把释义级成分用词整段剥掉，其余内容原样。
 */
export function stripSenseComponentUsages(
  content: DraftMeaningsStepContentWritableV3
): DraftMeaningsStepContentWritableV3 {
  if (
    !content.pos.some((pos) =>
      pos.senses.some((sense) => sense.component_usages !== undefined)
    )
  ) {
    return content;
  }
  return {
    ...content,
    pos: content.pos.map((pos) => ({
      ...pos,
      senses: pos.senses.map((sense) => {
        const { component_usages: _dropped, ...rest } = sense;
        return rest;
      })
    }))
  };
}
