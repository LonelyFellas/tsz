import type {
  NextDictionaryPosMapping,
  NextDraft,
  PartOfSpeechCatalogResponse,
  SharedFormsStepContentV3
} from "@tsz/types";
import { isSharedForms, expandFormContents } from "@tsz/shared";
import {
  addPartOfSpeech,
  fillFormTypeTemplate
} from "@/features/dictionary/word-creation-v3/operations";
import { applyDefaultFormSharing } from "@/features/dictionary/word-creation-v3/defaultFormSharing";
import { applyFormsStructure } from "@/features/dictionary/word-creation-v3/sharedFormsModel";
import { newWordNodeId } from "@/features/dictionary/word-model/primitives";

const emptyForms: SharedFormsStepContentV3 = {
  forms_format: "shared_v1",
  contents: [],
  pos: []
};

export type SuggestedPartOfSpeech =
  string | Pick<NextDictionaryPosMapping, "part_of_speech" | "base_form_only">;

/**
 * 把创建页内置词典给出的词性建议铺进新草稿的词形编辑结构。
 * 只接受当前目录中的词性，避免旧词典编码在编辑器里生成不可保存的行。
 */
export function seedRecommendedPartOfSpeech(
  draft: NextDraft,
  kind: "word" | "phrase",
  suggestions: readonly SuggestedPartOfSpeech[],
  catalog: PartOfSpeechCatalogResponse
): NextDraft {
  if (draft.form_editor?.pos.length || suggestions.length === 0) {
    return draft;
  }

  const eligibleParts = new Map(
    catalog.items
      .filter((item) => item.kind === kind)
      .map((item) => [item.code, item])
  );
  const defaultTemplates = new Map<
    string,
    PartOfSpeechCatalogResponse["items"][number]
  >();
  let forms = expandFormContents(emptyForms);
  for (const suggestion of suggestions) {
    const legacy = typeof suggestion === "string";
    const code = legacy ? suggestion : suggestion.part_of_speech;
    const item = eligibleParts.get(code);
    if (!item) continue;
    if (legacy || !suggestion.base_form_only) defaultTemplates.set(code, item);
    const result = addPartOfSpeech(forms, item, newWordNodeId);
    if (result.ok) forms = result.value;
  }
  if (forms.pos.length === 0) return draft;
  const filled = fillFormTypeTemplate(
    forms,
    [...defaultTemplates.values()],
    newWordNodeId
  );
  const structured = applyFormsStructure(emptyForms, filled);
  if (!isSharedForms(structured)) return draft;
  const formIds = new Set(
    filled.pos.flatMap((pos) => pos.forms.map((form) => form.id))
  );
  const formEditor = applyDefaultFormSharing(structured, catalog, formIds);
  return { ...draft, form_editor: formEditor };
}
