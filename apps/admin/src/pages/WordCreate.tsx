import { useNavigate } from "react-router-dom";
import {
  UnifiedCreateEntryStep,
  type UnifiedCreateRequests
} from "@/features/dictionary/word-creation/UnifiedCreateEntryStep";

export function WordCreatePage({
  requests
}: {
  requests?: UnifiedCreateRequests;
} = {}) {
  const navigate = useNavigate();
  return (
    <UnifiedCreateEntryStep
      requests={requests}
      onCreated={(word, state) => {
        const route =
          word.schema_version === 3
            ? `/words/${word.id}/v3/wizard/forms`
            : `/words/${word.id}/wizard/forms`;
        navigate(route, { replace: true, state });
      }}
    />
  );
}
