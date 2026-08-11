import type {
  AdminWordV2,
  CefrLevel,
  Dialect,
  DialectVariantSuggestionItemV2,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  EnglishTextV2,
  GrammarStructureV2,
  RichText,
  SenseGroupV2,
  SuggestDialectVariantsInputV2,
  SuggestDialectVariantsResponseV2,
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
    return {
      mode: "unified",
      common: { id: newWordNodeId(), value, origin: "manual" }
    };
  }
  const source = headwords.source_dialect;
  return {
    mode: "distinguish",
    source_dialect: source,
    uk:
      source === "uk"
        ? {
            state: "ready",
            variant: { id: newWordNodeId(), value, origin: "manual" }
          }
        : { state: "missing" },
    us:
      source === "us"
        ? {
            state: "ready",
            variant: { id: newWordNodeId(), value, origin: "manual" }
          }
        : { state: "missing" }
  };
}

type MeaningDialect = "uk" | "us";
type MeaningDialectSuggestionItem = Extract<
  DialectVariantSuggestionItemV2,
  { field_kind: "definition" | "example" }
>;

function oppositeMeaningDialect(dialect: MeaningDialect): MeaningDialect {
  return dialect === "uk" ? "us" : "uk";
}

function sourceForMissingMeaningDialect(
  value: EnglishTextV2,
  targetDialect: MeaningDialect
): RichText | undefined {
  if (value.mode !== "distinguish") return undefined;
  const sourceDialect = oppositeMeaningDialect(targetDialect);
  if (value.source_dialect !== sourceDialect) return undefined;
  if (value[targetDialect].state !== "missing") return undefined;
  const sourceSlot = value[sourceDialect];
  if (sourceSlot.state !== "ready") return undefined;
  return sourceSlot.variant.value.text.trim()
    ? sourceSlot.variant.value
    : undefined;
}

/** 统计目标方言缺失或正文为空的英文释义与例句，不要求另一侧源文本可用。 */
export function countIncompleteMeaningDialectSlots(
  content: DraftMeaningsStepContent,
  targetDialect: MeaningDialect
): number {
  let count = 0;
  for (const pos of content.pos) {
    for (const sense of pos.senses) {
      for (const definition of sense.definitions) {
        if (!definition.definition_mode.startsWith("en_")) continue;
        const value = definition.content as EnglishTextV2;
        if (value.mode !== "distinguish") continue;
        const slot = value[targetDialect];
        if (slot.state === "missing" || !slot.variant.value.text.trim()) {
          count += 1;
        }
      }
      for (const sentence of sense.sentences) {
        if (sentence.en_text.mode !== "distinguish") continue;
        const slot = sentence.en_text[targetDialect];
        if (slot.state === "missing" || !slot.variant.value.text.trim()) {
          count += 1;
        }
      }
    }
  }
  return count;
}

/**
 * 收集词义页中可安全补全的目标方言文本。语法结构使用独立模型，刻意不在此遍历。
 */
export function collectMissingMeaningDialectItems(
  content: DraftMeaningsStepContent,
  targetDialect: MeaningDialect
): SuggestDialectVariantsInputV2 {
  const items: MeaningDialectSuggestionItem[] = [];
  for (const pos of content.pos) {
    for (const sense of pos.senses) {
      for (const definition of sense.definitions) {
        if (!definition.definition_mode.startsWith("en_")) continue;
        const value = sourceForMissingMeaningDialect(
          definition.content as EnglishTextV2,
          targetDialect
        );
        if (value) {
          items.push({
            client_id: definition.id,
            field_kind: "definition",
            value
          });
        }
      }
      for (const sentence of sense.sentences) {
        const value = sourceForMissingMeaningDialect(
          sentence.en_text,
          targetDialect
        );
        if (value) {
          items.push({
            client_id: sentence.id,
            field_kind: "example",
            value
          });
        }
      }
    }
  }
  return {
    source_dialect: oppositeMeaningDialect(targetDialect),
    target_dialect: targetDialect,
    items
  };
}

function meaningSuggestionKey(
  item: Pick<DialectVariantSuggestionItemV2, "client_id" | "field_kind">
): string {
  return `${item.field_kind}:${item.client_id}`;
}

/**
 * 把批量建议写回当前最新内容。仅 missing 槽位可写，手填或既有内容永不覆盖。
 */
export function applyMeaningDialectSuggestions(
  content: DraftMeaningsStepContent,
  targetDialect: MeaningDialect,
  suggestions: SuggestDialectVariantsResponseV2["suggestions"]
): {
  content: DraftMeaningsStepContent;
  applied_count: number;
  skipped_count: number;
} {
  const counts = new Map<string, number>();
  for (const suggestion of suggestions) {
    const key = meaningSuggestionKey(suggestion);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const uniqueSuggestions = new Map<string, MeaningDialectSuggestionItem>();
  for (const suggestion of suggestions) {
    if (suggestion.field_kind === "form") continue;
    const key = meaningSuggestionKey(suggestion);
    if (counts.get(key) === 1) uniqueSuggestions.set(key, suggestion);
  }

  let appliedCount = 0;
  const usedSuggestions = new Set<string>();
  const applyToValue = (
    value: EnglishTextV2,
    clientId: string,
    fieldKind: MeaningDialectSuggestionItem["field_kind"]
  ): EnglishTextV2 => {
    const key = meaningSuggestionKey({
      client_id: clientId,
      field_kind: fieldKind
    });
    const suggestion = uniqueSuggestions.get(key);
    if (
      !suggestion ||
      usedSuggestions.has(key) ||
      !suggestion.value.text.trim() ||
      !sourceForMissingMeaningDialect(value, targetDialect)
    ) {
      return value;
    }
    usedSuggestions.add(key);
    appliedCount += 1;
    return {
      ...value,
      [targetDialect]: {
        state: "ready",
        variant: {
          id: newWordNodeId(),
          value: suggestion.value,
          origin: "converted"
        }
      }
    };
  };

  const nextPos = content.pos.map((pos) => {
    const nextSenses = pos.senses.map((sense) => {
      const nextDefinitions: WordDefinitionV2[] = sense.definitions.map(
        (definition) => {
          if (!definition.definition_mode.startsWith("en_")) return definition;
          const nextValue = applyToValue(
            definition.content as EnglishTextV2,
            definition.id,
            "definition"
          );
          return nextValue === definition.content
            ? definition
            : ({ ...definition, content: nextValue } as WordDefinitionV2);
        }
      );
      const nextSentences = sense.sentences.map((sentence) => {
        const nextValue = applyToValue(
          sentence.en_text,
          sentence.id,
          "example"
        );
        return nextValue === sentence.en_text
          ? sentence
          : { ...sentence, en_text: nextValue };
      });
      const definitionsChanged = nextDefinitions.some(
        (definition, index) => definition !== sense.definitions[index]
      );
      const sentencesChanged = nextSentences.some(
        (sentence, index) => sentence !== sense.sentences[index]
      );
      return definitionsChanged || sentencesChanged
        ? {
            ...sense,
            definitions: nextDefinitions,
            sentences: nextSentences
          }
        : sense;
    });
    return nextSenses.some((sense, index) => sense !== pos.senses[index])
      ? { ...pos, senses: nextSenses }
      : pos;
  });
  const changed = nextPos.some((pos, index) => pos !== content.pos[index]);
  return {
    content: changed ? { ...content, pos: nextPos } : content,
    applied_count: appliedCount,
    skipped_count: suggestions.length - appliedCount
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
    content_id: newWordNodeId(),
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
    zh_text_id: newWordNodeId(),
    zh_text: emptyWordRichText(),
    links: [{ word_id: wordId, sense_id: senseId, role: "focus" }]
  };
}

export function createSense(
  headwords: WordHeadwordsV2,
  wordId: string,
  senseGroupId: string
): WordSenseV2 {
  const id = newWordNodeId();
  return {
    id,
    sub_pos: "",
    level: "A1",
    sense_group_id: senseGroupId,
    depends_on_context: false,
    definitions: [createDefinition()],
    sentences: [createSentence(headwords, wordId, id)],
    relations: []
  };
}

export function createPosMeanings(
  posId: string,
  headwords: WordHeadwordsV2,
  wordId: string,
  senseGroupId: string
): WordPosMeaningsV2 {
  return {
    pos_id: posId,
    grammar_structures: [createGrammar(headwords)],
    senses: [createSense(headwords, wordId, senseGroupId)]
  };
}

export function createSenseGroup(): SenseGroupV2 {
  return { id: newWordNodeId(), name_zh: "", name_en: "" };
}

export function ensureMeaningsForForms(
  word: AdminWordV2
): DraftMeaningsStepContent {
  const senseGroups =
    word.meanings.sense_groups.length > 0
      ? word.meanings.sense_groups
      : [createSenseGroup()];
  const senseGroupIds = new Set(senseGroups.map((group) => group.id));
  const defaultSenseGroupId = senseGroups[0]!.id;
  const posById = new Map(
    word.meanings.pos.map((entry) => [entry.pos_id, entry])
  );
  return {
    sense_groups: senseGroups,
    pos: word.forms.pos.map((forms) => {
      const existing = posById.get(forms.pos_id);
      if (!existing) {
        return createPosMeanings(
          forms.pos_id,
          word.headwords,
          word.id,
          defaultSenseGroupId
        );
      }
      const senses = existing.senses.map((sense) =>
        sense.sense_group_id && senseGroupIds.has(sense.sense_group_id)
          ? sense
          : { ...sense, sense_group_id: defaultSenseGroupId }
      );
      return senses.every((sense, index) => sense === existing.senses[index])
        ? existing
        : { ...existing, senses };
    })
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

function toWireEnglishText(value: EnglishTextV2): EnglishTextV2 {
  if (value.mode === "unified") {
    return {
      mode: "unified",
      common: {
        id: value.common.id,
        value: value.common.value,
        origin: value.common.origin
      }
    };
  }
  const mapSlot = (slot: typeof value.uk): typeof value.uk =>
    slot.state === "missing"
      ? { state: "missing" }
      : {
          state: "ready",
          variant: {
            id: slot.variant.id,
            value: slot.variant.value,
            origin: slot.variant.origin
          }
        };
  return {
    mode: "distinguish",
    source_dialect: value.source_dialect,
    uk: mapSlot(value.uk),
    us: mapSlot(value.us)
  };
}

/**
 * 只把后端接受的词形字段放上 wire，避免旧缓存中的只读音频字段被带回服务端。
 */
export function toFormsWireContent(
  content: DraftFormsStepContent
): DraftFormsStepContent {
  const mapVariant = (
    variant: WordPosFormsV2["base_form"]["variants"][number]
  ) => ({
    id: variant.id,
    dialect: variant.dialect,
    spelling: variant.spelling,
    origin: variant.origin,
    pronunciations: variant.pronunciations.map((pronunciation) => ({
      id: pronunciation.id,
      dict_phonetic: pronunciation.dict_phonetic,
      actual_pron: pronunciation.actual_pron,
      style: pronunciation.style
    }))
  });
  return {
    pos: content.pos.map((pos) => ({
      pos_id: pos.pos_id,
      pos: pos.pos,
      dialect_rules: {
        spelling_mode: pos.dialect_rules.spelling_mode,
        phonetic_mode: pos.dialect_rules.phonetic_mode
      },
      base_form: {
        id: pos.base_form.id,
        form_type: "base",
        variants: pos.base_form.variants.map(mapVariant)
      },
      form_groups: pos.form_groups.map((group) => ({
        id: group.id,
        is_regular: group.is_regular,
        slots: group.slots.map((slot) => ({
          id: slot.id,
          form_type: slot.form_type,
          variants: slot.variants.map(mapVariant)
        }))
      }))
    }))
  };
}

/**
 * 构造词义保存请求：保留稳定文本 ID，丢弃未选完的关联目标与服务端只读快照。
 */
export function toMeaningsWireContent(
  content: DraftMeaningsStepContent
): DraftMeaningsStepContent {
  return {
    sense_groups: content.sense_groups.map((group) => ({
      id: group.id,
      name_zh: group.name_zh,
      name_en: group.name_en
    })),
    pos: content.pos.map((pos) => ({
      pos_id: pos.pos_id,
      grammar_structures: pos.grammar_structures.map((grammar) => ({
        id: grammar.id,
        variants: grammar.variants.map((variant) => ({
          id: variant.id,
          dialect: variant.dialect,
          content: variant.content
        }))
      })),
      senses: pos.senses.map((sense) => ({
        id: sense.id,
        sub_pos: sense.sub_pos,
        level: sense.level,
        ...(sense.sense_group_id
          ? { sense_group_id: sense.sense_group_id }
          : {}),
        ...(sense.frequency !== undefined
          ? { frequency: sense.frequency }
          : {}),
        depends_on_context: sense.depends_on_context,
        definitions: sense.definitions.map((definition) => {
          const common = {
            id: definition.id,
            level: definition.level,
            ...(definition.grammar_structure_id
              ? { grammar_structure_id: definition.grammar_structure_id }
              : {})
          };
          if ("content_id" in definition) {
            return {
              ...common,
              definition_mode: definition.definition_mode,
              content_id: definition.content_id,
              content: definition.content
            };
          }
          return {
            ...common,
            definition_mode: definition.definition_mode,
            content: toWireEnglishText(definition.content)
          };
        }),
        sentences: sense.sentences.map((sentence) => ({
          id: sentence.id,
          level: sentence.level,
          en_text: toWireEnglishText(sentence.en_text),
          zh_text_id: sentence.zh_text_id,
          zh_text: sentence.zh_text,
          links: sentence.links
            .filter(
              (link) =>
                link.role === "focus" ||
                Boolean(link.word_id.trim() && link.sense_id.trim())
            )
            .map((link) => ({
              word_id: link.word_id,
              sense_id: link.sense_id,
              role: link.role
            }))
        })),
        relations: sense.relations
          .filter((relation) =>
            Boolean(
              relation.target_word_id.trim() && relation.target_sense_id.trim()
            )
          )
          .map((relation) => ({
            id: relation.id,
            relation: relation.relation,
            target_word_id: relation.target_word_id,
            target_sense_id: relation.target_sense_id,
            score: relation.score
          }))
      }))
    }))
  };
}

export function cefrRank(level: CefrLevel): number {
  return ["A1", "A2", "B1", "B2", "C1", "C2"].indexOf(level);
}
