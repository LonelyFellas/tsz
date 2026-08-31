import { useCallback, useState } from "react";
import type { WordHeadwordsV2 } from "@tsz/types";
import { useLocation, useNavigate } from "react-router-dom";
import {
  UnifiedCreateEntryStep,
  type UnifiedCreateRequests
} from "@/features/dictionary/word-creation/UnifiedCreateEntryStep";
import { WordCreationLayout } from "@/features/dictionary/word-creation/WordCreationLayout";
import { pendingSentenceTargetFromState } from "@/features/dictionary/word-creation-v3/pendingSentenceTargetNavigation";

export function WordCreatePage({
  requests
}: {
  requests?: UnifiedCreateRequests;
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const pendingTarget = pendingSentenceTargetFromState(location.state);
  const [detectedHeadwords, setDetectedHeadwords] = useState<WordHeadwordsV2>();
  const onDetectedHeadwords = useCallback((headwords?: WordHeadwordsV2) => {
    setDetectedHeadwords(headwords);
  }, []);
  return (
    <WordCreationLayout currentStep="basics" draftHeadwords={detectedHeadwords}>
      <UnifiedCreateEntryStep
        initialValue={pendingTarget?.headword}
        requests={requests}
        onDetectedHeadwords={onDetectedHeadwords}
        onCreated={(word, state) => {
          navigate(`/words/${word.id}/v3/wizard/forms`, {
            replace: true,
            state: pendingTarget
              ? { ...state, pendingSentenceTarget: pendingTarget }
              : state
          });
        }}
      />
    </WordCreationLayout>
  );
}
