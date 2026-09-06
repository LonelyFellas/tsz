import { useQueryClient } from "@tanstack/react-query";
import { wordKeys } from "@/features/dictionary/api";
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
  const queryClient = useQueryClient();
  return (
    <WordCreationLayout currentStep="basics">
      <UnifiedCreateEntryStep
        requests={requests}
        onCreated={(word, state) => {
          void queryClient.invalidateQueries({ queryKey: wordKeys.all });
          navigate(`/words/${word.id}/v3/wizard/forms`, {
            replace: true,
            state
          });
        }}
      />
    </WordCreationLayout>
  );
}
