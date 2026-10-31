import type {
  AdminWordV3,
  DraftMeaningsStepContentWritableV3,
  FormsStepRepresentationV3,
  PartOfSpeechCatalogResponse,
  WordCreationStep
} from "@tsz/types";
import { expandFormContents } from "@tsz/shared";

export interface AssistantEditorContext {
  word: AdminWordV3;
  step: WordCreationStep;
  forms: FormsStepRepresentationV3;
  meanings: DraftMeaningsStepContentWritableV3;
  dirtySteps: Readonly<{ forms: boolean; meanings: boolean }>;
  progress: readonly { label: string; completed: boolean }[];
  catalog?: PartOfSpeechCatalogResponse;
  applyForms?: (
    forms: FormsStepRepresentationV3,
    expectedSnapshot: string
  ) => boolean;
}

export const ASSISTANT_STEP_LABELS: Record<WordCreationStep, string> = {
  basics: "基础信息",
  forms: "词形与发音",
  meanings: "词义与例句",
  preview: "核对与发布"
};

/** Only content goes to the model; voice assets and audit metadata do not. */
export function assistantSnapshot(context: AssistantEditorContext) {
  const { word, step, forms, meanings, dirtySteps, progress } = context;
  const expandedForms = expandFormContents(forms);
  const sections =
    step === "meanings"
      ? { meanings, forms: expandedForms }
      : { forms: expandedForms, meanings };
  const content = JSON.stringify(
    {
      label: word.presentation.label,
      current_step: ASSISTANT_STEP_LABELS[step],
      dirty_steps: dirtySteps,
      progress,
      ...sections
    },
    (key, value: unknown) => {
      if (
        key === "id" ||
        key.endsWith("_id") ||
        key.includes("audio") ||
        key.includes("storage") ||
        key.endsWith("_url") ||
        [
          "url",
          "synthesis",
          "voice_versions",
          "created_by",
          "archived_by"
        ].includes(key)
      )
        return undefined;
      return value;
    }
  );
  const characters = Array.from(content);
  const local_content = characters.slice(0, 24000).join("");
  return {
    local_content,
    context_truncated: characters.length > 24000,
    fingerprint: `${word.revision}:${step}:${local_content}`
  };
}
