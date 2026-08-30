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
  return (
    <WordCreationLayout currentStep="basics">
      <UnifiedCreateEntryStep
        initialPendingTarget={pendingTarget}
        requests={requests}
        onCreated={(word, state) => {
          navigate(`/words/${word.id}/v3/wizard/forms`, {
            replace: true,
            state: {
              ...state,
              ...(pendingTarget ? { pendingSentenceTarget: pendingTarget } : {})
            }
          });
        }}
      />
    </WordCreationLayout>
  );
}
