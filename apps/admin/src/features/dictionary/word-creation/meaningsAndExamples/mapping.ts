import type {
  AdminWordV2,
  DraftMeaningsStepContent,
  WordPosMeaningsV2,
  WordSenseV2
} from "@tsz/types";

export function collectPronunciationHints(
  forms: AdminWordV2["forms"]
): Readonly<Record<string, string>> {
  const hints: Record<string, string> = {};
  for (const pos of forms.pos) {
    const slots = [
      pos.base_form,
      ...pos.form_groups.flatMap((group) => group.slots)
    ];
    for (const slot of slots) {
      for (const variant of slot.variants) {
        const spelling = variant.spelling.trim().toLowerCase();
        const pronunciation = variant.pronunciations.find(
          (item) => item.dict_phonetic.trim() || item.actual_pron.trim()
        );
        const phoneme =
          pronunciation?.dict_phonetic.trim() ||
          pronunciation?.actual_pron.trim() ||
          "";
        if (spelling && phoneme && hints[spelling] === undefined) {
          hints[spelling] = phoneme;
        }
      }
    }
  }
  return hints;
}

export function senseOwnsNode(sense: WordSenseV2, nodeId: string): boolean {
  return (
    sense.id === nodeId ||
    sense.definitions.some((definition) => definition.id === nodeId) ||
    sense.sentences.some((sentence) => sentence.id === nodeId) ||
    sense.relations.some((relation) => relation.id === nodeId)
  );
}

export function meaningsPosOwnsNode(
  pos: WordPosMeaningsV2,
  nodeId: string
): boolean {
  if (pos.pos_id === nodeId) return true;
  if (
    pos.grammar_structures.some(
      (grammar) =>
        grammar.id === nodeId ||
        grammar.variants.some((variant) => variant.id === nodeId)
    )
  ) {
    return true;
  }
  return pos.senses.some((sense) => senseOwnsNode(sense, nodeId));
}

export function countSenseReferences(
  content: DraftMeaningsStepContent,
  wordId: string,
  senseId: string
): number {
  return content.pos.reduce(
    (count, pos) =>
      count +
      pos.senses.reduce(
        (senseCount, sense) =>
          senseCount +
          sense.sentences.reduce(
            (sentenceCount, sentence) =>
              sentenceCount +
              sentence.links.filter(
                (link) =>
                  link.role === "context" &&
                  link.word_id === wordId &&
                  link.sense_id === senseId
              ).length,
            0
          ) +
          sense.relations.filter(
            (relation) =>
              relation.target_word_id === wordId &&
              relation.target_sense_id === senseId
          ).length,
        0
      ),
    0
  );
}

export function removeSenseAndReferences(
  content: DraftMeaningsStepContent,
  wordId: string,
  senseId: string
): DraftMeaningsStepContent {
  return {
    ...content,
    pos: content.pos.map((pos) => ({
      ...pos,
      senses: pos.senses
        .filter((sense) => sense.id !== senseId)
        .map((sense) => ({
          ...sense,
          sentences: sense.sentences.map((sentence) => ({
            ...sentence,
            links: sentence.links.filter(
              (link) =>
                !(
                  link.role === "context" &&
                  link.word_id === wordId &&
                  link.sense_id === senseId
                )
            )
          })),
          relations: sense.relations.filter(
            (relation) =>
              !(
                relation.target_word_id === wordId &&
                relation.target_sense_id === senseId
              )
          )
        }))
    }))
  };
}
