import type { AdminWordV2, WordPosMeaningsV2, WordSenseV2 } from "@tsz/types";
import {
  soleSubPartOfSpeechCode,
  type PartOfSpeechLookup
} from "../../part-of-speech/catalog";
import type { DraftMeaningsWithSentenceAssociations } from "./sentenceAssociationTypes";

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
  content: DraftMeaningsWithSentenceAssociations,
  wordId: string,
  senseId: string
): number {
  const legacyReferences = content.pos.reduce(
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
  const sharedReferences = (content.shared_sentences ?? []).reduce(
    (count, sentence) =>
      count +
      sentence.associations.filter(
        (association) =>
          association.state !== "pending" &&
          association.target_word_id === wordId &&
          association.target_sense_id === senseId
      ).length,
    0
  );
  return legacyReferences + sharedReferences;
}

export function removeSenseAndReferences(
  content: DraftMeaningsWithSentenceAssociations,
  wordId: string,
  senseId: string
): DraftMeaningsWithSentenceAssociations {
  return {
    ...content,
    ...(content.shared_sentences
      ? {
          shared_sentences: content.shared_sentences
            .map((sentence) => ({
              ...sentence,
              associations: sentence.associations.filter(
                (association) =>
                  association.state === "pending" ||
                  association.target_word_id !== wordId ||
                  association.target_sense_id !== senseId
              )
            }))
            .filter((sentence) => sentence.associations.length > 0)
        }
      : {}),
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

/**
 * 基本词性下只有一个细分词性时自动回填：管理员没有可选空间，留空只会
 * 变成无信息量的必填动作。只回填空值——已有取值（含与当前目录不符的存量
 * 编码）一律保留，交由校验拒绝保存，避免把非法值静默洗成合法值。
 */
export function applySoleSubPartOfSpeech(
  content: DraftMeaningsWithSentenceAssociations,
  forms: AdminWordV2["forms"],
  lookup: PartOfSpeechLookup
): DraftMeaningsWithSentenceAssociations {
  const posCodeById = new Map(forms.pos.map((pos) => [pos.pos_id, pos.pos]));
  let changed = false;
  const pos = content.pos.map((posMeanings) => {
    const posCode = posCodeById.get(posMeanings.pos_id);
    const soleSubPos = posCode
      ? soleSubPartOfSpeechCode(lookup, posCode)
      : undefined;
    if (soleSubPos === undefined) return posMeanings;
    if (posMeanings.senses.every((sense) => sense.sub_pos)) return posMeanings;
    changed = true;
    return {
      ...posMeanings,
      senses: posMeanings.senses.map((sense) =>
        sense.sub_pos ? sense : { ...sense, sub_pos: soleSubPos }
      )
    };
  });
  return changed ? { ...content, pos } : content;
}
