import type {
  Dialect,
  DraftFormsStepContentV3,
  DraftMeaningsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  EnglishTextV3,
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
        if (!relation.target_headword && !relation.target_gloss) continue;
        snapshots[relation.id] = {
          ...(relation.target_headword
            ? { headword: relation.target_headword }
            : {}),
          ...(relation.target_gloss ? { gloss: relation.target_gloss } : {})
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
          const bound = Boolean(
            relation.target_word_id && relation.target_sense_id
          );
          const pendingHeadword = relation.pending_target_headword?.trim();
          const pendingGloss = relation.pending_target_gloss?.trim();
          return {
            id: relation.id,
            relation: relation.relation,
            ...(bound
              ? {
                  target_word_id: relation.target_word_id,
                  target_sense_id: relation.target_sense_id
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

function createDefaultPosMeanings(
  posId: string,
  wordId: string,
  senseGroupId: string,
  idFactory: () => string
): WordPosMeaningsWritableV3 {
  const senseId = idFactory();
  const translationId = idFactory();
  return {
    pos_id: posId,
    grammar_structures: [
      {
        id: idFactory(),
        variants: [
          {
            id: idFactory(),
            dialect: "common",
            content: { version: 2, text: "", annotations: [] }
          }
        ]
      }
    ],
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
 * Adds the product defaults directly to a writable V3 draft and maintains the
 * UI invariant that one sense group belongs to only one POS. The wire remains
 * unchanged: ownership is derived from `sense_group_id` references.
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
  const keptGroupIds = new Set(
    keptPos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.sense_group_id ? [sense.sense_group_id] : []
      )
    )
  );
  const removedOnlyGroupIds = new Set(
    removedPos.flatMap((pos) =>
      pos.senses.flatMap((sense) =>
        sense.sense_group_id && !keptGroupIds.has(sense.sense_group_id)
          ? [sense.sense_group_id]
          : []
      )
    )
  );
  let nextGroups =
    removedOnlyGroupIds.size === 0
      ? meanings.sense_groups
      : meanings.sense_groups.filter(
          (group) => !removedOnlyGroupIds.has(group.id)
        );
  let nextPos =
    removedPos.length === 0 && !crossReferencesChanged ? meanings.pos : keptPos;
  let changed =
    nextGroups !== meanings.sense_groups || nextPos !== meanings.pos;
  const groupById = new Map(nextGroups.map((group) => [group.id, group]));
  const groupOwner = new Map<string, string>();
  const appendGroup = (
    group: DraftMeaningsStepContentWritableV3["sense_groups"][number]
  ) => {
    if (nextGroups === meanings.sense_groups) nextGroups = [...nextGroups];
    nextGroups.push(group);
    groupById.set(group.id, group);
    changed = true;
  };
  const replacePos = (
    index: number,
    pos: DraftMeaningsStepContentWritableV3["pos"][number]
  ) => {
    if (nextPos === meanings.pos) nextPos = [...nextPos];
    nextPos[index] = pos;
    changed = true;
  };

  for (const [posIndex, pos] of nextPos.entries()) {
    const referencedGroupIds = Array.from(
      new Set(
        pos.senses.flatMap((sense) =>
          sense.sense_group_id ? [sense.sense_group_id] : []
        )
      )
    );
    let currentPos = pos;
    for (const groupId of referencedGroupIds) {
      let group = groupById.get(groupId);
      if (!group) {
        group = { id: groupId, name_zh: "", name_en: "" };
        appendGroup(group);
      }
      const owner = groupOwner.get(groupId);
      if (!owner || owner === pos.pos_id) {
        groupOwner.set(groupId, pos.pos_id);
        continue;
      }
      const clonedGroup = { ...group, id: idFactory() };
      appendGroup(clonedGroup);
      groupOwner.set(clonedGroup.id, pos.pos_id);
      currentPos = {
        ...currentPos,
        senses: currentPos.senses.map((sense) =>
          sense.sense_group_id === groupId
            ? { ...sense, sense_group_id: clonedGroup.id }
            : sense
        )
      };
    }
    if (currentPos !== pos) replacePos(posIndex, currentPos);
  }

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
    const senseGroup = { id: idFactory(), name_zh: "", name_en: "" };
    appendGroup(senseGroup);
    if (nextPos === meanings.pos) nextPos = [...nextPos];
    nextPos.push(
      createDefaultPosMeanings(posId, wordId, senseGroup.id, idFactory)
    );
    changed = true;
  }

  return changed ? { sense_groups: nextGroups, pos: nextPos } : meanings;
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
