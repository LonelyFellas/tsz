import type {
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

/**
 * 把创建页内置词典给出的词性建议铺进新草稿的词形编辑结构。
 * 只接受当前目录中的词性，避免旧词典编码在编辑器里生成不可保存的行。
 */
export function seedRecommendedPartOfSpeech(
  draft: NextDraft,
  kind: "word" | "phrase",
  suggestedCodes: readonly string[],
  catalog: PartOfSpeechCatalogResponse
): NextDraft {
  if (draft.form_editor?.pos.length || suggestedCodes.length === 0) {
    return draft;
  }

  const items = suggestedCodes.flatMap((code) => {
    const item = catalog.items.find(
      (candidate) => candidate.code === code && candidate.kind === kind
    );
    return item ? [item] : [];
  });
  if (items.length === 0) return draft;

  let forms = expandFormContents(emptyForms);
  for (const item of items) {
    const result = addPartOfSpeech(forms, item, newWordNodeId);
    if (result.ok) forms = result.value;
  }
  forms = fillFormTypeTemplate(forms, catalog.items, newWordNodeId);
  const structured = applyFormsStructure(emptyForms, forms);
  if (!isSharedForms(structured)) return draft;
  const formIds = new Set(
    forms.pos.flatMap((pos) => pos.forms.map((form) => form.id))
  );
  const formEditor = applyDefaultFormSharing(structured, catalog, formIds);
  return { ...draft, form_editor: formEditor };
}
