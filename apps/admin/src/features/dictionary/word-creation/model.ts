import type {
  AdminWordV2,
  CefrLevel,
  Dialect,
  DraftFormsStepContent,
  DraftMeaningsStepContent,
  EnglishTextV2,
  GrammarStructureV2,
  RichText,
  SenseGroupV2,
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
import { DEFAULT_DIALECT_PREFERENCE } from "@tsz/shared";
import type { AdminDialectPreference } from "@tsz/shared";
import {
  emptyWordRichText,
  newWordNodeId,
  toWordRichText
} from "../word-model/primitives";

/** 收敛后的英文文本恒为单份，用它把「写侧只产出 unified」写进类型里。 */
type UnifiedEnglishTextV2 = Extract<EnglishTextV2, { mode: "unified" }>;

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

type DerivedFormType = Exclude<WordFormType, "base">;

export function legalDerivedFormTypes(
  _pos: WordPosTag,
  configured?: readonly DerivedFormType[]
): DerivedFormType[] {
  return [...(configured ?? [])];
}

export function defaultDerivedFormType(
  pos: WordPosTag,
  existing: readonly DerivedFormType[],
  configured?: readonly DerivedFormType[]
): DerivedFormType | undefined {
  const legal = legalDerivedFormTypes(pos, configured);
  return legal.find((type) => !existing.includes(type));
}

/** 单值展示(面包屑、提交提示)一律用检测基准侧,与左栏「当前词条」的排序一致。 */
/**
 * 词条在标题、消息等单行位置的显示拼写：按管理员的方言偏好取那一侧。
 * 缺省用 `source_dialect`（即管理员当时输入的那一侧），只用于拿不到偏好的场景。
 */
export function wordDisplayHeadword(
  word: AdminWordV2,
  preference?: AdminDialectPreference
): string {
  if (word.headwords.mode === "unified") return word.headwords.common;
  return word.headwords[preference ?? word.headwords.source_dialect];
}

/** 并列展示两侧拼写时的顺序:检测基准侧在前,与左栏「当前词条」一致。 */
/**
 * 双拼写的展示顺序：**偏好侧在前**。
 *
 * 原先按 `source_dialect` 排（管理员输入的那一侧在前），手测 C5 记录了它的后果：
 * 输入 `center` 却看到 `centre` 排在前面、字号更大，会被读成「主词被静默换掉了」。
 * 方言改成个人偏好后，排序跟着偏好走才是稳定可预期的。
 */
export function orderedHeadwordSpellings(
  headwords: WordHeadwordsV2,
  preference: AdminDialectPreference = DEFAULT_DIALECT_PREFERENCE
): string[] {
  if (headwords.mode === "unified") return [headwords.common];
  return preference === "uk"
    ? [headwords.uk, headwords.us]
    : [headwords.us, headwords.uk];
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

/**
 * 英文释义 / 例句一律构造为单份（A1）：方言是管理员的个人偏好，不再逐词条分叉。
 * 存量 `distinguish` 数据仍能被读到，收敛发生在保存前，见 `collapseEnglishText`。
 */
export function createEnglishText(text = ""): UnifiedEnglishTextV2 {
  return {
    mode: "unified",
    common: {
      id: newWordNodeId(),
      value: toWordRichText(text),
      origin: "manual"
    }
  };
}

/** 读兼容：任意形状取出当前口径要显示与编辑的那一份正文。 */
export function resolveEnglishText(
  value: EnglishTextV2,
  preference: AdminDialectPreference
): RichText {
  if (value.mode === "unified") return value.common.value;
  const slot = value[preference];
  // 偏好侧缺失时就是空——刻意不搬运另一侧文本，那等于把美式内容冒充成英式的。
  return slot.state === "ready" ? slot.variant.value : emptyWordRichText();
}

/**
 * 写回当前口径那一份，**保持 wire 形状不变**：存量 `distinguish` 在编辑期间仍是
 * `distinguish`，收敛推迟到保存前，好让「将丢弃 N 条」的确认框有东西可数。
 */
export function writeEnglishText(
  value: EnglishTextV2,
  preference: AdminDialectPreference,
  content: RichText
): EnglishTextV2 {
  if (value.mode === "unified") {
    return {
      ...value,
      common: { id: value.common.id, value: content, origin: "manual" }
    };
  }
  const current = value[preference];
  return {
    ...value,
    [preference]: {
      state: "ready",
      variant: {
        id: current.state === "ready" ? current.variant.id : newWordNodeId(),
        value: content,
        origin: "manual"
      }
    }
  };
}

/**
 * 收敛为单份：保留偏好侧内容与其稳定节点 ID，非偏好侧在此丢弃。
 * 调用方必须先向管理员确认，见 `countDiscardedEnglishTexts`。
 */
export function collapseEnglishText(
  value: EnglishTextV2,
  preference: AdminDialectPreference
): UnifiedEnglishTextV2 {
  if (value.mode === "unified") return value;
  const slot = value[preference];
  return {
    mode: "unified",
    common:
      slot.state === "ready"
        ? {
            id: slot.variant.id,
            value: slot.variant.value,
            origin: slot.variant.origin
          }
        : { id: newWordNodeId(), value: emptyWordRichText(), origin: "manual" }
  };
}

/** 该 `EnglishTextV2` 是否仍是旧的英美双份形状。 */
function isDialectSplitEnglishText(value: EnglishTextV2): boolean {
  return value.mode === "distinguish";
}

function englishTextsOf(
  content: DraftMeaningsStepContent
): { kind: "definition" | "sentence"; value: EnglishTextV2 }[] {
  const items: { kind: "definition" | "sentence"; value: EnglishTextV2 }[] = [];
  for (const pos of content.pos) {
    for (const sense of pos.senses) {
      for (const definition of sense.definitions) {
        if (!definition.definition_mode.startsWith("en_")) continue;
        items.push({
          kind: "definition",
          value: definition.content as EnglishTextV2
        });
      }
      for (const sentence of sense.sentences) {
        items.push({ kind: "sentence", value: sentence.en_text });
      }
    }
  }
  return items;
}

/** 词义页里是否还存在旧的英美双份英文内容（决定是否显示收敛说明条）。 */
export function hasDialectSplitEnglishText(
  content: DraftMeaningsStepContent
): boolean {
  return englishTextsOf(content).some((item) =>
    isDialectSplitEnglishText(item.value)
  );
}

export interface DiscardedEnglishTextCount {
  definitions: number;
  sentences: number;
}

/** 统计保存收敛时会丢掉的非偏好侧英文内容条数；空文本不计入。 */
export function countDiscardedEnglishTexts(
  content: DraftMeaningsStepContent,
  preference: AdminDialectPreference
): DiscardedEnglishTextCount {
  const other = preference === "uk" ? "us" : "uk";
  const count = { definitions: 0, sentences: 0 };
  for (const item of englishTextsOf(content)) {
    if (item.value.mode !== "distinguish") continue;
    const slot = item.value[other];
    if (slot.state !== "ready" || !slot.variant.value.text.trim()) continue;
    if (item.kind === "definition") count.definitions += 1;
    else count.sentences += 1;
  }
  return count;
}

/**
 * 把整页英文释义与例句收敛为单份。没有任何双份内容时原样返回同一个引用，
 * 让 readiness 这类每次渲染都会调用的路径不产生多余分配与重渲染。
 */
export function collapseMeaningsEnglishText(
  content: DraftMeaningsStepContent,
  preference: AdminDialectPreference
): DraftMeaningsStepContent {
  if (!hasDialectSplitEnglishText(content)) return content;
  return {
    ...content,
    pos: content.pos.map((pos) => ({
      ...pos,
      senses: pos.senses.map((sense) => ({
        ...sense,
        definitions: sense.definitions.map((definition) =>
          definition.definition_mode.startsWith("en_")
            ? ({
                ...definition,
                content: collapseEnglishText(
                  definition.content as EnglishTextV2,
                  preference
                )
              } as WordDefinitionV2)
            : definition
        ),
        sentences: sense.sentences.map((sentence) => ({
          ...sentence,
          en_text: collapseEnglishText(sentence.en_text, preference)
        }))
      }))
    }))
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

/**
 * 读兼容：语法结构按当前口径取那一份文本。统一词条只有 `common` 一条，
 * 存量区分词条取偏好侧，都取不到时退回第一条，绝不返回 undefined。
 */
export function resolveGrammarText(
  grammar: GrammarStructureV2,
  preference: AdminDialectPreference
): RichText {
  const variant =
    grammar.variants.find((item) => item.dialect === preference) ??
    grammar.variants.find((item) => item.dialect === "common") ??
    grammar.variants[0];
  return variant?.content ?? emptyWordRichText();
}

/**
 * 写：单份输入回写到当前口径那一条，**不改变 wire 形状**——与英文内容同一套节奏，
 * 镜像推迟到保存前，好让「另一侧会被覆盖」的确认框还数得出来。
 */
export function writeGrammarText(
  grammar: GrammarStructureV2,
  preference: AdminDialectPreference,
  content: RichText
): GrammarStructureV2 {
  const target =
    grammar.variants.find((item) => item.dialect === preference) ??
    grammar.variants.find((item) => item.dialect === "common") ??
    grammar.variants[0];
  if (!target) {
    return {
      ...grammar,
      variants: [{ id: newWordNodeId(), dialect: "common", content }]
    };
  }
  return {
    ...grammar,
    variants: grammar.variants.map((item) =>
      item.id === target.id ? { ...item, content } : item
    )
  };
}

/**
 * 保存前把语法结构规整成后端要求的方言形状，内容一律取偏好侧那一份。
 *
 * TODO(dialect-preference-migration 阶段 6): 后端提案 P1（放宽 distinguish 词条的
 * 语法结构方言校验）落地后，这里改为恒写一条 `common`，镜像逻辑连同本函数一起删掉。
 * 现在后端强制 `distinguish ⇒ 恰好 uk + us 两条`，前端只能写两条同值镜像。
 */
export function mirrorGrammarStructure(
  grammar: GrammarStructureV2,
  headwords: WordHeadwordsV2,
  preference: AdminDialectPreference
): GrammarStructureV2 {
  const content = resolveGrammarText(grammar, preference);
  return {
    ...grammar,
    variants: grammarDialects(headwords).map((dialect) => {
      // 复用该方言已有的节点 ID，别每次保存都换一个新节点。
      const existing = grammar.variants.find(
        (item) => item.dialect === dialect
      );
      return {
        id: existing?.id ?? newWordNodeId(),
        dialect,
        content
      };
    })
  };
}

/**
 * 统计保存镜像时会被偏好侧覆盖掉的语法结构条数：只有非偏好侧确实写过、
 * 且与偏好侧不同的才算，空的或本来就一样的不打扰管理员。
 */
export function countOverwrittenGrammarVariants(
  content: DraftMeaningsStepContent,
  headwords: WordHeadwordsV2,
  preference: AdminDialectPreference
): number {
  if (headwords.mode !== "distinguish") return 0;
  const other = preference === "uk" ? "us" : "uk";
  let count = 0;
  for (const pos of content.pos) {
    for (const grammar of pos.grammar_structures) {
      const kept = resolveGrammarText(grammar, preference).text;
      const dropped = grammar.variants.find((item) => item.dialect === other);
      if (!dropped) continue;
      if (dropped.content.text.trim() && dropped.content.text !== kept) {
        count += 1;
      }
    }
  }
  return count;
}

/**
 * 把整页语法结构规整为保存形状。没有任何变化时返回同一个引用，
 * 让 readiness 这类每次渲染都会调用的路径不产生多余分配。
 */
export function mirrorMeaningsGrammar(
  content: DraftMeaningsStepContent,
  headwords: WordHeadwordsV2,
  preference: AdminDialectPreference
): DraftMeaningsStepContent {
  const pos = content.pos.map((entry) => {
    const grammar_structures = entry.grammar_structures.map((grammar) => {
      const next = mirrorGrammarStructure(grammar, headwords, preference);
      const same =
        next.variants.length === grammar.variants.length &&
        next.variants.every((variant, index) => {
          const original = grammar.variants[index];
          return (
            original !== undefined &&
            original.id === variant.id &&
            original.dialect === variant.dialect &&
            original.content === variant.content
          );
        });
      return same ? grammar : next;
    });
    return grammar_structures.every(
      (grammar, index) => grammar === entry.grammar_structures[index]
    )
      ? entry
      : { ...entry, grammar_structures };
  });
  return pos.every((entry, index) => entry === content.pos[index])
    ? content
    : { ...content, pos };
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
  wordId: string,
  senseId: string
): WordSentenceV2 {
  return {
    id: newWordNodeId(),
    level: "A1",
    en_text: createEnglishText(),
    zh_text_id: newWordNodeId(),
    zh_text: emptyWordRichText(),
    links: [{ word_id: wordId, sense_id: senseId, role: "focus" }]
  };
}

export function createSense(wordId: string, senseGroupId: string): WordSenseV2 {
  const id = newWordNodeId();
  return {
    id,
    sub_pos: "",
    level: "A1",
    sense_group_id: senseGroupId,
    depends_on_context: false,
    definitions: [createDefinition()],
    sentences: [createSentence(wordId, id)],
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
    senses: [createSense(wordId, senseGroupId)]
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

function toWireEnglishText(
  value: EnglishTextV2,
  preference: AdminDialectPreference
): UnifiedEnglishTextV2 {
  const collapsed = collapseEnglishText(value, preference);
  return {
    mode: "unified",
    common: {
      id: collapsed.common.id,
      value: collapsed.common.value,
      origin: collapsed.common.origin
    }
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
  content: DraftMeaningsStepContent,
  headwords: WordHeadwordsV2,
  preference: AdminDialectPreference
): DraftMeaningsStepContent {
  return {
    sense_groups: content.sense_groups.map((group) => ({
      id: group.id,
      name_zh: group.name_zh,
      name_en: group.name_en
    })),
    pos: content.pos.map((pos) => ({
      pos_id: pos.pos_id,
      grammar_structures: pos.grammar_structures.map((grammar) => {
        const mirrored = mirrorGrammarStructure(grammar, headwords, preference);
        return {
          id: mirrored.id,
          variants: mirrored.variants.map((variant) => ({
            id: variant.id,
            dialect: variant.dialect,
            content: variant.content
          }))
        };
      }),
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
          // 按判别字段 definition_mode 分支，不按 content_id 是否存在——
          // 释义从中文改成英文后残留的 content_id 会让英文内容被原样透传，
          // 既漏掉单份收敛，也可能把 RichText 与 EnglishTextV2 弄混。
          if (
            definition.definition_mode === "zh_definition" ||
            definition.definition_mode === "zh_sentence"
          ) {
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
            content: toWireEnglishText(
              definition.content as EnglishTextV2,
              preference
            )
          };
        }),
        sentences: sense.sentences.map((sentence) => ({
          id: sentence.id,
          level: sentence.level,
          en_text: toWireEnglishText(sentence.en_text, preference),
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
