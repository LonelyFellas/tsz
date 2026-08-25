import type {
  Dialect,
  DraftMeaningsStepContentV3,
  DraftMeaningsStepContentWritableV3,
  EnglishTextV3,
  RichTextV3,
  RichTextVariantV3,
  WordDefinitionV3
} from "@tsz/types";

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
          links: sentence.links.map((link) => ({
            word_id: link.word_id,
            sense_id: link.sense_id,
            role: link.role
          }))
        })),
        relations: sense.relations.map((relation) => ({
          id: relation.id,
          relation: relation.relation,
          ...(relation.target_word_id === undefined
            ? {}
            : { target_word_id: relation.target_word_id }),
          ...(relation.target_sense_id === undefined
            ? {}
            : { target_sense_id: relation.target_sense_id }),
          ...(relation.pending_target_headword === undefined
            ? {}
            : { pending_target_headword: relation.pending_target_headword }),
          score: relation.score
        }))
      }))
    }))
  };
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
