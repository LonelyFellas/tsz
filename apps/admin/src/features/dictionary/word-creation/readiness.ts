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
import type { AdminDialectPreference } from "@tsz/shared";
import { FALLBACK_DIALECT_PREFERENCE } from "@tsz/shared";
import type { PartOfSpeechLookup } from "../part-of-speech/catalog";
import { collapseMeaningsEnglishText, collapseMeaningsGrammar } from "./model";
import {
  baseFormPronunciationIssues,
  baseFormSpellingIssues,
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
  | "base_pronunciation"
  | "forms"
  | "sense_groups"
  | "grammar_structures"
  | "senses"
  | "sentences";

/**
 * `empty` 是「还没有可统计的内容」,`not_required` 是「本词条确实不需要填」——
 * 后者不能与 `complete` 混同,否则 0/0 会被读成已完成。
 */
export type ReadinessState =
  "complete" | "incomplete" | "empty" | "not_required";

export interface ReadinessTarget {
  step: WordCreationStep;
  pos_id?: string;
  node_id: string;
  field: string;
}

export interface ReadinessRow {
  key: ReadinessKey;
  /** 所属步骤,便于各步骤的拦截提示引用左栏同一口径。 */
  step: WordCreationStep;
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
  step: WordCreationStep,
  label: string,
  completed: number,
  total: number,
  target?: ReadinessTarget
): ReadinessRow {
  return {
    key,
    step,
    label,
    completed,
    total,
    state: stateFor(completed, total),
    ...(target ? { target } : {})
  };
}

/** 某一步骤下仍待完善的行,供该步骤的拦截提示复用左栏口径。 */
export function pendingReadinessRows(
  rows: readonly ReadinessRow[],
  step: WordCreationStep
): ReadinessRow[] {
  return rows.filter(
    (candidate) => candidate.step === step && candidate.state === "incomplete"
  );
}

export function buildWordReadiness(
  word?: AdminWordV2,
  draft: WordReadinessDraft = {},
  partOfSpeechLookup?: PartOfSpeechLookup,
  // 完成度必须按「保存后会变成什么样」来算：存量双份词条收敛后只保留偏好侧，
  // 拿未收敛的原值去判会把已经可发布的词条误报成未完成。
  dialectPreference: AdminDialectPreference = FALLBACK_DIALECT_PREFERENCE
): ReadinessRow[] {
  const forms = draft.forms ?? word?.forms ?? { pos: [] };
  const rawMeanings = draft.meanings ??
    word?.meanings ?? {
      sense_groups: [],
      pos: []
    };
  const meanings = collapseMeaningsGrammar(
    collapseMeaningsEnglishText(rawMeanings, dialectPreference),
    dialectPreference
  );
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
  // 「基本词性」只回答词性与其基准拼写,读音单列一行,否则缺音标会被读成没选词性。
  const spellingIssuesByPos = forms.pos.map((pos) => ({
    pos,
    issues: baseFormSpellingIssues(pos, word?.headwords)
  }));
  const completePartsOfSpeech = spellingIssuesByPos.filter(
    ({ issues }) => issues.length === 0
  ).length;
  const firstIncompletePartOfSpeech = spellingIssuesByPos.find(
    ({ issues }) => issues.length > 0
  );
  const pronunciationIssuesByPos = forms.pos.map((pos) => ({
    pos,
    issues: baseFormPronunciationIssues(pos)
  }));
  const completeBasePronunciations = pronunciationIssuesByPos.filter(
    ({ issues }) => issues.length === 0
  ).length;
  const firstIncompleteBasePronunciation = pronunciationIssuesByPos.find(
    ({ issues }) => issues.length > 0
  );
  const formsReadiness = row(
    "forms",
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
    // 词性目录确认该词不需要派生词形:标成中性的「无需填写」,
    // 不能沿用 complete——0/0 打绿勾会被读成内容已填好。
    formsReadiness.state = "not_required";
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
    row("dialect", "basics", "方言识别", dialectComplete, 1, {
      step: "basics",
      node_id: "basics",
      field: "headwords"
    }),
    row(
      "parts_of_speech",
      "forms",
      "基本词性",
      completePartsOfSpeech,
      Math.max(1, forms.pos.length),
      firstIncompletePartOfSpeech
        ? {
            step: "forms",
            pos_id: firstIncompletePartOfSpeech.pos.pos_id,
            node_id: firstIncompletePartOfSpeech.issues[0]!.node_id,
            field: firstIncompletePartOfSpeech.issues[0]!.field
          }
        : forms.pos.length === 0
          ? { step: "forms", node_id: "forms", field: "pos" }
          : undefined
    ),
    row(
      "base_pronunciation",
      "forms",
      "原形发音",
      completeBasePronunciations,
      forms.pos.length,
      firstIncompleteBasePronunciation
        ? {
            step: "forms",
            pos_id: firstIncompleteBasePronunciation.pos.pos_id,
            node_id: firstIncompleteBasePronunciation.issues[0]!.node_id,
            field: firstIncompleteBasePronunciation.issues[0]!.field
          }
        : undefined
    ),
    formsReadiness,
    row(
      "sense_groups",
      "meanings",
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
      "meanings",
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
      "meanings",
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
      "meanings",
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
