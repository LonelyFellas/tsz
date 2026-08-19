import type {
  AdminWordV2,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  GrammarStructureV2,
  WordDerivedFormSlotV2,
  WordCreationStep,
  WordPosFormsV2,
  WordPosMeaningsV2,
  WordSenseV2,
  WordSentenceV2
} from "@tsz/types";
import type { PartOfSpeechLookup } from "../part-of-speech/catalog";
import {
  baseFormComplete,
  baseFormIssueTarget,
  formSlotComplete,
  formSlotIssueTarget
} from "./formsValidation";
import {
  grammarStructureIssueTarget,
  wordSenseIssueTarget,
  wordSentenceIssueTarget
} from "./meaningsAndExamples/validation";

export type ReadinessKey =
  | "dialect"
  | "parts_of_speech"
  | "forms"
  | "sense_groups"
  | "grammar_structures"
  | "senses"
  | "sentences";

export type ReadinessState = "complete" | "incomplete" | "empty";

export interface ReadinessTarget {
  step: WordCreationStep;
  pos_id?: string;
  node_id: string;
  field: string;
}

export interface ReadinessRow {
  key: ReadinessKey;
  label: string;
  completed: number;
  total: number;
  state: ReadinessState;
  target?: ReadinessTarget;
}

export interface WordReadinessDraft {
  forms?: DraftFormsStepContent;
  meanings?: DraftMeaningsStepContent;
}

interface FormRequirement {
  pos: WordPosFormsV2;
  slot?: WordDerivedFormSlotV2;
  group_id?: string;
  duplicate?: boolean;
  catalog_missing?: boolean;
  node_id: string;
  field: string;
}

interface MeaningPosition {
  formPos: WordPosFormsV2 | undefined;
  meaningsPos: WordPosMeaningsV2 | undefined;
}

interface GrammarRequirement extends MeaningPosition {
  grammar: GrammarStructureV2 | undefined;
}

interface SenseRequirement extends MeaningPosition {
  sense: WordSenseV2 | undefined;
}

interface SentenceRequirement extends MeaningPosition {
  sense: WordSenseV2;
  sentence: WordSentenceV2;
}

function stateFor(completed: number, total: number): ReadinessState {
  if (total === 0) return "empty";
  return completed === total ? "complete" : "incomplete";
}

function row(
  key: ReadinessKey,
  label: string,
  completed: number,
  total: number,
  target?: ReadinessTarget
): ReadinessRow {
  return {
    key,
    label,
    completed,
    total,
    state: stateFor(completed, total),
    ...(target ? { target } : {})
  };
}

export function buildWordReadiness(
  word?: AdminWordV2,
  draft: WordReadinessDraft = {},
  partOfSpeechLookup?: PartOfSpeechLookup
): ReadinessRow[] {
  const forms = draft.forms ?? word?.forms ?? { pos: [] };
  const meanings = draft.meanings ??
    word?.meanings ?? {
      sense_groups: [],
      pos: []
    };
  const completedSteps = new Set(word?.completed_steps ?? []);
  const dialectComplete = completedSteps.has("basics") ? 1 : 0;

  const formRequirements = forms.pos.flatMap<FormRequirement>((pos) => {
    const configured = partOfSpeechLookup?.byCode.get(pos.pos);
    const slots = pos.form_groups.flatMap((group) => {
      const typeCounts = new Map<string, number>();
      for (const slot of group.slots) {
        typeCounts.set(
          slot.form_type,
          (typeCounts.get(slot.form_type) ?? 0) + 1
        );
      }
      return group.slots.map((slot) => ({
        pos,
        slot,
        group_id: group.id,
        duplicate: (typeCounts.get(slot.form_type) ?? 0) > 1,
        node_id: slot.id,
        field: "variants"
      }));
    });
    if (partOfSpeechLookup && configured?.allowed_form_types === undefined) {
      return [
        {
          pos,
          catalog_missing: true,
          node_id: pos.pos_id,
          field: "form_groups"
        },
        ...slots
      ];
    }
    return slots;
  });
  const completeFormSlots = formRequirements.filter((requirement) => {
    if (
      !requirement.slot ||
      requirement.duplicate ||
      requirement.catalog_missing
    ) {
      return false;
    }
    const allowed = partOfSpeechLookup?.byCode.get(
      requirement.pos.pos
    )?.allowed_form_types;
    return (
      (!partOfSpeechLookup ||
        Boolean(allowed?.includes(requirement.slot.form_type))) &&
      formSlotComplete(requirement.slot, requirement.pos.dialect_rules)
    );
  }).length;
  const firstIncompleteForm = formRequirements.find((requirement) => {
    if (
      !requirement.slot ||
      requirement.duplicate ||
      requirement.catalog_missing
    ) {
      return true;
    }
    const allowed = partOfSpeechLookup?.byCode.get(
      requirement.pos.pos
    )?.allowed_form_types;
    return (
      (partOfSpeechLookup && !allowed?.includes(requirement.slot.form_type)) ||
      !formSlotComplete(requirement.slot, requirement.pos.dialect_rules)
    );
  });
  const firstIncompleteFormTarget = firstIncompleteForm
    ? firstIncompleteForm.duplicate
      ? {
          node_id: firstIncompleteForm.group_id ?? firstIncompleteForm.node_id,
          field: "slots"
        }
      : firstIncompleteForm.slot &&
          partOfSpeechLookup &&
          !partOfSpeechLookup.byCode
            .get(firstIncompleteForm.pos.pos)
            ?.allowed_form_types?.includes(firstIncompleteForm.slot.form_type)
        ? { node_id: firstIncompleteForm.slot.id, field: "form_type" }
        : firstIncompleteForm.slot
          ? (formSlotIssueTarget(
              firstIncompleteForm.slot,
              firstIncompleteForm.pos.dialect_rules
            ) ?? {
              node_id: firstIncompleteForm.node_id,
              field: firstIncompleteForm.field
            })
          : {
              node_id: firstIncompleteForm.node_id,
              field: firstIncompleteForm.field
            }
    : undefined;
  const completePartsOfSpeech = forms.pos.filter((pos) =>
    baseFormComplete(pos, word?.headwords)
  ).length;
  const firstIncompletePartOfSpeech = forms.pos.find(
    (pos) => !baseFormComplete(pos, word?.headwords)
  );
  const firstIncompletePartOfSpeechTarget = firstIncompletePartOfSpeech
    ? baseFormIssueTarget(firstIncompletePartOfSpeech, word?.headwords)
    : undefined;
  const formsReadiness = row(
    "forms",
    "词形变化",
    completeFormSlots,
    formRequirements.length,
    firstIncompleteForm && firstIncompleteFormTarget
      ? {
          step: "forms",
          pos_id: firstIncompleteForm.pos.pos_id,
          node_id: firstIncompleteFormTarget.node_id,
          field: firstIncompleteFormTarget.field
        }
      : undefined
  );
  if (
    formRequirements.length === 0 &&
    forms.pos.length > 0 &&
    partOfSpeechLookup &&
    forms.pos.every(
      (pos) =>
        partOfSpeechLookup.byCode.get(pos.pos)?.allowed_form_types !== undefined
    )
  ) {
    formsReadiness.state = "complete";
  }

  const completeSenseGroups = meanings.sense_groups.filter(
    (group) =>
      group.name_zh.trim() &&
      [...group.name_zh.trim()].length <= 200 &&
      group.name_en.trim() &&
      [...group.name_en.trim()].length <= 200
  ).length;
  const firstIncompleteSenseGroup = meanings.sense_groups.find(
    (group) =>
      !group.name_zh.trim() ||
      [...group.name_zh.trim()].length > 200 ||
      !group.name_en.trim() ||
      [...group.name_en.trim()].length > 200
  );
  const senseGroupIds = new Set(meanings.sense_groups.map((group) => group.id));
  const formPosById = new Map(forms.pos.map((pos) => [pos.pos_id, pos]));
  const meaningPosById = new Map(meanings.pos.map((pos) => [pos.pos_id, pos]));
  const meaningPositions: MeaningPosition[] = [
    ...forms.pos.map((formPos) => ({
      formPos,
      meaningsPos: meaningPosById.get(formPos.pos_id)
    })),
    ...meanings.pos
      .filter((pos) => !formPosById.has(pos.pos_id))
      .map((meaningsPos) => ({ formPos: undefined, meaningsPos }))
  ];

  const grammars = meaningPositions.flatMap<GrammarRequirement>(
    ({ formPos, meaningsPos }) =>
      meaningsPos?.grammar_structures.length
        ? meaningsPos.grammar_structures.map((grammar) => ({
            formPos,
            meaningsPos,
            grammar
          }))
        : [{ formPos, meaningsPos, grammar: undefined }]
  );
  const completeGrammars = grammars.filter(({ grammar }) =>
    grammar ? !grammarStructureIssueTarget(grammar, word?.headwords) : false
  ).length;
  const firstIncompleteGrammar = grammars.find(
    ({ grammar }) =>
      !grammar || Boolean(grammarStructureIssueTarget(grammar, word?.headwords))
  );
  const firstIncompleteGrammarTarget = firstIncompleteGrammar?.grammar
    ? grammarStructureIssueTarget(
        firstIncompleteGrammar.grammar,
        word?.headwords
      )
    : undefined;

  const senses = meaningPositions.flatMap<SenseRequirement>(
    ({ formPos, meaningsPos }) =>
      meaningsPos?.senses.length
        ? meaningsPos.senses.map((sense) => ({ formPos, meaningsPos, sense }))
        : [{ formPos, meaningsPos, sense: undefined }]
  );
  const senseIssueTarget = ({
    formPos,
    meaningsPos,
    sense
  }: SenseRequirement) =>
    sense
      ? wordSenseIssueTarget(
          sense,
          senseGroupIds,
          new Set(
            meaningsPos?.grammar_structures.map((grammar) => grammar.id) ?? []
          ),
          formPos?.pos,
          partOfSpeechLookup
        )
      : {
          node_id: formPos?.pos_id ?? meaningsPos?.pos_id ?? "meanings",
          field: "senses"
        };
  const completeSenses = senses.filter(
    (requirement) => !senseIssueTarget(requirement)
  ).length;
  const firstIncompleteSense = senses.find((requirement) =>
    Boolean(senseIssueTarget(requirement))
  );
  const firstIncompleteSenseTarget = firstIncompleteSense
    ? senseIssueTarget(firstIncompleteSense)
    : undefined;

  const sentences = senses.flatMap<SentenceRequirement>(
    ({ formPos, meaningsPos, sense }) =>
      (sense?.sentences ?? []).map((sentence) => ({
        formPos,
        meaningsPos,
        sense: sense!,
        sentence
      }))
  );
  const completeSentences = sentences.filter(
    ({ sense, sentence }) =>
      !wordSentenceIssueTarget(sentence, sense.id, word?.id)
  ).length;
  const firstIncompleteSentence = sentences.find(({ sense, sentence }) =>
    Boolean(wordSentenceIssueTarget(sentence, sense.id, word?.id))
  );
  const firstIncompleteSentenceTarget = firstIncompleteSentence
    ? wordSentenceIssueTarget(
        firstIncompleteSentence.sentence,
        firstIncompleteSentence.sense.id,
        word?.id
      )
    : undefined;

  return [
    row("dialect", "方言识别", dialectComplete, 1, {
      step: "basics",
      node_id: "basics",
      field: "headwords"
    }),
    row(
      "parts_of_speech",
      "基本词性",
      completePartsOfSpeech,
      Math.max(1, forms.pos.length),
      firstIncompletePartOfSpeech && firstIncompletePartOfSpeechTarget
        ? {
            step: "forms",
            pos_id: firstIncompletePartOfSpeech.pos_id,
            node_id: firstIncompletePartOfSpeechTarget.node_id,
            field: firstIncompletePartOfSpeechTarget.field
          }
        : forms.pos.length === 0
          ? { step: "forms", node_id: "forms", field: "pos" }
          : undefined
    ),
    formsReadiness,
    row(
      "sense_groups",
      "语义区间",
      completeSenseGroups,
      Math.max(1, meanings.sense_groups.length),
      firstIncompleteSenseGroup
        ? {
            step: "meanings",
            node_id: firstIncompleteSenseGroup.id,
            field:
              !firstIncompleteSenseGroup.name_zh.trim() ||
              [...firstIncompleteSenseGroup.name_zh.trim()].length > 200
                ? "name_zh"
                : "name_en"
          }
        : meanings.sense_groups.length === 0
          ? {
              step: "meanings",
              node_id: word?.id ?? "meanings",
              field: "sense_groups"
            }
          : undefined
    ),
    row(
      "grammar_structures",
      "语法结构",
      completeGrammars,
      grammars.length,
      firstIncompleteGrammar
        ? {
            step: "meanings",
            pos_id:
              firstIncompleteGrammar.formPos?.pos_id ??
              firstIncompleteGrammar.meaningsPos?.pos_id,
            node_id: firstIncompleteGrammarTarget
              ? firstIncompleteGrammarTarget.node_id
              : (firstIncompleteGrammar.formPos?.pos_id ??
                firstIncompleteGrammar.meaningsPos?.pos_id ??
                "meanings"),
            field: firstIncompleteGrammarTarget
              ? firstIncompleteGrammarTarget.field
              : "grammar_structures"
          }
        : undefined
    ),
    row(
      "senses",
      "多维词义",
      completeSenses,
      senses.length,
      firstIncompleteSense && firstIncompleteSenseTarget
        ? {
            step: "meanings",
            pos_id:
              firstIncompleteSense.formPos?.pos_id ??
              firstIncompleteSense.meaningsPos?.pos_id,
            node_id: firstIncompleteSenseTarget.node_id,
            field: firstIncompleteSenseTarget.field
          }
        : undefined
    ),
    row(
      "sentences",
      "多维例句",
      completeSentences,
      sentences.length,
      firstIncompleteSentence && firstIncompleteSentenceTarget
        ? {
            step: "meanings",
            pos_id:
              firstIncompleteSentence.formPos?.pos_id ??
              firstIncompleteSentence.meaningsPos?.pos_id,
            node_id: firstIncompleteSentenceTarget.node_id,
            field: firstIncompleteSentenceTarget.field
          }
        : undefined
    )
  ];
}
