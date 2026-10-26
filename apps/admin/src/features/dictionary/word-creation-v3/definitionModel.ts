import type {
  CefrLevel,
  EnglishTextV3,
  RichTextV3,
  RichTextVariantV3,
  WordDefinitionV3,
  WordSenseWritableV3
} from "@tsz/types";
import {
  boundFormGroupIds,
  DEFAULT_DEFINITION_PLAN,
  DEFAULT_SENSE_LEVEL
} from "./meaningsModel";

export type DefinitionModeV3 = WordDefinitionV3["definition_mode"];
export type DefinitionLanguageV3 = "zh" | "en";
export type DefinitionStyleV3 = "definition" | "sentence";

/** 语言与释义方式分两列选，落 wire 前合回后端唯一认的 definition_mode。 */
export const DEFINITION_MODE_BY_PARTS: Record<
  DefinitionLanguageV3,
  Record<DefinitionStyleV3, DefinitionModeV3>
> = {
  zh: { definition: "zh_definition", sentence: "zh_sentence" },
  en: { definition: "en_definition", sentence: "en_sentence" }
};

export function definitionLanguageOf(
  mode: DefinitionModeV3
): DefinitionLanguageV3 {
  return mode === "zh_definition" || mode === "zh_sentence" ? "zh" : "en";
}

export function definitionStyleOf(mode: DefinitionModeV3): DefinitionStyleV3 {
  return mode === "zh_definition" || mode === "en_definition"
    ? "definition"
    : "sentence";
}

function englishVariants(content: EnglishTextV3): RichTextVariantV3[] {
  return content.mode === "unified"
    ? [content.common]
    : [content.uk, content.us].flatMap((slot) =>
        slot.state === "ready" ? [slot.variant] : []
      );
}

/** 这条释义还没录入任何东西：正文空白（英文两侧都算）且没选语法结构。 */
function definitionIsBlank(definition: WordDefinitionV3): boolean {
  if (definition.grammar_structure_id) return false;
  if (definitionLanguageOf(definition.definition_mode) === "zh")
    return (definition.content as RichTextV3).text.trim() === "";
  return englishVariants(definition.content as EnglishTextV3).every(
    (variant) => variant.value.text.trim() === ""
  );
}

/**
 * 这组释义是否还停在某个等级的默认铺排：条数、语言、等级、释义方式全对得上，
 * 且每条都还空着。只有这样才敢跟着词义等级整组换掉——录入者哪怕只调过一行的
 * 语言或等级，也说明已经排过版，不能抹掉。条数对不上（包括一条都没有）同理不动。
 */
export function definitionsStillDefault(
  definitions: readonly WordDefinitionV3[],
  level: string
): boolean {
  const plan = DEFAULT_DEFINITION_PLAN[level as CefrLevel] ?? [];
  // 等级不在表里（后端/存量数据带来的非法值）就一律不动，别拿空计划去比空释义。
  if (plan.length === 0) return false;
  if (definitions.length !== plan.length) return false;
  return definitions.every((definition, index) => {
    const slot = plan[index]!;
    return (
      definitionIsBlank(definition) &&
      definition.level === slot.level &&
      definitionLanguageOf(definition.definition_mode) === slot.language &&
      definitionStyleOf(definition.definition_mode) ===
        (slot.style ?? "definition")
    );
  });
}

/** 默认空白模板可直接移除；录入内容或调整过配置的词义需要确认。 */
export function senseNeedsDeleteConfirmation(
  sense: WordSenseWritableV3,
  inheritedGroupId?: string
): boolean {
  return Boolean(
    sense.sense_group_id !== inheritedGroupId ||
    sense.sub_pos.trim() ||
    sense.level !== DEFAULT_SENSE_LEVEL ||
    (sense.frequency && sense.frequency !== "0") ||
    sense.depends_on_context ||
    boundFormGroupIds(sense).length ||
    sense.sentences.length ||
    sense.relations.length ||
    sense.component_usages?.length ||
    !definitionsStillDefault(sense.definitions, DEFAULT_SENSE_LEVEL) ||
    sense.definitions.some((definition) => {
      if (definitionLanguageOf(definition.definition_mode) === "zh")
        return false;
      const english = definition.content as EnglishTextV3;
      return (
        english.mode !== "unified" ||
        Boolean(
          english.common.voice_profile ||
          english.common.audio_assets?.length ||
          english.common.text_links?.length
        )
      );
    })
  );
}

function definitionRichText(definition: WordDefinitionV3): RichTextV3 {
  if (definitionLanguageOf(definition.definition_mode) === "zh")
    return definition.content as RichTextV3;
  return (
    englishVariants(definition.content as EnglishTextV3)[0]?.value ?? {
      version: 2,
      text: "",
      annotations: []
    }
  );
}

export function withDefinitionMode(
  definition: WordDefinitionV3,
  definitionMode: DefinitionModeV3,
  idFactory: () => string
): WordDefinitionV3 {
  if (definition.definition_mode === definitionMode) return definition;
  // 语言/方式属于节点绑定；切换后正文也必须使用新的父子节点 ID。
  const base = {
    id: idFactory(),
    level: definition.level,
    ...(definition.grammar_structure_id
      ? { grammar_structure_id: definition.grammar_structure_id }
      : {})
  };
  if (definitionMode === "zh_definition" || definitionMode === "zh_sentence") {
    return {
      ...base,
      definition_mode: definitionMode,
      content_id: idFactory(),
      content: definitionRichText(definition)
    };
  }
  if (
    definition.definition_mode === "en_definition" ||
    definition.definition_mode === "en_sentence"
  ) {
    const content = structuredClone(definition.content);
    for (const variant of englishVariants(content)) variant.id = idFactory();
    return { ...base, definition_mode: definitionMode, content };
  }
  return {
    ...base,
    definition_mode: definitionMode,
    content: {
      mode: "unified",
      common: {
        id: idFactory(),
        origin: "manual",
        value: definition.content as RichTextV3
      }
    }
  };
}

export function definitionModeRemovesEnglishSettings(
  definition: WordDefinitionV3,
  definitionMode: DefinitionModeV3
): boolean {
  return (
    definitionLanguageOf(definition.definition_mode) === "en" &&
    definitionLanguageOf(definitionMode) === "zh" &&
    englishVariants(definition.content as EnglishTextV3).some(
      (variant) =>
        Boolean(variant.text_links?.length) ||
        Boolean(variant.voice_profile) ||
        Boolean(variant.audio_assets?.length)
    )
  );
}
