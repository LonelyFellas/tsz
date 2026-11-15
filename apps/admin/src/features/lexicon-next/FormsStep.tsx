import { useLayoutEffect, useRef, useState } from "react";
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
import { removePosDescription } from "./model";

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
  registerLeaveGuard,
  selectedPos,
  onSelectedPosChange
}: {
  value: SharedFormsStepContentV3;
  saved?: SharedFormsStepContentV3;
  kind: "word" | "phrase";
  locale: PhonemeLocaleV3;
  issues: readonly V3DraftValidationIssue[];
  onChange: (next: SharedFormsStepContentV3) => void;
  registerLeaveGuard: (guard?: () => Promise<boolean>) => void;
  selectedPos?: string;
  onSelectedPosChange?: (code: string) => void;
}) {
  const [activePosId, setActivePosId] = useState<string>();
  // 新增词性先回写结构，再报告选中 ID；此时父级 props 可能尚未更新。
  const latestForms = useRef(value);
  useLayoutEffect(() => {
    latestForms.current = value;
  }, [value]);
  const applyForms = (next: SharedFormsStepContentV3) => {
    latestForms.current = next;
    onChange(next);
  };
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
          onSharedFormsChange={applyForms}
          onChange={(next) => {
            const updated = applyFormsStructure(value, next);
            if (isSharedForms(updated)) applyForms(updated);
          }}
          entryKind={kind}
          deletePosDescription={removePosDescription}
          activePosId={
            value.pos.find((pos) => pos.pos === selectedPos)?.pos_id ??
            (!onSelectedPosChange &&
            value.pos.some((pos) => pos.pos_id === activePosId)
              ? activePosId
              : value.pos[0]?.pos_id)
          }
          onActivePosChange={(id) => {
            if (!onSelectedPosChange) {
              setActivePosId(id);
              return;
            }
            const pos = latestForms.current.pos.find(
              (pos) => pos.pos_id === id
            );
            if (pos) onSelectedPosChange(pos.pos);
          }}
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
