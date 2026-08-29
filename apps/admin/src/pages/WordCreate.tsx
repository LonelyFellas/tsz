import { useNavigate } from "react-router-dom";
import {
  UnifiedCreateEntryStep,
  type UnifiedCreateRequests
} from "@/features/dictionary/word-creation/UnifiedCreateEntryStep";
import { WordCreationLayout } from "@/features/dictionary/word-creation/WordCreationLayout";

export function WordCreatePage({
  requests
}: {
  requests?: UnifiedCreateRequests;
} = {}) {
  const navigate = useNavigate();
  return (
    <WordCreationLayout currentStep="basics">
      <UnifiedCreateEntryStep
        requests={requests}
        onCreated={(word, state) => {
          navigate(`/words/${word.id}/v3/wizard/forms`, {
            replace: true,
            state
          });
        }}
      />
    </WordCreationLayout>
  );
}
