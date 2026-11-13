import { useLayoutEffect, useState } from "react";
import { expandFormContents, isSharedForms } from "@tsz/shared";
import type {
  SharedFormsStepContentV3,
  PhonemeLocaleV3,
  V3DraftValidationIssue
} from "@tsz/types";
import { V3FormsAndPronunciationStep } from "@/features/dictionary/word-creation-v3/components/V3FormsAndPronunciationStep";
import {
  applyFormsStructure,
  createPronunciationReferenceIds
} from "@/features/dictionary/word-creation-v3/sharedFormsModel";
import { createStableVariantIdFactory } from "@/features/dictionary/word-creation-v3/operations";
import { DictionaryFormTypeLabels } from "@/features/dictionary/part-of-speech/FormTypeLabels";
import { EntryDialectContext } from "@/features/settings/useDialectPreference";

export const emptyFormEditor = (): SharedFormsStepContentV3 => ({
  forms_format: "shared_v1",
  contents: [],
  pos: []
});

export function FormsStep({
  value,
  saved,
  kind,
  locale,
  issues,
  onChange,
  registerLeaveGuard
}: {
  value: SharedFormsStepContentV3;
  saved?: SharedFormsStepContentV3;
  kind: "word" | "phrase";
  locale: PhonemeLocaleV3;
  issues: readonly V3DraftValidationIssue[];
  onChange: (next: SharedFormsStepContentV3) => void;
  registerLeaveGuard: (guard?: () => Promise<boolean>) => void;
}) {
  const [activePosId, setActivePosId] = useState<string>();
  const [stableVariantIds] = useState(() =>
    createStableVariantIdFactory(expandFormContents(value), [])
  );
  const [pronunciationIds] = useState(() =>
    createPronunciationReferenceIds(value, [])
  );
  useLayoutEffect(() => {
    stableVariantIds.seed(expandFormContents(value), []);
    pronunciationIds.seed(value);
  }, [value, stableVariantIds, pronunciationIds]);
  return (
    <EntryDialectContext.Provider value={locale}>
      <DictionaryFormTypeLabels>
        <V3FormsAndPronunciationStep
          value={expandFormContents(value)}
          issues={issues}
          sharedForms={value}
          onSharedFormsChange={onChange}
          onChange={(next) => {
            const updated = applyFormsStructure(value, next);
            if (isSharedForms(updated)) onChange(updated);
          }}
          entryKind={kind}
          activePosId={
            value.pos.some((pos) => pos.pos_id === activePosId)
              ? activePosId
              : value.pos[0]?.pos_id
          }
          onActivePosChange={setActivePosId}
          stableVariantIds={stableVariantIds}
          pronunciationReferenceIds={pronunciationIds}
          multipleSpellingsAvailable
          contentReassignmentAvailable
          savedContentIds={new Set(saved?.contents.map((row) => row.id))}
          bindingEditingAvailable={false}
          registerLeaveGuard={registerLeaveGuard}
        />
      </DictionaryFormTypeLabels>
    </EntryDialectContext.Provider>
  );
}
