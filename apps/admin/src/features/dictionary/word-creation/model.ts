import type {
  AdminWordV2,
  CefrLevel,
  Dialect,
  DraftMeaningsStepContent,
  EnglishTextV2,
  GrammarStructureV2,
  RichText,
  WordDefinitionV2,
  WordDerivedFormSlotV2,
  WordFormGroupV2,
  WordFormType,
  WordHeadwordsV2,
  WordPosFormsV2,
  WordPosMeaningsV2,
  WordPosTag,
  WordPronunciationV2,
  WordRelationType,
  WordRelationV2,
  WordSenseV2,
  WordSentenceV2
} from "@tsz/types";
import {
  emptyWordRichText,
  newWordNodeId,
  toWordRichText
} from "../word-model/primitives";

export const WORD_STEP_ORDER = [
  "basics",
  "forms",
  "meanings",
  "preview"
] as const;

export const WORD_STEP_PATH = {
  basics: "basics",
  forms: "forms",
  meanings: "meanings",
  preview: "preview"
} as const;

export const WORD_STEP_TITLE = {
  basics: "创建新词条",
  forms: "词形与发音",
  meanings: "词义与例句",
  preview: "预览并生效"
} as const;

export function wordDisplayHeadword(word: AdminWordV2): string {
  return word.headwords.mode === "unified"
    ? word.headwords.common
    : word.headwords.uk;
}

export function dialectHeadword(
  headwords: WordHeadwordsV2,
  dialect: Dialect
): string {
  if (headwords.mode === "unified") return headwords.common;
  if (dialect === "uk") return headwords.uk;
  if (dialect === "us") return headwords.us;
  return headwords[headwords.source_dialect];
}

export function formDialects(pos: WordPosFormsV2): Dialect[] {
  return pos.dialect_rules.spelling_mode === "distinguish" ||
    pos.dialect_rules.phonetic_mode === "distinguish"
    ? ["uk", "us"]
    : ["common"];
}

export function createPronunciation(): WordPronunciationV2 {
  return {
    id: newWordNodeId(),
    dict_phonetic: "",
    actual_pron: "",
    style: "normal"
  };
}

function createVariant(
  dialect: Dialect,
  spelling = ""
): WordPosFormsV2["base_form"]["variants"][number] {
  return {
    id: newWordNodeId(),
    dialect,
    spelling,
    origin: "manual",
    pronunciations: [createPronunciation()]
  };
}

export function createFormGroup(): WordFormGroupV2 {
  return { id: newWordNodeId(), is_regular: true, slots: [] };
}

export function createPosForms(
  pos: WordPosTag,
  headwords: WordHeadwordsV2
): WordPosFormsV2 {
  const distinguish = headwords.mode === "distinguish";
  const variants = distinguish
    ? [createVariant("uk", headwords.uk), createVariant("us", headwords.us)]
    : [createVariant("common", headwords.common)];
  return {
    pos_id: newWordNodeId(),
    pos,
    dialect_rules: {
      spelling_mode: distinguish ? "distinguish" : "unified",
      phonetic_mode: distinguish ? "distinguish" : "unified"
    },
    base_form: {
      id: newWordNodeId(),
      form_type: "base",
      variants
    },
    form_groups: [createFormGroup()]
  };
}

export function createDerivedSlot(
  type: Exclude<WordFormType, "base">,
  pos: WordPosFormsV2
): WordDerivedFormSlotV2 {
  return {
    id: newWordNodeId(),
    form_type: type,
    variants: formDialects(pos).map((dialect) => createVariant(dialect))
  };
}

export function createEnglishText(
  headwords: WordHeadwordsV2,
  text = ""
): EnglishTextV2 {
  const value = toWordRichText(text);
  if (headwords.mode === "unified") {
    return { mode: "unified", common: { value, origin: "manual" } };
  }
  const source = headwords.source_dialect;
  return {
    mode: "distinguish",
    source_dialect: source,
    uk:
      source === "uk"
        ? { state: "ready", variant: { value, origin: "manual" } }
        : { state: "missing" },
    us:
      source === "us"
        ? { state: "ready", variant: { value, origin: "manual" } }
        : { state: "missing" }
  };
}

export function grammarDialects(headwords: WordHeadwordsV2): Dialect[] {
  return headwords.mode === "distinguish" ? ["uk", "us"] : ["common"];
}

export function createGrammar(headwords: WordHeadwordsV2): GrammarStructureV2 {
  return {
    id: newWordNodeId(),
    variants: grammarDialects(headwords).map((dialect) => ({
      id: newWordNodeId(),
      dialect,
      content: emptyWordRichText()
    }))
  };
}

export function createDefinition(): WordDefinitionV2 {
  return {
    id: newWordNodeId(),
    level: "A1",
    definition_mode: "zh_definition",
    content: emptyWordRichText()
  };
}

export function createSentence(
  headwords: WordHeadwordsV2,
  wordId: string,
  senseId: string
): WordSentenceV2 {
  return {
    id: newWordNodeId(),
    level: "A1",
    en_text: createEnglishText(headwords),
    zh_text: emptyWordRichText(),
    links: [{ word_id: wordId, sense_id: senseId, role: "focus" }]
  };
}

export function createSense(
  headwords: WordHeadwordsV2,
  wordId: string
): WordSenseV2 {
  const id = newWordNodeId();
  return {
    id,
    sub_pos: "",
    level: "A1",
    depends_on_context: false,
    definitions: [createDefinition()],
    sentences: [createSentence(headwords, wordId, id)],
    relations: []
  };
}

export function createPosMeanings(
  posId: string,
  headwords: WordHeadwordsV2,
  wordId: string
): WordPosMeaningsV2 {
  return {
    pos_id: posId,
    grammar_structures: [createGrammar(headwords)],
    senses: [createSense(headwords, wordId)]
  };
}

export function ensureMeaningsForForms(
  word: AdminWordV2
): DraftMeaningsStepContent {
  const posById = new Map(
    word.meanings.pos.map((entry) => [entry.pos_id, entry])
  );
  return {
    sense_groups: word.meanings.sense_groups,
    pos: word.forms.pos.map(
      (forms) =>
        posById.get(forms.pos_id) ??
        createPosMeanings(forms.pos_id, word.headwords, word.id)
    )
  };
}

export function updateRichText(original: RichText, text: string): RichText {
  return toWordRichText(text, original);
}

export function createRelation(type: WordRelationType): WordRelationV2 {
  return {
    id: newWordNodeId(),
    relation: type,
    target_word_id: "",
    target_sense_id: "",
    score: "0"
  };
}

export function cefrRank(level: CefrLevel): number {
  return ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(level);
}
