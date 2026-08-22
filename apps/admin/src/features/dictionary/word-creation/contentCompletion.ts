import type {
  AdminWordV2,
  ContentCompletionJob,
  DraftMeaningsStepContent,
  EnglishTextV2,
  WordDefinitionV2,
  WordPosMeaningsV2
} from "@tsz/types";
import type { DraftMeaningsWithSentenceAssociations } from "./meaningsAndExamples/sentenceAssociationTypes";

export interface ContentCompletionApplyReportItem {
  pos_id: string;
  outcome: "applied" | "skipped_existing" | "failed";
  reason?: string;
}

export type ContentCompletionApplyResult =
  | { ok: false; reason: "revision_changed" | "local_changes_after_generation" }
  | {
      ok: true;
      content: DraftMeaningsWithSentenceAssociations;
      report: ContentCompletionApplyReportItem[];
    };

export function shouldPollContentCompletion(
  status: ContentCompletionJob["status"]
) {
  return status === "pending" || status === "running";
}

export function applyContentCompletion(
  word: AdminWordV2,
  current: DraftMeaningsWithSentenceAssociations,
  job: ContentCompletionJob,
  locallyChangedAfterGeneration: boolean
): ContentCompletionApplyResult {
  if (word.revision !== job.base_revision) {
    return { ok: false, reason: "revision_changed" };
  }
  if (locallyChangedAfterGeneration) {
    return { ok: false, reason: "local_changes_after_generation" };
  }
  const candidate = job.result;
  if (!candidate) return { ok: true, content: current, report: [] };
  const allowedPosIds = new Set(word.forms.pos.map((pos) => pos.pos_id));
  const candidateGroups = new Map(
    candidate.sense_groups.map((group) => [group.id, group])
  );
  const currentByPos = new Map(current.pos.map((pos) => [pos.pos_id, pos]));
  const nextByPos = new Map(currentByPos);
  const appliedGroupIds = new Set<string>();
  const report: ContentCompletionApplyReportItem[] = [];
  for (const pos of candidate.pos) {
    if (
      !allowedPosIds.has(pos.pos_id) ||
      !validCandidatePos(word, pos, candidateGroups)
    ) {
      report.push({
        pos_id: pos.pos_id,
        outcome: "failed",
        reason: "候选结构、引用或 CEFR 非法"
      });
      continue;
    }
    const existing = currentByPos.get(pos.pos_id);
    const merged = existing
      ? mergeCandidatePos(existing, pos, current, candidateGroups)
      : { pos, changed: true };
    if (!merged.changed) {
      report.push({
        pos_id: pos.pos_id,
        outcome: "skipped_existing",
        reason: "该词性没有可安全补齐的空缺"
      });
      continue;
    }
    nextByPos.set(pos.pos_id, merged.pos);
    merged.pos.senses.forEach((sense) => {
      if (sense.sense_group_id) appliedGroupIds.add(sense.sense_group_id);
    });
    report.push({ pos_id: pos.pos_id, outcome: "applied" });
  }
  const groups = [...current.sense_groups];
  for (const groupId of appliedGroupIds) {
    const group = candidateGroups.get(groupId);
    if (group && !groups.some((item) => item.id === group.id))
      groups.push(group);
  }
  return {
    ok: true,
    content: {
      ...current,
      sense_groups: groups,
      pos: word.forms.pos.flatMap((formsPos) => {
        const pos = nextByPos.get(formsPos.pos_id);
        return pos ? [pos] : [];
      })
    },
    report
  };
}

function mergeCandidatePos(
  existing: WordPosMeaningsV2,
  candidate: WordPosMeaningsV2,
  current: DraftMeaningsWithSentenceAssociations,
  candidateGroups: Map<string, DraftMeaningsStepContent["sense_groups"][number]>
) {
  if (isPlaceholderPos(existing, current)) {
    return { pos: candidate, changed: true };
  }

  const cleanedGrammar = existing.grammar_structures.filter((grammar) =>
    grammar.variants.some((variant) => variant.content.text.trim())
  );
  const cleanedSenses = existing.senses.map((sense) => ({
    ...sense,
    definitions: sense.definitions.filter(definitionHasText),
    sentences: sense.sentences.filter(
      (sentence) =>
        englishTextHasText(sentence.en_text) || sentence.zh_text.text.trim()
    )
  }));
  let changed =
    cleanedGrammar.length !== existing.grammar_structures.length ||
    cleanedSenses.some(
      (sense, index) =>
        sense.definitions.length !==
          existing.senses[index]!.definitions.length ||
        sense.sentences.length !== existing.senses[index]!.sentences.length
    );
  let needsCandidateGrammar = cleanedGrammar.every((grammar) =>
    grammar.variants.every((variant) => !variant.content.text.trim())
  );
  const senses = [...cleanedSenses];
  candidate.senses.forEach((candidateSense) => {
    const existingSense =
      cleanedSenses.length === 1 && candidate.senses.length === 1
        ? cleanedSenses[0]
        : undefined;
    if (!existingSense) {
      senses.push(candidateSense);
      changed = true;
      needsCandidateGrammar = true;
      return;
    }
    const index = senses.findIndex((sense) => sense.id === existingSense.id);
    let senseChanged = false;
    let senseGroupId = existingSense.sense_group_id;
    const existingGroup = current.sense_groups.find(
      (group) => group.id === senseGroupId
    );
    if (
      (!senseGroupId ||
        (!existingGroup?.name_zh.trim() && !existingGroup?.name_en.trim())) &&
      candidateSense.sense_group_id &&
      candidateGroups.has(candidateSense.sense_group_id)
    ) {
      senseGroupId = candidateSense.sense_group_id;
      senseChanged = true;
    }
    const definitions = existingSense.definitions.filter(definitionHasText);
    for (const definition of candidateSense.definitions) {
      const mode = "content_id" in definition ? "zh" : "en";
      const hasExistingMode = definitions.some(
        (item) =>
          ("content_id" in item ? "zh" : "en") === mode &&
          definitionHasText(item)
      );
      if (!hasExistingMode) {
        definitions.push(definition);
        senseChanged = true;
        needsCandidateGrammar = true;
      }
    }
    const sentences = existingSense.sentences.filter(
      (sentence) =>
        englishTextHasText(sentence.en_text) || sentence.zh_text.text.trim()
    );
    const existingSentenceKeys = new Set(sentences.map(sentenceKey));
    for (const sentence of candidateSense.sentences) {
      const rewritten = {
        ...sentence,
        links: sentence.links.map((link) =>
          link.role === "focus" ? { ...link, sense_id: existingSense.id } : link
        )
      };
      if (!existingSentenceKeys.has(sentenceKey(rewritten))) {
        sentences.push(rewritten);
        existingSentenceKeys.add(sentenceKey(rewritten));
        senseChanged = true;
      }
    }
    const subPos = existingSense.sub_pos || candidateSense.sub_pos;
    if (subPos !== existingSense.sub_pos) senseChanged = true;
    if (senseChanged) {
      senses[index] = {
        ...existingSense,
        sub_pos: subPos,
        sense_group_id: senseGroupId,
        definitions,
        sentences
      };
      changed = true;
    }
  });

  const grammar_structures = needsCandidateGrammar
    ? cleanedGrammar.length > 0
      ? [...cleanedGrammar, ...candidate.grammar_structures]
      : candidate.grammar_structures
    : cleanedGrammar;
  if (needsCandidateGrammar) changed = true;
  return {
    pos: { ...existing, grammar_structures, senses },
    changed
  };
}

function sentenceKey(
  sentence: WordPosMeaningsV2["senses"][number]["sentences"][number]
) {
  const english =
    sentence.en_text.mode === "unified"
      ? sentence.en_text.common.value.text
      : [sentence.en_text.uk, sentence.en_text.us]
          .flatMap((slot) =>
            slot.state === "ready" ? [slot.variant.value.text] : []
          )
          .join("\u0000");
  return `${english.trim().toLocaleLowerCase()}\u0000${sentence.zh_text.text
    .trim()
    .toLocaleLowerCase()}`;
}

function isPlaceholderPos(
  pos: WordPosMeaningsV2,
  content: DraftMeaningsStepContent
) {
  const groupIds = new Set(
    pos.senses.flatMap((sense) =>
      sense.sense_group_id ? [sense.sense_group_id] : []
    )
  );
  const groupsEmpty = content.sense_groups
    .filter((group) => groupIds.has(group.id))
    .every((group) => !group.name_zh.trim() && !group.name_en.trim());
  return (
    groupsEmpty &&
    pos.grammar_structures.every((grammar) =>
      grammar.variants.every((variant) => !variant.content.text.trim())
    ) &&
    pos.senses.every(
      (sense) =>
        !sense.sub_pos.trim() &&
        !sense.frequency &&
        !sense.depends_on_context &&
        sense.relations.length === 0 &&
        sense.definitions.every(
          (definition) => !definitionHasText(definition)
        ) &&
        sense.sentences.every(
          (sentence) =>
            !englishTextHasText(sentence.en_text) &&
            !sentence.zh_text.text.trim()
        )
    )
  );
}

function definitionHasText(definition: WordDefinitionV2) {
  return "content_id" in definition
    ? Boolean(definition.content.text.trim())
    : englishTextHasText(definition.content);
}

function englishTextHasText(value: EnglishTextV2) {
  if (value.mode === "unified") return Boolean(value.common.value.text.trim());
  return [value.uk, value.us].some(
    (slot) => slot.state === "ready" && Boolean(slot.variant.value.text.trim())
  );
}

function validCandidatePos(
  word: AdminWordV2,
  pos: WordPosMeaningsV2,
  groups: Map<string, DraftMeaningsStepContent["sense_groups"][number]>
) {
  const ids = new Set<string>();
  const add = (id: string) => (ids.has(id) ? false : (ids.add(id), true));
  const grammarIds = new Set(
    pos.grammar_structures.map((grammar) => grammar.id)
  );
  if (grammarIds.size !== pos.grammar_structures.length) return false;
  for (const grammar of pos.grammar_structures) {
    if (!add(grammar.id) || grammar.variants.length === 0) return false;
    for (const variant of grammar.variants) {
      if (!add(variant.id) || !variant.content.text.trim()) return false;
    }
  }
  for (const sense of pos.senses) {
    if (!add(sense.id) || !validLevel(sense.level)) return false;
    if (!sense.sense_group_id || !groups.has(sense.sense_group_id))
      return false;
    for (const definition of sense.definitions) {
      if (!add(definition.id) || !validLevel(definition.level)) return false;
      if (
        definition.grammar_structure_id &&
        !grammarIds.has(definition.grammar_structure_id)
      )
        return false;
      if ("content_id" in definition && !add(definition.content_id))
        return false;
      if (!definitionHasText(definition)) return false;
    }
    for (const sentence of sense.sentences) {
      if (
        !add(sentence.id) ||
        !add(sentence.zh_text_id) ||
        !validLevel(sentence.level)
      )
        return false;
      if (
        !englishTextHasText(sentence.en_text) ||
        !sentence.zh_text.text.trim()
      )
        return false;
      if (
        !sentence.links.some(
          (link) =>
            link.role === "focus" &&
            link.word_id === word.id &&
            link.sense_id === sense.id
        )
      )
        return false;
    }
  }
  return pos.senses.length > 0;
}

function validLevel(value: string) {
  return ["A1", "A2", "B1", "B2", "C1", "C2"].includes(value);
}
